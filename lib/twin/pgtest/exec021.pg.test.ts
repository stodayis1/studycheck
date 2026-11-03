// GPT-EXEC-021 — 실제 PostgreSQL 에서 42P10 을 재현하고 패치를 대조한다 (§177)
//
// 실행 (로컬 시험 의존성은 lib/twin/pgtest/harness.ts 머리말 참고)
//   NODE_PATH=<pgtest>/node_modules npx tsx --test lib/twin/pgtest/exec021.pg.test.ts
//
// 왜 정적 검사로 끝내지 않는가
//   016~019 는 전부 문자열 검사였다. 그런데 이번 42P10 은 **엔진의 추론 규칙**에서
//   난 것이라 문자열로는 잡히지 않는다. 문법도 맞고 그럴싸하게 읽힌다.
//   그래서 근거를 실행으로 옮긴다 — 원본은 42P10 으로 실패하고, 같은 조건에서
//   수정본은 성공한다는 **대조**가 이번 수정의 근거다.
//
// 무엇을 증명하지 않는가 (§196)
//   합성 기반 스키마의 `auth.uid()` · `is_admin()` · Supabase 역할은 **대역**이다.
//   따라서 이 통과는 SQL 문법·ON CONFLICT 추론·게시 함수 동작의 증거이고,
//   Supabase 인증·RLS 통합의 증거가 아니다.
//
// 데이터는 전부 합성이고 폐기 가능한 로컬 클러스터에서만 돈다 (§171·§195).

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  startCluster, installBaseline, makePractice, actAs, actAsAdmin,
  readRepo, PATCH_SQL, VERIFY_SQL, TEACHER_UID, type Pg,
} from './harness'

let pg: Pg

before(async () => {
  pg = await startCluster()
  console.log(`# 엔진: PostgreSQL ${pg.version} · 격리 로컬 · 합성 데이터만`)
}, { timeout: 180_000 })

after(async () => { if (pg !== undefined) await pg.close() }, { timeout: 60_000 })

const PUBLISH = 'select public.admin_set_practice_publication($1::uuid, $2::boolean)'
const OPTS = { timeout: 180_000 }

/** 저장소의 패치 파일을 그대로 적용한다. 시험이 제 DDL 을 새로 쓰지 않는다 */
async function applyPatch(p: Pg) {
  await p.q(readRepo(PATCH_SQL))
}

// ════════════════════════════════════════════════════════════════════
// R1 — 원인 재현: 빈 표 + 부분 UNIQUE + 조건 없는 UPSERT → 42P10
// ════════════════════════════════════════════════════════════════════

test('R1 조건 없는 UPSERT 는 부분 UNIQUE 를 못 쓴다 → 42P10', OPTS, async () => {
  await pg.fresh('r1')
  // 설치 SQL 과 **같은 모양**의 표와 인덱스만 따로 만든다 (함수 없이 원시 UPSERT)
  await pg.q(`
    create table t (
      id serial primary key,
      practice_id uuid,
      is_active boolean not null default true,
      review_status text not null default 'approved',
      updated_at timestamptz not null default now()
    );
    create unique index t_practice_uidx on t (practice_id) where practice_id is not null;`)

  const rows = await pg.q('select count(*)::int as n from t')
  assert.equal(rows.rows[0].n, 0, '빈 표에서 재현해야 한다 — 중복 데이터 때문이 아니다')

  const e = await pg.fail(`
    insert into t (practice_id, is_active, review_status)
    values (gen_random_uuid(), true, 'approved')
    on conflict (practice_id)
    do update set is_active = true, updated_at = now()`)

  // 다른 오류를 원인 재현으로 인정하지 않는다 (§181)
  assert.equal(e.code, '42P10', `42P10 이 아닙니다: ${e.code} ${e.message}`)
  assert.match(e.message, /ON CONFLICT/)
})

test('R1 실패를 기대하는 검사가 거짓 통과하지 않는다 (§193)', OPTS, async () => {
  await pg.fresh('r1b')
  await pg.q('create table t (id int primary key)')
  // 성공하는 문장을 fail() 에 넘기면 **반드시 터져야** 한다. 삼키면 시험이 무의미해진다
  await assert.rejects(
    () => pg.fail('insert into t values (1)'),
    /실패를 기대했지만 성공했습니다/,
  )
})

// ════════════════════════════════════════════════════════════════════
// R2 — 수정본 원시 UPSERT: 첫 실행은 INSERT, 재실행은 UPDATE, 행은 1개
// ════════════════════════════════════════════════════════════════════

