-- pg-learning-fixture.sql — 격리 PostgreSQL 시험용 **합성** 자료 (GPT-EXEC-045 §5)
--
-- 왜 있나
--   `045_learning_actions.sql` 은 기존 운영 표를 **참조한다** (students · problems ·
--   video_watch_logs · gradings · exam_sheet_problems · is_staff() · auth.uid()).
--   격리 환경에는 그것들이 없으므로, **참조에 필요한 최소 모양만** 여기서 만든다.
--
-- ⚠️ 운영 스키마의 사본이 아니다
--   운영 표에는 칸이 훨씬 많다. 여기 있는 것은 045 가 **실제로 가리키는 칸**뿐이다.
--   그래서 이 시험은 「045 가 참조하는 모양에서 돈다」를 보이는 것이고,
--   운영 스키마 전체와 맞는다는 증거가 아니다. 보고에 그대로 적는다.
--
-- ⚠️ 실제 자료·실제 키를 쓰지 않는다. 모든 값은 지어낸 것이다.

-- ── 역할 — Supabase 의 세 역할 이름을 그대로 만든다 ──────────────────
-- 045 §6 이 이 이름들로 권한을 닫으므로, 없으면 시험이 뜻이 없다.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  -- 시험에서 역할을 바꿔 끼울 수 있게 로그인 역할 하나를 둔다.
  -- `session_user` 는 **이 역할**로 남으므로, `set role` 로 바꿔도
  -- 045 의 호출자 검사가 무엇을 보는지 그대로 드러난다.
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'app_server') then
    create role app_server login;
  end if;
end
$$;

-- `app_server` 를 `service_role` 의 구성원으로 — 「서버 직결」 경로를 흉내 낸다
grant service_role to app_server;
grant anon, authenticated to app_server;   -- 역할을 바꿔 끼워 거부를 보려고
grant usage on schema public to anon, authenticated, service_role, app_server;

-- ── Supabase 의 `auth.uid()` 자리 ────────────────────────────────────
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;

-- ── `public.is_staff()` 자리 ─────────────────────────────────────────
-- 045 는 RLS 정책에서 `(select public.is_staff())` 로 **감싸** 부른다.
create or replace function public.is_staff() returns boolean
language sql stable as $$ select false $$;

-- ── 045 가 참조하는 표들 ─────────────────────────────────────────────

create table if not exists public.students (
  id        uuid primary key,
  name      text,
  is_active boolean not null default true,
  session_uid uuid,
  user_id   uuid
);

create table if not exists public.problems (
  id          bigint primary key,
  type_code   text,
  answer_text text
);

create table if not exists public.video_watch_logs (
  id         uuid primary key,
  student_id uuid not null references public.students(id)
);

create table if not exists public.exam_sheets (
  id    uuid primary key,
  code  text,
  title text
);

create table if not exists public.gradings (
  id         uuid primary key,
  sheet_id   uuid not null references public.exam_sheets(id),
  student_id uuid references public.students(id)
);

create table if not exists public.exam_sheet_problems (
  sheet_id   uuid not null references public.exam_sheets(id),
  no         int not null,
  problem_id bigint not null references public.problems(id),
  primary key (sheet_id, no)
);

-- ── 합성 자료 ────────────────────────────────────────────────────────
-- 학생 A : 시험지 S1 을 받았다 (문항 101 · 9007199254740993)
-- 학생 B : 시험지 S2 를 받았다 (문항 201)
-- 학생 C : **퇴원**(is_active = false)

insert into public.students (id, name, is_active, session_uid) values
  ('11111111-1111-4111-8111-111111111111', '시험학생A', true,  'aaaaaaaa-0000-4000-8000-000000000001'),
  ('22222222-2222-4222-8222-222222222222', '시험학생B', true,  'bbbbbbbb-0000-4000-8000-000000000002'),
  ('33333333-3333-4333-8333-333333333333', '퇴원학생C', false, 'cccccccc-0000-4000-8000-000000000003')
on conflict (id) do nothing;

insert into public.problems (id, type_code, answer_text) values
  (101, '공수1-01-02', '③'),
  (102, '공수1-01-02', '14'),
  (201, '공수1-01-07', '26'),
  (9007199254740993, '공수1-01-02', '⑤')     -- 안전 정수를 넘는 id
on conflict (id) do nothing;

insert into public.exam_sheets (id, code, title) values
  ('aaaa1111-0000-4000-8000-000000000001', 'S1CODE', '다항식 1차'),
  ('bbbb2222-0000-4000-8000-000000000002', 'S2CODE', 'B 학생 시험지'),
  ('cccc3333-0000-4000-8000-000000000003', 'S3CODE', '다항식 2차')
on conflict (id) do nothing;

insert into public.gradings (id, sheet_id, student_id) values
  ('dddd0001-0000-4000-8000-000000000001', 'aaaa1111-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111'),
  ('dddd0002-0000-4000-8000-000000000002', 'bbbb2222-0000-4000-8000-000000000002',
   '22222222-2222-4222-8222-222222222222'),
  -- 같은 학생이 **다른 시험지**로도 같은 문항을 받았다 → 시도 유일키 시험용
  ('dddd0003-0000-4000-8000-000000000003', 'cccc3333-0000-4000-8000-000000000003',
   '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

insert into public.exam_sheet_problems (sheet_id, no, problem_id) values
  ('aaaa1111-0000-4000-8000-000000000001', 1, 101),
  ('aaaa1111-0000-4000-8000-000000000001', 2, 9007199254740993),
  ('bbbb2222-0000-4000-8000-000000000002', 1, 201),
  ('cccc3333-0000-4000-8000-000000000003', 1, 101)   -- 다른 시험지의 같은 문항
on conflict (sheet_id, no) do nothing;

insert into public.video_watch_logs (id, student_id) values
  ('eeee0001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111'),
  ('eeee0002-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;
