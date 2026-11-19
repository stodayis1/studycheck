-- 부스터 특강 선착순 신청 — 표 2개 + 함수 3개 (2026-11-19)
--
-- 원장님 2026-11-19: 「부스터는 특강비가 없어 무료야. 그래서 선착순인거야」
--                   「여러 학부모가 같은 순간에 신청하더라도 7명 이상 확정되는 일이 없어야 합니다」
--
-- ★ 더하기만 한다. 기존 표·정책·함수는 하나도 건드리지 않는다.
-- ★ 되돌리기: docs/sql/부스터특강_선착순신청_되돌리기.sql
--
-- ───────────────────────────────────────────────────────────────────────────
-- 7명이 못 들어가게 하는 방법
-- ───────────────────────────────────────────────────────────────────────────
-- 화면에서 숫자를 보고 막는 방식은 반드시 뚫린다 — 보는 순간과 넣는 순간 사이에 남이 들어간다.
-- (수학OPS 의 기존 특강 신청이 딱 그 구멍이다: 브라우저에서만 세고 서버는 그냥 넣는다.)
--
-- 그래서 세 겹으로 막는다.
--
--   1겹  booster_apply() 가 특강 행을 **select … for update** 로 잠근다.
--        동시에 눌러도 한 명씩 차례로 지나간다. 둘째 사람은 첫째가 끝난 **뒤**에 숫자를 센다.
--   2겹  자리번호에 **유일 index**를 건다. 어떤 경로로 들어와도 7번 자리는 저장이 안 된다.
--   3겹  seats_taken 에 **check (seats_taken <= capacity)**. 숫자 자체가 정원을 못 넘는다.
--
-- 1겹만으로도 맞지만, 나중에 누가 다른 길로 insert 해도 2·3겹이 막는다.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 취소하면 자리가 자동으로 열리나 → 안 열린다
-- ───────────────────────────────────────────────────────────────────────────
-- 원장님: 「신청 취소가 발생했을 때 자리를 다시 열지, 대기자를 받을지는 관리자가 결정」
--
-- 그래서 정원은 **지금 확정된 사람 수**가 아니라 **나간 자리 수(seats_taken)** 로 센다.
-- 취소해도 seats_taken 은 그대로다. 원장님이 booster_reopen_seat() 를 부르셔야 준다.

begin;

-- ── 1. 특강 한 줄 ─────────────────────────────────────────────────────────
create table if not exists public.booster_sessions (
  id           uuid primary key default gen_random_uuid(),
  slug         text        not null unique,          -- 주소에 쓰는 열쇠
  title        text        not null,
  capacity     int         not null check (capacity > 0),
  -- ★ 나간 자리 수. 취소해도 줄지 않는다 (원장님이 다시 열어야 준다).
  seats_taken  int         not null default 0 check (seats_taken >= 0),
  opens_at     timestamptz not null,                 -- 접수 시작 (서버 시계로 본다)
  is_test      boolean     not null default false,   -- 연습용 — 실제 명단과 섞지 않는다
  is_open      boolean     not null default true,    -- 원장님이 손으로 닫을 수 있는 빗장
  created_at   timestamptz not null default now(),
  constraint booster_seats_within_capacity check (seats_taken <= capacity)
);

comment on table public.booster_sessions is
  '부스터 특강 — 선착순 정원을 지키는 기준 행. seats_taken 은 취소해도 줄지 않는다(원장이 booster_reopen_seat 로만 되돌린다).';

-- ── 2. 신청 ───────────────────────────────────────────────────────────────
create table if not exists public.booster_applications (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid        not null references public.booster_sessions(id) on delete cascade,
  -- ★ 접수 순서 = 서버가 준 자리번호. 브라우저 시각이 아니다.
  seat_no       int         not null check (seat_no >= 1),
  status        text        not null default 'confirmed'
                            check (status in ('confirmed', 'cancelled')),
  student_name  text        not null,
  grade         text        not null,
  parent_name   text        not null,
  parent_phone  text        not null,                -- 보이는 꼴 (010-1234-5678)
  phone_digits  text        not null,                -- 중복 판정용 숫자만
  is_enrolled   boolean     not null,                -- 현재 수학의지혜 재원 여부
  agreed_count  int         not null,                -- 동의한 항목 수 (앱이 3을 넣는다)
  created_at    timestamptz not null default now(),  -- 서버가 찍는 접수 시각
  cancelled_at  timestamptz,
  cancel_reason text
);

