// GPT-EXEC-025 — 실제 PostgreSQL 에서 줄끝 조합을 대조한다 (§142)
//
// 실행 (로컬 시험 의존성은 lib/twin/pgtest/harness.ts 머리말 참고)
//   NODE_PATH=<pgtest>/node_modules npx tsx --test lib/twin/pgtest/exec025.pg.test.ts
//
// 왜 이 시험이 필요한가
//   021 은 로컬에서 13/13 통과했는데 운영에서 `[2] 알려진 본문 비교` 에서 멈췄다.
//   차이는 **입력의 줄끝**이었다. 로컬 시험은 패치 파일(LF)을 그대로 보냈고,
//   운영은 SQL Editor 로 붙여넣는 과정에서 CRLF 로 전달됐다 (024 진단의 입력 probe
//   CR=1·LF=1 이 그 관측값이다).
//
//   그래서 이번 시험의 핵심은 **입력 자체를 CRLF 로 바꿔서 보내는 것**이다.
//   보내기 전에 CR 을 지우면 이번 운영 경로를 시험한 것이 아니다 (§170).
//   각 입력의 길이·CR/LF 개수·해시를 보내기 직전에 로그에 남긴다 (§169).
//
// 무엇을 증명하지 않는가 (§196 of 021, 그대로)
//   합성 기반의 `auth.uid()` · `is_admin()` · Supabase 역할은 **대역**이다.
//   이 통과는 SQL 문법·ON CONFLICT 추론·게시 함수 동작·줄끝 처리의 증거이고,
//   Supabase 인증·RLS 통합의 증거가 아니다.
//
// 데이터는 전부 합성이고 폐기 가능한 로컬 클러스터에서만 돈다.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  startCluster, installBaselineAs, makePractice, actAs, actAsAdmin,
  readRepo, toCRLF, toLF, inputStats, PATCH_SQL, VERIFY_SQL, INSTALL_SQL,
  TEACHER_UID, type Pg, type Eol,
} from './harness'

let pg: Pg

/** 025 — 이번 회차의 현행 성공 경로 */
const PATCH_025 = 'docs/sql/migrations/025_fix_publication_patch_line_endings.sql'
/** 021 — 역사 대조군 (LF 성공 · CRLF 실패) */
const PATCH_021 = PATCH_SQL

const PUBLISH = 'select public.admin_set_practice_publication($1::uuid, $2::boolean)'
const OPTS = { timeout: 240_000 }
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)

before(async () => {
  pg = await startCluster()
  console.log(`# 엔진: PostgreSQL ${pg.version} · 격리 로컬 · 합성 데이터만`)
}, { timeout: 180_000 })

after(async () => { if (pg !== undefined) await pg.close() }, { timeout: 60_000 })

/**
 * 패치를 **지정한 줄끝 그대로** 보낸다.
 *
 * `toCRLF` 를 거친 문자열을 그대로 `query` 에 넘긴다. 보내기 전에 CR 을 지우는
 * 전처리를 넣지 않는다 — 그러면 이번에 고친 경로를 시험하지 못한다.
 */
async function sendPatch(p: Pg, path: string, eol: Eol, label: string) {
  const sql = eol === 'crlf' ? toCRLF(readRepo(path)) : toLF(readRepo(path))
  const st = inputStats(label, sql)
  if (eol === 'crlf') {
    assert.ok(st.cr > 50, `CRLF 로 보내야 하는데 CR 이 ${st.cr}개뿐입니다`)
    assert.equal(st.cr, st.lf, 'CRLF 입력은 CR 과 LF 개수가 같아야 합니다')
  } else {
    assert.equal(st.cr, 0, 'LF 입력에 CR 이 섞였습니다')
  }
  await p.q(sql)
  return st
}

/** 같은 입력을 보내되 실패를 기대한다 */
async function sendPatchExpectFail(p: Pg, path: string, eol: Eol, label: string) {
  const sql = eol === 'crlf' ? toCRLF(readRepo(path)) : toLF(readRepo(path))
  const st = inputStats(label, sql)
  if (eol === 'crlf') assert.ok(st.cr > 50, `CR 이 ${st.cr}개뿐입니다`)
  const e = await p.fail(sql)
  return { st, e }
}

/** 게시 함수의 현재 본문과 메타데이터 */
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

