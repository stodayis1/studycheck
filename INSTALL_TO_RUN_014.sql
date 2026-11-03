-- 쌍둥이 문항 파이프라인 — 설치 SQL (최초 마이그레이션)
-- 작성 2026-09-23 · GPT-EXEC-003 (결함 1~7 수정본)
--
-- ⚠ 아직 실행하지 마세요. GPT 검수 후 실행 승인이 나면 그때 돌립니다.
--
-- 먼저 `쌍둥이_설치전_점검.sql` 을 돌려 모든 항목이 OK 인지 확인하세요.
--
-- 이 파일은 **한 트랜잭션**입니다. 중간에 한 줄이라도 실패하면 전부 되돌아가고
-- "테이블은 생겼는데 함수는 없는" 반쪽 설치가 남지 않습니다 (§108).
--
-- 실행: Supabase → StudyCheck 프로젝트(cggskjxsyrvuhsldgkoj) → SQL Editor → 전체 붙여넣고 Run
-- 되돌리기: `쌍둥이_롤백.sql`
--
-- 기존 problems·students·users 는 참조만 합니다. 수정하지 않습니다.

begin;


-- ════════════════════════════════════════════════════════════════════
-- 0) 사전검사 — 예상과 다르면 여기서 멈춘다 (§112~114)
-- ════════════════════════════════════════════════════════════════════
-- IF NOT EXISTS 로 조용히 재사용하지 않는다. 예상 못 한 객체가 있으면 중단한다.

do $pre$
declare
  v_rows bigint;
  v_cnt  int;
begin
  -- 전용 스키마가 이미 있으면 중단 (D-049)
  select count(*) into v_cnt from pg_namespace where nspname = 'ai_question_private';
  if v_cnt > 0 then
    raise exception '설치 중단: ai_question_private 스키마가 이미 있습니다. 내용을 확인하세요.';
  end if;

  -- 새로 만들 테이블과 같은 이름이 public 에 있으면 중단
  select count(*) into v_cnt from information_schema.tables
   where table_schema = 'public' and table_name = 'type_learning_assets';
  if v_cnt > 0 then
    raise exception '설치 중단: public.type_learning_assets 가 이미 있습니다.';
  end if;

  -- 같은 이름의 함수가 있으면 중단한다.
  -- 정책 (§288): **이름이 같으면 인자가 달라도 중단**한다. overload 를 얹으면
  -- PostgREST 가 어느 쪽을 부를지 헷갈린다. `쌍둥이_설치전_점검.sql` 도 같은 기준이다.
  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('admin_list_twin_candidates','admin_get_twin_candidate',
                       'admin_approve_twin_candidate','admin_reject_twin_candidate',
                       'admin_set_student_publish_approval','admin_set_practice_publication',
                       'server_create_twin_candidate','server_update_twin_validation',
                       'server_list_eligible_twin_types','server_get_twin_batch_state');
  if v_cnt > 0 then
    raise exception '설치 중단: 같은 이름의 RPC 가 이미 있습니다 (%개).', v_cnt;
  end if;

  -- 기존 관리자 판정 함수가 **인자 없는 형태로 정확히 하나씩** 있어야 한다.
  -- 이름만 세면 동명의 다른 시그니처를 함수로 착각할 수 있다.
  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'is_admin' and p.pronargs = 0;
  if v_cnt <> 1 then
    raise exception '설치 중단: public.is_admin() (인자 없음) 이 정확히 하나가 아닙니다 (%개).', v_cnt;
  end if;

  select count(*) into v_cnt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'is_staff' and p.pronargs = 0;
  if v_cnt <> 1 then
    raise exception '설치 중단: public.is_staff() (인자 없음) 이 정확히 하나가 아닙니다 (%개).', v_cnt;
  end if;

  -- 폐기된 public.twin_candidates 는 **행이 0개일 때만** 제거한다 (§112)
  select count(*) into v_cnt from information_schema.tables
   where table_schema = 'public' and table_name = 'twin_candidates';
  if v_cnt > 0 then
    execute 'select count(*) from public.twin_candidates' into v_rows;
    if v_rows > 0 then
      raise exception '설치 중단: public.twin_candidates 에 행이 %개 있습니다. 자동으로 지우지 않습니다.', v_rows;
    end if;
    execute 'drop table public.twin_candidates';
    raise notice '폐기된 public.twin_candidates(0행)를 제거했습니다.';
  end if;
end;
$pre$;


-- ════════════════════════════════════════════════════════════════════
-- 1) 전용 비노출 스키마 (D-049)
-- ════════════════════════════════════════════════════════════════════
-- 공용 이름인 `private` 대신 이 기능 전용 이름을 쓴다.
-- 다른 기능이 private 를 쓸 때 광범위한 revoke·drop 이 영향을 주는 것을 막는다.
-- ⚠ Supabase 대시보드의 Exposed Schemas 에 추가하지 않는다.

create schema ai_question_private;

revoke usage on schema ai_question_private from anon, authenticated;
revoke all   on schema ai_question_private from anon, authenticated;

alter default privileges in schema ai_question_private
  revoke all on tables    from anon, authenticated;
alter default privileges in schema ai_question_private
  revoke all on functions from anon, authenticated;

comment on schema ai_question_private is
  'AI 질문앱 전용 비노출 영역. PostgREST 에 노출하지 않는다. 접근은 public 의 SECURITY DEFINER RPC 로만.';


-- ════════════════════════════════════════════════════════════════════
-- 2) 후보 테이블
-- ════════════════════════════════════════════════════════════════════

