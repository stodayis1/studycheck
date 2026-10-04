-- 학생·학부모가 **자기가 받은 학습지**를 읽을 수 있게
--
-- 왜
--   exam_sheets 와 exam_sheet_problems 가 직원 전용이라, 배부를 해도 학생 화면에
--   제목조차 안 떴다(조인이 통째로 null 로 온다). 할일목록에 아무것도 안 보이던 원인.
--
-- 무엇을 여나
--   **배부받은 시험지만.** 다른 시험지는 그대로 안 보인다.
--   문항 줄(exam_sheet_problems)도 같이 연다 — 몇 문항인지 세려면 필요하고,
--   어차피 QR 채점 화면은 코드만 알면 열리므로 새로 새는 것은 없다.

begin;

drop policy if exists own_assigned_read on public.exam_sheets;
create policy own_assigned_read on public.exam_sheets
  for select using (
    id in (
      select t.sheet_id from public.exam_sheet_targets t
      join public.students s on s.id = t.student_id
      where s.session_uid = (select auth.uid())
         or s.parent_session_uid = (select auth.uid())
    )
  );

drop policy if exists own_assigned_read on public.exam_sheet_problems;
create policy own_assigned_read on public.exam_sheet_problems
  for select using (
    sheet_id in (
      select t.sheet_id from public.exam_sheet_targets t
      join public.students s on s.id = t.student_id
      where s.session_uid = (select auth.uid())
         or s.parent_session_uid = (select auth.uid())
    )
  );

commit;

-- 되돌리려면
--   drop policy if exists own_assigned_read on public.exam_sheets;
--   drop policy if exists own_assigned_read on public.exam_sheet_problems;
