-- 045_learning_actions.sql — 학습 행동 기록 (043 을 고친 판)
--
-- 상태: **초안이다. 운영에서 실행하지 않았다.**
--   GPT-EXEC-045 §2 가 043 의 결함 일곱 가지를 고치라고 했고, 이 파일이 그것이다.
--   043 (`043_learning_actions.sql`) 은 **실행하지 않는다** — 그 파일 머리에 적어 두었다.
--
-- 043 에서 무엇을 고쳤나 (GPT_REVIEW_043_044 §4 · §5)
--   ① **서버 전용으로 닫았다.** `revoke from public` 하나로는 `anon`·`authenticated` 의
--      직접 권한이 남는 환경에서 막히지 않는다. 셋 다 명시적으로 회수하고,
--      `service_role` 에만 `grant execute` 한다. 역할 기본권한에 기대지 않는다.
--   ② **호출자를 함수 안에서 확인한다.** SECURITY DEFINER 안의 `current_user` 는
--      호출자가 아니라 **함수 소유자**다. 그래서 그것으로 판별하지 않고,
--      PostgREST 가 넣어 주는 요청 역할(JWT claim)과 `session_user` 의 역할 소속을 본다.
--   ③ **`p_graded` 는 서버가 채점한 값이다.** 043 의 주석은 「DB 함수가 채점을 정한다」
--      였는데 실제로는 인자를 그대로 넣었다. 주석을 사실로 고쳤고, 대신
--      **채점을 실을 수 있는 kind 를 제한**하고 값 자체를 검사한다.
--   ④ **중복·충돌을 판정한 뒤에** 시도를 만든다. 043 은 시도를 먼저 upsert 해서
--      중복 요청에도 `updated_at` 이 바뀌고, 다른 문항으로 들어온 같은 행동 id 에
--      **새 시도가 먼저 생겼다.**
--   ⑤ **중복 동등성에 문맥을 넣었다.** 043 은 `occurred_at + payload` 만 봤다.
--      이제 `kind`·문항·`source_kind`·`source_ref`·`run_id` 까지 같아야 중복이다.
--   ⑥ **시도 유일키에 과제를 넣었다.** `(student, problem, run)` 은 **다른 과제에서
--      같은 문항을 푸는 시도를 합친다.** `(student, problem, source_kind, source_ref, run)`
--      으로 바꿨다 (`source_ref` 가 NULL 이어도 같은 것으로 보도록 `coalesce`).
--   ⑦ **`v_changed || 'payload'` 를 `array_append` 로** 바꿨다 (연산자 중의성).
--   ⑧ **applied · duplicate · conflict 의 반환 모양을 맞췄다.** 043 은 applied 에
--      `graded` 가 없어서 어댑터에서 null 이 됐다.
--   ⑨ **같은 행동 키를 직렬화한다.** 부분 유일키만으로는 동시 요청의 「중복이냐 충돌이냐」
--      가 정해지지 않는다. 판정 전에 그 키로 advisory lock 을 잡는다.
--   ⑩ `search_path` 를 **비우고** 모든 이름을 스키마로 한정했다.
--
-- 무엇을 건드리지 않나 (043 §3-C 그대로)
--   gradings · grading_answers · video_watch_logs · learning_notes · lesson_videos ·
--   problems · standard_types · type_learning_assets · exam_sheets · exam_sheet_problems 를
--   **고치지도 쓰지도 않는다.** 기존 정책을 풀지 않는다. 참조만 한다.
--
-- 되돌리기는 045_learning_actions_rollback.sql 을 본다. 세 단계로 갈라 두었다.

begin;

-- ════════════════════════════════════════════════════════════════════
-- 0. 재실행·동명 객체 — **모르면 멈춘다** (045 §2)
-- ════════════════════════════════════════════════════════════════════
--
-- 같은 이름의 표가 이미 있는데 모양이 다르면, `create table if not exists` 는
-- **조용히 넘어가고** 뒤의 insert 가 엉뚱한 곳에서 깨진다. 여기서 먼저 확인한다.