create table ai_question_private.twin_candidates (
  id                 uuid primary key default gen_random_uuid(),
  batch_id           uuid not null,
  source_problem_id  bigint not null references public.problems(id) on delete cascade,
  candidate_no       int not null default 1 check (candidate_no >= 1),

  -- 생성 키 (§164)
  source_fingerprint text not null check (btrim(source_fingerprint) <> ''),
  prompt_version     text not null check (btrim(prompt_version) <> ''),

  -- ── 생성 모델이 만든 내용 ─────────────────────────────────────────
  -- §237: 허용값을 제한한다. **null 은 그대로 둔다** — 억지 기본값으로 바꾸지 않는다 (D-066)
  -- 값 목록은 `lib/twin/schema.ts` 의 VariantKind 와 **같아야 한다.**
  -- 여기서 임의로 좁히면 모델이 낸 정상 후보가 DB 에서 거부된다.
  variant_kind       text check (variant_kind is null or variant_kind in
                       ('numeric','wording','context','representation','mixed')),
  problem_text_latex text not null check (btrim(problem_text_latex) <> ''),
  answer_kind        text not null check (answer_kind in ('number','choice')),
  answer_text        text not null check (btrim(answer_text) <> ''),
  -- 배열 계약을 DB 에서도 확인한다 (§133)
  solution_outline   jsonb not null check (jsonb_typeof(solution_outline)   = 'array'),
  concepts           jsonb not null default '[]'::jsonb check (jsonb_typeof(concepts)        = 'array'),
  common_mistakes    jsonb not null default '[]'::jsonb check (jsonb_typeof(common_mistakes) = 'array'),
  transformations    jsonb not null default '[]'::jsonb check (jsonb_typeof(transformations) = 'array'),
  self_check_notes   jsonb not null default '[]'::jsonb check (jsonb_typeof(self_check_notes)= 'array'),
  type_code          text,
  -- 프롬프트 규칙 3 · schema.ts 와 같은 범위다: -1 | 0 | +1
  difficulty_delta   int check (difficulty_delta is null or difficulty_delta between -1 and 1),
  reverse_derivation_risk text           -- 모델 자기보고
                     check (reverse_derivation_risk is null or
                            reverse_derivation_risk in ('low','medium','high')),
  single_answer_claim     boolean,       -- 모델 자기보고
  needs_new_image         boolean not null default false,
  generation_status  text not null default 'generated'
                     check (generation_status in ('generated','unsupported')),
  unsupported_reason text,

  -- ── 서버 검산 결과 ────────────────────────────────────────────────
  format_validation_passed   boolean not null default false,
  deterministic_check_passed boolean not null default false,
  independent_check_passed   boolean not null default false,
  ai_consensus_passed        boolean not null default false,
  teacher_approved           boolean not null default false,

  verification_status text not null default 'unverified'
                      check (verification_status in ('verified','unverified','failed')),
  unverified_reason  text,
  check_method       text check (check_method in ('rule','cas','second_model','none')),
  check_detail       jsonb not null default '{}'::jsonb check (jsonb_typeof(check_detail) = 'object'),
  format_issues      jsonb not null default '[]'::jsonb check (jsonb_typeof(format_issues) = 'array'),
  ai_issues          jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_issues)     = 'array'),
  ai_answer_text     text,
  similarity_to_source numeric,

  -- ── 검수 ──────────────────────────────────────────────────────────
  status             text not null default 'generated'
                     check (status in ('generated','pending_review','approved','rejected')),
  -- D-052: auth.uid() 를 그대로 담는다. public.users(id) 외래키를 걸지 않는다.
  --   auth.users 는 257행인데 public.users 는 11행이다 (학생 익명 세션 때문).
  --   공개 프로필 행의 존재·삭제 정책과 감사 기록을 묶으면 기록이 깨진다.
  reviewed_by_auth_uid uuid,
  reviewed_at        timestamptz,
  reject_reason      text,
  teacher_edited     boolean not null default false,
  practice_problem_id uuid,                            -- 승인 시 연결 (FK는 아래에서)

  generation_model   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- D-065: 생성 고유키에 batch_id 를 포함한다.
  --   같은 batch 재시도 → 같은 행 / 새 batch → 새 후보
  unique (source_problem_id, source_fingerprint, prompt_version, batch_id, candidate_no),

  -- ── D-053 · D-055: 검증 불변식을 상태별로 DB 가 강제한다 ──────────
  --
  -- ⚠ 이전 판은 교사 수정 승인 경로를 막았다.
  --   교사가 내용을 고치면 format_validation_passed 가 false 로 내려가는데,
  --   "형식 실패면 rejected" 라는 일괄 규칙이 approved 를 허용하지 않았다.
  --   수정 전 검산을 수정본의 검산으로 가장하지 않으면서도 승인은 성공해야 한다.
  constraint twin_validation_invariants check (
    (
      case status
        -- 생성 직후: 아직 아무 판정도 없다
        when 'generated' then true

        -- 검수 대기: 형식을 통과했고 수학 검증이 실패가 아니어야 한다
        when 'pending_review' then
          format_validation_passed and verification_status <> 'failed'

        -- 승인: 교사가 눌렀고 예제가 만들어져 있어야 한다
        when 'approved' then
          teacher_approved
          and practice_problem_id is not null
          and (
            -- (가) 교사가 내용을 고치지 않은 경우 — 자동검산 결과가 그대로 유효하다
            (
              not teacher_edited
              and format_validation_passed
              and verification_status <> 'failed'
            )
            or
            -- (나) 교사가 고친 경우 (D-055) — 자동검산은 전부 무효화돼 있어야 한다
            (
              teacher_edited
              and not format_validation_passed
              and not deterministic_check_passed
              and not independent_check_passed
              and not ai_consensus_passed
              and verification_status = 'unverified'
              and unverified_reason = 'teacher_edited'
              and check_method = 'none'
            )
          )

        -- 거부: 자동검증 실패·다른 후보 승인·사후 거부를 모두 허용한다.
        --       다만 거부된 것이 승인 상태로 남아 있으면 안 된다
        when 'rejected' then not teacher_approved

        else false
      end
    )
    -- 상태와 무관한 규칙 (D-078) — **양방향**이다.
    --
    -- (→) 결정론적 검산을 주장하려면 verified + rule|cas 여야 한다.
    and (
      not (deterministic_check_passed or independent_check_passed)
      or (verification_status = 'verified' and check_method in ('rule','cas'))
    )
    -- (←) verified 라면 결정론적 플래그 중 하나가 반드시 true 이고 rule|cas 여야 한다.
    --     이 줄이 없으면 "AI 가 동의했으니 verified" 라고 적어 넣을 수 있었다.
    --     AI 합의(ai_consensus_passed)만으로는 **어느 방향에서도** verified 가 될 수 없다.
    and (
      verification_status <> 'verified'
      or ((deterministic_check_passed or independent_check_passed)
          and check_method in ('rule','cas'))
    )
  )
);

