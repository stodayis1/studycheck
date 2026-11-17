-- 고등 커리큘럼: 교재 구성은 원장님만, 선생님은 제안으로 (2026-11-17)
--
-- 왜: 원장님 2026-11-17 — 교재 흐름(단계·교재 이름·구성)은 원장님 기준안으로 두고,
--     선생님은 차시표·내신 대비·운영 칸을 직접 쓰고 교재에 대한 의견은 「제안」으로 올린다.
--
-- 문서 나눔 (curriculum_plan_docs.doc_id):
--   books          교재 흐름의 구성·교재 이름          → 원장(is_admin)만 넣고 고침
--   books-values   교재 흐름 중 운영 규칙 줄의 값      → 볼 수 있는 선생님 누구나
--   sugg-<id>      선생님 제안 한 건                    → 넣기는 누구나, 고치기(반영·보류)는 원장만
--   exam, unit-*   내신 대비 · 단원별 차시               → 볼 수 있는 선생님 누구나
--
-- 안전한가: 쓰기 정책을 **좁히는** 변경이다. 적용할 때 표는 0행이었다. 읽기는 그대로다.
-- 되돌리기: docs/sql/고등커리큘럼_교재구성_원장만_되돌리기.sql

drop policy if exists curriculum_plan_docs_high_insert on public.curriculum_plan_docs;
create policy curriculum_plan_docs_high_insert on public.curriculum_plan_docs
  for insert to authenticated with check (
    (select public.can_see_high_curriculum())
    and (doc_id <> 'books' or (select public.is_admin()))
  );

drop policy if exists curriculum_plan_docs_high_update on public.curriculum_plan_docs;
create policy curriculum_plan_docs_high_update on public.curriculum_plan_docs
  for update to authenticated
  using ((select public.can_see_high_curriculum()))
  with check (
    (select public.can_see_high_curriculum())
    and ((doc_id <> 'books' and doc_id not like 'sugg-%') or (select public.is_admin()))
  );

-- 확인
select tablename, policyname, cmd from pg_policies where tablename = 'curriculum_plan_docs' order by policyname;
