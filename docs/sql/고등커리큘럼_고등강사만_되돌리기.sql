-- 고등커리큘럼_고등강사만.sql 되돌리기 — 다시 직원 전체(is_staff)에게 연다. 데이터는 그대로다.

drop policy if exists curriculum_plan_docs_high_read   on public.curriculum_plan_docs;
drop policy if exists curriculum_plan_docs_high_insert on public.curriculum_plan_docs;
drop policy if exists curriculum_plan_docs_high_update on public.curriculum_plan_docs;

create policy curriculum_plan_docs_staff_read on public.curriculum_plan_docs
  for select to authenticated using ((select public.is_staff()));
create policy curriculum_plan_docs_staff_insert on public.curriculum_plan_docs
  for insert to authenticated with check ((select public.is_staff()));
create policy curriculum_plan_docs_staff_update on public.curriculum_plan_docs
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

-- 함수는 앱(사이드바·화면)이 부르므로 앱을 되돌린 뒤에 지운다:
--   drop function if exists public.can_see_high_curriculum();

select tablename, policyname, cmd from pg_policies where tablename = 'curriculum_plan_docs' order by policyname;