comment on table ai_question_private.twin_candidates is
  'AI가 만든 쌍둥이 후보. 학생에게 절대 가지 않는다. 승인된 것만 ai_practice_problems 로 복사된다.';
comment on column ai_question_private.twin_candidates.independent_check_passed is
  '결정론적 검산(규칙·CAS)만 켤 수 있다. AI 검토 일치는 ai_consensus_passed 다.';
comment on column ai_question_private.twin_candidates.reviewed_by_auth_uid is
  'D-052. auth.uid() 원본. public.users 행이 지워져도 감사 기록이 남도록 FK를 걸지 않는다.';

create index twin_cand_status_idx on ai_question_private.twin_candidates (status);
create index twin_cand_source_idx on ai_question_private.twin_candidates (source_problem_id);
create index twin_cand_group_idx  on ai_question_private.twin_candidates
  (source_problem_id, source_fingerprint, prompt_version, batch_id);


-- ════════════════════════════════════════════════════════════════════
-- 3) 승인된 예제 테이블
-- ════════════════════════════════════════════════════════════════════

create table ai_question_private.ai_practice_problems (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null unique
                     references ai_question_private.twin_candidates(id) on delete restrict,
  source_problem_id  bigint references public.problems(id) on delete set null,
  type_code          text not null check (btrim(type_code) <> ''),   -- §131: 빈 유형 금지

  problem_text_latex text not null check (btrim(problem_text_latex) <> ''),
  answer_kind        text not null check (answer_kind in ('number','choice')),
  answer_text        text not null check (btrim(answer_text) <> ''),
  solution_outline   jsonb not null check (jsonb_typeof(solution_outline) = 'array'),
  concepts           jsonb not null default '[]'::jsonb check (jsonb_typeof(concepts)        = 'array'),
  common_mistakes    jsonb not null default '[]'::jsonb check (jsonb_typeof(common_mistakes) = 'array'),

  -- ── 학생 게시 안전검수 (D-064 · D-048) ───────────────────────────────
  student_publish_approved          boolean not null default false,
  student_publish_first_approved_by_auth_uid uuid,          -- 최초. 지우지 않는다
  student_publish_first_approved_at       timestamptz,
  student_publish_last_changed_by_auth_uid   uuid,
  student_publish_last_changed_at         timestamptz,

  -- ── 게시 (D-041 · D-051) ─────────────────────────────────────────
  status             text not null default 'approved'
                     check (status in ('approved','published','retired')),
  first_published_by_auth_uid uuid,              -- 최초. 지우지 않는다
  first_published_at timestamptz,
  publish_changed_by_auth_uid uuid,
  publish_changed_at timestamptz,
  retired_at         timestamptz,
  retired_reason     text,

  teacher_edited     boolean not null default false,
  reviewed_by_auth_uid uuid,
  reviewed_at        timestamptz not null default now(),
  prompt_version     text,
  generation_model   text,
  created_at         timestamptz not null default now(),

  -- ── D-050: 안전 승인 없이는 게시될 수 없다. DB 가 강제한다 ────────
  constraint practice_publish_requires_approval check (
    status <> 'published' or student_publish_approved = true
  ),
  -- ── D-051: 폐기된 것은 안전 승인 상태로 남지 않는다 ───────────────
  constraint practice_retired_not_approved check (
    status <> 'retired' or (student_publish_approved = false and retired_at is not null)
  )
);

comment on table ai_question_private.ai_practice_problems is
  '교사 승인을 받은 화면용 AI 예제. 정답은 서버 판정에만 쓰고 학생 클라이언트로 보내지 않는다.';
comment on column ai_question_private.ai_practice_problems.status is
  'D-041·D-051. approved=검수 완료·비노출 / published=게시(안전승인 필수) / retired=폐기(재게시 불가).';
comment on constraint practice_publish_requires_approval on ai_question_private.ai_practice_problems is
  'D-050. 학생 게시 안전검수를 거치지 않은 게시를 DB 차원에서 막는다. 이 승인은 최종답 공개 권한이 아니다 (D-063).';

create index ai_practice_type_idx   on ai_question_private.ai_practice_problems (type_code);
create index ai_practice_status_idx on ai_question_private.ai_practice_problems (status);

-- 후보 → 예제 역방향 FK (같은 스키마)
alter table ai_question_private.twin_candidates
  add constraint twin_cand_practice_fk
  foreign key (practice_problem_id)
  references ai_question_private.ai_practice_problems(id) on delete set null;


-- ════════════════════════════════════════════════════════════════════
-- 4) 학생용 자산 연결 테이블
-- ════════════════════════════════════════════════════════════════════
-- 정답·해설을 저장하지 않는다. 게시될 때만 활성화된다.

create table public.type_learning_assets (
  id            uuid primary key default gen_random_uuid(),
  type_code     text not null,
  asset_type    text not null check (asset_type in
                  ('twin_problem','representative_problem','concept_card','video','ai_practice')),
  problem_id    bigint references public.problems(id) on delete cascade,
  -- §130: cross-schema FK. 사전 점검에서 제약 문제가 없음을 확인했다
  practice_id   uuid references ai_question_private.ai_practice_problems(id) on delete cascade,
  video_url     text,
  start_seconds int,
  end_seconds   int,
  title         text,
  is_active     boolean not null default false,
  review_status text not null default 'unreviewed'
                check (review_status in ('unreviewed','approved','rejected')),
  priority      int not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.type_learning_assets is
  '유형별 학습 자산 연결표. 정답·해설을 저장하지 않는다. 게시될 때만 is_active=true 가 된다.';

create index tla_type_idx   on public.type_learning_assets (type_code, priority);
create index tla_active_idx on public.type_learning_assets (is_active, review_status);
create unique index tla_practice_uidx
  on public.type_learning_assets (practice_id) where practice_id is not null;

alter table public.type_learning_assets enable row level security;

-- §122: authenticated 에 SELECT 만. 쓰기는 명시적으로 회수하고 RPC 로만 한다.
revoke insert, update, delete on public.type_learning_assets from anon, authenticated;
revoke all on public.type_learning_assets from anon;
grant select on public.type_learning_assets to authenticated;

-- 학생: 활성 + 승인된 것만
create policy tla_read_active on public.type_learning_assets
  for select to authenticated
  using (is_active = true and review_status = 'approved');

-- 직원: 관리 목적의 읽기
create policy tla_staff_read on public.type_learning_assets
  for select to authenticated using (public.is_staff());


-- ════════════════════════════════════════════════════════════════════
-- 5) 관리자 RPC
-- ════════════════════════════════════════════════════════════════════