test('R2 조건을 붙인 UPSERT 는 성공하고 같은 키의 행은 1개다', OPTS, async () => {
  await pg.fresh('r2')
  await pg.q(`
    create table t (
      id serial primary key,
      practice_id uuid,
      is_active boolean not null default true,
      review_status text not null default 'pending',
      updated_at timestamptz not null default now()
    );
    create unique index t_practice_uidx on t (practice_id) where practice_id is not null;`)

  const key = '44444444-4444-4444-8444-444444444444'
  const upsert = `
    insert into t (practice_id, is_active, review_status)
    values ($1::uuid, true, 'approved')
    on conflict (practice_id) where practice_id is not null
    do update set is_active = true, review_status = 'approved', updated_at = now()
    returning id, (xmax = 0) as inserted`

  const a = await pg.q(upsert, [key])
  assert.equal(a.rows[0].inserted, true, '첫 실행은 INSERT 여야 한다')

  const b = await pg.q(upsert, [key])
  assert.equal(b.rows[0].inserted, false, '재실행은 UPDATE 여야 한다')
  assert.equal(b.rows[0].id, a.rows[0].id, '같은 행을 갱신해야 한다')

  const n = await pg.q('select count(*)::int as n from t where practice_id = $1', [key])
  assert.equal(n.rows[0].n, 1, '같은 키의 행이 1개여야 한다')
})

// ════════════════════════════════════════════════════════════════════
// R3 — 원본 게시 RPC 로 운영과 같은 42P10 을 재현
// ════════════════════════════════════════════════════════════════════

test('R3 014 기준선의 게시 RPC 는 42P10 으로 실패한다 (운영과 같은 지점)', OPTS, async () => {
  await pg.fresh('r3')
  await installBaseline(pg)
  const practice = await makePractice(pg, { approveSafety: true })

  await actAsAdmin(pg)
  const e = await pg.fail(PUBLISH, [practice, true])

  assert.equal(e.code, '42P10', `42P10 이 아닙니다: ${e.code} ${e.message}`)

  // 게시가 막혔으므로 자산 행도 없고 상태도 그대로여야 한다 (트랜잭션이 되돌려진다)
  const s = await pg.q(
    'select status from ai_question_private.ai_practice_problems where id = $1', [practice])
  assert.equal(s.rows[0].status, 'approved', '실패했는데 상태가 바뀌었습니다')
  const a = await pg.q(
    'select count(*)::int as n from public.type_learning_assets where practice_id = $1', [practice])
  assert.equal(a.rows[0].n, 0)
})

// ════════════════════════════════════════════════════════════════════
// R4 — 패치 적용 후: 게시 → 게시취소 → 재게시
// ════════════════════════════════════════════════════════════════════

test('R4 패치 뒤에는 게시·게시취소·재게시가 되고 자산 행은 1개다', OPTS, async () => {
  await pg.fresh('r4')
  await installBaseline(pg)
  await applyPatch(pg)

  const practice = await makePractice(pg, { approveSafety: true })
  await actAsAdmin(pg)

  // ── 게시 ────────────────────────────────────────────────────────
  await pg.q(PUBLISH, [practice, true])
  let s = await pg.q(`select status, first_published_at, first_published_by_auth_uid
                        from ai_question_private.ai_practice_problems where id = $1`, [practice])
  assert.equal(s.rows[0].status, 'published')
  const firstAt = s.rows[0].first_published_at
  const firstBy = s.rows[0].first_published_by_auth_uid
  assert.ok(firstAt !== null, '최초 게시 시각이 기록돼야 한다')
  assert.ok(firstBy !== null, '최초 게시자가 기록돼야 한다')

  let a = await pg.q(`select count(*)::int as n,
                             bool_or(is_active) as active,
                             min(review_status) as review
                        from public.type_learning_assets where practice_id = $1`, [practice])
  assert.equal(a.rows[0].n, 1, '자산 행이 1개여야 한다')
  assert.equal(a.rows[0].active, true)
  assert.equal(a.rows[0].review, 'approved')

  // ── 게시 중 다시 publish=true → 기존 정책대로 invalid_state ──────
  // R4 를 통과시키려고 이것을 멱등 성공으로 바꾸지 않는다 (§192)
  const dup = await pg.fail(PUBLISH, [practice, true])
  assert.match(dup.message, /invalid_state/, `기대한 invalid_state 가 아닙니다: ${dup.message}`)

  // ── 게시취소 ────────────────────────────────────────────────────
  await pg.q(PUBLISH, [practice, false])
  s = await pg.q(`select status from ai_question_private.ai_practice_problems where id = $1`, [practice])
  assert.equal(s.rows[0].status, 'approved')
  a = await pg.q(`select count(*)::int as n, bool_or(is_active) as active
                    from public.type_learning_assets where practice_id = $1`, [practice])
  assert.equal(a.rows[0].n, 1, '게시취소로 자산 행이 사라지면 안 된다')
  assert.equal(a.rows[0].active, false)

  // ── 재게시 — 여기서 UPSERT 의 UPDATE 경로가 실제로 돈다 ──────────
  await pg.q(PUBLISH, [practice, true])
  s = await pg.q(`select status, first_published_at, first_published_by_auth_uid
                    from ai_question_private.ai_practice_problems where id = $1`, [practice])
  assert.equal(s.rows[0].status, 'published')
  assert.deepEqual(s.rows[0].first_published_at, firstAt, '최초 게시 시각이 덮어써졌습니다')
  assert.equal(s.rows[0].first_published_by_auth_uid, firstBy, '최초 게시자가 덮어써졌습니다')

  a = await pg.q(`select count(*)::int as n, bool_or(is_active) as active
                    from public.type_learning_assets where practice_id = $1`, [practice])
  assert.equal(a.rows[0].n, 1, '재게시로 자산 행이 늘어나면 안 된다 — UPSERT 가 UPDATE 로 가야 한다')
  assert.equal(a.rows[0].active, true)
})

