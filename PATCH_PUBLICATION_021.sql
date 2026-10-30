-- 쌍둥이 문항 파이프라인 — 021 증분 패치: 게시 RPC 의 ON CONFLICT 수정
-- 작성 2026-09-28 · GPT-EXEC-021
--
-- ⚠ 아직 **운영 실행 미승인**입니다. GPT 검수 뒤 별도 승인을 받고 실행합니다.
--
-- ════════════════════════════════════════════════════════════════════
-- 무슨 일이 있었나
-- ════════════════════════════════════════════════════════════════════
-- 설치 후 검증(POSTINSTALL_TO_RUN_017.sql)을 돌리다 `[4-9] 안전 승인 후 게시` 에서
-- 멈췄습니다.
--
--   ERROR: 42P10: there is no unique or exclusion constraint
--          matching the ON CONFLICT specification
--   PL/pgSQL function public.admin_set_practice_publication(uuid,boolean) line 53
--
-- 원인은 **설치 SQL 안에서 인덱스와 게시문이 어긋나 있던 것**입니다.
--
--   인덱스 (설치 SQL 362~363행) — practice_id 조건이 붙은 **부분** 유일 인덱스
--     create unique index tla_practice_uidx
--       on public.type_learning_assets (practice_id) where practice_id is not null;
--
--   게시문 (설치 SQL 805행) — 그 조건이 **빠져** 있다
--     on conflict (practice_id)
--
-- PostgreSQL 은 conflict target 에 인덱스의 조건(predicate)이 함께 적혀 있어야
-- 그 부분 인덱스를 충돌 판단에 쓸 수 있습니다. 조건이 없으면 쓸 인덱스를 찾지
-- 못해 42P10 을 냅니다.
--
-- **중복 데이터가 있어야 나는 오류가 아닙니다.** 표가 비어 있어도, 게시를 한 번만
-- 눌러도 바로 납니다. 넣는 uuid 가 비어 있지 않다는 것만으로 빠진 조건이
-- 저절로 채워지지도 않습니다.
--
-- ════════════════════════════════════════════════════════════════════
-- 무엇을 고치나 — 딱 한 줄
-- ════════════════════════════════════════════════════════════════════
--   - on conflict (practice_id)
--   + on conflict (practice_id) where practice_id is not null
--
-- **인덱스는 건드리지 않습니다.** 지우거나 새로 만들지 않고, 전역 UNIQUE 를
-- 추가하지도 않으며, 테이블 제약도 바꾸지 않습니다. 오류를 예외로 삼키거나
-- notice 로 낮추지도, 검증의 게시 구간을 빼지도 않습니다.
--
-- 고치는 대상은 `public.admin_set_practice_publication(uuid, boolean)` **하나**입니다.
-- 함수 안의 관리자 확인 · 잘못된 인자 거부 · FOR UPDATE · 안전승인 검사 ·
-- retired 차단 · 상태 전이 · 최초 게시자/시각 · 변경 이력은 **그대로**입니다.
--
-- ════════════════════════════════════════════════════════════════════
-- 어떻게 안전하게 바꾸나
-- ════════════════════════════════════════════════════════════════════
-- 이 파일은 `begin ... commit` 한 덩어리입니다. 아래 순서로 갑니다.
--
--   [1] 대상 함수가 **예상한 그 함수**인지 확인 (시그니처·인자명·반환형·언어·보안설정)
--   [2] 함수 본문이 **014 원본** 또는 **이 패치의 수정본** 과 정확히 같은지 확인
--       → 둘 다 아니면 **덮어쓰지 않고 중단**합니다. 모르는 변경을 자동으로 고치지 않습니다
--   [3] 인덱스 `tla_practice_uidx` 가 예상한 부분 유일 인덱스인지 확인 (이름만 보지 않습니다)
--   [4] 바꾸기 전 상태를 기록 (OID · 소유자 · 권한 · 보안속성 · 테이블 RLS · 정책)
--   [5] `create or replace function` 으로 본문만 교체
--   [6] 바꾼 뒤 상태를 다시 읽어 **본문 말고는 아무것도 달라지지 않았는지** 확인
--
-- 이미 수정본이면 `already_applied` 로 알리고 아무것도 바꾸지 않습니다.
-- 어느 확인이든 어긋나면 예외가 나고, `commit` 에 이르지 못해 **아무 변경도 남지 않습니다.**
--
-- 이 패치는 운영 학생·문항을 고르지 않고 게시 함수를 시험 호출하지도 않습니다.
-- 영구 백업 테이블도, 임시 테이블도 만들지 않습니다 (DO 블록 지역 변수만 씁니다).
--
-- 실행: Supabase → StudyCheck 프로젝트 → SQL Editor → 전체 붙여넣고 Run
--       (승인 뒤에 하십시오. 성공하면 마지막에 notice 로 결과가 나옵니다)