/** 설치 SQL 에서 게시 함수 본문을 떠 온다 (LF 기준) */
function installedBodyLf(): string {
  const s = toLF(readRepo(INSTALL_SQL))
  const start = s.indexOf('create function public.admin_set_practice_publication(')
  const b0 = s.indexOf('$fn$', start) + 4
  const b1 = s.indexOf('$fn$', b0)
  return s.slice(b0, b1)
}

// ════════════════════════════════════════════════════════════════════
// A. 과거 실패 재현 — 입력의 줄끝이 갈랐다 (§148)
// ════════════════════════════════════════════════════════════════════

test('A1 CRLF 로 설치한 014 본문은 운영 진단의 본문과 같다 (2252자 · CR 63)', OPTS, async () => {
  await pg.fresh('a1')
  await installBaselineAs(pg, 'crlf')
  const r = await pg.q(SNAP)
  const src = String(r.rows[0].src)
  // 코드 텍스트 대조다. 운영 데이터를 복제한 것이 아니다 (§150)
  assert.equal(src.length, 2252, `본문이 2252자가 아닙니다 (${src.length})`)
  assert.equal((src.match(new RegExp(CR, 'g')) ?? []).length, 63)
  assert.equal((src.match(new RegExp(NL, 'g')) ?? []).length, 63)
  assert.equal(toLF(src), installedBodyLf(), '014 파일 본문과 다릅니다')
  assert.equal(toLF(src).length, 2189)
  // 아직 조건 없는 ON CONFLICT 다
  assert.ok(src.includes('on conflict (practice_id)' + CR + NL))
  assert.ok(!src.includes('where practice_id is not null'))
})

test('A2 021 을 **LF** 로 보내면 통과한다 — 역사 대조군', OPTS, async () => {
  await pg.fresh('a2')
  await installBaselineAs(pg, 'crlf')
  await sendPatch(pg, PATCH_021, 'lf', '021 · LF')
  const r = await pg.q(SNAP)
  assert.ok(String(r.rows[0].src).includes('where practice_id is not null'))
})

test('A3 021 을 **CRLF** 로 보내면 P0001 로 멈추고 함수는 그대로다', OPTS, async () => {
  await pg.fresh('a3')
  await installBaselineAs(pg, 'crlf')
  const before = await pg.q(SNAP)

  const { e } = await sendPatchExpectFail(pg, PATCH_021, 'crlf', '021 · CRLF')

  assert.equal(e.code, 'P0001', `P0001 이 아닙니다: ${e.code}`)
  assert.match(e.message, /알려진 정의와 다릅니다/, e.message)
  // 운영에서 본 "본문 2189 글자" 가 그대로 나온다 — v_norm 의 길이다
  assert.match(e.message, /2189/, `메시지에 2189 가 없습니다: ${e.message}`)

  const after = await pg.q(SNAP)
  assert.equal(after.rows[0].src, before.rows[0].src, '중단해야 하는데 본문을 바꿨습니다')
  assert.deepEqual(after.rows[0].snap, before.rows[0].snap)
})

test('A3 실패를 기대하는 검사가 성공을 삼키지 않는다 (§155)', OPTS, async () => {
  await pg.fresh('a3b')
  await pg.q('create table t (id int primary key)')
  await assert.rejects(
    () => pg.fail('insert into t values (1)'),
    /실패를 기대했지만 성공했습니다/,
  )
})

// ════════════════════════════════════════════════════════════════════
// B. 025 핵심 표 — DB 본문 × 패치 입력 네 조합 모두 통과 (§157)
// ════════════════════════════════════════════════════════════════════

const MATRIX: { db: Eol; input: Eol; name: string }[] = [
  { db: 'lf', input: 'lf', name: 'B1 DB=LF · 입력=LF' },
  { db: 'crlf', input: 'lf', name: 'B2 DB=CRLF · 입력=LF' },
  { db: 'lf', input: 'crlf', name: 'B3 DB=LF · 입력=CRLF' },
  { db: 'crlf', input: 'crlf', name: 'B4 DB=CRLF · 입력=CRLF (024 와 같은 상태)' },
]

