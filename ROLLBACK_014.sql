-- 쌍둥이 문항 파이프라인 — 롤백 SQL
-- 작성 2026-09-23 · GPT-EXEC-003 §224
--
-- 무엇: `쌍둥이_설치.sql` 이 만든 것만 제거합니다.
--       함수 → 테이블 → 스키마 순으로 안전하게 지웁니다.
--
-- ⚠ 확인하고 실행하세요
--   후보와 승인된 예제를 전부 지웁니다. 검수해서 승인해 둔 것도 사라집니다.
--   §0 으로 무엇이 지워질지 먼저 세어 보세요.
--
-- 안전한 점
--   기존 problems·students·users 는 건드리지 않습니다. 참조(FK)만 했습니다.
--   이 파일에는 운영 데이터를 지우는 구문이 없습니다.
--
-- ⚠ 지금은 작성만 해둔 상태입니다. 실행하지 마세요.


-- ════════════════════════════════════════════════════════════════════
-- 0) 먼저 — 무엇이 지워지는지 확인 (이것만 먼저 돌려 보세요)
-- ════════════════════════════════════════════════════════════════════

select
  (select count(*) from ai_question_private.twin_candidates)                    as 지워질_후보,
  (select count(*) from ai_question_private.twin_candidates
    where status = 'approved')                                                  as 그중_승인됨,
  (select count(*) from ai_question_private.ai_practice_problems)               as 지워질_승인예제,
  (select count(*) from ai_question_private.ai_practice_problems
    where status = 'published')                                                 as 그중_게시중,
  (select count(*) from public.type_learning_assets)                            as 지워질_유형연결,
  (select count(*) from public.type_learning_assets where is_active)            as 그중_학생에게_활성;

-- 전부 0이면 마음 놓고 아래를 실행하셔도 됩니다.
-- "그중_게시중" 이 0이 아니면 **이미 학생에게 나간 예제가 있다는 뜻**입니다.
-- 그 경우 지우기 전에 먼저 게시를 내리시는 편이 안전합니다:
--   select public.admin_set_practice_publication(id, false)
--     from ai_question_private.ai_practice_problems where status = 'published';


-- ════════════════════════════════════════════════════════════════════
-- 1) 롤백 — 한 트랜잭션
-- ════════════════════════════════════════════════════════════════════

begin;

-- 함수부터 (권한도 함께 사라집니다)
drop function if exists public.admin_list_twin_candidates(text, uuid, integer, integer);
drop function if exists public.admin_get_twin_candidate(uuid);
drop function if exists public.admin_approve_twin_candidate(uuid, jsonb);
drop function if exists public.admin_reject_twin_candidate(uuid, text);
drop function if exists public.admin_set_student_publish_approval(uuid, boolean);
drop function if exists public.admin_set_practice_publication(uuid, boolean);
drop function if exists public.server_create_twin_candidate(jsonb);
drop function if exists public.server_update_twin_validation(uuid, jsonb);
drop function if exists public.server_list_eligible_twin_types(integer, text);
drop function if exists public.server_get_twin_batch_state(bigint, text, text, uuid);

-- 테이블 — D-057: cascade 를 쓰지 않습니다.
--   cascade 는 실행해 봐야 무엇이 딸려 지워지는지 압니다. 롤백은 사고 뒤에 돌리는 것이라
--   그때 조용히 무언가가 더 지워지면 안 됩니다. 의존을 명시적으로 끊고 순서대로 지웁니다.

--   1) type_learning_assets 가 ai_practice_problems 를 참조하므로 먼저 지웁니다
drop table if exists public.type_learning_assets;

--   2) twin_candidates → ai_practice_problems FK 를 명시적으로 끊습니다
alter table if exists ai_question_private.twin_candidates
  drop constraint if exists twin_cand_practice_fk;

--   3) 이제 의존이 없으므로 순서대로 지웁니다 (cascade 불필요)
drop table if exists ai_question_private.ai_practice_problems;
drop table if exists ai_question_private.twin_candidates;

-- 스키마 — cascade 를 쓰지 않습니다.
-- 비어 있지 않다면 예상 못 한 것이 남아 있다는 뜻이니 멈추는 편이 낫습니다.
drop schema if exists ai_question_private restrict;

commit;


-- ════════════════════════════════════════════════════════════════════
-- 2) 되돌아갔는지 확인
-- ════════════════════════════════════════════════════════════════════

select
  (select count(*) from pg_namespace where nspname = 'ai_question_private')  as 전용스키마,   -- 0
  (select count(*) from information_schema.tables
     where table_schema='public' and table_name='type_learning_assets')      as 유형연결,     -- 0
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public'
       and (p.proname like '%twin%' or p.proname like 'admin_set_practice%')) as 함수_남은것,  -- 0
  (select count(*) from public.problems)  as 문제은행_그대로,   -- 22242
  (select count(*) from public.students)  as 학생_그대로,       -- 220
  (select count(*) from public.users)     as 직원_그대로;       -- 11

-- 앞의 셋이 0이고 뒤의 셋이 그대로면 정상입니다.


-- ════════════════════════════════════════════════════════════════════
-- 참고 — 더 앞 단계로 되돌릴 일이 있다면
-- ════════════════════════════════════════════════════════════════════
-- 폐기된 `쌍둥이후보_테이블.sql` 이 만든 테이블이 남아 있는 경우:
--
--   drop table if exists public.twin_candidates;   -- 행이 0개인지 먼저 확인하세요