-- ── 5-1) 목록 (§151: items/total/limit/offset + practice 요약) ──────
create function public.admin_list_twin_candidates(
  p_status   text default 'pending_review',
  p_batch_id uuid default null,
  p_limit    integer default 50,
  p_offset   integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_items  jsonb;
  v_total  bigint;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in
     ('generated','pending_review','approved','rejected') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select count(*) into v_total
    from ai_question_private.twin_candidates c
   where (p_status is null or c.status = p_status)
     and (p_batch_id is null or c.batch_id = p_batch_id);

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_items
  from (
    select c.id, c.batch_id, c.source_problem_id, c.candidate_no, c.type_code, c.status,
           c.source_fingerprint,
           c.problem_text_latex, c.answer_kind, c.answer_text,
           c.solution_outline, c.concepts, c.common_mistakes, c.transformations,
           c.variant_kind, c.difficulty_delta,
           c.reverse_derivation_risk, c.single_answer_claim, c.self_check_notes,
           c.format_validation_passed, c.deterministic_check_passed,
           c.independent_check_passed, c.ai_consensus_passed, c.teacher_approved,
           c.verification_status, c.unverified_reason, c.check_method,
           c.format_issues, c.ai_issues, c.ai_answer_text, c.similarity_to_source,
           c.teacher_edited, c.reject_reason, c.practice_problem_id,
           c.generation_model, c.prompt_version, c.created_at,
           p.book        as source_book,
           p.difficulty  as source_difficulty,
           p.step        as source_step,
           p.answer_kind as source_answer_kind,
           p.answer_text as source_answer_text,
           p.image_path  as source_image_path,
           st.type_title as source_type_title,
           -- practice 요약 (§165) — 새로고침해도 안전 예제 상태가 유지된다
           ap.status               as practice_status,
           ap.student_publish_approved  as student_publish_approved,
           (ap.status = 'published') as is_published
      from ai_question_private.twin_candidates c
      join public.problems p on p.id = c.source_problem_id
      left join public.standard_types st on st.code = c.type_code
      left join ai_question_private.ai_practice_problems ap on ap.id = c.practice_problem_id
     where (p_status is null or c.status = p_status)
       and (p_batch_id is null or c.batch_id = p_batch_id)
     order by c.source_problem_id, c.candidate_no
     limit v_limit offset v_offset
  ) t;

  return jsonb_build_object(
    'items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset
  );
end;
$fn$;

-- ── 5-2) 상세 ───────────────────────────────────────────────────────
create function public.admin_get_twin_candidate(
  p_candidate_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_row jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_candidate_id is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  select to_jsonb(t) into v_row
  from (
    select c.*,
           p.book        as source_book,
           p.difficulty  as source_difficulty,
           p.step        as source_step,
           p.answer_kind as source_answer_kind,
           p.answer_text as source_answer_text,
           p.image_path  as source_image_path,
           st.type_title as source_type_title,
           ap.status              as practice_status,
           ap.student_publish_approved as student_publish_approved,
           (ap.status = 'published') as is_published
      from ai_question_private.twin_candidates c
      join public.problems p on p.id = c.source_problem_id
      left join public.standard_types st on st.code = c.type_code
      left join ai_question_private.ai_practice_problems ap on ap.id = c.practice_problem_id
     where c.id = p_candidate_id
  ) t;

  if v_row is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$fn$;

-- ── 5-3) 승인 ───────────────────────────────────────────────────────
create function public.admin_approve_twin_candidate(
  p_candidate_id uuid,
  p_edits jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_allowed  text[] := array['problem_text_latex','answer_kind','answer_text',
                             'solution_outline','concepts','common_mistakes'];
  v_key      text;
  v_c        ai_question_private.twin_candidates%rowtype;
  v_edited   boolean := false;
  v_text     text;  v_kind text;  v_answer text;
  v_outline  jsonb; v_concepts jsonb; v_mistakes jsonb;
  v_practice uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_candidate_id is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if p_edits is not null and jsonb_typeof(p_edits) <> 'object' then
    raise exception 'invalid_edits' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(coalesce(p_edits, '{}'::jsonb)) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'unknown_edit_key' using errcode = '22023';
    end if;
  end loop;

  select * into v_c from ai_question_private.twin_candidates
   where id = p_candidate_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_c.status <> 'pending_review' then
    raise exception 'invalid_state' using errcode = '22023';
  end if;
  -- §131: 빈 유형으로 예제를 만들지 않는다
  if btrim(coalesce(v_c.type_code, '')) = '' then
    raise exception 'empty_type_code' using errcode = '22023';
  end if;

  v_text     := coalesce(p_edits->>'problem_text_latex', v_c.problem_text_latex);
  v_kind     := coalesce(p_edits->>'answer_kind',        v_c.answer_kind);
  v_answer   := coalesce(p_edits->>'answer_text',        v_c.answer_text);
  v_outline  := coalesce(p_edits->'solution_outline',    v_c.solution_outline);
  v_concepts := coalesce(p_edits->'concepts',            v_c.concepts);
  v_mistakes := coalesce(p_edits->'common_mistakes',     v_c.common_mistakes);

  if btrim(coalesce(v_text, '')) = ''   then raise exception 'empty_problem_text' using errcode='22023'; end if;
  if btrim(coalesce(v_answer, '')) = '' then raise exception 'empty_answer'       using errcode='22023'; end if;
  if v_kind not in ('number','choice')  then raise exception 'invalid_answer_kind' using errcode='22023'; end if;
  -- §133: 배열 계약
  if jsonb_typeof(v_outline)  <> 'array' then raise exception 'invalid_json_type' using errcode='22023'; end if;
  if jsonb_typeof(v_concepts) <> 'array' then raise exception 'invalid_json_type' using errcode='22023'; end if;
  if jsonb_typeof(v_mistakes) <> 'array' then raise exception 'invalid_json_type' using errcode='22023'; end if;

  -- §134: concepts·common_mistakes 변경도 교사 수정으로 본다
  v_edited := (v_text <> v_c.problem_text_latex)
           or (v_kind <> v_c.answer_kind)
           or (v_answer <> v_c.answer_text)
           or (v_outline  is distinct from v_c.solution_outline)
           or (v_concepts is distinct from v_c.concepts)
           or (v_mistakes is distinct from v_c.common_mistakes);

  insert into ai_question_private.ai_practice_problems (
    candidate_id, source_problem_id, type_code,
    problem_text_latex, answer_kind, answer_text,
    solution_outline, concepts, common_mistakes,
    teacher_edited, reviewed_by_auth_uid, reviewed_at, prompt_version, generation_model
  ) values (
    v_c.id, v_c.source_problem_id, v_c.type_code,
    v_text, v_kind, v_answer, v_outline, v_concepts, v_mistakes,
    v_edited, auth.uid(), now(), v_c.prompt_version, v_c.generation_model
  )
  returning id into v_practice;

  update ai_question_private.twin_candidates
     set status = 'approved',
         teacher_approved = true,
         teacher_edited = v_edited,
         practice_problem_id = v_practice,
         reviewed_by_auth_uid = auth.uid(),
         reviewed_at = now(),
         reject_reason = null,
         -- 수정 전 자동검산이 수정본을 검증한 것처럼 보이면 안 된다
         format_validation_passed   = case when v_edited then false else format_validation_passed end,
         deterministic_check_passed = case when v_edited then false else deterministic_check_passed end,
         independent_check_passed   = case when v_edited then false else independent_check_passed end,
         ai_consensus_passed        = case when v_edited then false else ai_consensus_passed end,
         verification_status = case when v_edited then 'unverified' else verification_status end,
         unverified_reason   = case when v_edited then 'teacher_edited' else unverified_reason end,
         check_method        = case when v_edited then 'none' else check_method end,
         updated_at = now()
   where id = p_candidate_id;

  -- §137: 같은 **생성 그룹** 안에서만 나머지를 거부한다.
  -- 새 프롬프트·새 배치로 만든 정상 후보까지 과거 승인 때문에 거부되면 안 된다.
  update ai_question_private.twin_candidates
     set status = 'rejected',
         teacher_approved = false,
         reject_reason = coalesce(reject_reason, '같은 묶음의 다른 후보가 승인됨'),
         reviewed_by_auth_uid = auth.uid(), reviewed_at = now(), updated_at = now()
   where source_problem_id  = v_c.source_problem_id
     and source_fingerprint = v_c.source_fingerprint
     and prompt_version     = v_c.prompt_version
     and batch_id           = v_c.batch_id
     and id <> p_candidate_id
     and status = 'pending_review';

  return v_practice;
end;
$fn$;

-- ── 5-4) 거부 (D-051: 승인 후 거부하면 예제까지 폐기) ──────────────
create function public.admin_reject_twin_candidate(
  p_candidate_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_status   text;
  v_practice uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_reason = '' then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  select status, practice_problem_id into v_status, v_practice
    from ai_question_private.twin_candidates
   where id = p_candidate_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('pending_review','approved') then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  -- 승인됐던 후보를 거부하면 연결 예제를 폐기하고 학생에게서 즉시 내린다
  if v_practice is not null then
    perform 1 from ai_question_private.ai_practice_problems
     where id = v_practice for update;

    update ai_question_private.ai_practice_problems
       set status = 'retired',
           student_publish_approved = false,          -- 제약(retired_not_safe)을 만족시킨다
           student_publish_last_changed_by_auth_uid = auth.uid(),
           student_publish_last_changed_at = now(),
           retired_at = now(),
           retired_reason = v_reason,
           publish_changed_by_auth_uid = auth.uid(),
           publish_changed_at = now()
     where id = v_practice;

    update public.type_learning_assets
       set is_active = false, updated_at = now()
     where practice_id = v_practice;
  end if;

  -- 거부된 것이 승인 상태로 남아 있으면 안 된다 (불변식 rejected 분기)
  update ai_question_private.twin_candidates
     set status = 'rejected',
         teacher_approved = false,
         reject_reason = v_reason,
         reviewed_by_auth_uid = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_candidate_id;
end;
$fn$;

-- ── 5-5) 학생 게시 안전검수 (D-064 · D-048) ────────────────────────
create function public.admin_set_student_publish_approval(
  p_practice_problem_id uuid,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status   text;
  v_first_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_practice_problem_id is null or p_enabled is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  select status, student_publish_first_approved_at into v_status, v_first_at
    from ai_question_private.ai_practice_problems
   where id = p_practice_problem_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'retired' then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  -- 철회하는 경우, 게시 중이면 같은 트랜잭션에서 게시를 내린다 (D-064)
  if not p_enabled and v_status = 'published' then
    update ai_question_private.ai_practice_problems
       set status = 'approved',
           publish_changed_by_auth_uid = auth.uid(),
           publish_changed_at = now()
     where id = p_practice_problem_id;

    update public.type_learning_assets
       set is_active = false, updated_at = now()
     where practice_id = p_practice_problem_id;
  end if;

  update ai_question_private.ai_practice_problems
     set student_publish_approved = p_enabled,
         student_publish_first_approved_by_auth_uid = case
           when p_enabled and v_first_at is null then auth.uid()
           else student_publish_first_approved_by_auth_uid end,
         student_publish_first_approved_at = case
           when p_enabled and v_first_at is null then now()
           else student_publish_first_approved_at end,
         student_publish_last_changed_by_auth_uid = auth.uid(),
         student_publish_last_changed_at = now()
   where id = p_practice_problem_id;
end;
$fn$;

-- ── 5-6) 게시 / 게시취소 (D-050) ───────────────────────────────────
create function public.admin_set_practice_publication(
  p_practice_problem_id uuid,
  p_publish boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
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
$fn$;


-- ════════════════════════════════════════════════════════════════════
-- 6) 서버 내부 RPC — service_role 전용
-- ════════════════════════════════════════════════════════════════════

