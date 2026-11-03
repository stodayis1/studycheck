-- 쌍둥이 문항 파이프라인 — 025 증분 패치: 게시 RPC 의 ON CONFLICT 수정
-- 작성 2026-10-01 · GPT-EXEC-025 (021 을 대체합니다)
--
-- ⚠ 아직 **운영 실행 미승인**입니다. GPT 검수 뒤 별도 승인을 받고 실행합니다.
--
-- ════════════════════════════════════════════════════════════════════
-- 021 은 왜 멈췄나 — 줄끝 처리가 한쪽만 되어 있었습니다
-- ════════════════════════════════════════════════════════════════════
-- 021 을 실행하셨을 때 `[2] 알려진 본문 비교` 에서 이렇게 멈췄습니다.
--
--   ★ 패치 중단: 함수 본문이 알려진 정의와 다릅니다. (본문 2189 글자)
--
-- **함수가 바뀐 적은 없습니다.** 운영의 게시 함수 본문은 014 설치 파일에서 뽑은 것과
-- 줄끝(CRLF)까지 **글자 하나까지 같습니다** (2,252자 · CR 63개 · LF 63개).
-- 조건 없는 `on conflict (practice_id)` 가 아직 그대로 있는, 손대지 않은 014 원본입니다.
--
-- 멈춘 이유는 **021 의 비교 코드가 한쪽만 정리했기** 때문입니다.
--
--   021 : v_norm := replace(DB본문, chr(13), '');   ← DB 쪽 CR 만 제거
--         if v_norm = c_fixed ... elsif v_norm = c_orig ...  ← 상수는 그대로 비교
--
-- 패치 파일이 SQL Editor 로 전달될 때 줄끝이 CRLF 가 되면, `c_orig` 안에 CR 63개가
-- 함께 들어옵니다. 그러면 DB 쪽만 정리한 2,189자와 상수 쪽 2,252자를 비교하게 되어
-- **정상 원본조차 "다르다" 고 판정**합니다.
--
--   ※ DB 에 CRLF 가 있다는 것만으로는 실패하지 않습니다. 021 도 DB 쪽은 정리했습니다.
--     문제는 **입력 상수 쪽을 정리하지 않은 것**입니다.
--
-- 사후 검사(`v_norm <> c_fixed`)에도 같은 문제가 있어서, 사전 비교만 고치면 모자랍니다.
--
-- ════════════════════════════════════════════════════════════════════
-- 025 가 고치는 것 — 양쪽을 같은 기준으로 맞춥니다
-- ════════════════════════════════════════════════════════════════════
-- **업무 로직은 021 과 똑같이 한 줄뿐입니다.**
--
--   - on conflict (practice_id)
--   + on conflict (practice_id) where practice_id is not null
--
-- 달라진 것은 비교 방식입니다.
--
--   · `CRLF 쌍 → LF` 로만 바꿉니다. 그 밖의 정규화는 하지 않습니다.
--   · DB 본문 · 고정 원본(c_orig) · 고정 수정본(c_fixed) · 선언부(c_head) **전부** 같은 기준
--   · 사전 비교 · 교체 · 사후 비교 **세 단계 모두** 같은 기준
--   · 바꾼 뒤에도 남는 **단독 CR** 은 지워서 통과시키지 않고 **미지원으로 중단**합니다
--
-- **느슨하게 만들지 않았습니다.** 공백 삭제 · 주석 제거 · btrim · lower ·
-- 유니코드 포괄 정규화 · 유사도 비교를 쓰지 않습니다. 운영 본문을 새 기대값으로
-- 자동 학습하지도 않습니다. 모르는 본문이면 여전히 **덮어쓰지 않고 멈춥니다.**
--
-- 원장님이 편집기를 바꾸거나 파일을 손으로 변환하실 필요가 **없습니다.**
-- CRLF 로 전달되어도 그대로 작동합니다.
--
-- ════════════════════════════════════════════════════════════════════
-- 021 과의 관계
-- ════════════════════════════════════════════════════════════════════
-- 025 는 021 이 성공한 뒤에 쓰는 후속 패치가 **아닙니다.**
-- **021 을 적용하지 않은 014 원본 상태에서 바로 적용하는 대체 패치**입니다.
-- 이미 021 의 정확한 수정본이 들어가 있는 환경이라면 확인만 하고 아무것도 바꾸지 않습니다
-- (`already_applied`).
--
-- 021 파일은 이력으로 보존합니다. 지우거나 고치지 않았습니다.
--
-- ════════════════════════════════════════════════════════════════════
-- 어떤 순서로 가나
-- ════════════════════════════════════════════════════════════════════
-- 이 파일은 `begin ... commit` 한 덩어리입니다.
--
--   [0] 입력 상수의 줄끝을 맞추고, 단독 CR 이 있으면 중단
--   [1] 대상 함수가 **예상한 그 함수**인지 확인 (시그니처·인자명·반환형·언어·보안설정)
--   [2] 함수 본문이 **014 원본** 또는 **이 패치의 수정본** 과 같은지 확인 (양쪽 줄끝 맞춘 뒤)
--       → 둘 다 아니면 **덮어쓰지 않고 중단**합니다
--   [3] 인덱스 `tla_practice_uidx` 가 예상한 부분 유일 인덱스인지 확인 (이름만 보지 않습니다)
--   [4] 바꾸기 전 상태를 기록 (OID · 소유자 · 권한 · 보안속성 · 테이블 RLS · 정책)
--   [5] `create or replace function` 으로 본문만 교체
--   [6] 바꾼 뒤 상태를 다시 읽어 **본문 말고는 아무것도 달라지지 않았는지** 확인
--
-- 어느 확인이든 어긋나면 예외가 나고, `commit` 에 이르지 못해 **아무 변경도 남지 않습니다.**
-- 이 패치는 운영 학생·문항을 고르지 않고 게시 함수를 시험 호출하지도 않습니다.
-- 인덱스·권한·RLS·테이블을 건드리지 않고, 임시 표도 영구 표도 만들지 않습니다.
--
-- 실행: Supabase → StudyCheck 프로젝트 → SQL Editor → 전체 붙여넣고 Run
--       (승인 뒤에 하십시오. 성공하면 마지막에 notice 로 결과가 나옵니다)

