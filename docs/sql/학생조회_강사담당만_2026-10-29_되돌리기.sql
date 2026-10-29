-- 학생조회_강사담당만_2026-10-29.sql 되돌리기 — 적용 전 정책 그대로
-- (조회·수정 모두 is_staff() 하나로 돌아간다 = 강사도 196명 전부 읽힌다)
drop policy if exists staff_or_own on public.students;
create policy staff_or_own on public.students for select using (
  (select public.is_staff())
  or session_uid = (select auth.uid())
  or parent_session_uid = (select auth.uid())
);

drop policy if exists staff_update on public.students;
create policy staff_update on public.students for update using (
  (select public.is_staff())
);

-- 새로 만든 함수는 남겨도 해롭지 않다. 완전히 지우려면:
-- drop function if exists public.can_see_all_students();
-- drop function if exists public.my_staff_name();
-- drop function if exists public.my_supervisor_grades();
