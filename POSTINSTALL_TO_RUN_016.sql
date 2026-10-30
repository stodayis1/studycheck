-- 쌍둥이 문항 파이프라인 — 설치 후 검증
-- 작성 2026-09-23 · GPT-EXEC-003 §236 · GPT-EXEC-005 작업 C 반영
--
-- 무엇: `쌍둥이_설치.sql` 을 돌린 **뒤에** 안전장치가 정말 작동하는지 확인합니다.
--
-- ⚠ 이 파일은 **전체가 begin ... rollback** 입니다.
--    검증용 데이터를 넣었다가 마지막에 전부 되돌리므로 운영 데이터가 남지 않습니다.
--    **실패하면 예외로 중단되므로 어차피 커밋될 수 없습니다.**
--
-- ⚠ GPT-EXEC-005 반영 사항
--    - psql 콜론-따옴표 치환 문법을 제거했습니다. Supabase SQL Editor 에서 그대로 돌아갑니다
--    - 실패를 `warning` 이 아니라 **`raise exception`** 으로 처리합니다 (D-056).
--      이전 판은 실패해도 초록색으로 끝나 성공처럼 보일 수 있었습니다
--    - 예상 오류는 **정확한 오류 코드**를 확인합니다 (`when others` 로 뭉개지 않습니다)
--
-- 실행: Supabase → StudyCheck 프로젝트 → SQL Editor → 전체 붙여넣고 Run


begin;

-- ════════════════════════════════════════════════════════════════════
-- ★ 설정 — 고칠 것이 없습니다 (D-112)
-- ════════════════════════════════════════════════════════════════════
--
-- 예전 판은 파일 안의 빈 자리를 원장님이 직접 uuid 로 바꿔야 했습니다.
-- 운영 SQL 을 손으로 고치면 엉뚱한 줄만 선택해 실행하거나 uuid 가 문서에 남기 쉽습니다.
-- 이제 **검증 SQL 이 스스로 찾습니다.** 붙여넣고 Run 만 하시면 됩니다.
--
-- 고르는 규칙 (여러 명이어도 항상 같은 사람을 고르도록 정렬해 1건만 씁니다)
--   관리자 : public.users.role = 'admin' 이고 auth.users 에 같은 id 가 있는 행 중
--            id 를 문자열로 정렬해 첫 번째
--   학생   : public.students.session_uid 가 비어 있지 않은 행 중
--            session_uid 를 문자열로 정렬해 첫 번째
--
-- 고른 uuid 는 **어디에도 출력하지 않습니다** (결과표·notice·예외문 전부).
-- 아래 임시 테이블은 트랜잭션 안에서만 살아 있고 마지막 rollback 으로 사라집니다.

create temp table _twin_verify_cfg on commit drop as
select
  (select a.id::text
     from auth.users a
     join public.users u on u.id = a.id
    where u.role = 'admin'
    order by a.id::text
    limit 1)                       as admin_uid_text,
  (select s.session_uid::text
     from public.students s
    where s.session_uid is not null
    order by s.session_uid::text
    limit 1)                       as student_uid_text;

do $cfg$
declare
  v_admin text;
  v_stu   text;
begin
  select admin_uid_text, student_uid_text into v_admin, v_stu from _twin_verify_cfg;

  -- 후보가 없으면 **원인을 알 수 있게** 따로 알린다 (§120).
  -- 실제 uuid 는 메시지에 넣지 않는다 (§122).
  if v_admin is null then
    raise exception E'\n\n  ★ 관리자 계정을 찾지 못했습니다.\n'
      '  조건: public.users.role = ''admin'' 이고 auth.users 에 같은 id 가 있는 행\n'
      '  원장님 계정의 public.users.role 이 admin 인지 확인한 뒤 다시 실행하세요.\n';
  end if;

  if v_stu is null then
    raise exception E'\n\n  ★ session_uid 가 있는 학생을 찾지 못했습니다.\n'
      '  조건: public.students.session_uid is not null\n'
      '  학생이 한 번도 로그인한 적이 없으면 비어 있습니다.\n'
      '  학생 한 명이 앱에 로그인한 뒤 다시 실행하세요.\n';
  end if;

  -- uuid 로 캐스팅되지 않으면 여기서 바로 걸린다
  perform v_admin::uuid, v_stu::uuid;
  raise notice '설정 확인: OK (관리자 1명 · 학생 1명 자동 선택. uuid 는 출력하지 않습니다)';
end;
$cfg$;


-- ════════════════════════════════════════════════════════════════════
-- 1) 구조 — 함수 10개의 보안 설정
-- ════════════════════════════════════════════════════════════════════

do $t$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('admin_list_twin_candidates','admin_get_twin_candidate',
                       'admin_approve_twin_candidate','admin_reject_twin_candidate',
                       'admin_set_student_publish_approval','admin_set_practice_publication',
                       'server_create_twin_candidate','server_update_twin_validation',
                       'server_list_eligible_twin_types','server_get_twin_batch_state')
     and (not p.prosecdef or coalesce(p.proconfig::text,'') not like '%search_path%');
  if v_bad > 0 then
    raise exception '[1] 보안 설정이 빠진 함수 %개 (security definer / search_path)', v_bad;
  end if;

  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('admin_list_twin_candidates','admin_get_twin_candidate',
                       'admin_approve_twin_candidate','admin_reject_twin_candidate',
                       'admin_set_student_publish_approval','admin_set_practice_publication',
                       'server_create_twin_candidate','server_update_twin_validation',
                       'server_list_eligible_twin_types','server_get_twin_batch_state');
  if v_bad <> 10 then
    raise exception '[1] 함수가 10개가 아닙니다 (%개)', v_bad;
  end if;
  raise notice '[1] 함수 10개 보안 설정: OK';
end;
$t$;


-- ════════════════════════════════════════════════════════════════════
-- 2) 권한 — has_function_privilege
-- ════════════════════════════════════════════════════════════════════