create function public.server_create_twin_candidate(
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  -- §240: 허용 키 화이트리스트. 알 수 없는 키를 **조용히 버리지 않는다.**
  -- 오타(`answer_texts`)나 계약 변경을 눈치 못 채고 빈 값으로 저장하는 일을 막는다.
  v_allowed text[] := array[
    'source_problem_id','source_fingerprint','prompt_version','batch_id','candidate_no',
    'problem_text_latex','answer_kind','answer_text',
    'solution_outline','concepts','common_mistakes','transformations','self_check_notes',
    'type_code','difficulty_delta','variant_kind',
    'reverse_derivation_risk','single_answer_claim','needs_new_image',
    'generation_status','unsupported_reason','generation_model'];
  v_key    text;
  v_id     uuid;
  v_source bigint;
  v_fp     text;
  v_pv     text;
  v_no     int;
  v_delta  int;
  v_single boolean;
  v_newimg boolean;
  v_batch  uuid;
  v_src    record;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'unknown_payload_key' using errcode = '22023';
    end if;
  end loop;

  -- §242: 숫자·boolean cast 오류를 내부 SQL 문구 대신 안정 코드로 돌려준다
  begin
    v_source := (p_payload->>'source_problem_id')::bigint;
    v_no     := coalesce((p_payload->>'candidate_no')::int, 1);
    v_delta  := (p_payload->>'difficulty_delta')::int;
    v_single := (p_payload->>'single_answer_claim')::boolean;
    v_newimg := coalesce((p_payload->>'needs_new_image')::boolean, false);
  exception when others then
    raise exception 'invalid_payload' using errcode = '22023';
  end;
  v_fp := p_payload->>'source_fingerprint';
  v_pv := p_payload->>'prompt_version';

  if v_source is null or btrim(coalesce(v_fp,'')) = '' or btrim(coalesce(v_pv,'')) = '' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- D-065: batch_id 는 필수이고 uuid 여야 한다
  begin
    v_batch := (p_payload->>'batch_id')::uuid;
  exception when others then
    raise exception 'invalid_payload' using errcode = '22023';
  end;
  if v_batch is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- §179: 원문이 대상 조건을 만족하는지 DB 에서도 확인한다.
  -- 앱의 필터가 바뀌거나 빠져도 여기서 막힌다.
  select id, twin_id, answer_text, answer_kind, is_essay, type_code, image_path
    into v_src from public.problems where id = v_source;
  if not found then
    raise exception 'source_not_found' using errcode = 'P0002';
  end if;
  if v_src.twin_id is not null then
    raise exception 'source_already_has_twin' using errcode = '22023';
  end if;
  if btrim(coalesce(v_src.answer_text, '')) = '' then
    raise exception 'source_answer_missing' using errcode = '22023';
  end if;
  if v_src.answer_kind not in ('number','choice') then
    raise exception 'source_answer_kind_unsupported' using errcode = '22023';
  end if;
  -- D-082: **명시적 false 만** 통과한다. null 은 "서술형이 아님"이 아니라 미확인이다.
  -- D-090: 정책은 같지만 코드를 나눈다 — 로그만 보고
  --   "서술형이라 뺐다"(고칠 것 없음)와 "데이터가 비어 있어 뺐다"(보정 필요)를 구분해야 한다.
  if v_src.is_essay is null then
    raise exception 'source_is_essay_unknown' using errcode = '22023';
  end if;
  if v_src.is_essay then
    raise exception 'source_is_essay' using errcode = '22023';
  end if;

  -- D-088: 이미지가 없으면 모델이 원문을 볼 통로가 없다 (problem_ocr 은 아직 늘 null).
  -- 앱 필터가 빠져도 여기서 막힌다.
  if v_src.image_path is null or btrim(v_src.image_path) = '' then
    raise exception 'source_image_missing' using errcode = '22023';
  end if;
  if btrim(coalesce(v_src.type_code, '')) = ''
     or coalesce(p_payload->>'type_code','') is distinct from v_src.type_code then
    raise exception 'type_code_mismatch' using errcode = '22023';
  end if;

  -- §188: 배열 계약도 테이블 CHECK 에 맡기지 않고 여기서 확인한다
  if jsonb_typeof(coalesce(p_payload->'solution_outline','[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload->'concepts','[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload->'common_mistakes','[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload->'transformations','[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload->'self_check_notes','[]'::jsonb)) <> 'array' then
    raise exception 'invalid_json_type' using errcode = '22023';
  end if;
  if coalesce(p_payload->>'generation_status','generated') not in ('generated','unsupported') then
    raise exception 'invalid_generation_status' using errcode = '22023';
  end if;
  if v_no < 1 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if btrim(coalesce(p_payload->>'problem_text_latex','')) = ''
     or btrim(coalesce(p_payload->>'answer_text','')) = '' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if coalesce(p_payload->>'answer_kind','') not in ('number','choice') then
    raise exception 'invalid_answer_kind' using errcode = '22023';
  end if;
  -- §237 의 CHECK 에 우연히 맡기지 않고 여기서 이해 가능한 코드로 돌려준다
  if p_payload->>'variant_kind' is not null
     and p_payload->>'variant_kind' not in
         ('numeric','wording','context','representation','mixed') then
    raise exception 'invalid_enum_value' using errcode = '22023';
  end if;
  if p_payload->>'reverse_derivation_risk' is not null
     and p_payload->>'reverse_derivation_risk' not in ('low','medium','high') then
    raise exception 'invalid_enum_value' using errcode = '22023';
  end if;
  if v_delta is not null and (v_delta < -1 or v_delta > 1) then
    raise exception 'invalid_number_range' using errcode = '22023';
  end if;

  -- 같은 생성 키가 이미 있으면 그대로 돌려준다 (재시도 안전)
  select id into v_id from ai_question_private.twin_candidates
   where source_problem_id = v_source and source_fingerprint = v_fp
     and prompt_version = v_pv and batch_id = v_batch and candidate_no = v_no;
  if v_id is not null then
    return v_id;
  end if;

  insert into ai_question_private.twin_candidates (
    batch_id, source_problem_id, candidate_no, source_fingerprint, prompt_version,
    variant_kind, problem_text_latex, answer_kind, answer_text,
    solution_outline, concepts, common_mistakes, transformations, self_check_notes,
    type_code, difficulty_delta,
    reverse_derivation_risk, single_answer_claim, needs_new_image,
    generation_status, unsupported_reason, generation_model, status
  ) values (
    v_batch,
    v_source, v_no, v_fp, v_pv,
    p_payload->>'variant_kind',
    p_payload->>'problem_text_latex',
    p_payload->>'answer_kind',
    p_payload->>'answer_text',
    coalesce(p_payload->'solution_outline', '[]'::jsonb),
    coalesce(p_payload->'concepts',         '[]'::jsonb),
    coalesce(p_payload->'common_mistakes',  '[]'::jsonb),
    coalesce(p_payload->'transformations',  '[]'::jsonb),
    coalesce(p_payload->'self_check_notes', '[]'::jsonb),
    p_payload->>'type_code',
    v_delta,
    p_payload->>'reverse_derivation_risk',
    v_single,
    v_newimg,
    coalesce(p_payload->>'generation_status', 'generated'),
    p_payload->>'unsupported_reason',
    p_payload->>'generation_model',
    'generated'                                  -- 생성 상태는 항상 generated
  )
  on conflict (source_problem_id, source_fingerprint, prompt_version, batch_id, candidate_no)
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from ai_question_private.twin_candidates
     where source_problem_id = v_source and source_fingerprint = v_fp
       and prompt_version = v_pv and batch_id = v_batch and candidate_no = v_no;
  end if;
  return v_id;
end;
$fn$;

-- ── 6-3) 생성 묶음(batch) 상태 조회 (service_role 전용 · D-076) ────
-- 같은 batch 를 다시 돌릴 때 **모델을 또 부르지 않기 위한** 읽기 전용 조회다.
--
-- 돌려주는 것은 재사용 판정에 필요한 최소 필드뿐이다 (§178).
--   batch_id · candidate_no · candidate_id · status
-- 정답·풀이·원문 본문·검산 상세는 **돌려주지 않는다.** 여기로 새어 나갈 길을 두지 않는다.
create function public.server_get_twin_batch_state(
  p_source_problem_id bigint,
  p_source_fingerprint text,
  p_prompt_version text,
  p_batch_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_items jsonb;
begin
  if p_source_problem_id is null or p_batch_id is null
     or btrim(coalesce(p_source_fingerprint,'')) = ''
     or btrim(coalesce(p_prompt_version,'')) = '' then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'batch_id',     c.batch_id,
             'candidate_no', c.candidate_no,
             'candidate_id', c.id,
             'status',       c.status
           ) order by c.candidate_no
         ), '[]'::jsonb) into v_items
    from ai_question_private.twin_candidates c
   where c.source_problem_id  = p_source_problem_id
     and c.source_fingerprint = p_source_fingerprint
     and c.prompt_version     = p_prompt_version
     and c.batch_id           = p_batch_id;

  return jsonb_build_object('items', v_items);