begin;

-- 오래 잠겨 있지 않게 한다. 실패를 성공으로 바꾸지는 않는다
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $patch$
declare
  -- ── 줄끝 문자 ────────────────────────────────────────────────────
  k_cr   constant text := chr(13);
  k_lf   constant text := chr(10);
  k_crlf constant text := chr(13) || chr(10);

  -- ── 알려진 정의 세 가지 — **전달된 그대로** ──────────────────────
  -- 이 파일이 CRLF 로 전달되면 아래 상수 안에 CR 이 섞여 들어온다.
  -- 그래서 쓰기 전에 [0] 에서 줄끝을 맞춘다. 021 은 이걸 하지 않아 멈췄다.
  c_head_in  text := $head$create or replace function public.admin_set_practice_publication(
  p_practice_problem_id uuid,
  p_publish boolean
) returns void
language plpgsql
security definer
set search_path = ''$head$;

  c_orig_in  text := $orig$
declare
  v_status   text;
  v_safe     boolean;
  v_type     text;
  v_first_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_practice_problem_id is null or p_publish is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  select status, student_publish_approved, type_code, first_published_at
    into v_status, v_safe, v_type, v_first_at
    from ai_question_private.ai_practice_problems
   where id = p_practice_problem_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'retired' then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  if p_publish then
    if v_status <> 'approved' then
      raise exception 'invalid_state' using errcode = '22023';
    end if;
    -- D-064: 학생 게시 안전검수를 통과하지 않으면 게시할 수 없다
    if not v_safe then
      raise exception 'student_publish_approval_required' using errcode = '22023';
    end if;
  else
    if v_status <> 'published' then
      raise exception 'invalid_state' using errcode = '22023';
    end if;
  end if;

  update ai_question_private.ai_practice_problems
     set status = case when p_publish then 'published' else 'approved' end,
         first_published_by_auth_uid = case
           when p_publish and v_first_at is null then auth.uid()
           else first_published_by_auth_uid end,
         first_published_at = case
           when p_publish and v_first_at is null then now()
           else first_published_at end,
         publish_changed_by_auth_uid = auth.uid(),
         publish_changed_at = now()
   where id = p_practice_problem_id;

  if p_publish then
    insert into public.type_learning_assets
      (type_code, asset_type, practice_id, is_active, review_status)
    values (v_type, 'ai_practice', p_practice_problem_id, true, 'approved')
    on conflict (practice_id)
    do update set is_active = true, review_status = 'approved', updated_at = now();
  else
    update public.type_learning_assets
       set is_active = false, updated_at = now()
     where practice_id = p_practice_problem_id;
  end if;