// ════════════════════════════════════════════════════════════════════
// R5 — 승인·권한 가드가 그대로인가
// ════════════════════════════════════════════════════════════════════

test('R5 패치 뒤에도 안전승인·retired·비관리자·잘못된 인자를 거부한다', OPTS, async () => {
  await pg.fresh('r5')
  await installBaseline(pg)
  await applyPatch(pg)

  // (가) 안전 미승인 → student_publish_approval_required
  const noSafe = await makePractice(pg, { approveSafety: false })
  await actAsAdmin(pg)
  const e1 = await pg.fail(PUBLISH, [noSafe, true])
  assert.match(e1.message, /student_publish_approval_required/, e1.message)
  assert.equal(e1.code, '22023')

  // (나) 비관리자(교사) → forbidden 42501
  const ok = await makePractice(pg, { approveSafety: true })
  await actAs(pg, TEACHER_UID)
  const e2 = await pg.fail(PUBLISH, [ok, true])
  assert.equal(e2.code, '42501', e2.message)
  assert.match(e2.message, /forbidden/)

  // (다) 잘못된 인자 → invalid_argument 22023
  await actAsAdmin(pg)
  const e3 = await pg.fail('select public.admin_set_practice_publication(null::uuid, true)')
  assert.match(e3.message, /invalid_argument/, e3.message)
  const e4 = await pg.fail(PUBLISH, [ok, null])
  assert.match(e4.message, /invalid_argument/, e4.message)

  // (라) 없는 id → not_found P0002
  const e5 = await pg.fail(PUBLISH, ['55555555-5555-4555-8555-555555555555', true])
  assert.equal(e5.code, 'P0002', e5.message)

  // (마) retired → invalid_state. 상태는 함수가 아니라 표에서 직접 옮긴다
  //     (retired 로 가는 경로는 다른 RPC 이고, 여기서 보려는 것은 게시 차단이다)
  await pg.q(`update ai_question_private.ai_practice_problems
                 set student_publish_approved = false,
                     status = 'retired', retired_at = now()
               where id = $1`, [ok])
  const e6 = await pg.fail(PUBLISH, [ok, true])
  assert.match(e6.message, /invalid_state/, e6.message)
})

// ════════════════════════════════════════════════════════════════════
// R6 — 패치가 본문 말고 무엇도 바꾸지 않는가
// ════════════════════════════════════════════════════════════════════

const SNAP = `
  select jsonb_build_object(
    'oid', p.oid::text,
    'owner', pg_get_userbyid(p.proowner),
    'acl', coalesce(p.proacl::text, '(null)'),
    'secdef', p.prosecdef,
    'config', coalesce(p.proconfig::text, '(null)'),
    'volatile', p.provolatile,
    'parallel', p.proparallel,
    'leakproof', p.proleakproof,
    'strict', p.proisstrict,
    'rettype', p.prorettype::regtype::text,
    'args', pg_get_function_identity_arguments(p.oid),
    'argnames', p.proargnames::text,
    'lang', l.lanname
  ) as snap, p.prosrc as src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
 where n.nspname = 'public' and p.proname = 'admin_set_practice_publication'`