for (const [i, m] of MATRIX.entries()) {
  test(`${m.name} → 사전·교체·사후 검사 통과`, OPTS, async () => {
    await pg.fresh('b' + (i + 1))
    await installBaselineAs(pg, m.db)

    const before = await pg.q(SNAP)
    const srcBefore = String(before.rows[0].src)
    assert.equal(srcBefore.length, m.db === 'crlf' ? 2252 : 2189,
      'DB 본문의 줄끝이 의도한 상태가 아닙니다')

    const bi = await pg.q(IDX)
    const br = await pg.q(RLS)

    await sendPatch(pg, PATCH_025, m.input, `025 · ${m.input.toUpperCase()}`)

    const after = await pg.q(SNAP)
    const srcAfter = String(after.rows[0].src)

    // 교체된 본문은 LF 기준의 수정본이다
    assert.ok(!srcAfter.includes(CR), '교체 뒤 본문에 CR 이 남았습니다')
    assert.equal(srcAfter.length, 2219, `수정본이 2219자가 아닙니다 (${srcAfter.length})`)
    assert.ok(srcAfter.includes('on conflict (practice_id) where practice_id is not null'))

    // 본문 말고는 그대로
    assert.deepEqual(after.rows[0].snap, before.rows[0].snap,
      'OID·소유자·ACL·보안설정·search_path·반환형·인자가 달라졌습니다')
    assert.deepEqual((await pg.q(IDX)).rows[0].idx, bi.rows[0].idx, '인덱스가 달라졌습니다')
    assert.deepEqual((await pg.q(RLS)).rows[0].rls, br.rows[0].rls, 'RLS·정책이 달라졌습니다')

    // 본문 차이는 **그 한 줄**뿐이다
    const lb = toLF(srcBefore).split(NL)
    const la = srcAfter.split(NL)
    assert.equal(la.length, lb.length, '본문 줄 수가 달라졌습니다')
    const diff = lb.map((l, k) => [k, l, la[k]] as const).filter(([, x, y]) => x !== y)
    assert.equal(diff.length, 1, `달라진 줄이 ${diff.length}개입니다`)
    assert.equal(diff[0][1].trim(), 'on conflict (practice_id)')
    assert.equal(diff[0][2].trim(), 'on conflict (practice_id) where practice_id is not null')

    // 그리고 게시가 실제로 된다
    const practice = await makePractice(pg, { approveSafety: true })
    await actAsAdmin(pg)
    await pg.q(PUBLISH, [practice, true])
    const s = await pg.q(
      'select status from ai_question_private.ai_practice_problems where id = $1', [practice])
    assert.equal(s.rows[0].status, 'published')
  })
}

// ════════════════════════════════════════════════════════════════════
// C. 다시 적용하면 아무것도 바꾸지 않는다 (§174)
// ════════════════════════════════════════════════════════════════════

for (const input of ['lf', 'crlf'] as Eol[]) {
  test(`C 정확한 수정본에 ${input.toUpperCase()} 입력으로 재적용 → already_applied, 불변`, OPTS, async () => {
    await pg.fresh('c_' + input)
    await installBaselineAs(pg, 'crlf')
    await sendPatch(pg, PATCH_025, 'lf', '025 · LF (1회차)')
    const once = await pg.q(SNAP)

    await sendPatch(pg, PATCH_025, input, `025 · ${input.toUpperCase()} (2회차)`)
    const twice = await pg.q(SNAP)

    assert.equal(twice.rows[0].src, once.rows[0].src, '두 번째 적용이 본문을 건드렸습니다')
    assert.deepEqual(twice.rows[0].snap, once.rows[0].snap, '메타데이터가 달라졌습니다')
  })
}

test('C 021 이 이미 적용된 환경에서도 025 는 no-op 이다', OPTS, async () => {
  await pg.fresh('c_021')
  await installBaselineAs(pg, 'crlf')
  await sendPatch(pg, PATCH_021, 'lf', '021 · LF')
  const after021 = await pg.q(SNAP)

  await sendPatch(pg, PATCH_025, 'crlf', '025 · CRLF')
  const after025 = await pg.q(SNAP)

  assert.equal(after025.rows[0].src, after021.rows[0].src)
  assert.deepEqual(after025.rows[0].snap, after021.rows[0].snap)
})

// ════════════════════════════════════════════════════════════════════
// D·E. 느슨해지지 않았는가 — 모르는 본문은 여전히 막는다 (§175·§176)
// ════════════════════════════════════════════════════════════════════

/** 함수 본문을 주어진 문자열로 바꿔 둔다 (남이 고친 상태를 만든다) */
async function tamper(p: Pg, body: string) {
  await p.q(`select set_config('twin.tampered', $1, false)`, [body])
  await p.q(`
    do $x$
    begin
      execute 'create or replace function public.admin_set_practice_publication('
        || 'p_practice_problem_id uuid, p_publish boolean) returns void '
        || 'language plpgsql security definer set search_path = '''' as '
        || quote_literal(current_setting('twin.tampered')) || ';';
    end;
    $x$;`)
}