do $preflight$
declare
  v_missing text;
begin
  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'learning_attempts') then
    select string_agg(c, ', ') into v_missing
    from unnest(array['id', 'student_id', 'problem_id', 'source_kind', 'source_ref',
                      'run_id', 'started_at', 'updated_at']) as c
    where not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.learning_attempts'::regclass
        and a.attname = c and a.attnum > 0 and not a.attisdropped
    );
    if v_missing is not null then
      raise exception 'public.learning_attempts 가 이미 있는데 칸이 다릅니다 (없는 칸: %). '
        ' 이 파일을 그냥 실행하지 마십시오 — 기존 표를 확인하고 결정하세요.', v_missing;
    end if;
  end if;

  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = 'learning_actions') then
    select string_agg(c, ', ') into v_missing
    from unnest(array['id', 'attempt_id', 'student_id', 'action_id', 'producer', 'is_canonical',
                      'kind', 'occurred_at', 'received_at', 'payload', 'received_context',
                      'verdict', 'graded', 'watch_log_id', 'run_id']) as c
    where not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.learning_actions'::regclass
        and a.attname = c and a.attnum > 0 and not a.attisdropped
    );
    if v_missing is not null then
      raise exception 'public.learning_actions 가 이미 있는데 칸이 다릅니다 (없는 칸: %). '
        ' 043 판이 이미 올라가 있으면 먼저 그 판을 확인하세요.', v_missing;
    end if;
  end if;
end
$preflight$;