const IDX = `
  select jsonb_agg(jsonb_build_object(
           'name', ic.relname, 'def', pg_get_indexdef(i.indexrelid),
           'unique', i.indisunique, 'valid', i.indisvalid) order by ic.relname) as idx
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid
    join pg_namespace n on n.oid = tc.relnamespace
   where n.nspname = 'public' and tc.relname = 'type_learning_assets'`

const RLS = `
  select jsonb_build_object(
           'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity,
           'acl', coalesce(c.relacl::text, '(null)'),
           'policies', coalesce((select jsonb_agg(jsonb_build_object(
               'name', pol.polname, 'cmd', pol.polcmd,
               'using', pg_get_expr(pol.polqual, pol.polrelid),
               'check', pg_get_expr(pol.polwithcheck, pol.polrelid)) order by pol.polname)
             from pg_policy pol where pol.polrelid = c.oid), '[]'::jsonb)) as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'type_learning_assets'`

test('R6 패치는 함수 본문 한 줄 말고 아무것도 바꾸지 않는다', OPTS, async () => {
  await pg.fresh('r6')
  await installBaseline(pg)

  const b = await pg.q(SNAP)
  const bi = await pg.q(IDX)
  const br = await pg.q(RLS)
  const srcBefore = String(b.rows[0].src)

  await applyPatch(pg)

  const a = await pg.q(SNAP)
  const ai = await pg.q(IDX)
  const ar = await pg.q(RLS)
  const srcAfter = String(a.rows[0].src)

  assert.deepEqual(a.rows[0].snap, b.rows[0].snap,
    'OID·소유자·ACL·보안설정·search_path·반환형·인자가 달라졌습니다')
  assert.deepEqual(ai.rows[0].idx, bi.rows[0].idx, '인덱스가 달라졌습니다')
  assert.deepEqual(ar.rows[0].rls, br.rows[0].rls, 'RLS·정책·표 권한이 달라졌습니다')

  // 본문 차이는 **딱 그 한 줄**이어야 한다
  const norm = (s: string) => s.replace(/\r/g, '').split('\n')
  const lb = norm(srcBefore)
  const la = norm(srcAfter)
  assert.equal(la.length, lb.length, '본문 줄 수가 달라졌습니다')
  const diff = lb.map((l, i) => [i, l, la[i]] as const).filter(([, x, y]) => x !== y)
  assert.equal(diff.length, 1, `달라진 줄이 ${diff.length}개입니다:\n` + diff.map(d => d.join(' | ')).join('\n'))
  assert.equal(diff[0][1].trim(), 'on conflict (practice_id)')
  assert.equal(diff[0][2].trim(), 'on conflict (practice_id) where practice_id is not null')
})

// ════════════════════════════════════════════════════════════════════
// R7 — 두 번 적용 / 모르는 상태
// ════════════════════════════════════════════════════════════════════

test('R7 패치를 두 번 적용하면 두 번째는 아무것도 바꾸지 않는다', OPTS, async () => {
  await pg.fresh('r7a')
  await installBaseline(pg)
  await applyPatch(pg)
  const once = await pg.q(SNAP)

  await applyPatch(pg)
  const twice = await pg.q(SNAP)

  assert.deepEqual(twice.rows[0].snap, once.rows[0].snap)
  assert.equal(twice.rows[0].src, once.rows[0].src, '두 번째 적용이 본문을 건드렸습니다')

  // 게시는 여전히 된다
  const practice = await makePractice(pg, { approveSafety: true })
  await actAsAdmin(pg)
  await pg.q(PUBLISH, [practice, true])
  const s = await pg.q('select status from ai_question_private.ai_practice_problems where id = $1', [practice])
  assert.equal(s.rows[0].status, 'published')
})