do $t$
declare
  r record;
  v_actual boolean;
begin
  for r in
    select * from (values
      ('public.admin_list_twin_candidates(text,uuid,integer,integer)', 'anon',          false),
      ('public.admin_list_twin_candidates(text,uuid,integer,integer)', 'authenticated', true),
      ('public.admin_approve_twin_candidate(uuid,jsonb)',              'anon',          false),
      ('public.admin_approve_twin_candidate(uuid,jsonb)',              'authenticated', true),
      ('public.admin_set_practice_publication(uuid,boolean)',          'anon',          false),
      ('public.server_create_twin_candidate(jsonb)',                   'anon',          false),
      ('public.server_create_twin_candidate(jsonb)',                   'authenticated', false),
      ('public.server_create_twin_candidate(jsonb)',                   'service_role',  true),
      ('public.server_update_twin_validation(uuid,jsonb)',             'authenticated', false),
      ('public.server_update_twin_validation(uuid,jsonb)',             'service_role',  true),
      -- §290: 새로 추가한 대상유형 집계 RPC 도 service_role 전용이어야 한다
      ('public.server_list_eligible_twin_types(integer,text)',          'anon',          false),
      ('public.server_list_eligible_twin_types(integer,text)',          'authenticated', false),
      ('public.server_list_eligible_twin_types(integer,text)',          'service_role',  true),
      -- §198: batch 상태 조회 RPC 도 service_role 전용이어야 한다
      ('public.server_get_twin_batch_state(bigint,text,text,uuid)',     'anon',          false),
      ('public.server_get_twin_batch_state(bigint,text,text,uuid)',     'authenticated', false),
      ('public.server_get_twin_batch_state(bigint,text,text,uuid)',     'service_role',  true)
    ) as t(fn, role_name, expected)
  loop
    v_actual := has_function_privilege(r.role_name, r.fn, 'EXECUTE');
    if v_actual <> r.expected then
      raise exception '[2] 권한 불일치: % / % — 기대 %, 실제 %', r.fn, r.role_name, r.expected, v_actual;
    end if;
  end loop;
  raise notice '[2] 역할별 함수 권한 16가지: OK';
end;
$t$;
-- authenticated 가 admin_* 에 true 인 것은 정상입니다.
-- 실제 거부는 함수 본문의 is_admin() 이 합니다 (아래 3에서 확인).


-- ════════════════════════════════════════════════════════════════════
-- 3) 역할별 실제 호출 — 가장 중요합니다
-- ════════════════════════════════════════════════════════════════════
-- 예상 오류를 **정확한 코드**로 확인합니다 (D-056).

-- (가) 학생(비관리자)이 관리자 함수 → forbidden (SQLSTATE 42501)
do $t$
declare
  v_stu text;
  v_sqlstate text;
  v_msg text;
begin
  select student_uid_text into v_stu from _twin_verify_cfg;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_stu, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_list_twin_candidates();
    reset role;
    raise exception '[3-가] 학생이 admin_* 를 호출했는데 성공했습니다. 즉시 롤백하세요.';
  exception
    when insufficient_privilege then
      v_sqlstate := '42501'; v_msg := sqlerrm;
    when others then
      v_sqlstate := sqlstate; v_msg := sqlerrm;
  end;
  reset role;

  if v_sqlstate <> '42501' or v_msg not like '%forbidden%' then
    raise exception '[3-가] 기대한 forbidden(42501) 이 아닙니다: % / %', v_sqlstate, v_msg;
  end if;
  raise notice '[3-가] 학생의 admin_* 거부: OK (42501 forbidden)';
end;
$t$;

-- (나) anon 이 관리자 함수 → 권한 없음
do $t$
declare v_sqlstate text;
begin
  set local role anon;
  begin
    perform public.admin_list_twin_candidates();
    reset role;
    raise exception '[3-나] anon 이 admin_* 를 호출했는데 성공했습니다. 즉시 롤백하세요.';
  exception when others then
    v_sqlstate := sqlstate;
  end;
  reset role;
  if v_sqlstate <> '42501' then
    raise exception '[3-나] 기대한 권한 오류(42501)가 아닙니다: %', v_sqlstate;
  end if;
  raise notice '[3-나] anon 의 admin_* 거부: OK (42501)';
end;
$t$;

-- (다) authenticated(원장이라도) 가 서버 함수 → 권한 없음
do $t$
declare
  v_admin text;
  v_sqlstate text;
begin
  select admin_uid_text into v_admin from _twin_verify_cfg;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.server_create_twin_candidate('{}'::jsonb);
    reset role;
    raise exception '[3-다] authenticated 가 server_* 를 호출했는데 성공했습니다. 즉시 롤백하세요.';
  exception when others then
    v_sqlstate := sqlstate;
  end;
  reset role;
  if v_sqlstate <> '42501' then
    raise exception '[3-다] 기대한 권한 오류(42501)가 아닙니다: %', v_sqlstate;
  end if;
  raise notice '[3-다] authenticated 의 server_* 거부: OK (원장이라도 막힌다)';
end;
$t$;

-- (라) 원장이 관리자 함수 → 정상 동작
do $t$
declare
  v_admin text;
  v_res jsonb;
begin
  select admin_uid_text into v_admin from _twin_verify_cfg;
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_res := public.admin_list_twin_candidates();
  reset role;

  if not (v_res ? 'items' and v_res ? 'total' and v_res ? 'limit' and v_res ? 'offset') then
    raise exception '[3-라] 목록 응답 모양이 다릅니다: %', v_res;
  end if;
  raise notice '[3-라] 원장의 admin_* 호출: OK (total=%)', v_res->>'total';
end;
$t$;

-- (마) 새로 추가한 대상유형 집계 RPC — authenticated 거부, service_role 허용 (§290)
do $t$
declare
  v_admin text;
  v_sqlstate text;
  v_res jsonb;
