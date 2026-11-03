-- 쌍둥이 문항 파이프라인 — 설치 전 점검 (읽기 전용)
-- 작성 2026-09-23 · GPT-EXEC-003 §227 · GPT-EXEC-005 작업 B 반영
--
-- 무엇: `쌍둥이_설치.sql` 을 돌리기 **전에** 안전한지 확인합니다.
-- 이 파일은 **아무것도 바꾸지 않습니다.** 읽기만 합니다. 마음 놓고 돌리셔도 됩니다.
--
-- ⚠ GPT-EXEC-005 §116 반영
--   이전 판은 `public.twin_candidates` 를 정적 서브쿼리로 직접 참조해서,
--   그 테이블이 **없는 정상 상태**에서는 쿼리 전체가 파싱 단계에서 실패했습니다.
--   이제 존재 여부를 먼저 보고 동적으로만 세므로, 있든 없든 끝까지 실행됩니다.
--
-- 실행: Supabase → StudyCheck 프로젝트 → SQL Editor → 전체 붙여넣고 Run
--
-- 결과 메시지의 판정이 전부 **OK** 여야 설치할 수 있습니다.
-- 하나라도 `중단` 이면 설치하지 마시고 그 줄을 알려 주세요.
--
-- ⚠ GPT-EXEC-006 §286
--   중단 항목이 하나라도 있으면 **마지막에 오류로 끝납니다.** notice 만 남기고
--   성공한 것처럼 끝내지 않습니다. 빨간 오류가 뜨면 위의 `중단` 줄을 보세요.
--   (이 파일은 여전히 읽기 전용입니다. 오류가 나도 바뀌는 것은 없습니다.)
--
-- ⚠ 이름 충돌 정책 (§288)
--   이 점검과 `쌍둥이_설치.sql` 은 **같은 기준**으로 판단합니다 —
--   이번에 만들 RPC 와 **이름이 같은 함수가 있으면, 인자가 달라도 중단**합니다.
--   overload 를 얹으면 PostgREST 가 어느 쪽을 부를지 헷갈리기 때문입니다.

do $check$
declare
  v_cnt    int;
  v_rows   bigint;
  v_txt    text;
  v_fail   int := 0;
  v_col    text;
  v_missing text;
  -- 4-1) 문제 데이터 상태
  v_essay_null      bigint;
  v_base_essay_null bigint;
  v_strict          bigint;
  v_types_no_twin   bigint;
  v_no_image     bigint;
  -- D-094: 문제 테이블 구조가 온전한지. false 면 문제 데이터 점검 전체를 건너뛴다
  v_problem_ok   boolean := false;
  v_dup_code     bigint;
  -- Storage
  v_storage_ok   boolean;
  v_bucket_rows  bigint;
  v_with_image   bigint;
  v_no_object    bigint;
  v_no_updated   bigint;
  v_no_etag      bigint;
  v_usable       bigint;
  v_usable_types bigint;
  v_orphan_all   bigint;

  -- 이번 설치가 만드는 RPC 이름 (§117 · §288)
  -- 설치 SQL 의 사전검사와 **같은 목록·같은 기준**이어야 한다.
  v_names text[] := array[
    'admin_list_twin_candidates',
    'admin_get_twin_candidate',
    'admin_approve_twin_candidate',
    'admin_reject_twin_candidate',
    'admin_set_student_publish_approval',
    'admin_set_practice_publication',
    'server_create_twin_candidate',
    'server_update_twin_validation',
    'server_list_eligible_twin_types',
    'server_get_twin_batch_state'
  ];