end;
$orig$;

  c_fixed_in text := $fixed$
declare
  v_status   text;
  v_safe     boolean;
  v_type     text;
  v_first_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_practice_problem_id is null or p_publish is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  select status, student_publish_approved, type_code, first_published_at
    into v_status, v_safe, v_type, v_first_at
    from ai_question_private.ai_practice_problems
   where id = p_practice_problem_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'retired' then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  if p_publish then
    if v_status <> 'approved' then
      raise exception 'invalid_state' using errcode = '22023';
    end if;
    -- D-064: 학생 게시 안전검수를 통과하지 않으면 게시할 수 없다
    if not v_safe then
      raise exception 'student_publish_approval_required' using errcode = '22023';
    end if;
  else
    if v_status <> 'published' then
      raise exception 'invalid_state' using errcode = '22023';
    end if;
  end if;

  update ai_question_private.ai_practice_problems
     set status = case when p_publish then 'published' else 'approved' end,
         first_published_by_auth_uid = case
           when p_publish and v_first_at is null then auth.uid()
           else first_published_by_auth_uid end,
         first_published_at = case
           when p_publish and v_first_at is null then now()
           else first_published_at end,
         publish_changed_by_auth_uid = auth.uid(),
         publish_changed_at = now()
   where id = p_practice_problem_id;

  if p_publish then
    insert into public.type_learning_assets
      (type_code, asset_type, practice_id, is_active, review_status)
    values (v_type, 'ai_practice', p_practice_problem_id, true, 'approved')
    on conflict (practice_id) where practice_id is not null
    do update set is_active = true, review_status = 'approved', updated_at = now();
  else
    update public.type_learning_assets
       set is_active = false, updated_at = now()
     where practice_id = p_practice_problem_id;
  end if;
end;
$fixed$;

  -- 줄끝을 맞춘 것. 비교·교체·사후검사에 **이것만** 쓴다
  c_head  text;
  c_orig  text;
  c_fixed text;

  v_oid_before   oid;
  v_oid_after    oid;
  v_cnt          int;
  v_src          text;
  v_norm         text;
  v_state        text;
  v_fn_before    jsonb;
  v_fn_after     jsonb;
  v_owner_before text;
  v_owner_after  text;
  v_acl_before   text;
  v_acl_after    text;
  v_rls_before   jsonb;
  v_rls_after    jsonb;
  v_idx          record;
  v_pred         text;
  v_key          text;
  v_ddl          text;