begin
  select admin_uid_text into v_admin from _twin_verify_cfg;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.server_list_eligible_twin_types(5, null);
    reset role;
    raise exception '[3-마] authenticated 가 server_list_eligible_twin_types 를 호출했는데 성공했습니다.';
  exception when others then
    v_sqlstate := sqlstate;
  end;
  reset role;
  if v_sqlstate <> '42501' then
    raise exception '[3-마] 기대한 권한 오류(42501)가 아닙니다: %', v_sqlstate;
  end if;

  set local role anon;
  begin
    perform public.server_list_eligible_twin_types(5, null);
    reset role;
    raise exception '[3-마] anon 이 server_list_eligible_twin_types 를 호출했는데 성공했습니다.';
  exception when others then
    v_sqlstate := sqlstate;
  end;
  reset role;
  if v_sqlstate <> '42501' then
    raise exception '[3-마] anon 에서 기대한 권한 오류(42501)가 아닙니다: %', v_sqlstate;
  end if;

  set local role service_role;
  v_res := public.server_list_eligible_twin_types(5, null);
  reset role;
  if v_res is null or not (v_res ? 'items') or jsonb_typeof(v_res->'items') <> 'array' then
    raise exception '[3-마] 응답 모양이 다릅니다 (items 배열이 아님): %', v_res;
  end if;
  raise notice '[3-마] 대상유형 집계 RPC: authenticated·anon 거부 / service_role 허용: OK';
end;
$t$;

-- (바) batch 상태 조회 RPC — 역할별 권한과 **최소 응답 모양** (§253)
do $t$
declare
  v_admin text;
  v_sqlstate text;
  v_res jsonb;
begin
  select admin_uid_text into v_admin from _twin_verify_cfg;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.server_get_twin_batch_state(1::bigint, 'fp', 'v1', gen_random_uuid());
    reset role;
    raise exception '[3-바] authenticated 가 server_get_twin_batch_state 를 호출했는데 성공했습니다.';
  exception when others then
    v_sqlstate := sqlstate;
  end;
  reset role;
  if v_sqlstate <> '42501' then
    raise exception '[3-바] 기대한 권한 오류(42501)가 아닙니다: %', v_sqlstate;
  end if;

  set local role anon;
  begin
    perform public.server_get_twin_batch_state(1::bigint, 'fp', 'v1', gen_random_uuid());
    reset role;
    raise exception '[3-바] anon 이 server_get_twin_batch_state 를 호출했는데 성공했습니다.';
  exception when others then
    v_sqlstate := sqlstate;
  end;
  reset role;
  if v_sqlstate <> '42501' then
    raise exception '[3-바] anon 에서 기대한 권한 오류(42501)가 아닙니다: %', v_sqlstate;
  end if;

  -- 없는 batch 는 빈 목록이다. 오류가 아니다
  set local role service_role;
  v_res := public.server_get_twin_batch_state(1::bigint, 'fp-none', 'v-none', gen_random_uuid());
  reset role;
  if v_res is null or not (v_res ? 'items') or jsonb_typeof(v_res->'items') <> 'array'
     or jsonb_array_length(v_res->'items') <> 0 then
    raise exception '[3-바] 없는 batch 응답이 빈 목록이 아닙니다: %', v_res;
  end if;
  raise notice '[3-바] batch 상태 조회 RPC: 권한·빈 응답 모양 OK';
end;
$t$;


-- ════════════════════════════════════════════════════════════════════
-- 4) 상태 전이 — 검증용 데이터 (마지막에 전부 롤백됩니다)
-- ════════════════════════════════════════════════════════════════════

do $t$
declare
  v_admin    text;
  v_src      bigint;
  v_fp       text := 'verify-' || gen_random_uuid()::text;
  v_batch    uuid := gen_random_uuid();
  v_batch2   uuid := gen_random_uuid();
  v_c1 uuid; v_c1b uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_c5 uuid;
  v_state jsonb;
  v_type     text;        -- 원문의 실제 type_code (§179: payload 와 일치해야 한다)
  v_bad_src  bigint;
  v_practice uuid;
  v_status text; v_active boolean; v_safe boolean;
  v_approved boolean; v_edited boolean; v_vs text; v_cm text;
  v_cnt int;
  v_sqlstate text; v_msg text;

  v_payload  jsonb;