comment on table public.booster_applications is
  '부스터 특강 신청. seat_no 가 접수 순서다(서버가 준다). 명단은 원장만 읽는다.';

-- 2겹 — 같은 특강에 같은 자리번호는 **하나뿐**. 7번 자리는 저장 자체가 안 된다.
create unique index if not exists booster_app_seat_uniq
  on public.booster_applications (session_id, seat_no);

-- 중복 신청 방지 — 같은 특강에 **같은 학생 이름 + 같은 번호**는 한 번만.
-- ★ 취소된 건은 빼고 본다. 취소 뒤 원장님이 다시 받으실 수 있어야 한다.
-- ★ 형제자매는 같은 번호로 각각 신청된다 — 학생 이름이 다르기 때문 (원장님 2026-11-19).
create unique index if not exists booster_app_dup_uniq
  on public.booster_applications (session_id, phone_digits, student_name)
  where status = 'confirmed';

create index if not exists booster_app_session_seat
  on public.booster_applications (session_id, seat_no);

-- ── 3. RLS — 학부모는 쓰지도 읽지도 못한다 ────────────────────────────────
-- ★ 신청은 **서버(service_role)만** 넣는다. service_role 은 RLS 를 통째로 비껴간다.
--   그래서 아래 정책에 insert 를 **아무에게도 열지 않는다** — 브라우저에서 직접 못 넣는다.
--   (app/api/survey 와 같은 자리. docs/보안.md)
-- ★ 학생·학부모도 authenticated 다(익명 로그인). 그래서 to authenticated using (true) 는 쓰지 않는다.
-- ★ is_staff()/is_admin() 은 (select ...) 로 감싼다 — 맨몸이면 행마다 호출돼 느려진다.
alter table public.booster_sessions     enable row level security;
alter table public.booster_applications enable row level security;

-- 특강 한 줄은 직원이 읽을 수 있다 (관리 화면용). 학부모 화면은 서버를 거친다.
drop policy if exists booster_sessions_staff_read on public.booster_sessions;
create policy booster_sessions_staff_read on public.booster_sessions
  for select to authenticated using ((select public.is_staff()));

drop policy if exists booster_sessions_admin_write on public.booster_sessions;
create policy booster_sessions_admin_write on public.booster_sessions
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ★ 명단에는 연락처가 들어 있다. **원장만** 읽는다 (원장님 2026-11-19:
--   「신청자 명단과 개인정보는 관리자만 열람할 수 있도록」).
drop policy if exists booster_apps_admin_read on public.booster_applications;
create policy booster_apps_admin_read on public.booster_applications
  for select to authenticated using ((select public.is_admin()));

drop policy if exists booster_apps_admin_write on public.booster_applications;
create policy booster_apps_admin_write on public.booster_applications
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── 4. 신청 받기 — 정원을 지키는 그 함수 ──────────────────────────────────
create or replace function public.booster_apply(
  p_slug         text,
  p_student_name text,
  p_grade        text,
  p_parent_name  text,
  p_parent_phone text,
  p_phone_digits text,
  p_is_enrolled  boolean,
  p_agreed_count int
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s      public.booster_sessions%rowtype;
  v_seat int;
  v_id   uuid;
begin
  -- ★ 1겹 — 특강 행을 잠근다. 같은 순간에 들어온 사람들이 여기서 한 줄로 선다.
  --   잠그기 전에는 아무것도 세지 않는다. 세고 나서 잠그면 그 틈으로 남이 들어간다.
  select * into s from public.booster_sessions where slug = p_slug for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  if not s.is_open then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- ★ 시각은 **DB 시계**로 본다. 브라우저 시계는 사람이 바꿀 수 있다.
  if now() < s.opens_at then
    return jsonb_build_object('ok', false, 'reason', 'not_yet',
                              'opens_at', s.opens_at);
  end if;

  if s.seats_taken >= s.capacity then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  -- 동의 세 가지를 다 받았는지 — 앱을 거치지 않고 찔러 넣는 길도 막는다
  if coalesce(p_agreed_count, 0) < 3 then
    return jsonb_build_object('ok', false, 'reason', 'need_agreement');
  end if;

  -- 중복 — 같은 특강에 같은 학생 이름 + 같은 번호
  if exists (
    select 1 from public.booster_applications
    where session_id = s.id
      and status = 'confirmed'
      and phone_digits = p_phone_digits
      and student_name = p_student_name
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  v_seat := s.seats_taken + 1;

  insert into public.booster_applications
    (session_id, seat_no, student_name, grade, parent_name, parent_phone,
     phone_digits, is_enrolled, agreed_count)
  values
    (s.id, v_seat, p_student_name, p_grade, p_parent_name, p_parent_phone,
     p_phone_digits, p_is_enrolled, p_agreed_count)
  returning id into v_id;

  -- ★ 3겹 — 이 update 가 capacity 를 넘기면 check 제약에 걸려 통째로 되돌아간다.
  update public.booster_sessions
     set seats_taken = v_seat
   where id = s.id;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'seat_no', v_seat,
    'seats_taken', v_seat, 'capacity', s.capacity);

exception
  -- 2겹에 걸린 경우(있어서는 안 되지만) — 터뜨리지 않고 「마감」으로 돌려준다
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'race');
end;
$$;