begin;

-- 오래 잠겨 있지 않게 한다. 실패를 성공으로 바꾸지는 않는다
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $patch$
declare
  -- ── 알려진 정의 세 가지 (줄바꿈은 LF 로 맞춘 것) ──────────────────
  -- c_head  : create or replace 선언부. `as` 와 본문은 [5] 에서 붙인다
  -- c_orig  : 014 설치 SQL 의 본문 그대로
  -- c_fixed : 위 한 줄만 고친 본문
  c_head text := $head$create or replace function public.admin_set_practice_publication(
  p_practice_problem_id uuid,
  p_publish boolean
) returns void
language plpgsql
security definer
set search_path = ''$head$;

  c_orig text := $orig$
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

  c_fixed text := $fixed$
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
  -- [1] 대상 함수가 예상한 그 함수인가
  -- ══════════════════════════════════════════════════════════════════
  -- 이름이 같은 함수가 여러 개(overload)면 PostgREST 가 어느 쪽을 부를지
  -- 헷갈린다. 설치 SQL 도 같은 기준이라 **정확히 하나**를 요구한다.
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
  -- [2] 본문이 **알려진 두 가지** 중 하나인가
  -- ══════════════════════════════════════════════════════════════════
  -- 줄바꿈(CRLF/LF)만 맞춘다. 공백을 지우거나 주석을 떼어내 서로 다른 정의를
  -- 같다고 취급하지 않는다 — 그러면 모르는 변경을 통과시키게 된다.
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid_before;
  v_norm := replace(coalesce(v_src, ''), chr(13), '');

  if v_norm = c_fixed then
    v_state := 'already_applied';
  elsif v_norm = c_orig then
    v_state := 'needs_patch';
  else
    raise exception E'\n\n  * 패치 중단: 함수 본문이 알려진 정의와 다릅니다.\n'
      '  014 원본도 아니고 이 패치의 수정본도 아닙니다 (본문 % 글자).\n'
      '  누가 무엇을 바꿨는지 확인하기 전에는 덮어쓰지 않습니다.\n', length(v_norm);
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- [3] 인덱스가 예상한 부분 유일 인덱스인가 — 이름만 보지 않는다
  -- ══════════════════════════════════════════════════════════════════
  -- 여기가 어긋나면 수정본도 42P10 을 낸다. 그래서 already_applied 여도 본다.
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
    raise notice '[021] already_applied — 함수가 이미 수정본입니다. 아무것도 바꾸지 않습니다.';
  else
    -- 본문을 보통 문자열 리터럴로 넘긴다. quote_literal 이 따옴표를 처리한다.
    -- drop 하지 않는다 — create or replace 라 OID·소유자·권한이 유지된다.
    v_ddl := c_head || chr(10) || 'as ' || quote_literal(c_fixed) || ';';
    execute v_ddl;
    raise notice '[021] 게시 RPC 본문을 교체했습니다 (on conflict 에 조건 추가).';
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
         replace(coalesce(p.prosrc, ''), chr(13), '')
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
  if v_norm <> c_fixed then
    raise exception E'\n\n  * 패치 중단: 교체한 본문이 기대한 수정본과 다릅니다 (% 글자).\n', length(v_norm);
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

  raise notice '[021] 확인 완료 — 상태 %, OID·소유자·권한·보안설정·RLS·정책 모두 그대로입니다.', v_state;
  raise notice '[021] 인덱스 tla_practice_uidx: unique·valid·immediate, 키 practice_id, 조건 %', v_pred;
end;
$patch$;

commit;

-- ════════════════════════════════════════════════════════════════════
-- 이 다음에 할 일
-- ════════════════════════════════════════════════════════════════════
-- 이 패치가 통과하면 `POSTINSTALL_TO_RUN_017.sql` 을 다시 돌려 전체 검증을 합니다.
-- 017 은 `begin ... rollback` 이라 검증용 데이터가 남지 않습니다.
-- 실행 순서와 판단 기준은 `PATCH_RUNBOOK_021.md` 에 적어 두었습니다.