test('D 실행문이 바뀐 본문은 교체 전에 막는다', OPTS, async () => {
  await pg.fresh('d1')
  await installBaselineAs(pg, 'crlf')
  const orig = String((await pg.q(SNAP)).rows[0].src)
  // 안전승인 검사를 빼 버린 본문 — 절대 받아들여선 안 된다
  const bad = orig.replace('if not v_safe then', 'if false then')
  assert.notEqual(bad, orig, '변이가 아무것도 바꾸지 않았습니다')
  await tamper(pg, bad)

  const before = await pg.q(SNAP)
  const { e } = await sendPatchExpectFail(pg, PATCH_025, 'crlf', '025 · CRLF (실행문 변경 본문)')
  assert.match(e.message, /알려진 두 정의와 다릅니다/, e.message)
  assert.equal(String((await pg.q(SNAP)).rows[0].src), String(before.rows[0].src))
})

test('D 공백만 바뀐 본문도 교체 전에 막는다 — 느슨하게 보지 않는다', OPTS, async () => {
  await pg.fresh('d2')
  await installBaselineAs(pg, 'crlf')
  const orig = String((await pg.q(SNAP)).rows[0].src)
  const bad = orig.replace('  if p_publish then', '    if p_publish then')
  assert.notEqual(bad, orig, '변이가 아무것도 바꾸지 않았습니다')
  await tamper(pg, bad)

  const before = await pg.q(SNAP)
  const { e } = await sendPatchExpectFail(pg, PATCH_025, 'crlf', '025 · CRLF (들여쓰기 변경 본문)')
  assert.match(e.message, /알려진 두 정의와 다릅니다/, e.message)
  assert.equal(String((await pg.q(SNAP)).rows[0].src), String(before.rows[0].src))
})

test('D 주석만 바뀐 본문도 교체 전에 막는다', OPTS, async () => {
  await pg.fresh('d3')
  await installBaselineAs(pg, 'crlf')
  const orig = String((await pg.q(SNAP)).rows[0].src)
  const bad = orig.replace('-- D-064', '-- D-064 (누가 덧붙인 말)')
  assert.notEqual(bad, orig, '변이가 아무것도 바꾸지 않았습니다')
  await tamper(pg, bad)

  const { e } = await sendPatchExpectFail(pg, PATCH_025, 'lf', '025 · LF (주석 변경 본문)')
  assert.match(e.message, /알려진 두 정의와 다릅니다/, e.message)
})

test('E 단독 CR 이 섞인 본문은 지우지 않고 미지원으로 막는다', OPTS, async () => {
  await pg.fresh('e1')
  await installBaselineAs(pg, 'lf')
  const orig = String((await pg.q(SNAP)).rows[0].src)
  assert.ok(!orig.includes(CR))
  // LF 가 따라오지 않는 단독 CR 을 끼워 넣는다.
  // 021 처럼 CR 만 전부 지우면 이 본문이 원본과 같아져 **통과해 버린다.**
  // 025 는 CRLF 쌍만 바꾸므로 이 CR 이 남고, 미지원으로 멈춰야 한다
  const lone = orig.replace('  if p_publish then', '  ' + CR + 'if p_publish then')
  assert.notEqual(lone, orig, '변이가 아무것도 바꾸지 않았습니다')
  assert.ok(lone.includes(CR) && !lone.includes(CR + NL), '단독 CR 이 아닙니다')
  await tamper(pg, lone)

  const before = await pg.q(SNAP)
  const { e } = await sendPatchExpectFail(pg, PATCH_025, 'lf', '025 · LF (단독 CR 본문)')
  assert.match(e.message, /단독 CR/, e.message)
  assert.equal(String((await pg.q(SNAP)).rows[0].src), String(before.rows[0].src))
})

test('E 입력에 단독 CR 이 섞이면 미지원으로 막는다', OPTS, async () => {
  await pg.fresh('e2')
  await installBaselineAs(pg, 'crlf')
  // 패치 입력 안의 c_orig 한 곳에 단독 CR 을 끼운다
  const sql = toLF(readRepo(PATCH_025)).replace(
    '  if not public.is_admin() then', '  ' + CR + 'if not public.is_admin() then')
  const st = inputStats('025 · 단독 CR 입력', sql)
  assert.equal(st.cr, 1, '단독 CR 이 1개여야 합니다')
  const e = await pg.fail(sql)
  assert.match(e.message, /단독 CR/, e.message)
})

