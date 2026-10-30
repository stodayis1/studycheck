-- pg-learning-verify.sql — 격리 PostgreSQL 에서 저장 SQL 을 **실제로 돌려** 확인한다
--                          (GPT-EXEC-045 §5 의 필수 항목)
--
-- 규칙
--   · 틀리면 `raise exception` 으로 **멈춘다.** psql 은 `ON_ERROR_STOP=1` 로 돈다.
--   · 통과한 항목은 `[OK]` 로 한 줄씩 찍는다. 그 줄이 증거다.
--   · psql 전용 `\set`·`:'var'` 를 쓰지 않는다 (045 §2).
--   · **동시 요청**은 한 세션으로 재현할 수 없으므로 실행기(`pg-learning-test.cjs`)가
--     두 세션으로 따로 돌린다. 여기서는 나머지를 본다.
--
-- 쓰는 역할
--   이 파일은 `app_server`(= `service_role` 구성원)로 돌린다. 역할별 거부는
--   아래 §1 에서 `set role` 로 바꿔 끼워 본다.

\set ON_ERROR_STOP on

create or replace function pg_temp.ok(msg text) returns void
language plpgsql as $$ begin raise notice '[OK] %', msg; end $$;

create or replace function pg_temp.want(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then raise exception '[FAIL] %', msg; end if;
  raise notice '[OK] %', msg;
end
$$;

-- 행동 하나를 부르는 짧은 이름. payload 문맥을 인자와 맞춰 준다
create or replace function pg_temp.call(
  p_student uuid, p_problem text, p_source_kind text, p_source_ref text,
  p_run text, p_action text, p_producer text, p_kind text,
  p_at timestamptz, p_extra jsonb default '{}', p_graded text default null,
  p_watch uuid default null
) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  v := public.apply_learning_action(
    p_student, p_problem, p_source_kind, p_source_ref, p_run, p_action, p_producer,
    p_kind, p_at,
    jsonb_build_object(
      'schema_version', '0.2-draft.1',
      'occurred_at', to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'task_ref', coalesce(p_source_kind || ':' || coalesce(p_source_ref, ''), 'standalone'),
      'problem_ref', p_problem
    ) || p_extra,
    p_graded, p_watch);
  return v;
end
$$;

do $$
declare
  A uuid := '11111111-1111-4111-8111-111111111111';
  B uuid := '22222222-2222-4222-8222-222222222222';
  C uuid := '33333333-3333-4333-8333-333333333333';   -- 퇴원
  S1 text := 'aaaa1111-0000-4000-8000-000000000001';
  S2 text := 'bbbb2222-0000-4000-8000-000000000002';
  S3 text := 'cccc3333-0000-4000-8000-000000000003';
  RUN text := 'pgtest-045';
  PROD text := 'studycheck-learning-045-pilot';
  T1 timestamptz := '2026-10-29T01:00:00.000Z';
  T2 timestamptz := '2026-10-29T02:00:00.000Z';
  v jsonb;
  n bigint;
  att1 uuid;
  att2 uuid;
  k text;
begin
  -- ══════════════════════════════════════════════════════════════════
  -- A. 정상 저장 — applied 반환 모양
  -- ══════════════════════════════════════════════════════════════════
  v := pg_temp.call(A, '101', 'exam_sheet', S1, RUN, 'act-A-1', PROD, 'answer', T1,
                    jsonb_build_object('event_type', 'problem_answered', 'answer', '③'), 'correct');
  perform pg_temp.want(v ->> 'verdict' = 'applied', 'A1 정상 저장이 applied 다');
  perform pg_temp.want(v ->> 'graded' = 'correct',
    'A2 applied 반환에 graded 가 있다 (043 은 빠져 있었다)');
  foreach k in array array['verdict', 'attempt_id', 'graded', 'action_kind',
                           'changed_fields', 'reason']
  loop
    perform pg_temp.want(v ? k, format('A3 applied 반환에 %s 가 있다', k));
  end loop;
  att1 := (v ->> 'attempt_id')::uuid;

  -- ══════════════════════════════════════════════════════════════════
  -- B. 동일 재전송 → duplicate. **updated_at 을 바꾸지 않는다**
  -- ══════════════════════════════════════════════════════════════════
  declare v_before timestamptz; v_after timestamptz; begin
    select updated_at into v_before from public.learning_attempts where id = att1;
    perform pg_sleep(0.05);
    v := pg_temp.call(A, '101', 'exam_sheet', S1, RUN, 'act-A-1', PROD, 'answer', T1,
                      jsonb_build_object('event_type', 'problem_answered', 'answer', '③'), 'correct');
    perform pg_temp.want(v ->> 'verdict' = 'duplicate', 'B1 같은 봉투 재전송은 duplicate 다');
    perform pg_temp.want(v ->> 'graded' = 'correct', 'B2 duplicate 에 처음 채점이 보존된다');
    select updated_at into v_after from public.learning_attempts where id = att1;
    perform pg_temp.want(v_before = v_after,
      'B3 duplicate 가 updated_at 을 바꾸지 않는다 (043 의 결함)');
  end;
  select count(*) into n from public.learning_actions
    where student_id = A and action_id = 'act-A-1';
  perform pg_temp.want(n = 1, 'B4 duplicate 가 줄을 더 만들지 않는다');

  -- ══════════════════════════════════════════════════════════════════
  -- C. 같은 행동 id · **다른 문맥** → conflict (043 은 중복으로 봤다)
  -- ══════════════════════════════════════════════════════════════════
  -- payload·시각은 그대로 두고 **문항만** 바꾼다
  v := pg_temp.call(A, '9007199254740993', 'exam_sheet', S1, RUN, 'act-A-1', PROD, 'answer', T1,
                    jsonb_build_object('event_type', 'problem_answered', 'answer', '③'), 'correct');
  perform pg_temp.want(v ->> 'verdict' = 'conflict',
    'C1 같은 id·다른 문항은 conflict 다 (문맥을 본다)');
  perform pg_temp.want(v -> 'changed_fields' ? 'problem_id', 'C2 바뀐 칸에 problem_id 가 적힌다');
  perform pg_temp.want(v ->> 'graded' is null, 'C3 conflict 를 채점하지 않는다');
  perform pg_temp.want((v ->> 'attempt_id')::uuid = att1,
    'C4 conflict 가 **새 시도를 만들지 않는다** — 기존 시도에 붙는다');
  select count(*) into n from public.learning_attempts where run_id = RUN;
  perform pg_temp.want(n = 1, 'C5 conflict 뒤에도 시도가 하나다');
  select count(*) into n from public.learning_actions
    where action_id = 'act-A-1' and is_canonical = false;
  perform pg_temp.want(n = 1, 'C6 conflict 수신이 보존된다 (is_canonical = false)');
  select count(*) into n from public.learning_actions
    where action_id = 'act-A-1' and received_context is not null;
  perform pg_temp.want(n = 1, 'C7 받은 문맥이 payload 를 고치지 않고 따로 남는다');

  -- 같은 id · **다른 종류** 도 conflict
  v := pg_temp.call(A, '101', 'exam_sheet', S1, RUN, 'act-A-1', PROD, 'stuck', T1,
                    jsonb_build_object('event_type', 'stuck_reported', 'stuck_axis', 'recall'));
  perform pg_temp.want(v ->> 'verdict' = 'conflict', 'C8 같은 id·다른 종류도 conflict 다');
  perform pg_temp.want(v -> 'changed_fields' ? 'kind', 'C9 바뀐 칸에 kind 가 적힌다');

  -- ── C10~C13 **payload·시각·문항이 똑같은데 문맥만 다른** 경우 ────────
  --
  -- 왜 따로 두나: 위 C1·C8 은 payload 도 함께 달라진다 (`problem_ref`·`event_type`).
  -- 그래서 **문맥 검사를 지워도 통과한다** — 일부러 망가뜨려 보고 알았다.
  -- `run_id` · `source_kind` · `source_ref` · `kind` 는 payload 에 없으므로,
  -- 그것만 바꿔야 문맥 검사를 실제로 재는 것이 된다.
  declare
    same_payload jsonb := jsonb_build_object(
      'schema_version', '0.2-draft.1',
      'occurred_at', to_char(T1 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'task_ref', 'exam_sheet:' || S1,
      'problem_ref', '101');
  begin
    -- 기준 한 줄
    v := public.apply_learning_action(A, '101', 'exam_sheet', S1, RUN, 'act-ctx-1', PROD,
           'open', T1, same_payload, null, null);
    perform pg_temp.want(v ->> 'verdict' = 'applied', 'C10 문맥 시험 기준 줄이 저장된다');

    -- ① **run_id 만** 다르다
    v := public.apply_learning_action(A, '101', 'exam_sheet', S1, 'other-run-ctx', 'act-ctx-1',
           PROD, 'open', T1, same_payload, null, null);
    perform pg_temp.want(v ->> 'verdict' = 'conflict',
      'C11 payload·시각·문항이 같고 **run_id 만** 달라도 conflict 다');
    perform pg_temp.want(v -> 'changed_fields' ? 'run_id', 'C11b 바뀐 칸에 run_id 가 적힌다');

    -- ② **kind 만** 다르다 (payload 는 글자까지 같다)
    v := public.apply_learning_action(A, '101', 'exam_sheet', S1, RUN, 'act-ctx-1', PROD,
           'stuck', T1, same_payload, null, null);
    perform pg_temp.want(v ->> 'verdict' = 'conflict',
      'C12 payload 가 같고 **kind 만** 달라도 conflict 다');
    perform pg_temp.want(v -> 'changed_fields' ? 'kind', 'C12b 바뀐 칸에 kind 가 적힌다');

    -- ③ **source_ref 만** 다르다 (같은 학생이 받은 다른 시험지)
    v := public.apply_learning_action(A, '101', 'exam_sheet', S3, RUN, 'act-ctx-1', PROD,
           'open', T1, same_payload, null, null);
    perform pg_temp.want(v ->> 'verdict' = 'conflict',
      'C13 payload 가 같고 **source_ref 만** 달라도 conflict 다');
    perform pg_temp.want(v -> 'changed_fields' ? 'source_ref', 'C13b 바뀐 칸에 source_ref 가 적힌다');

    -- ④ 그리고 **정말 같으면** 중복이다 (위 셋이 과민한 것이 아님을 보인다)
    v := public.apply_learning_action(A, '101', 'exam_sheet', S1, RUN, 'act-ctx-1', PROD,
           'open', T1, same_payload, null, null);
    perform pg_temp.want(v ->> 'verdict' = 'duplicate',
      'C14 문맥까지 같으면 중복이다 (문맥 검사가 과민하지 않다)');
  end;

  -- ── C15 같은 행동 키에 **advisory lock** 을 실제로 잡는가 ────────────
  --
  -- 「동시 요청을 직렬화한다」를 두 세션의 **타이밍**으로 재면, 상대가 아직
  -- 시작하지 않은 것을 「기다리는 중」으로 오해할 수 있다 (그 실수를 했다).
  -- 그래서 잠금 자체를 본다 — 같은 트랜잭션 안에서 `pg_locks` 를 읽으면
  -- 함수가 **그 행동 키로** 잠갔는지가 숫자로 나온다.
  declare
    v_key bigint := hashtextextended(A::text || '|' || PROD || '|' || 'act-lock-1', 0);
    v_hi bigint := (v_key >> 32) & 4294967295;
    v_lo bigint := v_key & 4294967295;
    v_held boolean;
  begin
    perform public.apply_learning_action(A, '101', 'exam_sheet', S1, RUN, 'act-lock-1', PROD,
      'open', T1, jsonb_build_object('schema_version', '0.2-draft.1',
        'occurred_at', to_char(T1 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'task_ref', 'exam_sheet:' || S1, 'problem_ref', '101'), null, null);
    select exists (
      select 1 from pg_catalog.pg_locks l
      where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid()
        and l.classid::bigint = v_hi and l.objid::bigint = v_lo
    ) into v_held;
    perform pg_temp.want(v_held,
      'C15 함수가 **그 행동 키로** advisory lock 을 잡는다 (동시 요청 직렬화의 근거)');
  end;

  -- ══════════════════════════════════════════════════════════════════
  -- D. 시도 유일키 — **다른 시험지의 같은 문항은 다른 시도다** (§5)
  -- ══════════════════════════════════════════════════════════════════
  v := pg_temp.call(A, '101', 'exam_sheet', S3, RUN, 'act-A-2', PROD, 'answer', T2,
                    jsonb_build_object('event_type', 'problem_answered', 'answer', '④'), 'wrong');
  perform pg_temp.want(v ->> 'verdict' = 'applied', 'D1 다른 시험지의 같은 문항이 저장된다');
  att2 := (v ->> 'attempt_id')::uuid;
  perform pg_temp.want(att1 <> att2,
    'D2 다른 시험지면 **다른 시도**다 (043 의 키는 둘을 합쳤다)');
  select count(*) into n from public.learning_attempts where run_id = RUN;
  perform pg_temp.want(n = 2, 'D3 시도가 둘이다');

  -- standalone (source_ref 가 NULL) 도 중복이 쌓이지 않는다
  perform pg_temp.call(A, '101', 'standalone', null, RUN, 'act-A-3', PROD, 'open', T2,
                       jsonb_build_object('event_type', 'attempt_opened'));
  perform pg_temp.call(A, '101', 'standalone', null, RUN, 'act-A-4', PROD, 'stuck', T2,
                       jsonb_build_object('event_type', 'stuck_reported', 'stuck_axis', 'recall'));
  select count(*) into n from public.learning_attempts
    where run_id = RUN and source_kind = 'standalone';
  perform pg_temp.want(n = 1,
    'D4 source_ref 가 NULL 이어도 시도가 하나다 (coalesce 로 묶었다)');

  -- ══════════════════════════════════════════════════════════════════
  -- E. 범위 — 학생 A/B · 퇴원 · 배정 · 참조 소유권
  -- ══════════════════════════════════════════════════════════════════
  begin
    perform pg_temp.call(B, '101', 'exam_sheet', S1, RUN, 'act-B-1', PROD, 'open', T1,
                         jsonb_build_object('event_type', 'attempt_opened'));
    raise exception '[FAIL] E1 남의 시험지로 저장이 됐다';
  exception when insufficient_privilege then
    perform pg_temp.ok('E1 남의 시험지는 거부된다');
  end;

  begin
    perform pg_temp.call(A, '201', 'exam_sheet', S1, RUN, 'act-A-9', PROD, 'open', T1,
                         jsonb_build_object('event_type', 'attempt_opened'));
    raise exception '[FAIL] E2 그 시험지에 없는 문항이 저장됐다';
  exception when insufficient_privilege then
    perform pg_temp.ok('E2 그 시험지의 문항이 아니면 거부된다');
  end;

  begin
    perform pg_temp.call(C, '101', 'exam_sheet', S1, RUN, 'act-C-1', PROD, 'open', T1,
                         jsonb_build_object('event_type', 'attempt_opened'));
    raise exception '[FAIL] E3 퇴원 학생으로 저장이 됐다';
  exception when insufficient_privilege then
    perform pg_temp.ok('E3 활성 학생이 아니면 거부된다');
  end;

  begin
    perform pg_temp.call(A, '101', 'exam_sheet', S1, RUN, 'act-A-10', PROD, 'help', T1,
                         jsonb_build_object('event_type', 'help_opened'), null,
                         'eeee0002-0000-4000-8000-000000000002');   -- B 의 시청 기록
    raise exception '[FAIL] E4 남의 시청 기록을 가리켰는데 저장됐다';
  exception when insufficient_privilege then
    perform pg_temp.ok('E4 남의 시청 기록을 가리키면 거부된다');
  end;

  begin
    perform pg_temp.call(A, '999999', 'standalone', null, RUN, 'act-A-11', PROD, 'open', T1,
                         jsonb_build_object('event_type', 'attempt_opened'));
    raise exception '[FAIL] E5 없는 문항이 저장됐다';
  exception when foreign_key_violation then
    perform pg_temp.ok('E5 없는 문항은 거부된다');
  end;

  -- ══════════════════════════════════════════════════════════════════
  -- F. 인자·문맥 검사
  -- ══════════════════════════════════════════════════════════════════
  begin
    perform public.apply_learning_action(
      A, '101', 'exam_sheet', S1, RUN, 'act-A-12', PROD, 'open', T1,
      jsonb_build_object('problem_ref', '102',
        'occurred_at', to_char(T1 at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
      null, null);
    raise exception '[FAIL] F1 payload 문맥이 어긋났는데 저장됐다';
  exception when invalid_parameter_value then
    perform pg_temp.ok('F1 payload 의 problem_ref 가 인자와 다르면 거부된다');
  end;

  begin
    perform pg_temp.call(A, '101', 'exam_sheet', S1, RUN, 'act-A-13', PROD, 'open', T1,
                         jsonb_build_object('event_type', 'attempt_opened'), 'correct');
    raise exception '[FAIL] F2 열기 행동에 채점이 실렸는데 저장됐다';
  exception when invalid_parameter_value then
    perform pg_temp.ok('F2 답·확인이 아닌 행동에는 채점을 실을 수 없다');
  end;

  begin
    perform pg_temp.call(A, 'not-a-number', 'standalone', null, RUN, 'act-A-14', PROD, 'open', T1,
                         jsonb_build_object('event_type', 'attempt_opened'));
    raise exception '[FAIL] F3 문항 id 가 글자인데 저장됐다';
  exception when invalid_parameter_value then
    perform pg_temp.ok('F3 문항 id 가 정수가 아니면 거부된다');
  end;

  -- 안전 정수를 **넘는** 문항 id 가 그대로 저장된다
  v := pg_temp.call(A, '9007199254740993', 'exam_sheet', S1, RUN, 'act-A-15', PROD, 'answer', T2,
                    jsonb_build_object('event_type', 'problem_answered', 'answer', '⑤'), 'correct');
  perform pg_temp.want(v ->> 'verdict' = 'applied', 'F4 큰 정수 문항 id 가 저장된다');
  select count(*) into n from public.learning_attempts
    where run_id = RUN and problem_id = 9007199254740993;
  perform pg_temp.want(n = 1, 'F5 큰 정수 id 가 값이 바뀌지 않고 저장됐다');

  -- ══════════════════════════════════════════════════════════════════
  -- G. 중간 실패는 **전체 되돌림**
  -- ══════════════════════════════════════════════════════════════════
  declare v_att bigint; v_act bigint; begin
    select count(*) into v_att from public.learning_attempts;
    select count(*) into v_act from public.learning_actions;
    begin
      -- 새 시도를 만들 수 있는 요청이지만 **시청 기록 소유 검사에서 막힌다**.
      -- 043 은 시도를 먼저 만들었으므로 이 자리에서 시도만 남았다
      perform pg_temp.call(A, '102', 'standalone', null, RUN, 'act-A-16', PROD, 'help', T1,
                           jsonb_build_object('event_type', 'help_opened'), null,
                           'eeee0002-0000-4000-8000-000000000002');
    exception when insufficient_privilege then
      null;
    end;
    perform pg_temp.want(
      (select count(*) from public.learning_attempts) = v_att
      and (select count(*) from public.learning_actions) = v_act,
      'G1 중간에 막히면 시도도 행동도 남지 않는다');
  end;

  -- ══════════════════════════════════════════════════════════════════
  -- H. 되읽기 — 상태 칸이 아니라 **행동 목록**에서 센다
  -- ══════════════════════════════════════════════════════════════════
  -- 받아들인 줄은 **전부 applied** 여야 하고, 충돌 줄은 그 안에 끼지 않는다.
  -- (「한 줄뿐」이라고 세지 않는다 — 이 시험이 같은 시도에 여러 행동을 넣는다)
  select count(*) into n
  from public.learning_actions a
  where a.attempt_id = att1 and a.is_canonical and a.verdict <> 'applied';
  perform pg_temp.want(n = 0, 'H1a 받아들인 줄은 전부 applied 다');

  select count(*) into n
  from public.learning_actions a
  where a.attempt_id = att1 and a.is_canonical;
  perform pg_temp.want(n > 0, 'H1b 받아들인 줄이 있다');

  select count(*) into n
  from public.learning_actions a
  where a.attempt_id = att1 and not a.is_canonical;
  perform pg_temp.want(n > 0,
    'H1c 충돌 줄이 **보존되어 있다** (상태에는 안 들어가고 기록으로만 남는다)');

  -- 같은 행동 id 로 받아들인 줄은 **하나뿐**이다 (부분 유일키)
  select count(*) into n from (
    select action_id from public.learning_actions
    where is_canonical group by student_id, producer, action_id having count(*) > 1
  ) x;
  perform pg_temp.want(n = 0, 'H1d 같은 행동 키로 받아들인 줄이 둘이 되지 않는다');

  perform pg_temp.want(
    (select graded from public.learning_actions
      where attempt_id = att1 and is_canonical and kind = 'answer') = 'correct',
    'H2 되읽은 채점이 저장한 값과 같다');

  -- 상태 칸(first_result 같은 것)을 만들지 않았다
  perform pg_temp.want(not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.learning_attempts'::regclass
      and attname in ('first_result', 'last_result', 'retry_result', 'stuck_axis')
      and attnum > 0 and not attisdropped),
    'H3 시도 표에 상태 칸을 만들지 않았다');

  raise notice '[DONE] 본 묶음 통과';
end
$$;
