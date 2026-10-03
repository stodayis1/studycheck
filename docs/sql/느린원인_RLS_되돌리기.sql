-- 되돌리기 — docs/sql/느린원인_RLS_한번만호출.sql 을 되돌린다.
-- 2026-10-04 바꾸기 직전의 정책 식을 그대로 적어 둔 것이다.
-- (되돌리면 선생님 화면이 다시 느려진다. 문제가 생겼을 때만 쓸 것)

begin;

alter policy staff_only on public.academy_event_attempts using (is_staff()) with check (is_staff());
alter policy staff_delete on public.academy_events using (is_staff());
alter policy staff_insert on public.academy_events with check (is_staff());
alter policy staff_update on public.academy_events using (is_staff()) with check (is_staff());
alter policy public_read_active on public.announcements using (((is_active = true) OR is_staff()));
alter policy staff_all on public.app_settings using (is_staff()) with check (is_staff());
alter policy staff_only on public.assignment_items using (is_staff()) with check (is_staff());
alter policy staff_only on public.assignment_sets using (is_staff()) with check (is_staff());
alter policy staff_only on public.assignment_targets using (is_staff()) with check (is_staff());
alter policy staff_all on public.autostep_concept_page_map using (is_staff()) with check (is_staff());
alter policy staff_all on public.autostep_homework_alerts using (is_staff()) with check (is_staff());
alter policy staff_all on public.autostep_workbook_map using (is_staff()) with check (is_staff());
alter policy staff_only on public.class_groups using (is_staff()) with check (is_staff());
alter policy staff_all on public.class_sessions using (is_staff()) with check (is_staff());
alter policy staff_delete on public.concepts using (is_staff());
alter policy staff_insert on public.concepts with check (is_staff());
alter policy staff_update on public.concepts using (is_staff()) with check (is_staff());
alter policy staff_only on public.consultations using (is_staff()) with check (is_staff());
alter policy staff_all on public.core_tests using (is_staff()) with check (is_staff());
alter policy staff_all on public.elementary_textbooks using (is_staff()) with check (is_staff());
alter policy staff_full_access on public.exam_periods using (is_staff()) with check (is_staff());
alter policy staff_all on public.exam_prep_assignments using (is_staff()) with check (is_staff());
alter policy staff_all on public.exam_schedule using (is_staff()) with check (is_staff());
alter policy staff_all on public.exam_sheet_problems using (is_staff()) with check (is_staff());
alter policy staff_all on public.exam_sheets using (is_staff()) with check (is_staff());
alter policy staff_all on public.exams using (is_staff()) with check (is_staff());
alter policy staff_all on public.feedback_replies using (is_staff()) with check (is_staff());
alter policy staff_all on public.feedbacks using (is_staff()) with check (is_staff());
alter policy staff_only on public.grade_lookup_attempts using (is_staff()) with check (is_staff());
alter policy staff_all on public.grading_answers using (is_staff()) with check (is_staff());
alter policy staff_all on public.gradings using (is_staff()) with check (is_staff());
alter policy staff_all on public.inner_enough using (is_staff()) with check (is_staff());
alter policy staff_all on public.learning_notes using (is_staff()) with check (is_staff());
alter policy staff_all on public.middle_worksheets using (is_staff()) with check (is_staff());
alter policy staff_read on public.problems using (is_staff());
alter policy staff_all on public.progress_checks using (is_staff()) with check (is_staff());
alter policy staff_all on public.quick_answers using (is_staff()) with check (is_staff());
alter policy staff_all on public.report_links using (is_staff()) with check (is_staff());
alter policy staff_all on public.schedules using (is_staff()) with check (is_staff());
alter policy staff_all on public.school_exams using (is_staff()) with check (is_staff());
alter policy staff_read on public.standard_types using (is_staff());
alter policy staff_all on public.student_exam_prep using (is_staff()) with check (is_staff());
alter policy staff_only on public.student_handoff_notes using (is_staff()) with check (is_staff());
alter policy staff_all on public.student_progress using (is_staff()) with check (is_staff());
alter policy staff_all on public.student_textbooks using (is_staff()) with check (is_staff());
alter policy staff_all on public.student_worksheets using (is_staff()) with check (is_staff());
alter policy admin_only_delete on public.students using (is_admin());
alter policy staff_insert on public.students with check (is_staff());
alter policy staff_or_own on public.students using ((is_staff() OR (session_uid = ( SELECT auth.uid() AS uid)) OR (parent_session_uid = ( SELECT auth.uid() AS uid))));
alter policy staff_update on public.students using (is_staff()) with check (is_staff());
alter policy staff_only on public.submissions using (is_staff()) with check (is_staff());
alter policy staff_all on public.textbook_catalog using (is_staff()) with check (is_staff());
alter policy tla_staff_read on public.type_learning_assets using (is_staff());
alter policy staff_all on public.users using ((is_staff() OR (id = ( SELECT auth.uid() AS uid)))) with check (is_staff());
alter policy staff_all on public.video_watch_logs using (is_staff()) with check (is_staff());
alter policy admin_read on public.worksheet_action_logs using (is_admin());
alter policy admin_decide on public.worksheet_override_requests using (is_admin()) with check (is_admin());
alter policy admin_delete on public.worksheet_override_requests using (is_admin());
alter policy staff_read on public.worksheet_override_requests using (is_staff());
alter policy staff_request on public.worksheet_override_requests with check ((is_staff() AND ((status = 'pending'::text) OR is_admin())));

commit;
