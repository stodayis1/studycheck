-- 앱이 전체적으로 느린 원인 — RLS 정책이 행마다 is_staff() 를 부르고 있다
--
-- 무슨 일이 일어나고 있나
--   선생님 화면에서 표를 읽을 때마다 Postgres 가 **행 하나하나에 대해** is_staff() 를 부른다.
--   is_staff() 는 SECURITY DEFINER 라 인라인이 안 되고, 매번 users 표를 뒤진다.
--   progress_checks 22,659행이면 22,659번이다.
--
--   실제로 잰 값 (2026-10-04, 운영 DB)
--     progress_checks 전체 읽기 : 선생님으로 470ms  /  RLS 없이 3ms
--     class_sessions  전체 읽기 : 선생님으로 343ms  /  RLS 없이 38ms
--
--     실행 계획
--       Seq Scan on progress_checks (actual time=0.447..588.112 rows=23565)
--         Filter: (is_staff() OR ...)        ← 행마다 호출된다
--         Execution Time: 591.952 ms
--
--     같은 모양을 23,565행에 대해 직접 재 보면
--       is_staff() or ...          618 ms
--       (select is_staff()) or ...   6 ms      ← 100배
--
--   한 달 치 질의 통계로는 이 세 표를 읽는 데만 누적 9시간 넘게 쓰고 있었다.
--
-- 무엇을 바꾸나
--   정책의 **이름·대상 표·권한(SELECT/INSERT/…)·역할은 하나도 건드리지 않는다.**
--   is_staff() → (select is_staff()) 로 괄호만 씌운다.
--   이렇게 하면 Postgres 가 질의 시작 때 **한 번만** 부르고 그 값을 재사용한다(InitPlan).
--   값이 같으므로 **누가 무엇을 볼 수 있는지는 전혀 달라지지 않는다.**
--
-- 되돌리려면
--   docs/sql/느린원인_RLS_되돌리기.sql 을 실행한다.
--
-- 실행 방법
--   Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run
--   (운영 중에 실행해도 된다. 표를 잠그지 않는다)

begin;

alter policy staff_only on public.academy_event_attempts using ((select is_staff())) with check ((select is_staff()));
alter policy staff_delete on public.academy_events using ((select is_staff()));
alter policy staff_insert on public.academy_events with check ((select is_staff()));
alter policy staff_update on public.academy_events using ((select is_staff())) with check ((select is_staff()));
alter policy public_read_active on public.announcements using (((is_active = true) OR (select is_staff())));
alter policy staff_all on public.app_settings using ((select is_staff())) with check ((select is_staff()));
alter policy staff_only on public.assignment_items using ((select is_staff())) with check ((select is_staff()));
alter policy staff_only on public.assignment_sets using ((select is_staff())) with check ((select is_staff()));
alter policy staff_only on public.assignment_targets using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.autostep_concept_page_map using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.autostep_homework_alerts using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.autostep_workbook_map using ((select is_staff())) with check ((select is_staff()));
alter policy staff_only on public.class_groups using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.class_sessions using ((select is_staff())) with check ((select is_staff()));
alter policy staff_delete on public.concepts using ((select is_staff()));
alter policy staff_insert on public.concepts with check ((select is_staff()));
alter policy staff_update on public.concepts using ((select is_staff())) with check ((select is_staff()));
alter policy staff_only on public.consultations using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.core_tests using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.elementary_textbooks using ((select is_staff())) with check ((select is_staff()));
alter policy staff_full_access on public.exam_periods using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.exam_prep_assignments using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.exam_schedule using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.exam_sheet_problems using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.exam_sheets using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.exams using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.feedback_replies using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.feedbacks using ((select is_staff())) with check ((select is_staff()));
alter policy staff_only on public.grade_lookup_attempts using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.grading_answers using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.gradings using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.inner_enough using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.learning_notes using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.middle_worksheets using ((select is_staff())) with check ((select is_staff()));
alter policy staff_read on public.problems using ((select is_staff()));
alter policy staff_all on public.progress_checks using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.quick_answers using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.report_links using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.schedules using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.school_exams using ((select is_staff())) with check ((select is_staff()));
alter policy staff_read on public.standard_types using ((select is_staff()));
alter policy staff_all on public.student_exam_prep using ((select is_staff())) with check ((select is_staff()));
alter policy staff_only on public.student_handoff_notes using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.student_progress using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.student_textbooks using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.student_worksheets using ((select is_staff())) with check ((select is_staff()));
alter policy admin_only_delete on public.students using ((select is_admin()));
alter policy staff_insert on public.students with check ((select is_staff()));
alter policy staff_or_own on public.students using (((select is_staff()) OR (session_uid = ( SELECT auth.uid() AS uid)) OR (parent_session_uid = ( SELECT auth.uid() AS uid))));
alter policy staff_update on public.students using ((select is_staff())) with check ((select is_staff()));
alter policy staff_only on public.submissions using ((select is_staff())) with check ((select is_staff()));
alter policy staff_all on public.textbook_catalog using ((select is_staff())) with check ((select is_staff()));
alter policy tla_staff_read on public.type_learning_assets using ((select is_staff()));
alter policy staff_all on public.users using (((select is_staff()) OR (id = ( SELECT auth.uid() AS uid)))) with check ((select is_staff()));
alter policy staff_all on public.video_watch_logs using ((select is_staff())) with check ((select is_staff()));
alter policy admin_read on public.worksheet_action_logs using ((select is_admin()));
alter policy admin_decide on public.worksheet_override_requests using ((select is_admin())) with check ((select is_admin()));
alter policy admin_delete on public.worksheet_override_requests using ((select is_admin()));
alter policy staff_read on public.worksheet_override_requests using ((select is_staff()));
alter policy staff_request on public.worksheet_override_requests with check (((select is_staff()) AND ((status = 'pending'::text) OR (select is_admin()))));

commit;

-- 확인 — 아래가 0 이어야 한다 (맨몸 is_staff()/is_admin() 가 남아 있지 않다)
select count(*) as 아직_맨몸호출
from pg_policies
where schemaname = 'public'
  and (qual ~ '(?<![.\w])is_(staff|admin)\(\)' or with_check ~ '(?<![.\w])is_(staff|admin)\(\)');
