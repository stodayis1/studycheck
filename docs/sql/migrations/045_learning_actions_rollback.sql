-- 045_learning_actions_rollback.sql — 되돌리기 **세 단계**
--
-- GPT-EXEC-045 §2 마지막 줄: 「rollback 은 **차단 · 이번 run+고정 시험계정 정리 ·
--   기능 철수** 단계를 구분한다. 역할 권한을 빠짐없이 회수하고 범위 밖 삭제는 금지한다.
--   원장님용 최종 실행본은 psql 전용 `\set`/`:'var'` 편집을 요구하지 않는 형태로 만든다.
--   **지금 원장님에게 실행을 요구하지 않는다.**」
--
-- 그래서 이 파일은
--   · `\set` 같은 psql 전용 문법을 쓰지 않는다 — Supabase SQL 편집기에 그대로 붙여도 된다
--   · 세 단계를 **따로** 두었다. 필요한 단계만 골라 실행한다
--   · 기본은 **전부 주석 처리**다. 실행하려면 그 단계를 감싼 주석 기호만 지운다
--   · 지우는 범위는 `run_id` 하나로 좁다. `drop table` 이나 전체 delete 를 기본으로 쓰지 않는다
--
-- ────────────────────────────────────────────────────────────────────
-- 고쳐야 할 곳은 **아래 한 줄뿐**이다
--
--   2단계 안의   where run_id = 'pilot-045'
--
--   그 'pilot-045' 를 치울 묶음 이름으로 바꾼다 (앱의 `LEARNING_RUN_ID` 와 같은 값).
--   다른 곳은 손대지 않는다.
-- ────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════
-- 1단계 — **차단만.** 자료를 지우지 않는다
-- ════════════════════════════════════════════════════════════════════
--
-- 무슨 일이 생겼는지 모를 때 **먼저 이것만** 한다. 더 들어오지 않게 막고,
-- 이미 쌓인 기록은 그대로 두고 본다. 되돌리기 중 가장 먼저·가장 안전한 단계다.
--
-- ⚠️ **권한 회수만으로는 함수 소유자를 막지 못한다.**
--   격리 PostgreSQL 17.6 에서 실제로 돌려 보고 알았다 — `revoke` 를 빠짐없이 해도
--   함수 **소유자**는 implicit EXECUTE 로 계속 부를 수 있었다 (`applied` 가 떴다).
--   운영에서는 서버가 소유자가 아니라 `service_role` 로 들어오므로 회수로 막히지만,
--   「차단」이라고 적은 단계가 **누구에게는 안 막힌다**면 그건 차단이 아니다.
--   그래서 권한 회수에 더해, 호출자 검사 함수를 **항상 거짓**으로 바꿔 둔다.
--   소유자든 service_role 이든 그 자리에서 멈춘다.
--
-- 되살리는 법: 045_learning_actions.sql 을 다시 실행한다 (§4 가 검사 함수를,
--   §6 이 권한을 원래대로 돌려 놓는다). 표·자료는 손대지 않았으므로 그대로다.

/*
begin;

-- ① 호출자 검사를 **항상 거짓**으로. 소유자까지 막는다
create or replace function public.learning_caller_is_server()
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $guard$ select false $guard$;

comment on function public.learning_caller_is_server() is
  '되돌리기 1단계로 차단됨. 045_learning_actions.sql 을 다시 실행하면 풀린다';

-- ② 그리고 권한도 **빠짐없이** 회수한다 — public 하나만 회수하면 직접 권한이 남는다
do $block$
declare
  v_fn text := 'public.apply_learning_action(uuid, text, text, text, text, text, text, text, '
             || 'timestamptz, jsonb, text, uuid)';
  v_guard text := 'public.learning_caller_is_server()';
  r text;
begin
  execute 'revoke all on function ' || v_fn || ' from public';
  execute 'revoke all on function ' || v_guard || ' from public';
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute 'revoke all on function ' || v_fn || ' from ' || pg_catalog.quote_ident(r);
      execute 'revoke all on function ' || v_guard || ' from ' || pg_catalog.quote_ident(r);
    end if;
  end loop;
end
$block$;

commit;
*/


-- ════════════════════════════════════════════════════════════════════
-- 2단계 — **이번 묶음의 기록만** 치운다
-- ════════════════════════════════════════════════════════════════════
--
-- 시범을 접지만 기능은 남길 때. 지우는 범위는 `run_id` **하나**다.
-- 다른 묶음·다른 학생의 기록은 건드리지 않는다.
--
-- `learning_actions` 는 `attempt_id` 에 `on delete cascade` 가 걸려 있어 시도를 지우면
-- 함께 지워진다. 그래도 **먼저 센다** — 지운 뒤에 「몇 줄이었지」를 알 수 없기 때문이다.
--
-- ⚠️ 아래 두 곳의 'pilot-045' 를 치울 묶음 이름으로 바꾼다.

/*
begin;

-- ① 먼저 센다. 이 숫자를 기록에 남긴다
select 'learning_attempts' as 표, count(*) as 지울_행수
  from public.learning_attempts where run_id = 'pilot-045'
union all
select 'learning_actions', count(*)
  from public.learning_actions where run_id = 'pilot-045';

-- ② 범위 밖이 섞여 있지 않은지 본다. 0 이 아니면 **멈춘다**
do $block$
declare v_bad bigint;
begin
  select count(*) into v_bad
  from public.learning_actions a
  join public.learning_attempts t on t.id = a.attempt_id
  where a.run_id = 'pilot-045' and t.run_id <> 'pilot-045';
  if v_bad > 0 then
    raise exception '묶음이 섞인 행이 % 개 있습니다 — 지우지 않고 멈춥니다', v_bad;
  end if;
end
$block$;

-- ③ 지운다. 이 묶음만
delete from public.learning_attempts where run_id = 'pilot-045';
-- 시도에 매달리지 않은 행동 줄이 남을 수 없지만, 확인 삼아 같은 범위로 한 번 더
delete from public.learning_actions where run_id = 'pilot-045';

commit;
*/


-- ════════════════════════════════════════════════════════════════════
-- 3단계 — **기능 철수.** 표와 함수를 없앤다
-- ════════════════════════════════════════════════════════════════════
--
-- 이 학습 기록 기능을 아예 접을 때만. **모든 묶음의 기록이 사라진다.**
-- 2단계를 먼저 하고, 남길 것이 없다는 것을 확인한 뒤에 한다.
--
-- 기존 운영 표(`students` · `problems` · `video_watch_logs` · `gradings` ·
-- `exam_sheet_problems`)는 **건드리지 않는다.** 참조만 했으므로 지울 것이 없다.

/*
begin;

-- 남은 행이 있으면 보여 주고 멈춘다 — 모르고 지우지 않게
do $block$
declare v_n bigint;
begin
  select count(*) into v_n from public.learning_attempts;
  if v_n > 0 then
    raise exception '아직 시도 % 건이 남아 있습니다. 2단계로 묶음별로 치운 뒤 다시 하세요', v_n;
  end if;
end
$block$;

drop function if exists public.apply_learning_action(
  uuid, text, text, text, text, text, text, text, timestamptz, jsonb, text, uuid);
drop function if exists public.learning_caller_is_server();

-- 정책은 표와 함께 사라진다. 기존 표의 정책을 푸는 구문은 **없다**
drop table if exists public.learning_actions;
drop table if exists public.learning_attempts;

commit;
*/