begin
  select admin_uid_text into v_admin from _twin_verify_cfg;

  -- 대상 조건을 **실제로** 만족하는 원문을 고른다.
  -- server_create_twin_candidate 가 DB 에서 같은 조건을 다시 보기 때문이다 (§179).
  select id, type_code into v_src, v_type from public.problems
   where twin_id is null
     and answer_text is not null and btrim(answer_text) <> ''
     and answer_kind in ('number','choice')
     and is_essay = false          -- D-082: null 은 검증용 원문에서도 제외
     and type_code is not null and btrim(type_code) <> ''
     and image_path is not null and btrim(image_path) <> ''   -- D-088
   limit 1;
  if v_src is null then
    raise exception '[4] 검증용 원문을 찾지 못했습니다';
  end if;

  -- ── 4-1) 생성 키 재시도 중복 방지 ────────────────────────────────
  v_payload := jsonb_build_object(
    'source_problem_id', v_src, 'source_fingerprint', v_fp,
    'prompt_version', 'verify-v1', 'candidate_no', 1, 'batch_id', v_batch,
    'problem_text_latex', '검증용 문항', 'answer_kind', 'number', 'answer_text', '7',
    'solution_outline', '["단계1","단계2"]'::jsonb, 'type_code', v_type);
  v_c1  := public.server_create_twin_candidate(v_payload);
  v_c1b := public.server_create_twin_candidate(v_payload);
  select count(*) into v_cnt from ai_question_private.twin_candidates where source_fingerprint = v_fp;
  if v_c1 <> v_c1b or v_cnt <> 1 then
    raise exception '[4-1] 생성 키 재시도가 중복 행을 만들었습니다 (행 %개)', v_cnt;
  end if;
  raise notice '[4-1] 생성 키 재시도 중복 방지: OK';

  -- ── 4-2) 검증 실패 → rejected ────────────────────────────────────
  v_c2 := public.server_create_twin_candidate(jsonb_build_object(
    'source_problem_id', v_src, 'source_fingerprint', v_fp,
    'prompt_version', 'verify-v1', 'candidate_no', 2, 'batch_id', v_batch,
    'problem_text_latex', '실패할 후보', 'answer_kind', 'number', 'answer_text', '9',
    'solution_outline', '["x","y"]'::jsonb, 'type_code', v_type));
  perform public.server_update_twin_validation(v_c2, jsonb_build_object(
    'format_validation_passed', false, 'verification_status', 'failed'));
  select status into v_status from ai_question_private.twin_candidates where id = v_c2;
  if v_status <> 'rejected' then
    raise exception '[4-2] 검증 실패 후보가 rejected 가 아닙니다: %', v_status;
  end if;
  raise notice '[4-2] 검증 실패 후보 rejected: OK';

  -- ── 4-3) AI 합의로 독립 검산이 켜지지 않는다 ─────────────────────
  perform public.server_update_twin_validation(v_c1, jsonb_build_object(
    'format_validation_passed', true, 'deterministic_check_passed', false,
    'ai_consensus_passed', true, 'verification_status', 'unverified',
    'unverified_reason', 'no_cas', 'check_method', 'second_model'));
  select independent_check_passed, status into v_approved, v_status
    from ai_question_private.twin_candidates where id = v_c1;
  if v_approved then
    raise exception '[4-3] AI 합의만으로 independent_check_passed 가 켜졌습니다';
  end if;
  if v_status <> 'pending_review' then
    raise exception '[4-3] 미검증 후보가 pending_review 가 아닙니다: %', v_status;
  end if;
  raise notice '[4-3] AI 합의로 독립 검산 안 켜짐 + 미검증도 검수 대기 가능: OK';

  -- ── 4-4) 불변식 위반 거부 — **별도의 새 generated 후보**로 확인 ──
  --    (이전 판은 이미 pending_review 인 후보를 재사용해 invalid_state 만 나도 통과했다)
  v_c3 := public.server_create_twin_candidate(jsonb_build_object(
    'source_problem_id', v_src, 'source_fingerprint', v_fp,
    'prompt_version', 'verify-v1', 'candidate_no', 3, 'batch_id', v_batch,
    'problem_text_latex', '불변식 확인용', 'answer_kind', 'number', 'answer_text', '11',
    'solution_outline', '["a","b"]'::jsonb, 'type_code', v_type));
  begin
    perform public.server_update_twin_validation(v_c3, jsonb_build_object(
      'format_validation_passed', true, 'deterministic_check_passed', true,
      'verification_status', 'unverified', 'check_method', 'second_model'));
    raise exception '[4-4] 불변식 위반이 통과했습니다 (deterministic=true 인데 unverified)';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%validation_invariant_violation%' then
      raise exception '[4-4] 기대한 validation_invariant_violation 이 아닙니다: %', v_msg;
    end if;
  end;
  raise notice '[4-4] 불변식 위반 거부: OK (validation_invariant_violation)';

  -- ── 4-5) 다른 batch 후보는 자동 거부 대상이 아니다 (D-058 · D-065) ─
  -- §264-8: prompt_version·candidate_no 까지 **v_c1 과 똑같이** 두고 batch 만 다르게 한다.
  -- 둘을 동시에 바꾸면 "batch 가 달라서 살아남았는지"를 알 수 없다.
  -- 새 행이 만들어지는 것 자체가 UNIQUE 키에 batch_id 가 들어갔다는 증거이기도 하다.
  v_c4 := public.server_create_twin_candidate(jsonb_build_object(
    'source_problem_id', v_src, 'source_fingerprint', v_fp,
    'prompt_version', 'verify-v1', 'candidate_no', 1, 'batch_id', v_batch2,
    'problem_text_latex', '다른 배치 후보', 'answer_kind', 'number', 'answer_text', '13',
    'solution_outline', '["a","b"]'::jsonb, 'type_code', v_type));
  if v_c4 = v_c1 then
    raise exception '[4-5] batch 만 다른데 같은 후보가 반환됐습니다 — UNIQUE 키에 batch_id 가 빠졌습니다';
  end if;
  perform public.server_update_twin_validation(v_c4, jsonb_build_object(
    'format_validation_passed', true, 'verification_status', 'unverified',
    'unverified_reason', 'no_cas', 'check_method', 'none'));
  raise notice '[4-5] batch 만 다른 후보가 별개로 생성: OK';

  -- ── 관리자 RPC 는 호출 직전에만 역할을 바꾼다 (D-121) ────────────
  --
  -- 예전 판은 여기서 한 번 `set local role authenticated` 를 한 뒤 [4-6]~[4-12] 를
  -- 통째로 그 역할로 돌렸다. 그 사이의 `ai_question_private` 직접 조회가 42501 로 막혔다.
  --
  -- 그 42501 은 **비공개 스키마 차단이 제대로 작동한다는 증거**였다 (D-120).
  -- 그러니 고칠 곳은 권한이 아니라 **검증문 쪽**이다. 권한을 넓히지 않는다.
  --
  -- 규칙: 관리자 RPC 한 번마다 역할을 켜고 **즉시 끈다.**
  --       내부 상태 직접 조회는 **항상 reset role 뒤에** 한다.
  --       실패가 예상되는 RPC 도 예외를 삼킨 뒤 반드시 reset role 로 끝낸다.

  -- ── 4-6) 교사가 내용을 고쳐서 승인 (D-055) ───────────────────────
  --    이전 판의 CHECK 제약은 여기서 실패했다. 이제 성공해야 한다.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_practice := public.admin_approve_twin_candidate(v_c1,
                  jsonb_build_object('answer_text', '77', 'concepts', '["검증개념"]'::jsonb));
  reset role;

  select teacher_approved, teacher_edited, verification_status, unverified_reason, check_method
    into v_approved, v_edited, v_vs, v_msg, v_cm
    from ai_question_private.twin_candidates where id = v_c1;

  if not v_approved or not v_edited then
    raise exception '[4-6] 교사 수정 승인 상태가 아닙니다 (approved=%, edited=%)', v_approved, v_edited;
  end if;
  if v_vs <> 'unverified' or v_msg <> 'teacher_edited' or v_cm <> 'none' then
    raise exception '[4-6] D-055 상태와 다릅니다 (vs=%, reason=%, method=%)', v_vs, v_msg, v_cm;
  end if;
  -- 자동검산 플래그가 전부 내려갔는지도 확인한다
  select count(*) into v_cnt from ai_question_private.twin_candidates
   where id = v_c1
     and not format_validation_passed and not deterministic_check_passed
     and not independent_check_passed and not ai_consensus_passed;
  if v_cnt <> 1 then
    raise exception '[4-6] 교사 수정인데 자동검산 플래그가 남아 있습니다';
  end if;
  select practice_problem_id into v_practice
    from ai_question_private.twin_candidates where id = v_c1;
  if v_practice is null then
    raise exception '[4-6] practice_problem_id 가 비어 있습니다';
  end if;
  raise notice '[4-6] 교사 수정 승인 (D-055): OK';

  -- ── 4-7) 다른 batch 후보는 살아 있어야 한다 ──────────────────────
  select status into v_status from ai_question_private.twin_candidates where id = v_c4;
  if v_status <> 'pending_review' then
    raise exception '[4-7] 다른 배치 후보가 자동 거부됐습니다 (status=%)', v_status;
  end if;
  raise notice '[4-7] 자동 거부 범위가 생성 그룹으로 한정: OK';

  -- ── 4-8) safe=false 게시 거부 (D-050) ────────────────────────────
  -- 실패가 기대되는 호출이다. 예외를 삼킨 뒤 **역할을 반드시 되돌리고** 판정한다.
  -- 판정을 begin 블록 안에서 하면 그 raise 가 자기 자신의 handler 에 잡혀 메시지가 뒤섞인다.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_set_practice_publication(v_practice, true);
    v_msg := '__NO_ERROR__';
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  if v_msg = '__NO_ERROR__' then
    raise exception '[4-8] safe=false 인데 게시됐습니다';
  end if;
  if v_msg not like '%student_publish_approval_required%' then
    raise exception '[4-8] 기대한 student_publish_approval_required 가 아닙니다: %', v_msg;
  end if;
  raise notice '[4-8] safe=false 게시 거부: OK';

  -- ── 4-9) 안전 승인 후 게시 ───────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.admin_set_student_publish_approval(v_practice, true);
  perform public.admin_set_practice_publication(v_practice, true);
  reset role;

  select status into v_status from ai_question_private.ai_practice_problems where id = v_practice;
  select is_active into v_active from public.type_learning_assets where practice_id = v_practice;
  if v_status <> 'published' or not coalesce(v_active,false) then
    raise exception '[4-9] 게시 후 상태가 다릅니다 (%, active=%)', v_status, v_active;
  end if;
  raise notice '[4-9] 안전 승인 후 게시: OK';

  -- ── 4-10) 게시 중 safe=false → 자동 게시취소 ─────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.admin_set_student_publish_approval(v_practice, false);
  reset role;

  select status into v_status from ai_question_private.ai_practice_problems where id = v_practice;
  select is_active into v_active from public.type_learning_assets where practice_id = v_practice;
  if v_status <> 'approved' or coalesce(v_active,true) then
    raise exception '[4-10] safe 해제 시 자동 게시취소가 안 됐습니다 (%, active=%)', v_status, v_active;
  end if;
  raise notice '[4-10] safe 해제 시 자동 게시취소: OK';

  -- ── 4-11) 승인 후보 사후 거부 → retired + teacher_approved=false ─
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.admin_set_student_publish_approval(v_practice, true);
  perform public.admin_set_practice_publication(v_practice, true);
  perform public.admin_reject_twin_candidate(v_c1, '계산 오류');
  reset role;

  select status, student_publish_approved into v_status, v_safe
    from ai_question_private.ai_practice_problems where id = v_practice;
  select is_active into v_active from public.type_learning_assets where practice_id = v_practice;
  select teacher_approved into v_approved
    from ai_question_private.twin_candidates where id = v_c1;

  if v_status <> 'retired' or v_safe or coalesce(v_active,true) then
    raise exception '[4-11] 사후 거부 처리가 다릅니다 (%, safe=%, active=%)', v_status, v_safe, v_active;
  end if;
  if v_approved then
    raise exception '[4-11] 거부됐는데 teacher_approved 가 true 로 남아 있습니다';
  end if;
  raise notice '[4-11] 사후 거부 → retired · 자산 비활성 · teacher_approved=false: OK';

  -- ── 4-12) retired 는 재게시·재안전승인 불가 ──────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.admin_set_practice_publication(v_practice, true);
    v_msg := '__NO_ERROR__';
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  if v_msg = '__NO_ERROR__' then
    raise exception '[4-12] retired 를 재게시했습니다';
  end if;
  if v_msg not like '%invalid_state%' then
    raise exception '[4-12] 기대한 invalid_state 가 아닙니다: %', v_msg;
  end if;
  raise notice '[4-12] retired 재게시 거부: OK (invalid_state)';

  -- ── 4-13) 대상 조건을 어긴 원문·payload 는 거부한다 (§179) ────────
  -- 앱의 필터가 빠져도 DB 가 막는지 본다. 여기서 만들어지면 D-025 위반이다.

  -- (가) 없는 원문
  begin
    perform public.server_create_twin_candidate(jsonb_build_object(
      'source_problem_id', -1, 'source_fingerprint', v_fp,
      'prompt_version', 'verify-v1', 'candidate_no', 9, 'batch_id', v_batch,
      'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
      'type_code', v_type));
    raise exception '[4-13가] 없는 원문으로 후보가 만들어졌습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%source_not_found%' then
      raise exception '[4-13가] 기대한 source_not_found 가 아닙니다: %', v_msg;
    end if;
  end;

  -- (나) payload 의 type_code 가 원문과 다름
  begin
    perform public.server_create_twin_candidate(jsonb_build_object(
      'source_problem_id', v_src, 'source_fingerprint', v_fp,
      'prompt_version', 'verify-v1', 'candidate_no', 10, 'batch_id', v_batch,
      'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
      'type_code', v_type || '-WRONG'));
    raise exception '[4-13나] 유형이 다른 payload 로 후보가 만들어졌습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%type_code_mismatch%' then
      raise exception '[4-13나] 기대한 type_code_mismatch 가 아닙니다: %', v_msg;
    end if;
  end;

  -- (다) 정답이 없는 원문 — 있을 때만 본다 (없으면 건너뛴다)
  select id into v_bad_src from public.problems
   where (answer_text is null or btrim(answer_text) = '') limit 1;
  if v_bad_src is not null then
    begin
      perform public.server_create_twin_candidate(jsonb_build_object(
        'source_problem_id', v_bad_src, 'source_fingerprint', v_fp,
        'prompt_version', 'verify-v1', 'candidate_no', 11, 'batch_id', v_batch,
        'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
        'type_code', v_type));
      raise exception '[4-13다] 정답 없는 원문으로 후보가 만들어졌습니다 (D-025 위반)';
    exception when others then
      v_msg := sqlerrm;
      if v_msg not like '%source_answer_missing%' and v_msg not like '%type_code_mismatch%' then
        raise exception '[4-13다] 기대한 거부 사유가 아닙니다: %', v_msg;
      end if;
    end;
  else
    raise notice '[4-13다] 정답 없는 원문이 없어 건너뜁니다 (판정 아님)';
  end if;

  -- (라) batch_id 없음
  begin
    perform public.server_create_twin_candidate(jsonb_build_object(
      'source_problem_id', v_src, 'source_fingerprint', v_fp,
      'prompt_version', 'verify-v1', 'candidate_no', 12,
      'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
      'type_code', v_type));
    raise exception '[4-13라] batch_id 없이 후보가 만들어졌습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%invalid_payload%' then
      raise exception '[4-13라] 기대한 invalid_payload 가 아닙니다: %', v_msg;
    end if;
  end;

  -- (마) 이미지가 없는 원문 — D-088. 그런 원문이 있을 때만 본다
  select id into v_bad_src from public.problems
   where (image_path is null or btrim(image_path) = '')
     and twin_id is null
     and answer_text is not null and btrim(answer_text) <> ''
     and answer_kind in ('number','choice')
     and is_essay = false
   limit 1;
  if v_bad_src is not null then
    begin
      perform public.server_create_twin_candidate(jsonb_build_object(
        'source_problem_id', v_bad_src, 'source_fingerprint', v_fp,
        'prompt_version', 'verify-v1', 'candidate_no', 13, 'batch_id', v_batch,
        'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
        'type_code', v_type));
      raise exception '[4-13마] 이미지 없는 원문으로 후보가 만들어졌습니다 (D-088 위반)';
    exception when others then
      v_msg := sqlerrm;
      -- 유형이 다를 수도 있으니 두 코드 모두 허용한다. 둘 다 '거부' 라는 뜻이다
      if v_msg not like '%source_image_missing%' and v_msg not like '%type_code_mismatch%' then
        raise exception '[4-13마] 기대한 source_image_missing 이 아닙니다: %', v_msg;
      end if;
    end;
    raise notice '[4-13마] 이미지 없는 원문 거부: OK';
  else
    -- 전체 검증을 거짓 통과시키지 않는다 — 건너뛴 사실을 분명히 남긴다 (§108)
    raise notice '[4-13마] 이미지 없는 대상 원문이 없어 건너뜁니다 (판정 아님)';
  end if;

  -- (바) is_essay 가 null 인 원문 — D-090. 코드가 분리됐는지 본다
  select id into v_bad_src from public.problems
   where is_essay is null
     and twin_id is null
     and answer_text is not null and btrim(answer_text) <> ''
     and answer_kind in ('number','choice')
   limit 1;
  if v_bad_src is not null then
    begin
      perform public.server_create_twin_candidate(jsonb_build_object(
        'source_problem_id', v_bad_src, 'source_fingerprint', v_fp,
        'prompt_version', 'verify-v1', 'candidate_no', 14, 'batch_id', v_batch,
        'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
        'type_code', v_type));
      raise exception '[4-13바] is_essay=null 원문으로 후보가 만들어졌습니다 (D-082 위반)';
    exception when others then
      v_msg := sqlerrm;
      if v_msg not like '%source_is_essay_unknown%' and v_msg not like '%type_code_mismatch%' then
        raise exception '[4-13바] 기대한 source_is_essay_unknown 이 아닙니다: %', v_msg;
      end if;
    end;
    raise notice '[4-13바] is_essay=null 원문 거부: OK (source_is_essay_unknown)';
  else
    raise notice '[4-13바] is_essay=null 인 대상 원문이 없어 건너뜁니다 (판정 아님)';
  end if;

  -- (사) is_essay 가 true 인 원문 — 기존 코드가 유지되는지
  select id into v_bad_src from public.problems
   where is_essay = true
     and twin_id is null
     and answer_text is not null and btrim(answer_text) <> ''
     and answer_kind in ('number','choice')
   limit 1;
  if v_bad_src is not null then
    begin
      perform public.server_create_twin_candidate(jsonb_build_object(
        'source_problem_id', v_bad_src, 'source_fingerprint', v_fp,
        'prompt_version', 'verify-v1', 'candidate_no', 15, 'batch_id', v_batch,
        'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
        'type_code', v_type));
      raise exception '[4-13사] 서술형 원문으로 후보가 만들어졌습니다';
    exception when others then
      v_msg := sqlerrm;
      -- true 는 반드시 `source_is_essay` 여야 한다. `_unknown` 이 나오면 분기가 뒤바뀐 것이다
      if v_msg like '%source_is_essay_unknown%' then
        raise exception '[4-13사] true 인데 _unknown 코드가 나왔습니다 (D-090 분기 오류)';
      end if;
      if v_msg not like '%source_is_essay%' and v_msg not like '%type_code_mismatch%' then
        raise exception '[4-13사] 기대한 source_is_essay 가 아닙니다: %', v_msg;
      end if;
    end;
    raise notice '[4-13사] 서술형 원문 거부: OK (source_is_essay)';
  else
    raise notice '[4-13사] 서술형 대상 원문이 없어 건너뜁니다 (판정 아님)';
  end if;

  raise notice '[4-13] 대상조건·payload 위반 거부: OK';

  -- ── 4-14) verified 양방향 불변식 (D-078 · §250) ──────────────────
  -- "AI 가 동의했으니 verified" 를 적어 넣을 수 있으면 안 된다.
  v_c5 := public.server_create_twin_candidate(jsonb_build_object(
    'source_problem_id', v_src, 'source_fingerprint', v_fp,
    'prompt_version', 'verify-v1', 'candidate_no', 2, 'batch_id', v_batch2,
    'problem_text_latex', '양방향 불변식 확인용', 'answer_kind', 'number', 'answer_text', '17',
    'solution_outline', '["a","b"]'::jsonb, 'type_code', v_type));

  -- (가) verified 인데 결정론적 플래그가 false
  begin
    perform public.server_update_twin_validation(v_c5, jsonb_build_object(
      'format_validation_passed', true, 'deterministic_check_passed', false,
      'verification_status', 'verified', 'check_method', 'rule'));
    raise exception '[4-14가] verified 인데 결정론적 플래그 false 가 통과했습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%validation_invariant_violation%' then
      raise exception '[4-14가] 기대한 validation_invariant_violation 이 아닙니다: %', v_msg;
    end if;
  end;

  -- (나) verified + second_model (AI 합의만)
  begin
    perform public.server_update_twin_validation(v_c5, jsonb_build_object(
      'format_validation_passed', true, 'deterministic_check_passed', true,
      'ai_consensus_passed', true,
      'verification_status', 'verified', 'check_method', 'second_model'));
    raise exception '[4-14나] verified + second_model 이 통과했습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%validation_invariant_violation%' then
      raise exception '[4-14나] 기대한 validation_invariant_violation 이 아닙니다: %', v_msg;
    end if;
  end;

  -- (다) AI 합의만 true 인 unverified 는 **계속 허용**하되 independent 는 false 여야 한다
  perform public.server_update_twin_validation(v_c5, jsonb_build_object(
    'format_validation_passed', true, 'deterministic_check_passed', false,
    'ai_consensus_passed', true, 'verification_status', 'unverified',
    'unverified_reason', 'no_cas', 'check_method', 'none'));
  select status, independent_check_passed into v_status, v_approved
    from ai_question_private.twin_candidates where id = v_c5;
  if v_status <> 'pending_review' or v_approved then
    raise exception '[4-14다] AI 합의만 있는 후보 상태가 다릅니다 (%, independent=%)', v_status, v_approved;
  end if;

  -- (라) 알 수 없는 create payload 키 거부 (§254)
  begin
    perform public.server_create_twin_candidate(jsonb_build_object(
      'source_problem_id', v_src, 'source_fingerprint', v_fp,
      'prompt_version', 'verify-v1', 'candidate_no', 20, 'batch_id', v_batch,
      'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
      'type_code', v_type, 'teacher_approved', true));
    raise exception '[4-14라] 알 수 없는 payload 키가 통과했습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%unknown_payload_key%' then
      raise exception '[4-14라] 기대한 unknown_payload_key 가 아닙니다: %', v_msg;
    end if;
  end;

  -- (마) 잘못된 enum / range / JSON 타입 거부 (§255)
  begin
    perform public.server_create_twin_candidate(jsonb_build_object(
      'source_problem_id', v_src, 'source_fingerprint', v_fp,
      'prompt_version', 'verify-v1', 'candidate_no', 21, 'batch_id', v_batch,
      'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
      'type_code', v_type, 'variant_kind', '아무거나'));
    raise exception '[4-14마] 잘못된 variant_kind 가 통과했습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%invalid_enum_value%' then
      raise exception '[4-14마] 기대한 invalid_enum_value 가 아닙니다: %', v_msg;
    end if;
  end;
  begin
    perform public.server_create_twin_candidate(jsonb_build_object(
      'source_problem_id', v_src, 'source_fingerprint', v_fp,
      'prompt_version', 'verify-v1', 'candidate_no', 22, 'batch_id', v_batch,
      'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
      'type_code', v_type, 'difficulty_delta', 9));
    raise exception '[4-14마] 범위를 벗어난 difficulty_delta 가 통과했습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%invalid_number_range%' then
      raise exception '[4-14마] 기대한 invalid_number_range 가 아닙니다: %', v_msg;
    end if;
  end;
  begin
    perform public.server_create_twin_candidate(jsonb_build_object(
      'source_problem_id', v_src, 'source_fingerprint', v_fp,
      'prompt_version', 'verify-v1', 'candidate_no', 23, 'batch_id', v_batch,
      'problem_text_latex', 'x', 'answer_kind', 'number', 'answer_text', '1',
      'type_code', v_type, 'concepts', '"배열이 아님"'::jsonb));
    raise exception '[4-14마] 배열이 아닌 concepts 가 통과했습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%invalid_json_type%' then
      raise exception '[4-14마] 기대한 invalid_json_type 이 아닙니다: %', v_msg;
    end if;
  end;
  begin
    perform public.server_update_twin_validation(v_c5, jsonb_build_object(
      'format_validation_passed', true, 'check_detail', '"객체가 아님"'::jsonb));
    raise exception '[4-14마] 객체가 아닌 check_detail 이 통과했습니다';
  exception when others then
    v_msg := sqlerrm;
    if v_msg not like '%invalid_json_type%' and v_msg not like '%invalid_state%' then
      raise exception '[4-14마] 기대한 invalid_json_type 이 아닙니다: %', v_msg;
    end if;
  end;

  -- (바) batch 상태 조회가 실제 후보를 최소 필드로 돌려준다
  select public.server_get_twin_batch_state(v_src, v_fp, 'verify-v1', v_batch2) into v_state;
  if jsonb_array_length(v_state->'items') < 1 then
    raise exception '[4-14바] batch 상태에 후보가 없습니다: %', v_state;
  end if;
  if (v_state->'items'->0) ?| array['answer_text','solution_outline','problem_text_latex','check_detail'] then
    raise exception '[4-14바] batch 상태 응답에 정답·풀이가 들어 있습니다';
  end if;
  if not ((v_state->'items'->0) ?& array['batch_id','candidate_no','candidate_id','status']) then
    raise exception '[4-14바] batch 상태 응답에 필요한 필드가 없습니다: %', v_state;
  end if;

  raise notice '[4-14] verified 양방향 불변식 · payload 화이트리스트 · batch 상태: OK';
