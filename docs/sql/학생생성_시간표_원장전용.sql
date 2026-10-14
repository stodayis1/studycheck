-- 학생 계정 만들기와 시간표 편집을 **원장님 전용**으로 바꾼다 (원장님 2026-10-14).
--
-- 왜
--   2026-10-14 19:42 에 이규숙 선생님이 「학생 추가」로 이도윤 학생을 하나 더 만들었고,
--   같은 날 17:00 에 조윤희 선생님이 이도윤의 시간표를 3초 동안 13번 고쳤다.
--   두 분 다 규칙을 어긴 게 아니라, 정책이 is_staff() 라 선생님 누구나 할 수 있었다.
--   원장님 지시 — 계정 생성과 시간표 변경은 관리자를 통해야 한다.
--
-- 바꾸는 것
--   students   INSERT                 is_staff() → is_admin()
--   schedules  INSERT·UPDATE·DELETE   is_staff() → is_admin()
--
-- 그대로 두는 것 (바꾸면 선생님 일이 막힌다)
--   students   SELECT·UPDATE   선생님이 학교·학년 같은 정보를 고치는 일은 그대로 둔다
--   schedules  SELECT          선생님 화면이 시간표를 **읽어야** 오늘 수업 목록이 나온다
--   students   DELETE          이미 원장님 전용이다
--
-- ★ is_admin() 은 users.role = 'admin' 이다. 지금 admin 은 윤지혜 원장님 한 분이다.

begin;

-- ── students : 만들기만 원장님 전용 ─────────────────────────────────────────
drop policy if exists staff_insert on public.students;
create policy admin_only_insert on public.students
  for insert to authenticated
  with check ((select public.is_admin()));

-- ── schedules : 읽기는 직원 전체, 쓰기는 원장님 전용 ────────────────────────
-- 지금은 ALL 정책 하나(staff_all)라 읽기·쓰기가 같이 묶여 있다. 둘로 나눈다.
drop policy if exists staff_all on public.schedules;

create policy staff_read on public.schedules
  for select to authenticated
  using ((select public.is_staff()));

create policy admin_insert on public.schedules
  for insert to authenticated
  with check ((select public.is_admin()));

create policy admin_update on public.schedules
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy admin_delete on public.schedules
  for delete to authenticated
  using ((select public.is_admin()));

commit;

-- 확인
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname='public' and tablename in ('students','schedules')
--   order by tablename, cmd;