-- 학부모 화면은 서버(service_role)를 거친다. 그래도 직원이 관리 화면에서 부를 수 있게 둔다.
revoke all on function public.booster_apply(text, text, text, text, text, text, boolean, int) from public;
grant execute on function public.booster_apply(text, text, text, text, text, text, boolean, int) to service_role;

-- ── 5. 남은 자리만 알려 주는 함수 (이름·연락처는 안 준다) ─────────────────
create or replace function public.booster_status(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'found',       true,
    'title',       s.title,
    'capacity',    s.capacity,
    'seats_taken', s.seats_taken,
    'seats_left',  greatest(0, s.capacity - s.seats_taken),
    'opens_at',    s.opens_at,
    'is_open',     s.is_open,
    'now',         now())
  from public.booster_sessions s where s.slug = p_slug;
$$;

revoke all on function public.booster_status(text) from public;
grant execute on function public.booster_status(text) to service_role;

-- ── 6. 자리 다시 열기 — 원장님이 **손으로** 부르셔야 한다 ─────────────────
-- ★ 자동 재오픈은 하지 않는다 (원장님 2026-11-19).
create or replace function public.booster_reopen_seat(p_slug text, p_how_many int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.booster_sessions%rowtype;
  v_new int;
begin
  if not (select public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  select * into s from public.booster_sessions where slug = p_slug for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_session'); end if;

  v_new := greatest(0, s.seats_taken - greatest(1, coalesce(p_how_many, 1)));
  update public.booster_sessions set seats_taken = v_new where id = s.id;

  return jsonb_build_object('ok', true, 'seats_taken', v_new,
                            'seats_left', s.capacity - v_new);
end;
$$;

revoke all on function public.booster_reopen_seat(text, int) from public;
grant execute on function public.booster_reopen_seat(text, int) to authenticated, service_role;

-- ── 7. 이번 특강 두 줄 (연습용 + 실제) ────────────────────────────────────
-- ★ 연습용을 **먼저** 만든다. 원장님이 그 주소로 다 돌려 보신 뒤 실제가 열린다.
--   연습용은 지금 바로 열려 있고(과거 시각), 실제는 11/25 22:00(KST) = 13:00 UTC 에 열린다.
insert into public.booster_sessions (slug, title, capacity, opens_at, is_test)
values
  ('yebi-jung1-booster-2026-12-test', '[연습] 예비중1 중1-1 부스터 특강', 6,
   '2026-01-01T00:00:00Z', true),
  ('yebi-jung1-booster-2026-12',      '예비중1 중1-1 부스터 특강',        6,
   '2026-11-25T13:00:00Z', false)
on conflict (slug) do nothing;

commit;

-- ── 확인 ──────────────────────────────────────────────────────────────────
-- select slug, title, capacity, seats_taken, opens_at at time zone 'Asia/Seoul' as 접수시작_한국시간, is_test
--   from public.booster_sessions order by is_test;
--
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename like 'booster%' order by tablename, policyname;
--
-- -- 맨몸 is_staff()/is_admin() 이 없는지 (0 이어야 한다)
-- select count(*) from pg_policies where schemaname = 'public' and tablename like 'booster%'
--   and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