end;
$t$;


-- ════════════════════════════════════════════════════════════════════
-- 5) 학생 조회에 정답이 나타나지 않는지
-- ════════════════════════════════════════════════════════════════════

do $t$
declare
  v_cnt int;
  v_sqlstate text;
begin
  -- 학생이 읽을 수 있는 테이블에 정답 칼럼이 있으면 안 된다
  select count(*) into v_cnt from information_schema.columns
   where table_schema = 'public' and table_name = 'type_learning_assets'
     and column_name in ('answer_text','answer','solution_outline','problem_text_latex');
  if v_cnt > 0 then
    raise exception '[5-가] 학생이 읽는 테이블에 정답·풀이 칼럼이 %개 있습니다', v_cnt;
  end if;
  raise notice '[5-가] 학생 테이블에 정답 칼럼 없음: OK';

  -- authenticated 가 private 스키마에 접근하면 안 된다
  -- 여기만 **일부러** private 스키마에 직접 접근한다 (§148).
  -- 막히는 것이 정답이므로 42501 을 기대한다. 예외를 삼킨 뒤 반드시 역할을 되돌린다.
  set local role authenticated;
  begin
    perform 1 from ai_question_private.ai_practice_problems limit 1;
    v_sqlstate := '__NO_ERROR__';
  exception when others then
    v_sqlstate := sqlstate;
  end;
  reset role;
  if v_sqlstate = '__NO_ERROR__' then
    raise exception '[5-나] authenticated 가 private 스키마를 읽었습니다. 즉시 롤백하세요.';
  end if;
  if v_sqlstate <> '42501' then
    raise exception '[5-나] 기대한 권한 오류(42501)가 아닙니다: %', v_sqlstate;
  end if;
  raise notice '[5-나] authenticated 의 private 스키마 접근 거부: OK (42501)';