test('R7 모르는 본문이면 덮어쓰지 않고 중단한다', OPTS, async () => {
  await pg.fresh('r7b')
  await installBaseline(pg)
  // 남이 고친 것처럼 본문에 한 줄을 더한다.
  //
  // 처음에는 SQL 안에서 `replace(v_src, 'begin' || chr(10), ...)` 로 했는데
  // **설치 SQL 이 CRLF 라서 하나도 치환되지 않았다.** 그러면 본문이 그대로라
  // 패치가 정상 적용되고, 시험은 "중단하지 않았다" 며 엉뚱하게 실패한다.
  // 그래서 여기서 직접 읽어 바꾸고, **정말 바뀌었는지 assert 한다.**
  const orig = String((await pg.q(SNAP)).rows[0].src)
  const tampered = orig.replace(/\bbegin(\r?\n)/, 'begin$1  -- 누가 넣은 줄$1')
  assert.notEqual(tampered, orig, '변이가 아무것도 바꾸지 않았습니다 — 시험이 무의미해집니다')

  await pg.q(
    `select set_config('twin.tampered', $1, false)`, [tampered])
  await pg.q(`
    do $x$
    begin
      execute 'create or replace function public.admin_set_practice_publication('
        || 'p_practice_problem_id uuid, p_publish boolean) returns void '
        || 'language plpgsql security definer set search_path = '''' as '
        || quote_literal(current_setting('twin.tampered')) || ';';
    end;
    $x$;`)

  const before = await pg.q(SNAP)
  assert.equal(before.rows[0].src, tampered, '변이한 본문이 저장되지 않았습니다')
  const e = await pg.fail(readRepo(PATCH_SQL))
  assert.match(e.message, /알려진 정의와 다릅니다/, e.message)

  const after = await pg.q(SNAP)
  assert.equal(after.rows[0].src, before.rows[0].src, '중단해야 하는데 본문을 바꿨습니다')
})

test('R7 인덱스가 예상과 다르면 패치가 중단한다', OPTS, async () => {
  await pg.fresh('r7c')
  await installBaseline(pg)
  // 부분 조건을 뗀 전역 UNIQUE 로 바꿔 둔다.
  //
  // 여기서 보려는 것은 **패치의 사전 확인이 「예상과 다른 인덱스」를 거부하는가** 이다.
  // (앞선 판의 주석은 "전역 UNIQUE 면 수정본도 42P10 이 난다" 고 적었는데 정확하지 않다.
  //  전역 UNIQUE 도 다른 조건이 맞으면 ON CONFLICT 가 추론할 수 있다 — GPT_REVIEW_021 §74.)
  // assertion 과 기대 동작은 그대로 두고 설명만 바로잡는다.
  await pg.q(`
    drop index public.tla_practice_uidx;
    create unique index tla_practice_uidx on public.type_learning_assets (practice_id);`)

  const before = await pg.q(SNAP)
  const e = await pg.fail(readRepo(PATCH_SQL))
  assert.match(e.message, /조건이 예상과 다릅니다/, e.message)
  const after = await pg.q(SNAP)
  assert.equal(after.rows[0].src, before.rows[0].src, '중단해야 하는데 본문을 바꿨습니다')
})

test('R7 대상 함수가 없으면 새로 만들지 않고 중단한다', OPTS, async () => {
  await pg.fresh('r7d')
  await installBaseline(pg)
  await pg.q('drop function public.admin_set_practice_publication(uuid, boolean)')

  const e = await pg.fail(readRepo(PATCH_SQL))
  assert.match(e.message, /정확히 하나가 아닙니다/, e.message)

  const n = await pg.q(`select count(*)::int as n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='admin_set_practice_publication'`)
  assert.equal(n.rows[0].n, 0, '없는 함수를 새로 만들었습니다')
})

// ════════════════════════════════════════════════════════════════════
// R8 — 기준선 + 패치 뒤에 017 전체 검증을 **그대로** 돌린다
// ════════════════════════════════════════════════════════════════════

test('R8 패치 전 017 전체 검증은 42P10 으로 멈춘다', OPTS, async () => {
  await pg.fresh('r8a')
  await installBaseline(pg)
  const e = await pg.fail(readRepo(VERIFY_SQL))
  assert.equal(e.code, '42P10', `42P10 이 아닙니다: ${e.code} ${e.message}`)
})

test('R8 패치 뒤 017 전체 검증이 끝까지 통과한다 (파일 무변경)', OPTS, async () => {
  await pg.fresh('r8b')
  await installBaseline(pg)
  await applyPatch(pg)
  // 017 을 **한 글자도 고치지 않고** 그대로 돌린다. 마지막이 rollback 이라 남는 것이 없다
  await pg.q(readRepo(VERIFY_SQL))

  // rollback 이 실제로 되돌렸는지 — 검증용 후보가 남아 있으면 안 된다
  const n = await pg.q(`select count(*)::int as n from ai_question_private.twin_candidates
                         where prompt_version = 'verify-v1'`)
  assert.equal(n.rows[0].n, 0, '017 의 rollback 뒤에 검증 데이터가 남았습니다')
})
