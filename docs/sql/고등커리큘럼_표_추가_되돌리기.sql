-- 고등커리큘럼_표_추가.sql 되돌리기
--
-- ★ 표를 지우면 선생님들이 적은 커리큘럼(교재 흐름·내신 대비·차시표)이 함께 사라진다.
--   지우기 전에 반드시 내용을 뽑아 둔다:
--     select * from public.curriculum_plan_docs order by grade, doc_id;
--   화면만 내리고 싶으면 표는 두고 앱 배포만 되돌린다(Vercel Instant Rollback) — 그게 먼저다.

drop policy if exists curriculum_plan_docs_staff_update on public.curriculum_plan_docs;
drop policy if exists curriculum_plan_docs_staff_insert on public.curriculum_plan_docs;
drop policy if exists curriculum_plan_docs_staff_read   on public.curriculum_plan_docs;
drop table if exists public.curriculum_plan_docs;

-- 확인 (0행이어야 한다)
select tablename from pg_tables where schemaname = 'public' and tablename = 'curriculum_plan_docs';