end;
$t$;


-- ════════════════════════════════════════════════════════════════════
-- 5-다) 학생 게시 안전검수 명칭 (D-063 · §106)
-- ════════════════════════════════════════════════════════════════════
-- '최종답을 보여줘도 된다'는 뜻의 옛 이름이 남아 있으면 안 됩니다.
-- 이름이 남아 있으면 나중에 누군가 그 뜻으로 쓰게 됩니다.

do $t$
declare
  v_cnt int;
begin
  select count(*) into v_cnt from information_schema.columns
   where table_schema = 'ai_question_private'
     and column_name in ('safe_worked_example','can_show_final_value',
                         'safe_first_approved_by_auth_uid','safe_first_approved_at',
                         'safe_last_changed_by_auth_uid','safe_last_changed_at');
  if v_cnt > 0 then
    raise exception '[5-다] 옛 명칭 칼럼이 %개 남아 있습니다', v_cnt;
  end if;

  select count(*) into v_cnt from information_schema.columns
   where table_schema = 'ai_question_private'
     and table_name = 'ai_practice_problems'
     and column_name in ('student_publish_approved',
                         'student_publish_first_approved_by_auth_uid',
                         'student_publish_first_approved_at',
                         'student_publish_last_changed_by_auth_uid',
                         'student_publish_last_changed_at');
  if v_cnt <> 5 then
    raise exception '[5-다] 새 명칭 칼럼이 5개가 아닙니다 (%개)', v_cnt;
  end if;

  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_safe_worked_example';
  if v_cnt > 0 then
    raise exception '[5-다] 옛 이름 RPC admin_set_safe_worked_example 가 남아 있습니다';
  end if;
  raise notice '[5-다] 학생 게시 안전검수 명칭: OK (옛 이름 없음)';
end;
$t$;


-- ════════════════════════════════════════════════════════════════════
-- 6) 전부 되돌리기
-- ════════════════════════════════════════════════════════════════════
-- 위에서 만든 검증용 행이 전부 사라집니다. 운영 데이터는 건드리지 않았습니다.
-- 중간에 실패했다면 예외로 이미 중단됐으므로 여기까지 오지 않습니다.

do $t$ begin raise notice '════════ 모든 검증 통과 — 롤백합니다 ════════'; end; $t$;

rollback;

-- 되돌아갔는지 확인 (rollback 뒤에 따로 실행)
--   select count(*) from ai_question_private.twin_candidates;       -- 0
--   select count(*) from ai_question_private.ai_practice_problems;  -- 0
--   select count(*) from public.type_learning_assets;               -- 0