end;
$fn$;


-- ── 6-3) 생성 대상 유형 목록 (service_role 전용) ───────────────────
-- 코드의 listEligibleTypes() 가 부르는 함수다. 이전에는 존재하지 않는 이름을 불러
-- 런타임 오류로 끝났다 (GPT-EXEC-006 §274).
--
-- 유형 선정 의미
--   같은 type_code 에 기존 twin_id 를 가진 문항이 **하나라도** 있으면 그 유형은 제외한다.
--   생성 가능 원문은 twin_id is null · answer_text 보유 · number|choice · 비서술형.
create function public.server_list_eligible_twin_types(
  p_min_eligible integer default 5,
  p_grade text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_min int := greatest(coalesce(p_min_eligible, 5), 1);
  v_items jsonb;
begin
  -- §101: 세 count 가 **모두 같은 생성 가능 조건**을 쓴다.
  --   예전에는 number_count·choice_count 가 느슨한 조건(정답만 있으면 셈)이어서,
  --   eligible 과 숫자가 어긋나 "어느 쪽이 진짜인지" 알 수 없었다.
  --   이제 셋 다 같은 뜻이다: 실제로 생성에 쓸 수 있는 원문 수.
  --
  -- 생성 가능 조건 = twin_id 없음 · 정답 있음 · number|choice · is_essay=false(D-082)
  --                 · image_path 있음(D-088)
  select coalesce(jsonb_agg(to_jsonb(t) order by t.eligible desc), '[]'::jsonb) into v_items
  from (
    select p.type_code,
           st.grade,
           st.chapter_title,
           st.type_title,
           count(*) filter (
             where p.twin_id is null
               and p.answer_text is not null and btrim(p.answer_text) <> ''
               and p.answer_kind in ('number','choice')
               and p.is_essay = false
               and p.image_path is not null and btrim(p.image_path) <> ''
           ) as eligible,
           count(*) filter (
             where p.twin_id is null
               and p.answer_text is not null and btrim(p.answer_text) <> ''
               and p.answer_kind = 'number'
               and p.is_essay = false
               and p.image_path is not null and btrim(p.image_path) <> ''
           ) as number_count,
           count(*) filter (
             where p.twin_id is null
               and p.answer_text is not null and btrim(p.answer_text) <> ''
               and p.answer_kind = 'choice'
               and p.is_essay = false
               and p.image_path is not null and btrim(p.image_path) <> ''
           ) as choice_count
      from public.problems p
      join public.standard_types st on st.code = p.type_code
     where p.type_code is not null
       and (p_grade is null or st.grade = p_grade)
     group by p.type_code, st.grade, st.chapter_title, st.type_title
    having count(p.twin_id) = 0
       and count(*) filter (
             where p.twin_id is null
               and p.answer_text is not null and btrim(p.answer_text) <> ''
               and p.answer_kind in ('number','choice')
               and p.is_essay = false
               and p.image_path is not null and btrim(p.image_path) <> ''
           ) >= v_min
  ) t;

  return jsonb_build_object('items', v_items);
end;
$fn$;


-- ── 6-2) 검증 갱신 (D-053) ─────────────────────────────────────────
create function public.server_update_twin_validation(
  p_candidate_id uuid,
  p_validation jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_allowed text[] := array['format_validation_passed','deterministic_check_passed',
                            'ai_consensus_passed','verification_status','unverified_reason',
                            'check_method','check_detail','format_issues','ai_issues',
                            'ai_answer_text','similarity_to_source'];
  v_key    text;
  v_status text;
  v_format boolean;
  v_det    boolean;
  v_ai     boolean;
  v_vs     text;
  v_cm     text;
  v_sim    numeric;
  v_next   text;
begin
  -- §242: cast 오류를 내부 SQL 문구로 흘리지 않는다. 안정 코드로 바꾼다
  begin
    v_format := coalesce((p_validation->>'format_validation_passed')::boolean, false);
    v_det    := coalesce((p_validation->>'deterministic_check_passed')::boolean, false);
    v_ai     := coalesce((p_validation->>'ai_consensus_passed')::boolean, false);
    v_sim    := (p_validation->>'similarity_to_source')::numeric;
  exception when others then
    raise exception 'invalid_payload' using errcode = '22023';
  end;
  v_vs := coalesce(p_validation->>'verification_status', 'unverified');
  v_cm := p_validation->>'check_method';
  if p_candidate_id is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;
  if p_validation is null or jsonb_typeof(p_validation) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  -- 허용 키 화이트리스트 (§210)
  for v_key in select jsonb_object_keys(p_validation) loop
    if not (v_key = any(v_allowed)) then
      raise exception 'unknown_validation_key' using errcode = '22023';
    end if;
  end loop;
  if v_vs not in ('verified','unverified','failed') then
    raise exception 'invalid_verification_status' using errcode = '22023';
  end if;
  if v_cm is not null and v_cm not in ('rule','cas','second_model','none') then
    raise exception 'invalid_enum_value' using errcode = '22023';
  end if;

  -- §239: check_detail 은 object, format_issues·ai_issues 는 array 여야 한다.
  -- 테이블 CHECK 에 우연히 맡기지 않고 여기서 이해 가능한 코드로 돌려준다
  if p_validation ? 'check_detail'
     and jsonb_typeof(p_validation->'check_detail') <> 'object' then
    raise exception 'invalid_json_type' using errcode = '22023';
  end if;
  if (p_validation ? 'format_issues' and jsonb_typeof(p_validation->'format_issues') <> 'array')
     or (p_validation ? 'ai_issues' and jsonb_typeof(p_validation->'ai_issues') <> 'array') then
    raise exception 'invalid_json_type' using errcode = '22023';
  end if;

  -- D-078: verified 는 **양방향** 불변식이다.
  --   (→) 결정론적 검산을 주장하려면 verified + rule|cas 여야 한다
  if v_det and not (v_vs = 'verified' and coalesce(v_cm,'') in ('rule','cas')) then
    raise exception 'validation_invariant_violation' using errcode = '22023';
  end if;
  --   (←) verified 라면 결정론적 검산이 켜져 있고 rule|cas 여야 한다.
  --       AI 합의(second_model)만으로 verified 를 적어 넣을 수 없다
  if v_vs = 'verified' and not (v_det and coalesce(v_cm,'') in ('rule','cas')) then
    raise exception 'validation_invariant_violation' using errcode = '22023';
  end if;

  -- 승인·거부 후에는 검증값을 다시 덮을 수 없다 (결함 4 수정)
  select status into v_status from ai_question_private.twin_candidates
   where id = p_candidate_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'generated' then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  -- 형식 실패 또는 수학 검증 실패면 rejected. 미검증은 검수 대기로 갈 수 있다
  v_next := case
              when not v_format then 'rejected'
              when v_vs = 'failed' then 'rejected'
              else 'pending_review'
            end;

  update ai_question_private.twin_candidates
     set format_validation_passed   = v_format,
         deterministic_check_passed = v_det,
         -- ↓ v_ai 를 쳐다보지 않는다. AI 합의로는 절대 켜지지 않는다
         independent_check_passed   = v_det,
         ai_consensus_passed        = v_ai,
         verification_status = v_vs,
         unverified_reason   = p_validation->>'unverified_reason',
         check_method  = v_cm,
         check_detail  = coalesce(p_validation->'check_detail', '{}'::jsonb),
         format_issues = coalesce(p_validation->'format_issues', '[]'::jsonb),
         ai_issues     = coalesce(p_validation->'ai_issues', '[]'::jsonb),
         ai_answer_text = p_validation->>'ai_answer_text',
         similarity_to_source = v_sim,
         status = v_next,
         updated_at = now()
   where id = p_candidate_id;
end;
$fn$;


-- ════════════════════════════════════════════════════════════════════
-- 7) 실행 권한
-- ════════════════════════════════════════════════════════════════════