// ════════════════════════════════════════════════════════════════════
// F·G·H. 게시 동작과 가드가 그대로인가
// ════════════════════════════════════════════════════════════════════

test('F 게시 → 게시취소 → 재게시, 자산 1행, 최초 게시 이력 보존', OPTS, async () => {
  await pg.fresh('f1')
  await installBaselineAs(pg, 'crlf')
  await sendPatch(pg, PATCH_025, 'crlf', '025 · CRLF')

  const practice = await makePractice(pg, { approveSafety: true })
  await actAsAdmin(pg)

  await pg.q(PUBLISH, [practice, true])
  let s = await pg.q(`select status, first_published_at, first_published_by_auth_uid
                        from ai_question_private.ai_practice_problems where id = $1`, [practice])
  assert.equal(s.rows[0].status, 'published')
  const firstAt = s.rows[0].first_published_at
  const firstBy = s.rows[0].first_published_by_auth_uid
  assert.ok(firstAt !== null && firstBy !== null)

  let a = await pg.q(`select count(*)::int as n, bool_or(is_active) as active, min(review_status) as review
                        from public.type_learning_assets where practice_id = $1`, [practice])
  assert.equal(a.rows[0].n, 1)
  assert.equal(a.rows[0].active, true)
  assert.equal(a.rows[0].review, 'approved')

  // 게시 중 다시 true → 기존 정책대로 invalid_state. 멱등 성공으로 바꾸지 않는다 (§178)
  const dup = await pg.fail(PUBLISH, [practice, true])
  assert.match(dup.message, /invalid_state/, dup.message)

  await pg.q(PUBLISH, [practice, false])
  a = await pg.q(`select count(*)::int as n, bool_or(is_active) as active
                    from public.type_learning_assets where practice_id = $1`, [practice])
  assert.equal(a.rows[0].n, 1, '게시취소로 자산 행이 사라지면 안 됩니다')
  assert.equal(a.rows[0].active, false)

  // 재게시 — UPSERT 의 UPDATE 경로가 실제로 돈다
  await pg.q(PUBLISH, [practice, true])
  s = await pg.q(`select status, first_published_at, first_published_by_auth_uid
                    from ai_question_private.ai_practice_problems where id = $1`, [practice])
  assert.equal(s.rows[0].status, 'published')
  assert.deepEqual(s.rows[0].first_published_at, firstAt, '최초 게시 시각이 덮어써졌습니다')
  assert.equal(s.rows[0].first_published_by_auth_uid, firstBy, '최초 게시자가 덮어써졌습니다')

  a = await pg.q(`select count(*)::int as n, bool_or(is_active) as active
                    from public.type_learning_assets where practice_id = $1`, [practice])
  assert.equal(a.rows[0].n, 1, '재게시로 자산 행이 늘어나면 안 됩니다')
  assert.equal(a.rows[0].active, true)
})

test('G 원시 UPSERT 반복은 게시 상태 전이와 다른 시험이다 (§178)', OPTS, async () => {
  await pg.fresh('g1')
  await pg.q(`
    create table t (
      id serial primary key, practice_id uuid,
      is_active boolean not null default true,
      review_status text not null default 'pending',
      updated_at timestamptz not null default now());
    create unique index t_practice_uidx on t (practice_id) where practice_id is not null;`)
  const key = '44444444-4444-4444-8444-444444444444'
  const upsert = `
    insert into t (practice_id, is_active, review_status)
    values ($1::uuid, true, 'approved')
    on conflict (practice_id) where practice_id is not null
    do update set is_active = true, review_status = 'approved', updated_at = now()
    returning id, (xmax = 0) as inserted`
  const a = await pg.q(upsert, [key])
  assert.equal(a.rows[0].inserted, true, '첫 실행은 INSERT 여야 합니다')
  const b = await pg.q(upsert, [key])
  assert.equal(b.rows[0].inserted, false, '재실행은 UPDATE 여야 합니다')
  assert.equal(b.rows[0].id, a.rows[0].id)
  const n = await pg.q('select count(*)::int as n from t where practice_id = $1', [key])
  assert.equal(n.rows[0].n, 1)
})