begin
  raise notice '════════ 쌍둥이 파이프라인 설치 전 점검 ════════';

  -- ── 1) 폐기된 테이블 ──────────────────────────────────────────────
  if to_regclass('public.twin_candidates') is null then
    raise notice '[1] public.twin_candidates          : 없음                      → OK';
  else
    -- 있을 때만 동적으로 센다. 없으면 이 구문 자체가 실행되지 않는다
    execute 'select count(*) from public.twin_candidates' into v_rows;
    if v_rows = 0 then
      raise notice '[1] public.twin_candidates          : 있음, 행 0개             → OK (설치 SQL이 제거)';
    else
      raise notice '[1] public.twin_candidates          : 있음, 행 %개            → 중단', v_rows;
      v_fail := v_fail + 1;
    end if;
  end if;

  -- ── 2) 이름 충돌 (D-049) ─────────────────────────────────────────
  select count(*) into v_cnt from pg_namespace where nspname = 'ai_question_private';
  if v_cnt = 0 then
    raise notice '[2] ai_question_private 스키마       : 없음                      → OK';
  else
    select count(*) into v_cnt from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'ai_question_private';
    raise notice '[2] ai_question_private 스키마       : 이미 있음 (객체 %개)     → 중단', v_cnt;
    v_fail := v_fail + 1;
  end if;

  if to_regclass('public.type_learning_assets') is null then
    raise notice '[3] public.type_learning_assets     : 없음                      → OK';
  else
    raise notice '[3] public.type_learning_assets     : 이미 있음                 → 중단';
    v_fail := v_fail + 1;
  end if;

  -- ── 3) 함수 이름 충돌 (§117 · §288) ──────────────────────────────
  -- 설치 SQL 과 같은 기준으로 센다. 인자가 달라도 이름이 같으면 중단이다.
  select count(*), coalesce(string_agg(distinct p.proname, ' '), '')
    into v_cnt, v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(v_names);
  if v_cnt = 0 then
    raise notice '[4] 같은 이름의 RPC                 : 없음                      → OK';
  else
    raise notice '[4] 같은 이름의 RPC                 : %개 충돌 — %            → 중단', v_cnt, v_txt;
    v_fail := v_fail + 1;
  end if;

  -- ── 4) 참조할 기존 구조 ──────────────────────────────────────────
  select data_type into v_txt from information_schema.columns
   where table_schema = 'public' and table_name = 'problems' and column_name = 'id';
  if v_txt = 'bigint' then
    raise notice '[5] problems.id 타입                : bigint                    → OK';
  else
    raise notice '[5] problems.id 타입                : %                        → 중단 (bigint 여야 함)', coalesce(v_txt,'없음');
    v_fail := v_fail + 1;
  end if;

  select count(*) into v_cnt from information_schema.table_constraints
   where table_schema = 'public' and table_name = 'problems' and constraint_type = 'PRIMARY KEY';
  if v_cnt = 1 then
    raise notice '[6] problems 기본키                 : 있음                      → OK';
  else
    raise notice '[6] problems 기본키                 : %개                       → 중단', v_cnt;
    v_fail := v_fail + 1;
  end if;

  select data_type into v_txt from information_schema.columns
   where table_schema = 'public' and table_name = 'standard_types' and column_name = 'code';
  if v_txt = 'text' then
    raise notice '[7] standard_types.code 타입        : text                      → OK';
  else
    raise notice '[7] standard_types.code 타입        : %                        → 중단', coalesce(v_txt,'없음');
    v_fail := v_fail + 1;
  end if;

  -- §85: `standard_types.code` 가 유일해야 한다.
  --   유형 집계 RPC 와 아래 [24] 가 이 칼럼으로 inner join 한다. code 가 중복되면
  --   같은 원문이 여러 번 세어지고, count(distinct p.id) 로 막아도 **유형 수**가 부풀 수 있다.
  --   PK/UNIQUE 계약이 확실하지 않으므로 실제 중복 수를 직접 센다.
  if to_regclass('public.standard_types') is null then
    raise notice '[7-2] standard_types.code 중복       : 테이블 없음               → 중단';
    v_fail := v_fail + 1;
  elsif v_txt is null then
    raise notice '[7-2] standard_types.code 중복       : code 칼럼 없음            → 중단';
    v_fail := v_fail + 1;
  else
    select count(*) into v_dup_code from (
      select code from public.standard_types
       group by code having count(*) > 1
    ) d;
    if v_dup_code = 0 then
      raise notice '[7-2] standard_types.code 중복       : 없음                      → OK';
    else
      raise notice '[7-2] standard_types.code 중복       : %개 코드가 중복           → 중단', v_dup_code;
      v_fail := v_fail + 1;
    end if;
  end if;

  -- 인자 없는 정확한 함수가 하나씩 있어야 한다 (§110)
  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'is_admin' and p.pronargs = 0;
  if v_cnt = 1 then
    raise notice '[8] public.is_admin() (인자 없음)   : 1개                       → OK';
  else
    raise notice '[8] public.is_admin() (인자 없음)   : %개                       → 중단', v_cnt;
    v_fail := v_fail + 1;
  end if;

  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'is_staff' and p.pronargs = 0;
  if v_cnt = 1 then
    raise notice '[9] public.is_staff() (인자 없음)   : 1개                       → OK';
  else
    raise notice '[9] public.is_staff() (인자 없음)   : %개                       → 중단', v_cnt;
    v_fail := v_fail + 1;
  end if;

  select count(*) into v_cnt from pg_proc where proname = 'gen_random_uuid';
  if v_cnt > 0 then
    raise notice '[10] gen_random_uuid()              : 사용 가능                 → OK';
  else
    raise notice '[10] gen_random_uuid()              : 없음                      → 중단';
    v_fail := v_fail + 1;
  end if;

  -- ── 4-2) 새 SQL 이 참조하는 테이블·칼럼 (§244) ────────────────────
  -- 설치 SQL 의 RPC 본문이 이 칼럼들을 직접 읽는다. 하나라도 없으면 설치는 성공해도
  -- **첫 호출에서 깨진다.** 그래서 설치 전에 본다.
  v_missing := '';
  foreach v_col in array array[
    'problems.twin_id','problems.answer_text','problems.answer_kind','problems.is_essay',
    'problems.type_code','problems.image_path','problems.step','problems.difficulty',
    'problems.grade','problems.semester','problems.book',
    'standard_types.code','standard_types.grade',
    'standard_types.chapter_title','standard_types.type_title'
  ] loop
    select count(*) into v_cnt from information_schema.columns
     where table_schema = 'public'
       and table_name  = split_part(v_col, '.', 1)
       and column_name = split_part(v_col, '.', 2);
    if v_cnt = 0 then
      v_missing := v_missing || ' ' || v_col;
    end if;
  end loop;
  if v_missing = '' then
    raise notice '[11] 참조 칼럼 15개                  : 모두 있음                 → OK';
  else
    raise notice '[11] 참조 칼럼                       : 없음 —%                  → 중단', v_missing;
    v_fail := v_fail + 1;
  end if;

  -- ── 4-2-2) 문제 테이블 구조 가드 (D-094) ──────────────────────────
  -- 여기까지의 [5]~[7]·[7-2]·[11] 이 모두 통과해야 아래 데이터 점검을 실행한다.
  -- 없는 칼럼을 참조하면 **최종 판정 전에 SQL 오류로 끊긴다.** Storage 가드와 같은 원칙이다.
  -- (plpgsql 은 실행되는 구문만 파싱하므로 if 로 감싸면 안전하다.)
  v_problem_ok :=
        to_regclass('public.problems') is not null
    and to_regclass('public.standard_types') is not null
    and v_missing = ''
    and coalesce(v_dup_code, 1) = 0
    and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'problems'
         and column_name = 'id' and data_type = 'bigint'
    );

  if v_problem_ok then
    raise notice '[11-2] 문제 테이블 구조              : 온전함                    → 데이터 점검 실행';
  else
    raise notice '[11-2] 문제 테이블 구조              : 불완전                    → 데이터 점검 건너뜀';
  end if;

  -- ── 4-3) 문제 데이터 상태 ─────────────────────────────────────────
  -- '엄격 조건' = D-025 + D-082 + D-088
  --   twin_id 없음 · 정답 있음 · number|choice · type_code 있음
  --   · is_essay = false (**null 제외**) · image_path 있음
  raise notice '────────────────────────────────────────────────';

  if not v_problem_ok then
    raise notice '[12~16] 문제 데이터 통계            : 건너뜀 (구조 불완전)';
  else
    select count(*) into v_essay_null from public.problems where is_essay is null;
    raise notice '[12] is_essay is null (전체)         : %건', v_essay_null;

    select count(*) into v_base_essay_null from public.problems
     where twin_id is null
       and answer_text is not null and btrim(answer_text) <> ''
       and answer_kind in ('number','choice')
       and type_code is not null and btrim(type_code) <> ''
       and is_essay is null;
    raise notice '[13] 기본조건 중 is_essay null       : %건  (D-082 로 제외)', v_base_essay_null;

    select count(*) into v_no_image from public.problems
     where twin_id is null
       and answer_text is not null and btrim(answer_text) <> ''
       and answer_kind in ('number','choice')
       and type_code is not null and btrim(type_code) <> ''
       and is_essay = false
       and (image_path is null or btrim(image_path) = '');
    raise notice '[14] 기본조건 중 이미지 없음         : %건  (D-088 로 제외)', v_no_image;

    select count(*) into v_strict from public.problems
     where twin_id is null
       and answer_text is not null and btrim(answer_text) <> ''
       and answer_kind in ('number','choice')
       and type_code is not null and btrim(type_code) <> ''
       and is_essay = false
       and image_path is not null and btrim(image_path) <> '';
    raise notice '[15] 엄격 조건 원문 (Storage 확인 전): %건', v_strict;

    select count(*) into v_types_no_twin from (
      select p.type_code from public.problems p
       where p.type_code is not null and btrim(p.type_code) <> ''
       group by p.type_code
      having count(p.twin_id) = 0
    ) t;
    raise notice '[16] 쌍둥이가 전혀 없는 유형         : %개', v_types_no_twin;
  end if;

  -- ── 4-4) Storage 구조 (§148) ──────────────────────────────────────
  -- 여기서 '구조' 가 깨지면 **중단**이다. 아래 4-5 는 구조가 온전할 때만 실행한다 —
  -- 없는 칼럼을 참조하면 중간에 SQL 오류로 끊겨 최종 판정까지 못 간다.
  -- (plpgsql 은 실행되는 구문만 파싱하므로 if 로 감싸면 안전하다.)
  v_storage_ok := false;

  if to_regclass('storage.objects') is null then
    raise notice '[17] storage.objects                : 없음                      → 중단';
    v_fail := v_fail + 1;
  else
    v_missing := '';
    foreach v_col in array array['id','bucket_id','name','updated_at','metadata'] loop
      select count(*) into v_cnt from information_schema.columns
       where table_schema = 'storage' and table_name = 'objects' and column_name = v_col;
      if v_cnt = 0 then v_missing := v_missing || ' ' || v_col; end if;
    end loop;
    if v_missing <> '' then
      raise notice '[17] storage.objects 필수 칼럼      : 없음 —%                  → 중단', v_missing;
      v_fail := v_fail + 1;
    else
      raise notice '[17] storage.objects 필수 칼럼 5개  : 모두 있음                 → OK';
      v_storage_ok := true;
    end if;
  end if;

  -- ── 4-5) Storage 데이터 (§156 · D-089) ────────────────────────────
  -- 여기 건수는 **경고/제외 수**다. 한 건 때문에 전체 설치를 막지 않는다 —
  -- 파이프라인이 원문별로 이미 fail closed 라 고장 난 원문은 안전하게 건너뛴다.
  -- 준비도 판정은 아래 [23]·[24] 의 **사용 가능 수**로만 한다.
  -- 아래 집계는 problems 를 조인하므로 **문제 구조도 온전해야** 실행한다 (D-094 §105)
  if not v_storage_ok or not v_problem_ok then
    raise notice '[18~24] Storage 데이터 점검         : 건너뜀 (구조가 불완전)';
  else
    select count(*) into v_bucket_rows from storage.objects where bucket_id = 'problem-images';
    raise notice '[18] problem-images 버킷 객체        : %건', v_bucket_rows;

    -- 조인이 문항을 부풀리지 않게 **count(distinct p.id)** 를 쓴다 (§176).
    -- 정상 판정에는 o.id 존재 · updated_at 있음 · ETag 있음을 모두 넣는다 (§178).
    select
      count(distinct p.id),
      count(distinct p.id) filter (where o.id is null),
      count(distinct p.id) filter (where o.id is not null and o.updated_at is null),
      count(distinct p.id) filter (
        where o.id is not null
          and btrim(coalesce(o.metadata->>'eTag', o.metadata->>'etag', '')) = ''),
      count(distinct p.id) filter (
        where o.id is not null
          and o.updated_at is not null
          and btrim(coalesce(o.metadata->>'eTag', o.metadata->>'etag', '')) <> '')
      into v_with_image, v_no_object, v_no_updated, v_no_etag, v_usable
      from public.problems p
      left join storage.objects o
        on o.bucket_id = 'problem-images' and o.name = p.image_path
     where p.twin_id is null
       and p.answer_text is not null and btrim(p.answer_text) <> ''
       and p.answer_kind in ('number','choice')
       and p.type_code is not null and btrim(p.type_code) <> ''
       and p.is_essay = false
       and p.image_path is not null and btrim(p.image_path) <> '';

    raise notice '[19] 엄격 조건 원문 (재확인)         : %건', v_with_image;
    raise notice '[20]  - Storage 객체 없음            : %건  (경고·제외)', v_no_object;
    raise notice '[21]  - updated_at 없음              : %건  (경고·제외, D-083)', v_no_updated;
    raise notice '[22]  - ETag 없음                    : %건  (경고·제외)', v_no_etag;

    -- ── 준비도 판정 (D-089) ────────────────────────────────────────
    -- 고장 난 원문은 건너뛰면 그만이지만, 돌릴 깨끗한 원문이 하나도 없으면 준비가 안 된 것이다.
    if v_usable > 0 then
      raise notice '[23] 사용 가능 원문                 : %건                      → OK', v_usable;
    else
      raise notice '[23] 사용 가능 원문                 : 0건                       → 중단';
      v_fail := v_fail + 1;
    end if;

    -- D-093: 실제 유형 목록 RPC(`server_list_eligible_twin_types`)와 **같은 유형 집합**에서
    --   센다. 그 RPC 는 `standard_types` 와 inner join 하므로, 여기서 join 을 빼면
    --   점검은 "파일럿 유형이 있다" 고 말하고 설치 후 RPC 는 빈 목록을 주는 일이 생긴다.
    select count(*) into v_usable_types from (
      select p.type_code
        from public.problems p
        join public.standard_types st on st.code = p.type_code
        left join storage.objects o
          on o.bucket_id = 'problem-images' and o.name = p.image_path
       where p.type_code is not null and btrim(p.type_code) <> ''
       group by p.type_code
      having count(p.twin_id) = 0
         and count(distinct p.id) filter (
               where p.twin_id is null
                 and p.answer_text is not null and btrim(p.answer_text) <> ''
                 and p.answer_kind in ('number','choice')
                 and p.is_essay = false
                 and p.image_path is not null and btrim(p.image_path) <> ''
                 and o.id is not null
                 and o.updated_at is not null
                 and btrim(coalesce(o.metadata->>'eTag', o.metadata->>'etag', '')) <> ''
             ) >= 5
    ) t;

    if v_usable_types > 0 then
      raise notice '[24] 사용 가능 파일럿 유형(5개 이상): %개                      → OK', v_usable_types;
    else
      raise notice '[24] 사용 가능 파일럿 유형(5개 이상): 0개                       → 중단';
      v_fail := v_fail + 1;
    end if;

    -- 참고값. 판정에 넣지 않는다 (§170)
    select count(distinct p.id) into v_orphan_all
      from public.problems p
      left join storage.objects o
        on o.bucket_id = 'problem-images' and o.name = p.image_path
     where p.image_path is not null and btrim(p.image_path) <> '' and o.id is null;
    raise notice '[참고] 전체 문항의 고아 이미지 참조  : %건  (판정 아님)', v_orphan_all;
  end if;

  -- ── 5) 참고 정보 (판정 아님) ──────────────────────────────────────
  -- §110: 테이블이 없으면 참고 count 때문에 점검이 중간에 끊기지 않게 존재를 먼저 본다.
  raise notice '────────────────────────────────────────────────';
  if to_regclass('public.users') is null then
    raise notice '[참고] public.users                 : 테이블 없음';
  else
    select count(*) into v_rows from public.users;
    raise notice '[참고] public.users 행 수           : %', v_rows;
  end if;

  if to_regclass('auth.users') is null then
    raise notice '[참고] auth.users                   : 테이블 없음';
  else
    select count(*) into v_rows from auth.users;
    raise notice '[참고] auth.users 행 수             : %  (학생 익명 세션 포함)', v_rows;
  end if;

  if to_regclass('public.problems') is null then
    raise notice '[참고] 문제은행                     : 테이블 없음';
  else
    select count(*) into v_rows from public.problems;
    raise notice '[참고] 문제은행 행 수               : %  (설치 후에도 그대로여야 함)', v_rows;
  end if;

  -- ── 결론 ─────────────────────────────────────────────────────────
  raise notice '════════════════════════════════════════════════';
  if v_fail = 0 then
    raise notice '판정: 전부 OK — 설치해도 됩니다.';
  else
    -- §286: notice 로만 알리고 성공한 것처럼 끝내지 않는다.
    -- 스크립트로 돌려도, 사람이 notice 를 못 봐도, 여기서 반드시 실패로 끝난다.
    raise exception '판정: 중단 %건 — 설치하지 마시고 위 [n] 줄을 알려 주세요.', v_fail
      using errcode = 'raise_exception';
  end if;
end;
$check$;