revoke all on function public.admin_list_twin_candidates(text, uuid, integer, integer) from public, anon;
revoke all on function public.admin_get_twin_candidate(uuid)                            from public, anon;
revoke all on function public.admin_approve_twin_candidate(uuid, jsonb)                 from public, anon;
revoke all on function public.admin_reject_twin_candidate(uuid, text)                   from public, anon;
revoke all on function public.admin_set_student_publish_approval(uuid, boolean)              from public, anon;
revoke all on function public.admin_set_practice_publication(uuid, boolean)             from public, anon;
revoke all on function public.server_create_twin_candidate(jsonb)                       from public, anon, authenticated;
revoke all on function public.server_update_twin_validation(uuid, jsonb)                from public, anon, authenticated;
revoke all on function public.server_list_eligible_twin_types(integer, text)             from public, anon, authenticated;
revoke all on function public.server_get_twin_batch_state(bigint, text, text, uuid)      from public, anon, authenticated;

grant execute on function public.admin_list_twin_candidates(text, uuid, integer, integer) to authenticated;
grant execute on function public.admin_get_twin_candidate(uuid)                            to authenticated;
grant execute on function public.admin_approve_twin_candidate(uuid, jsonb)                 to authenticated;
grant execute on function public.admin_reject_twin_candidate(uuid, text)                   to authenticated;
grant execute on function public.admin_set_student_publish_approval(uuid, boolean)              to authenticated;
grant execute on function public.admin_set_practice_publication(uuid, boolean)             to authenticated;

grant execute on function public.server_create_twin_candidate(jsonb)        to service_role;
grant execute on function public.server_update_twin_validation(uuid, jsonb) to service_role;
grant execute on function public.server_list_eligible_twin_types(integer, text) to service_role;
grant execute on function public.server_get_twin_batch_state(bigint, text, text, uuid) to service_role;


commit;

-- 설치가 끝나면 `쌍둥이_설치후_검증.sql` 을 돌려 역할별 거부까지 확인하세요.
