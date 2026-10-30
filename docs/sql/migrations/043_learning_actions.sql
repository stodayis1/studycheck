-- ⚠️⚠️ **이 파일은 실행하지 않습니다 — 045 가 대신합니다.** (2026-10-29)
--
-- GPT_REVIEW_043_044 §4·§5 가 이 판의 결함 일곱 가지를 찾았다.
--   · `revoke from public` 하나로는 `anon`·`authenticated` 가 막히지 않는다
--   · SECURITY DEFINER 안에서 호출자·범위·참조 소유권을 확인하지 않는다
--   · 중복·충돌을 판정하기 **전에** 시도를 만들고 `updated_at` 을 바꾼다
--   · 중복 동등성을 `occurred_at + payload` 만으로 본다
--   · 시도 유일키 `(student, problem, run)` 이 **다른 과제의 시도를 합친다**
--   · `v_changed || 'payload'` 에 연산자 중의성이 있다
--   · applied 반환에 `graded` 가 없어 어댑터에서 null 이 된다
--
-- 고친 판: `docs/sql/migrations/045_learning_actions.sql`
-- 되돌리기: `docs/sql/migrations/045_learning_actions_rollback.sql` (세 단계)
--
-- 이 파일은 **무엇이 어떻게 틀렸는지 남겨 두려고** 지우지 않고 둔다. 실행하지 마십시오.

-- 043_learning_actions.sql — 학습 행동 기록 (초안)
--
-- 상태: **초안이다. 운영에서 실행하지 않았다.**
--   GPT-EXEC-043 §4 「B-DDL 작성: 이미 허용했고 지금 구현한다.
--   구체적인 DDL 을 보지 않고 운영 **실행**을 승인하지는 않음.」
--
-- 무엇을 만드나 — 표 2개 + 함수 1개
--   learning_attempts  한 학생 × 한 원문의 시도
--   learning_actions   행동 하나 = 한 줄 (덧붙이기 전용)
--   apply_learning_action()  중복판정·사실기록·현재상태를 **한 트랜잭션**으로 확정
--
-- 무엇을 건드리지 않나 (043 §3-C)
--   gradings · grading_answers · video_watch_logs · learning_notes · lesson_videos ·
--   problems · standard_types · type_learning_assets 를 **고치지도 쓰지도 않는다.**
--   기존 정책을 풀지 않는다. 참조만 한다.
--
-- 되돌리기는 043_learning_actions_rollback.sql 을 본다.
--   `drop table` 이나 `delete where is_test` 전체 삭제를 기본으로 쓰지 않는다.

begin;

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
  updated_at  timestamptz not null default now(),
  -- 한 학생이 같은 원문을 같은 run 에서 두 번 열지 않는다
  unique (student_id, problem_id, run_id)
);

comment on column public.learning_attempts.run_id is
  '시험 묶음 식별자. 되돌리기는 이 범위로만 한다 (EXEC-043 §3-C)';

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

  -- **서버가** 정한다. 학생이 넣는 값이 아니다 (043 §3-C)
  verdict      text not null check (verdict in ('applied', 'duplicate', 'conflict', 'rejected')),
  graded       text check (graded in ('correct', 'wrong')),

  -- 영상 관측은 기존 표를 가리킨다. 새 표에 다시 적지 않는다
  watch_log_id uuid references public.video_watch_logs(id),

  run_id       text not null,
  created_at   timestamptz not null default now()
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
--   `verdict`·`graded`·`is_canonical` 을 **서버 쪽에서** 정한다.

-- ════════════════════════════════════════════════════════════════════
-- 4. 한 트랜잭션으로 확정하는 함수
-- ════════════════════════════════════════════════════════════════════
--
-- 왜 RPC 인가 (043 §3-C)
--   SDK write 를 여러 번 순서대로 부르는 것은 트랜잭션이 아니다.
--   중복 판정 → 사실 기록 → 상태 확정이 **한 번에** 끝나야 한다.
--
-- 무엇을 서버가 정하나
--   `p_graded` 는 **서버가 채점해서** 넘긴다. 학생이 보낸 값이 아니다.
--   호출자는 service role 이거나, 학생 범위를 이미 확인한 서버 코드다.

create or replace function public.apply_learning_action(
  p_student_id  uuid,
  p_problem_id  bigint,
  p_source_kind text,
  p_source_ref  text,
  p_run_id      text,
  p_action_id   text,
  p_producer    text,
  p_kind        text,
  p_occurred_at timestamptz,
  p_payload     jsonb,
  p_graded      text default null,
  p_watch_log_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_id uuid;
  v_prev       public.learning_actions%rowtype;
  v_verdict    text;
  v_changed    text[] := '{}';
begin
  -- ① 시도를 찾거나 만든다
  insert into public.learning_attempts (student_id, problem_id, source_kind, source_ref, run_id)
  values (p_student_id, p_problem_id, p_source_kind, p_source_ref, p_run_id)
  on conflict (student_id, problem_id, run_id) do update set updated_at = now()
  returning id into v_attempt_id;

  -- ② 같은 행동이 이미 있는가 — **canonical 줄만** 본다
  select * into v_prev
  from public.learning_actions
  where student_id = p_student_id
    and producer   = p_producer
    and action_id  = p_action_id
    and is_canonical
  limit 1;

  if not found then
    -- 새 행동이다. 받아들인다
    insert into public.learning_actions (
      attempt_id, student_id, action_id, producer, is_canonical,
      kind, occurred_at, payload, verdict, graded, watch_log_id, run_id
    ) values (
      v_attempt_id, p_student_id, p_action_id, p_producer, true,
      p_kind, p_occurred_at, p_payload, 'applied', p_graded, p_watch_log_id, p_run_id
    );
    return jsonb_build_object('verdict', 'applied', 'attempt_id', v_attempt_id);
  end if;

  -- ③ 같은 뜻인가. **발생시각과 payload** 가 같으면 중복이다
  if v_prev.occurred_at = p_occurred_at and v_prev.payload = p_payload then
    -- 상태를 다시 바꾸지 않는다. 줄도 더 만들지 않는다
    return jsonb_build_object(
      'verdict', 'duplicate', 'attempt_id', v_attempt_id, 'graded', v_prev.graded);
  end if;

  -- ④ 같은 id 인데 뜻이 다르다 — **조용히 반영하지 않고 둘 다 남긴다**
  if v_prev.occurred_at <> p_occurred_at then v_changed := v_changed || 'occurred_at'; end if;
  if v_prev.payload <> p_payload then v_changed := v_changed || 'payload'; end if;

  insert into public.learning_actions (
    attempt_id, student_id, action_id, producer, is_canonical,
    kind, occurred_at, payload, verdict, graded, watch_log_id, run_id
  ) values (
    v_attempt_id, p_student_id, p_action_id, p_producer, false,   -- ← 유일키에 안 걸린다
    p_kind, p_occurred_at, p_payload, 'conflict', null, p_watch_log_id, p_run_id
  );

  return jsonb_build_object(
    'verdict', 'conflict', 'attempt_id', v_attempt_id, 'changed_fields', to_jsonb(v_changed));
end;
$$;

revoke all on function public.apply_learning_action(
  uuid, bigint, text, text, text, text, text, text, timestamptz, jsonb, text, uuid) from public;

commit;
