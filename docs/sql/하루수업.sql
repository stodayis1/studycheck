-- 「오늘 하루만 온 수업」 표 (원장님 2026-11-18)
--
-- 왜
--   12월 진급 이동을 11/18 부터 조금씩 시작하면서, 시간표를 확정하기 전에 학생이 새 반에
--   와서 앉는 날이 생겼다. 서우현·강하라(중3)가 최대호 선생님 수요일 반에 왔는데 두 학생의
--   시간표는 화·목·금뿐이라 「오늘 수업」 목록에 안 떴다. 수요일을 시간표에 넣으면 매주
--   수요일마다 뜬다 — 확정 전에 또 고쳐야 한다. 원장님: 「오늘 하루만」.
--
-- 더하기만 한다 — 기존 표·정책은 하나도 건드리지 않는다.
-- 되돌리기: docs/sql/하루수업_되돌리기.sql

begin;

create table if not exists public.one_day_classes (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  class_date  date not null,
  start_time  time not null,
  periods     numeric not null default 2,
  -- 누가 더했나 — 잘못 더해졌을 때 물어볼 자리. 이름을 글자로 둔다(users.name 꼴).
  created_by  text,
  memo        text,
  created_at  timestamptz not null default now(),
  -- 같은 학생·같은 날·같은 시각을 두 번 더하지 못하게. 두 번 눌러도 한 칸이다.
  unique (student_id, class_date, start_time)
);

-- 읽는 길은 늘 「그 날짜」다.
create index if not exists one_day_classes_date_idx on public.one_day_classes (class_date);

alter table public.one_day_classes enable row level security;

-- ★ 학생·학부모도 authenticated(익명 로그인)다. to authenticated using (true) 로 쓰면
--   그분들께도 열린다. 직원만 보게 is_staff() 로 막고, 행마다 호출되지 않게 (select ...) 로 감싼다.
drop policy if exists one_day_classes_staff_read on public.one_day_classes;
create policy one_day_classes_staff_read on public.one_day_classes
  for select to authenticated
  using ((select public.is_staff()));

-- 선생님이 직접 더하고 지운다 — 「오늘 왔어요」는 그 반 선생님이 아는 일이다.
-- (정규 시간표 schedules 는 원장 전용이라 선생님이 못 넣는다. 그래서 이 표가 필요하다.)
drop policy if exists one_day_classes_staff_write on public.one_day_classes;
create policy one_day_classes_staff_write on public.one_day_classes
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

commit;

-- 확인 ────────────────────────────────────────────────────────────────────
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'one_day_classes' order by ordinal_position;

select tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'one_day_classes' order by policyname;

-- 맨몸 is_staff()/is_admin() 가 남아 있지 않은지 — 0 이어야 한다
select count(*) from pg_policies where schemaname = 'public'
  and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