test('H 안전승인·retired·비관리자·잘못된 인자 거부가 그대로다', OPTS, async () => {
  await pg.fresh('h1')
  await installBaselineAs(pg, 'crlf')
  await sendPatch(pg, PATCH_025, 'crlf', '025 · CRLF')

  const noSafe = await makePractice(pg, { approveSafety: false })
  await actAsAdmin(pg)
  const e1 = await pg.fail(PUBLISH, [noSafe, true])
  assert.match(e1.message, /student_publish_approval_required/, e1.message)
  assert.equal(e1.code, '22023')

  const ok = await makePractice(pg, { approveSafety: true })
  await actAs(pg, TEACHER_UID)
  const e2 = await pg.fail(PUBLISH, [ok, true])
  assert.equal(e2.code, '42501', e2.message)
  assert.match(e2.message, /forbidden/)

  await actAsAdmin(pg)
  const e3 = await pg.fail('select public.admin_set_practice_publication(null::uuid, true)')
  assert.match(e3.message, /invalid_argument/, e3.message)
  const e4 = await pg.fail(PUBLISH, [ok, null])
  assert.match(e4.message, /invalid_argument/, e4.message)

  const e5 = await pg.fail(PUBLISH, ['55555555-5555-4555-8555-555555555555', true])
  assert.equal(e5.code, 'P0002', e5.message)

  await pg.q(`update ai_question_private.ai_practice_problems
                 set student_publish_approved = false, status = 'retired', retired_at = now()
               where id = $1`, [ok])
  const e6 = await pg.fail(PUBLISH, [ok, true])
  assert.match(e6.message, /invalid_state/, e6.message)
})

test('H 인덱스가 예상과 다르면 025 도 교체 전에 멈춘다', OPTS, async () => {
  await pg.fresh('h2')
  await installBaselineAs(pg, 'crlf')
  // 기대한 부분 인덱스와 다른 상태로 만든다. 가드가 거부하는지 보는 것이다
  await pg.q(`
    drop index public.tla_practice_uidx;
    create unique index tla_practice_uidx on public.type_learning_assets (practice_id);`)
  const before = await pg.q(SNAP)
  const { e } = await sendPatchExpectFail(pg, PATCH_025, 'crlf', '025 · CRLF (인덱스 변경)')
  assert.match(e.message, /조건이 예상과 다릅니다/, e.message)
  assert.equal(String((await pg.q(SNAP)).rows[0].src), String(before.rows[0].src))
})

test('H 대상 함수가 없으면 새로 만들지 않고 멈춘다', OPTS, async () => {
  await pg.fresh('h3')
  await installBaselineAs(pg, 'crlf')
  await pg.q('drop function public.admin_set_practice_publication(uuid, boolean)')
  const { e } = await sendPatchExpectFail(pg, PATCH_025, 'crlf', '025 · CRLF (함수 없음)')
  assert.match(e.message, /정확히 하나가 아닙니다/, e.message)
  const n = await pg.q(`select count(*)::int as n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public' and p.proname='admin_set_practice_publication'`)
  assert.equal(n.rows[0].n, 0, '없는 함수를 새로 만들었습니다')
})

// ════════════════════════════════════════════════════════════════════
// I. 025 적용 후 변경 없는 017 전체 검증 (§180)
// ════════════════════════════════════════════════════════════════════

test('I 025 전에는 017 전체 검증이 42P10 으로 멈춘다', OPTS, async () => {
  await pg.fresh('i1')
  await installBaselineAs(pg, 'crlf')
  const e = await pg.fail(readRepo(VERIFY_SQL))
  assert.equal(e.code, '42P10', `42P10 이 아닙니다: ${e.code} ${e.message}`)
})

for (const input of ['lf', 'crlf'] as Eol[]) {
  test(`I 025(${input.toUpperCase()} 입력) 뒤 017 전체 검증이 끝까지 통과한다 (파일 무변경)`, OPTS, async () => {
    await pg.fresh('i_' + input)
    await installBaselineAs(pg, 'crlf')
    await sendPatch(pg, PATCH_025, input, `025 · ${input.toUpperCase()}`)

    // 017 을 **한 글자도 고치지 않고** 그대로 돌린다
    const verify = readRepo(VERIFY_SQL)
    inputStats('017 검증 (파일 그대로)', verify)
    await pg.q(verify)

    // rollback 이 실제로 되돌렸는지
    const n = await pg.q(`select count(*)::int as n from ai_question_private.twin_candidates
                           where prompt_version = 'verify-v1'`)
    assert.equal(n.rows[0].n, 0, '017 의 rollback 뒤에 검증 데이터가 남았습니다')
    const a = await pg.q(`select count(*)::int as n from public.type_learning_assets`)
    assert.equal(a.rows[0].n, 0, '017 의 rollback 뒤에 자산 행이 남았습니다')
  })
}
