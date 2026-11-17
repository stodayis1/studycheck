-- 고등커리큘럼_교재구성_원장만.sql 되돌리기 — 볼 수 있는 선생님 누구나 모든 문서를 넣고 고치게 돌린다.

drop policy if exists curriculum_plan_docs_high_insert on public.curriculum_plan_docs;
create policy curriculum_plan_docs_high_insert on public.curriculum_plan_docs
  for insert to authenticated with check ((select public.can_see_high_curriculum()));

drop policy if exists curriculum_plan_docs_high_update on public.curriculum_plan_docs;
create policy curriculum_plan_docs_high_update on public.curriculum_plan_docs
  for update to authenticated using ((select public.can_see_high_curriculum())) with check ((select public.can_see_high_curriculum()));

select tablename, policyname, cmd from pg_policies where tablename = 'curriculum_plan_docs' order by policyname;