begin
  -- ══════════════════════════════════════════════════════════════════
  -- [0] 입력 상수의 줄끝을 맞춘다 — 021 이 빠뜨린 바로 그 단계
  -- ══════════════════════════════════════════════════════════════════
  -- **CRLF 쌍만** LF 로 바꾼다. 공백·주석·문자열 내용·실행문은 손대지 않는다.
  c_head  := replace(c_head_in,  k_crlf, k_lf);
  c_orig  := replace(c_orig_in,  k_crlf, k_lf);
  c_fixed := replace(c_fixed_in, k_crlf, k_lf);

  -- 남은 단독 CR 은 **지워서 통과시키지 않는다.** 모르는 입력이므로 멈춘다
  if position(k_cr in c_head) > 0
     or position(k_cr in c_orig) > 0
     or position(k_cr in c_fixed) > 0 then
    raise exception E'\n\n  * 패치 중단: 패치 입력에 CRLF 쌍이 아닌 단독 CR 이 섞여 있습니다.\n'
      '  줄끝은 CRLF 또는 LF 만 지원합니다. 단독 CR 을 지워서 통과시키지 않습니다.\n'
      '  파일을 내려받은 그대로 다시 붙여넣어 보시고, 그래도 같으면 알려 주십시오.\n';
  end if;

  -- 상수가 제대로 들어왔는지 최소한의 모양 확인 (빈 치환·잘린 전달을 걸러낸다)
  if length(c_orig) < 500 or length(c_fixed) < 500 or length(c_head) < 50 then
    raise exception E'\n\n  * 패치 중단: 패치 안의 알려진 정의가 온전히 전달되지 않았습니다 '
      '(선언부 % 자 · 원본 % 자 · 수정본 % 자).\n'
      '  파일 전체를 붙여넣었는지 확인해 주십시오.\n',
      length(c_head), length(c_orig), length(c_fixed);
  end if;
  if c_orig = c_fixed then
    raise exception E'\n\n  * 패치 중단: 알려진 원본과 수정본이 같습니다. 패치 파일이 온전하지 않습니다.\n';
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- [1] 대상 함수가 예상한 그 함수인가
  -- ══════════════════════════════════════════════════════════════════
  -- 이름이 같은 함수가 여러 개(overload)면 PostgREST 가 어느 쪽을 부를지
  -- 헷갈린다. 설치 SQL 도 같은 기준이라 **정확히 하나**를 요구한다.
  -- 운영 OID 나 서버 버전을 박아 넣지 않는다 — 시그니처로만 찾는다.
  select count(*) into v_cnt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_practice_publication';
  if coalesce(v_cnt, 0) <> 1 then
    raise exception E'\n\n  * 패치 중단: public.admin_set_practice_publication 이 정확히 하나가 아닙니다 (%개).\n'
      '  없으면 새로 만들지 않고, 여러 개면 어느 것을 고칠지 알 수 없어 멈춥니다.\n', coalesce(v_cnt, 0);
  end if;

  select p.oid into v_oid_before
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'admin_set_practice_publication'
     -- 인자 형을 OID 로 본다. 문자열 표기는 버전에 따라 이름이 섞여 나온다
     and p.pronargs = 2
     and p.proargtypes[0] = 'pg_catalog.uuid'::regtype
     and p.proargtypes[1] = 'pg_catalog.bool'::regtype
     and p.proargnames = array['p_practice_problem_id','p_publish']
     and p.prorettype = 'pg_catalog.void'::regtype
     and p.prokind = 'f'
     and p.prolang = (select l.oid from pg_language l where l.lanname = 'plpgsql')
     and p.prosecdef
     -- `set search_path = ''` 는 proconfig 에 search_path="" 로 저장된다.
     -- 표기가 두 가지라 둘 다 받되, **다른 설정이 섞여 있으면 안 된다**
     and cardinality(p.proconfig) = 1
     and p.proconfig[1] in ('search_path=', 'search_path=""')
     and not p.proretset;
  if v_oid_before is null then
    raise exception E'\n\n  * 패치 중단: 함수의 모양이 예상과 다릅니다.\n'
      '  기대: (p_practice_problem_id uuid, p_publish boolean) returns void,\n'
      '        language plpgsql, security definer, set search_path (빈 값)\n'
      '  지금 상태를 먼저 확인해야 합니다. 덮어쓰지 않고 멈춥니다.\n';
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- [2] 본문이 **알려진 두 가지** 중 하나인가 — 양쪽 줄끝을 맞춘 뒤
  -- ══════════════════════════════════════════════════════════════════
  -- CRLF 쌍만 LF 로 맞춘다. 공백을 지우거나 주석을 떼어내 서로 다른 정의를
  -- 같다고 취급하지 않는다 — 그러면 모르는 변경을 통과시키게 된다.
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid_before;
  v_norm := replace(coalesce(v_src, ''), k_crlf, k_lf);
  if position(k_cr in v_norm) > 0 then
    raise exception E'\n\n  * 패치 중단: 함수 본문에 CRLF 쌍이 아닌 단독 CR 이 있습니다.\n'
      '  지원하지 않는 줄끝입니다. 단독 CR 을 지워서 통과시키지 않습니다.\n';
  end if;

  if v_norm = c_fixed then
    v_state := 'already_applied';
  elsif v_norm = c_orig then
    v_state := 'needs_patch';
  else
    -- 중립적 진단 — 누가 바꿨다고 단정하지 않는다.
    -- 전달 과정의 변형일 수도, 정의가 실제로 다를 수도 있다
    raise exception E'\n\n  * 패치 중단: 함수 본문이 알려진 두 정의와 다릅니다.\n'
      '  줄끝을 맞춘 뒤 — 지금 본문 % 자 / 알려진 원본 % 자 / 알려진 수정본 % 자\n'
      '  전달 과정에서 글자가 바뀌었거나, 정의 자체가 다른 경우입니다.\n'
      '  어느 쪽인지 확인하기 전에는 덮어쓰지 않습니다.\n',
      length(v_norm), length(c_orig), length(c_fixed);
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- [3] 인덱스가 예상한 부분 유일 인덱스인가 — 이름만 보지 않는다
  -- ══════════════════════════════════════════════════════════════════
  -- 여기가 어긋나면 수정본도 통하지 않는다. 그래서 already_applied 여도 본다.
  select i.indisunique, i.indisvalid, i.indisready, i.indislive,
         i.indimmediate, i.indisexclusion, i.indnatts, i.indnkeyatts,
         pg_get_expr(i.indpred, i.indrelid) as pred,
         (select string_agg(a.attname, ',' order by k.ord)
            from unnest(i.indkey::int[]) with ordinality as k(attnum, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) as keys
    into v_idx
    from pg_class ic
    join pg_namespace icn on icn.oid = ic.relnamespace
    join pg_index i on i.indexrelid = ic.oid
    join pg_class tc on tc.oid = i.indrelid
    join pg_namespace tcn on tcn.oid = tc.relnamespace
   where ic.relname = 'tla_practice_uidx'
     and icn.nspname = 'public'
     and tc.relname = 'type_learning_assets'
     and tcn.nspname = 'public';
  if not found then
    raise exception E'\n\n  * 패치 중단: public.type_learning_assets 의 인덱스 tla_practice_uidx 를 찾지 못했습니다.\n'
      '  이 인덱스가 게시문의 충돌 판단 대상입니다. 없으면 고쳐도 같은 오류가 납니다.\n';
  end if;

  -- NULL 때문에 검사가 건너뛰어지지 않게 전부 coalesce 로 감싼다
  if not (coalesce(v_idx.indisunique, false) and coalesce(v_idx.indisvalid, false)
          and coalesce(v_idx.indisready, false) and coalesce(v_idx.indislive, false)
          and coalesce(v_idx.indimmediate, false)
          and not coalesce(v_idx.indisexclusion, true)) then
    raise exception E'\n\n  * 패치 중단: tla_practice_uidx 가 유효·준비됨·즉시검사 UNIQUE 가 아닙니다.\n'
      '  unique=% valid=% ready=% live=% immediate=% exclusion=%\n',
      v_idx.indisunique, v_idx.indisvalid, v_idx.indisready,
      v_idx.indislive, v_idx.indimmediate, v_idx.indisexclusion;
  end if;

  v_key  := coalesce(v_idx.keys, '(없음)');
  v_pred := coalesce(v_idx.pred, '(조건 없음)');
  if coalesce(v_idx.indnatts, 0) <> 1 or coalesce(v_idx.indnkeyatts, 0) <> 1
     or v_key <> 'practice_id' then
    raise exception E'\n\n  * 패치 중단: tla_practice_uidx 의 키가 practice_id 하나가 아닙니다 (키: %, 칼럼수 %).\n',
      v_key, coalesce(v_idx.indnatts, 0);
  end if;
  if v_pred <> '(practice_id IS NOT NULL)' then
    raise exception E'\n\n  * 패치 중단: tla_practice_uidx 의 조건이 예상과 다릅니다.\n'
      '  기대: (practice_id IS NOT NULL)\n  실제: %\n'
      '  게시문의 where 절은 이 조건과 똑같아야 합니다.\n', v_pred;
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- [4] 바꾸기 전 상태를 기록한다
  -- ══════════════════════════════════════════════════════════════════
  select to_jsonb(p) - 'prosrc' - 'prosqlbody',
         pg_get_userbyid(p.proowner),
         coalesce(p.proacl::text, '(null)')
    into v_fn_before, v_owner_before, v_acl_before
    from pg_proc p where p.oid = v_oid_before;

  select jsonb_build_object(
           'rls_enabled', c.relrowsecurity,
           'rls_forced',  c.relforcerowsecurity,
           'policies', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', pol.polname, 'cmd', pol.polcmd,
                      'permissive', pol.polpermissive, 'roles', pol.polroles::text,
                      'using', pg_get_expr(pol.polqual, pol.polrelid),
                      'check', pg_get_expr(pol.polwithcheck, pol.polrelid))
                    order by pol.polname)
               from pg_policy pol where pol.polrelid = c.oid), '[]'::jsonb))
    into v_rls_before
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'type_learning_assets';
  if v_rls_before is null then
    raise exception E'\n\n  * 패치 중단: public.type_learning_assets 를 찾지 못했습니다.\n';
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- [5] 본문만 교체한다
  -- ══════════════════════════════════════════════════════════════════
  if v_state = 'already_applied' then
    raise notice '[025] already_applied — 함수가 이미 수정본입니다. 아무것도 바꾸지 않습니다.';
  else
    -- **줄끝을 맞춘** 수정본을 보통 문자열 리터럴로 넘긴다. quote_literal 이 따옴표를 처리한다.
    -- drop 하지 않는다 — create or replace 라 OID·소유자·권한이 유지된다.
    v_ddl := c_head || k_lf || 'as ' || quote_literal(c_fixed) || ';';
    execute v_ddl;
    raise notice '[025] 게시 RPC 본문을 교체했습니다 (on conflict 에 조건 추가).';
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- [6] 본문 말고는 아무것도 달라지지 않았는가
  -- ══════════════════════════════════════════════════════════════════
  select p.oid into v_oid_after
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_set_practice_publication';
  if v_oid_after is distinct from v_oid_before then
    raise exception E'\n\n  * 패치 중단: 함수 OID 가 바뀌었습니다 (% -> %). drop/create 가 일어났다는 뜻입니다.\n',
      v_oid_before, v_oid_after;
  end if;

  select to_jsonb(p) - 'prosrc' - 'prosqlbody',
         pg_get_userbyid(p.proowner),
         coalesce(p.proacl::text, '(null)'),
         replace(coalesce(p.prosrc, ''), k_crlf, k_lf)
    into v_fn_after, v_owner_after, v_acl_after, v_norm
    from pg_proc p where p.oid = v_oid_after;

  if v_fn_after is distinct from v_fn_before then
    raise exception E'\n\n  * 패치 중단: 함수 속성이 달라졌습니다 (본문 외).\n  전: %\n  후: %\n',
      v_fn_before::text, v_fn_after::text;
  end if;
  if v_owner_after is distinct from v_owner_before then
    raise exception E'\n\n  * 패치 중단: 함수 소유자가 % -> % 로 바뀌었습니다.\n', v_owner_before, v_owner_after;
  end if;
  if v_acl_after is distinct from v_acl_before then
    raise exception E'\n\n  * 패치 중단: 함수 실행권한(ACL)이 바뀌었습니다.\n  전: %\n  후: %\n',
      v_acl_before, v_acl_after;
  end if;
  if position(k_cr in v_norm) > 0 then
    raise exception E'\n\n  * 패치 중단: 교체 뒤 본문에 단독 CR 이 남았습니다. 지원하지 않는 줄끝입니다.\n';
  end if;
  if v_norm <> c_fixed then
    raise exception E'\n\n  * 패치 중단: 교체한 본문이 기대한 수정본과 다릅니다 (% 자 / 기대 % 자).\n',
      length(v_norm), length(c_fixed);
  end if;

  select jsonb_build_object(
           'rls_enabled', c.relrowsecurity,
           'rls_forced',  c.relforcerowsecurity,
           'policies', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', pol.polname, 'cmd', pol.polcmd,
                      'permissive', pol.polpermissive, 'roles', pol.polroles::text,
                      'using', pg_get_expr(pol.polqual, pol.polrelid),
                      'check', pg_get_expr(pol.polwithcheck, pol.polrelid))
                    order by pol.polname)
               from pg_policy pol where pol.polrelid = c.oid), '[]'::jsonb))
    into v_rls_after
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'type_learning_assets';
  if v_rls_after is distinct from v_rls_before then
    raise exception E'\n\n  * 패치 중단: type_learning_assets 의 RLS·정책이 바뀌었습니다.\n  전: %\n  후: %\n',
      v_rls_before::text, v_rls_after::text;
  end if;

  raise notice '[025] 확인 완료 — 상태 %, OID·소유자·권한·보안설정·RLS·정책 모두 그대로입니다.', v_state;
  raise notice '[025] 인덱스 tla_practice_uidx: unique·valid·immediate, 키 practice_id, 조건 %', v_pred;
  raise notice '[025] 줄끝 처리: 입력 상수와 DB 본문에 같은 기준(CRLF 쌍 -> LF)을 적용했습니다.';
end;
$patch$;

commit;

-- ════════════════════════════════════════════════════════════════════
-- 이 다음에 할 일
-- ════════════════════════════════════════════════════════════════════
-- 이 패치가 통과하면 `POSTINSTALL_TO_RUN_017.sql` 을 다시 돌려 전체 검증을 합니다.
-- 017 은 `begin ... rollback` 이라 검증용 데이터가 남지 않습니다.
-- 실행 순서와 판단 기준은 `PATCH_RUNBOOK_025.md` 에 적어 두었습니다.