-- ════════════════════════════════════════════════════════════════════
-- 1. 시도
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.learning_attempts (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  problem_id  bigint not null references public.problems(id),
  -- 어디서 들어온 학습인지. 기존 과제·학습지를 **가리키기만** 한다
  source_kind text not null check (source_kind in ('class_session', 'worksheet', 'exam_sheet', 'standalone')),
  source_ref  text,
  -- 시험 자료를 가려내는 열쇠. 되돌릴 때 이 값으로만 치운다
  run_id      text not null,
  started_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.learning_attempts.run_id is
  '시험 묶음 식별자. 되돌리기는 이 범위로만 한다 (EXEC-043 §3-C)';

-- ── 시도 유일키 — **과제까지 넣는다** (§5) ────────────────────────────
--
-- 043 은 `unique (student_id, problem_id, run_id)` 였다. 그러면 **다른 과제에서
-- 같은 문항을 푸는 시도가 하나로 합쳐진다.** 기존 시도의 뜻(과제·문항·학생)을 잃는다.
-- `source_ref` 가 NULL 인 경우(standalone 등)도 **같은 것으로** 보려고 `coalesce` 로 묶는다 —
-- 그냥 unique 를 걸면 NULL 끼리는 서로 다른 값이라 중복이 쌓인다.
create unique index if not exists learning_attempts_scope_uniq
  on public.learning_attempts (student_id, problem_id, source_kind, coalesce(source_ref, ''), run_id);

create index if not exists learning_attempts_run_idx
  on public.learning_attempts (run_id);

-- ════════════════════════════════════════════════════════════════════
-- 2. 행동 — 덧붙이기 전용
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.learning_actions (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references public.learning_attempts(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,

  -- 중복 판정의 열쇠 셋
  action_id    text not null,
  producer     text not null,
  -- 같은 행동으로 **처음 받아들인** 줄인가. 충돌로 들어온 줄은 false
  is_canonical boolean not null,

  kind         text not null check (kind in ('open', 'answer', 'stuck', 'help', 'confirm')),
  occurred_at  timestamptz not null,          -- 학생 쪽에서 **행동이 일어난** 때
  received_at  timestamptz not null default now(),  -- 서버가 받은 때
  payload      jsonb not null default '{}',

  -- 충돌로 들어온 줄의 **받은 문맥**. 들어온 문항·과제·run 이 기존 줄과 달랐을 때
  -- 그 사실을 payload 를 고치지 않고 여기 남긴다 (감사용). applied·duplicate 는 NULL
  received_context jsonb,

  -- **서버가** 정한다. 학생이 넣는 값이 아니다 (043 §3-C)
  verdict      text not null check (verdict in ('applied', 'duplicate', 'conflict', 'rejected')),
  graded       text check (graded in ('correct', 'wrong')),

  -- 영상 관측은 기존 표를 가리킨다. 새 표에 다시 적지 않는다
  watch_log_id uuid references public.video_watch_logs(id),

  run_id       text not null,
  created_at   timestamptz not null default now(),

  -- 채점을 실을 수 있는 행동은 **둘뿐**이다. 나머지에 채점이 실리면 막는다 (§4-3)
  constraint learning_actions_graded_kind
    check (graded is null or kind in ('answer', 'confirm')),
  -- 충돌이 아닌 줄에 받은 문맥을 남기지 않는다
  constraint learning_actions_context_only_on_conflict
    check (received_context is null or verdict = 'conflict')
);

-- ── UNIQUE 와 「충돌도 둘 다 보존」을 **양립**시키는 방법 ──────────────
--
-- GPT 지적: 유일키를 걸면 충돌 수신 기록을 남길 수 없고,
--           안 걸면 같은 행동이 두 번 반영될 수 있다.
--
-- 그래서 유일키를 **canonical 줄에만** 건다 (부분 유일 인덱스).
--   · 처음 받아들인 줄   is_canonical = true  → 셋이 같으면 **하나만** 존재
--   · 충돌로 들어온 줄   is_canonical = false → 몇 개든 쌓인다
-- 중복 요청은 아예 새 줄을 만들지 않는다 (함수가 그대로 돌려보낸다).
--
-- ⚠️ 045 §2: 부분 유일키 **하나만으로 동시성·인가가 해결된 것이 아니다.**
--   동시 요청의 「중복이냐 충돌이냐」는 함수 안의 advisory lock 이 정한다.
create unique index if not exists learning_actions_canonical_uniq
  on public.learning_actions (student_id, producer, action_id)
  where is_canonical;

create index if not exists learning_actions_attempt_idx
  on public.learning_actions (attempt_id, occurred_at);

create index if not exists learning_actions_run_idx
  on public.learning_actions (run_id);

-- ════════════════════════════════════════════════════════════════════
-- 3. RLS — 학생은 **자기 것만**, 직원은 전부
-- ════════════════════════════════════════════════════════════════════

alter table public.learning_attempts enable row level security;
alter table public.learning_actions  enable row level security;

-- 학생 본인 판별: 익명 uid → students.session_uid (기존 패턴 그대로)
-- `is_staff()` 는 `(select …)` 로 감싼다 — 안 감싸면 행마다 돈다
drop policy if exists la_own_read on public.learning_attempts;
create policy la_own_read on public.learning_attempts for select
  using (student_id in (select id from public.students where session_uid = auth.uid()));

drop policy if exists la_staff_all on public.learning_attempts;
create policy la_staff_all on public.learning_attempts for all
  using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists lac_own_read on public.learning_actions;
create policy lac_own_read on public.learning_actions for select
  using (student_id in (select id from public.students where session_uid = auth.uid()));

drop policy if exists lac_staff_all on public.learning_actions;
create policy lac_staff_all on public.learning_actions for all
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- ⚠️ **학생에게 insert 정책을 주지 않는다.**
--   043 §3-C: 「학생 own_insert 정책이 임의 채점결과 주입 통로가 되지 않게 한다.」
--   학생은 아래 함수(SECURITY DEFINER)를 통해서만 기록을 남긴다. 그 함수가
--   `verdict`·`is_canonical` 을 정하고, `graded` 는 **서버 API 가 채점해** 넘긴다.

-- ════════════════════════════════════════════════════════════════════
-- 4. 호출자가 **신뢰 서버**인가 (045 §2)
-- ════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER 안에서 `current_user` 는 **함수 소유자**다. 호출자가 아니다.
-- 그래서 두 가지를 본다 — 둘 다 DEFINER 가 바꾸지 않는 값이다.
--
--   ① PostgREST 경유면 요청 JWT 의 `role` claim 이 GUC 로 들어 있다.
--      그 값이 `service_role` 이어야 한다. `anon`·`authenticated` 는 여기서 걸린다.
--   ② GUC 가 없으면 PostgREST 경유가 아니다 (psql · 마이그레이션 · 서버 직결).
--      그때는 `session_user` 가 `service_role` 에 속해야 한다.
--      `session_user` 는 `SET ROLE` 과 SECURITY DEFINER 둘 다에 **바뀌지 않는다.**
--
-- 이것은 `grant/revoke` 를 **대신하는 것이 아니라 한 겹 더** 두는 것이다.
-- 권한은 아래 §6 에서 따로 닫는다.
create or replace function public.learning_caller_is_server()
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if v_role is null then
    begin
      v_role := nullif(
        (nullif(pg_catalog.current_setting('request.jwt.claims', true), ''))::jsonb ->> 'role', '');
    exception when others then
      v_role := null;   -- claims 가 JSON 이 아니면 **모르는 것으로** 둔다
    end;
  end if;

  if v_role is not null then
    return v_role = 'service_role';
  end if;

  -- PostgREST 경유가 아니다 → 세션 역할로 본다
  return pg_catalog.pg_has_role(session_user, 'service_role', 'USAGE');
exception when undefined_object then
  -- `service_role` 이 없는 환경(평범한 PostgreSQL)에서는 **통과시키지 않는다**
  return false;
end;
$$;

comment on function public.learning_caller_is_server() is
  '학습 저장 RPC 의 호출자가 신뢰 서버인가. SECURITY DEFINER 안에서는 함수 소유자를 '
  '호출자로 착각할 수 있어, 요청 역할 claim 과 session_user 로 가른다 (GPT-EXEC-045 §2)';

-- ════════════════════════════════════════════════════════════════════
-- 5. 한 트랜잭션으로 확정하는 함수
-- ════════════════════════════════════════════════════════════════════
--
-- 왜 RPC 인가 (043 §3-C)
--   SDK write 를 여러 번 순서대로 부르는 것은 트랜잭션이 아니다.
--   중복 판정 → 사실 기록 → 상태 확정이 **한 번에** 끝나야 한다.
--
-- 채점은 누가 하나 — **서버 API 다** (045 §2)
--   `p_graded` 는 서버가 채점해 넘긴 값이다. 이 함수가 채점하지 않는다.
--   그래서 「DB 가 채점한다」고 적지 않는다. 대신 이 함수는
--     · 채점을 실을 수 있는 `kind` 를 제한하고 (`answer`·`confirm`)
--     · 학생 활성·문항 존재·시청기록 소유·**기존 배정**을 다시 확인하고
--     · payload 의 문맥이 인자와 **맞는지** 보고
--     · 학생이 보낸 `producer`·범위를 믿지 않는다 (호출자가 서버인지부터 본다)
--
-- `p_problem_id` 는 **text** 다. bigint 를 JSON 숫자로 받으면 JS 쪽에서
-- 안전 정수 범위를 넘을 때 값이 바뀐다 (GPT 탐침 P06). 글자로 받아 여기서 바꾼다.

create or replace function public.apply_learning_action(
  p_student_id   uuid,
  p_problem_id   text,
  p_source_kind  text,
  p_source_ref   text,
  p_run_id       text,
  p_action_id    text,
  p_producer     text,
  p_kind         text,
  p_occurred_at  timestamptz,
  p_payload      jsonb,
  p_graded       text default null,
  p_watch_log_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem_id bigint;
  v_attempt_id uuid;
  v_changed    text[] := '{}';
  v_prev       record;
  v_now        timestamptz := pg_catalog.now();
begin
  -- ── ⓪ 호출자 ────────────────────────────────────────────────────
  if not public.learning_caller_is_server() then
    raise exception '이 함수는 서버만 호출할 수 있습니다 (learning_caller_is_server = false)'
      using errcode = '42501';
  end if;

  -- ── ① 인자 모양 ─────────────────────────────────────────────────
  if p_student_id is null or p_action_id is null or p_producer is null
     or p_run_id is null or p_kind is null or p_occurred_at is null then
    raise exception '필수 인자가 비었습니다' using errcode = '22023';
  end if;
  if p_kind not in ('open', 'answer', 'stuck', 'help', 'confirm') then
    raise exception '모르는 행동 종류입니다: %', p_kind using errcode = '22023';
  end if;
  if p_source_kind not in ('class_session', 'worksheet', 'exam_sheet', 'standalone') then
    raise exception '모르는 출처 종류입니다: %', p_source_kind using errcode = '22023';
  end if;
  if p_graded is not null and p_graded not in ('correct', 'wrong') then
    raise exception '모르는 채점값입니다: %', p_graded using errcode = '22023';
  end if;
  -- 채점은 **답 제출과 확인 제출에만** 실린다. 열기·막힘·도움에 실리면 막는다
  if p_graded is not null and p_kind not in ('answer', 'confirm') then
    raise exception '% 행동에는 채점을 실을 수 없습니다', p_kind using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload 가 객체가 아닙니다' using errcode = '22023';
  end if;

  begin
    v_problem_id := p_problem_id::bigint;
  exception when others then
    raise exception '문항 식별자가 정수가 아닙니다: %', p_problem_id using errcode = '22023';
  end;

  -- ── ② payload 문맥이 인자와 **맞는가** ───────────────────────────
  -- 같은 payload·시각을 두고 인자만 바꿔 보내는 요청이 「중복」으로 분류되지 않게
  -- 애초에 문맥을 맞춰 둔다 (§5 가 짚은 틈).
  if (p_payload ->> 'problem_ref') is distinct from p_problem_id then
    raise exception 'payload 의 problem_ref 가 인자와 다릅니다' using errcode = '22023';
  end if;
  -- 글자 모양은 보내는 쪽마다 다를 수 있으므로 **시각으로** 견준다.
  -- 읽을 수 없는 글자도 어긋남으로 본다 — 맞다고 넘기지 않는다
  begin
    if (p_payload ->> 'occurred_at')::timestamptz is distinct from p_occurred_at then
      raise exception 'payload 의 occurred_at 이 인자와 다릅니다' using errcode = '22023';
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'payload 의 occurred_at 을 시각으로 읽을 수 없습니다' using errcode = '22023';
  end;

  -- ── ③ 범위 — 학생 · 문항 · 시청기록 · **기존 배정** ───────────────
  if not exists (select 1 from public.students s
                 where s.id = p_student_id and s.is_active) then
    raise exception '활성 학생이 아닙니다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.problems p where p.id = v_problem_id) then
    raise exception '문항이 없습니다' using errcode = '23503';
  end if;
  if p_watch_log_id is not null
     and not exists (select 1 from public.video_watch_logs w
                     where w.id = p_watch_log_id and w.student_id = p_student_id) then
    raise exception '남의 시청 기록을 가리켰습니다' using errcode = '42501';
  end if;

  -- 시험지에서 온 학습이면 **그 학생이 받은 시험지**이고 **그 시험지의 문항**이어야 한다.
  -- 서버 API 가 이미 보지만 여기서 한 겹 더 본다 (045 §2 「참조 소유권」)
  if p_source_kind = 'exam_sheet' then
    if p_source_ref is null then
      raise exception '시험지 출처인데 시험지 id 가 없습니다' using errcode = '22023';
    end if;
    if not exists (select 1 from public.gradings g
                   where g.student_id = p_student_id and g.sheet_id::text = p_source_ref) then
      raise exception '이 학생에게 배정된 시험지가 아닙니다' using errcode = '42501';
    end if;
    if not exists (select 1 from public.exam_sheet_problems x
                   where x.sheet_id::text = p_source_ref and x.problem_id = v_problem_id) then
      raise exception '이 시험지의 문항이 아닙니다' using errcode = '42501';
    end if;
  end if;

  -- ── ④ 같은 행동 키를 **직렬화한다** (§5 동시성) ───────────────────
  -- 부분 유일키는 「두 번 반영」을 막지만 「중복이냐 충돌이냐」를 정해 주지는 않는다.
  -- 같은 (학생·producer·행동id) 요청이 동시에 오면 여기서 한 줄로 세운다.
  -- 트랜잭션이 끝나면 자동으로 풀린다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text || '|' || p_producer || '|' || p_action_id, 0));

  -- ── ⑤ 중복·충돌 판정 — **시도를 만들기 전에** (§5) ───────────────
  select a.id as action_row_id, a.attempt_id, a.kind, a.occurred_at, a.payload,
         a.graded, a.run_id,
         t.problem_id, t.source_kind, t.source_ref
    into v_prev
  from public.learning_actions a
  join public.learning_attempts t on t.id = a.attempt_id
  where a.student_id = p_student_id
    and a.producer   = p_producer
    and a.action_id  = p_action_id
    and a.is_canonical
  limit 1;

  if found then
    -- 같은 뜻인가 — **문맥까지** 본다 (043 은 occurred_at + payload 만 봤다)
    if v_prev.kind = p_kind
       and v_prev.occurred_at = p_occurred_at
       and v_prev.payload = p_payload
       and v_prev.problem_id = v_problem_id
       and v_prev.source_kind = p_source_kind
       and v_prev.source_ref is not distinct from p_source_ref
       and v_prev.run_id = p_run_id
    then
      -- **아무것도 쓰지 않는다.** `updated_at` 도 바꾸지 않는다 (043 의 결함)
      return pg_catalog.jsonb_build_object(
        'verdict', 'duplicate',
        'attempt_id', v_prev.attempt_id,
        'graded', v_prev.graded,
        'action_kind', v_prev.kind,
        'changed_fields', '[]'::jsonb,
        'reason', null);
    end if;

    -- 같은 id 인데 뜻이 다르다 — **조용히 반영하지 않고 둘 다 남긴다**
    if v_prev.kind <> p_kind then v_changed := pg_catalog.array_append(v_changed, 'kind'); end if;
    if v_prev.occurred_at <> p_occurred_at then v_changed := pg_catalog.array_append(v_changed, 'occurred_at'); end if;
    if v_prev.payload <> p_payload then v_changed := pg_catalog.array_append(v_changed, 'payload'); end if;
    if v_prev.problem_id <> v_problem_id then v_changed := pg_catalog.array_append(v_changed, 'problem_id'); end if;
    if v_prev.source_kind <> p_source_kind then v_changed := pg_catalog.array_append(v_changed, 'source_kind'); end if;
    if v_prev.source_ref is distinct from p_source_ref then v_changed := pg_catalog.array_append(v_changed, 'source_ref'); end if;
    if v_prev.run_id <> p_run_id then v_changed := pg_catalog.array_append(v_changed, 'run_id'); end if;

    -- 감사 기록은 **기존 시도에** 붙인다. 새 시도를 만들지 않는다 —
    -- 충돌 수신을 보존하는 것과 학습 상태를 바꾸는 것은 다른 일이다 (045 §2)
    insert into public.learning_actions (
      attempt_id, student_id, action_id, producer, is_canonical,
      kind, occurred_at, payload, received_context, verdict, graded, watch_log_id, run_id
    ) values (
      v_prev.attempt_id, p_student_id, p_action_id, p_producer, false,  -- ← 유일키에 안 걸린다
      p_kind, p_occurred_at, p_payload,
      pg_catalog.jsonb_build_object(
        'problem_id', p_problem_id, 'source_kind', p_source_kind,
        'source_ref', p_source_ref, 'run_id', p_run_id, 'kind', p_kind),
      'conflict', null, p_watch_log_id, p_run_id
    );

    return pg_catalog.jsonb_build_object(
      'verdict', 'conflict',
      'attempt_id', v_prev.attempt_id,
      'graded', null,
      'action_kind', p_kind,
      'changed_fields', pg_catalog.to_jsonb(v_changed),
      'reason', null);
  end if;

  -- ── ⑥ 새 행동이다 — **이제** 시도를 찾거나 만든다 ─────────────────
  insert into public.learning_attempts (student_id, problem_id, source_kind, source_ref, run_id)
  values (p_student_id, v_problem_id, p_source_kind, p_source_ref, p_run_id)
  on conflict (student_id, problem_id, source_kind, coalesce(source_ref, ''), run_id)
    do update set updated_at = v_now
  returning id into v_attempt_id;

  insert into public.learning_actions (
    attempt_id, student_id, action_id, producer, is_canonical,
    kind, occurred_at, payload, verdict, graded, watch_log_id, run_id
  ) values (
    v_attempt_id, p_student_id, p_action_id, p_producer, true,
    p_kind, p_occurred_at, p_payload, 'applied', p_graded, p_watch_log_id, p_run_id
  );

  -- applied · duplicate · conflict 의 **반환 모양을 맞춘다** (043 은 applied 에 graded 가 없었다)
  return pg_catalog.jsonb_build_object(
    'verdict', 'applied',
    'attempt_id', v_attempt_id,
    'graded', p_graded,
    'action_kind', p_kind,
    'changed_fields', '[]'::jsonb,
    'reason', null);
end;
$$;

comment on function public.apply_learning_action(
  uuid, text, text, text, text, text, text, text, timestamptz, jsonb, text, uuid) is
  '학습 행동 하나를 한 트랜잭션으로 확정한다. **서버 전용.** 채점은 서버 API 가 하고 '
  '이 함수는 호출자·범위·문맥을 다시 확인한다 (GPT-EXEC-045 §2)';

-- ════════════════════════════════════════════════════════════════════
-- 6. 권한 — **서버만**. 역할 기본권한에 기대지 않는다 (045 §2)
-- ════════════════════════════════════════════════════════════════════
--
-- 043 은 `revoke ... from public` 하나였다. 그러면
--   · `anon`·`authenticated` 에 **직접** execute 가 남아 있는 환경에서는 막히지 않고
--   · 반대로 기본권한이 없는 환경에서는 **의도한 서버 역할도** 못 부른다.
-- 그래서 셋 다 명시적으로 회수하고 `service_role` 에만 준다.
-- 전체 프로젝트 기본권한(`alter default privileges`)은 **건드리지 않는다.**

do $perm$
declare
  v_fn text := 'public.apply_learning_action(uuid, text, text, text, text, text, text, text, '
             || 'timestamptz, jsonb, text, uuid)';
  v_guard text := 'public.learning_caller_is_server()';
  r text;
begin
  execute 'revoke all on function ' || v_fn || ' from public';
  execute 'revoke all on function ' || v_guard || ' from public';
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute 'revoke all on function ' || v_fn || ' from ' || pg_catalog.quote_ident(r);
      execute 'revoke all on function ' || v_guard || ' from ' || pg_catalog.quote_ident(r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant execute on function ' || v_fn || ' to service_role';
    execute 'grant execute on function ' || v_guard || ' to service_role';
  else
    raise warning 'service_role 역할이 없습니다 — 이 환경에서는 아무도 이 함수를 부를 수 없습니다 '
      '(격리 시험 환경이면 정상입니다)';
  end if;
end
$perm$;

commit;
