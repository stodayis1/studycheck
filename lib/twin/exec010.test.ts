// GPT-EXEC-010 회귀 테스트 — 사전점검 의미 일치 최종 보정
//
// 실행: npm run test:twin
//
//   A) 사전점검 [24] 가 실제 유형 목록 RPC 와 같은 유형 집합을 본다   (D-093)
//   B) 문제 구조 불량에서도 최종 판정까지 도달한다                    (D-094)
//   C) 앱 조회가 알려진 빈 문자열을 limit 전에 제외한다               (D-095)
//
// 운영 DB·Storage 에 접속하지 않는다. 파일 내용과 순수 함수만 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isEligible, pickSourceProblems } from './targets'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)

const SQL_INSTALL = 'docs/sql/쌍둥이_설치.sql'
const SQL_PRECHECK = 'docs/sql/쌍둥이_설치전_점검.sql'

/** 주석과 문자열 리터럴을 지운 SQL 본문 */
function sqlCode(path: string): string {
  let body = read(path).replace(/\/\*[\s\S]*?\*\//g, ' ')
  body = body.split(NL).map(l => l.replace(/--.*$/, '')).join(NL)
  return body.replace(/'(?:[^']|'')*'/g, " '' ")
}

/** `[n]` 로 시작하는 구간 하나를 잘라낸다. 문자열 존재만 보지 않기 위해 (§87) */
function section(sql: string, from: string, to: string): string {
  const a = sql.indexOf(from)
  assert.ok(a > 0, `${from} 구간을 찾지 못했습니다`)
  const b = sql.indexOf(to, a)
  assert.ok(b > a, `${to} 구간을 찾지 못했습니다`)
  return sql.slice(a, b)
}

// ════════════════════════════════════════════════════════════════════
// A) [24] 를 실제 유형 목록 RPC 와 맞춤 (D-093)
// ════════════════════════════════════════════════════════════════════

test('[24] 집계 구간 안에 standard_types inner join 이 있다', () => {
  const pre = read(SQL_PRECHECK)
  // 파일 전체에 join 문자열이 있는지가 아니라, **[24] 집계 구간 안**에 있는지 본다
  const block = section(pre, 'select count(*) into v_usable_types from (', "'[24]")
  assert.ok(block.includes('join public.standard_types st on st.code = p.type_code'),
    '[24] 가 standard_types 와 연결되지 않습니다 — 점검은 OK 인데 RPC 는 빈 목록일 수 있습니다')
  // left join 이면 의미가 달라진다. inner join 이어야 한다
  assert.ok(!/left join public\.standard_types/.test(block))
})

test('[24] 가 유형 목록 RPC 와 같은 원문 조건을 쓴다', () => {
  const pre = read(SQL_PRECHECK)
  const block = section(pre, 'select count(*) into v_usable_types from (', "'[24]")

  // 기존 쌍둥이가 하나라도 있으면 제외
  assert.ok(block.includes('count(p.twin_id) = 0'))
  // 정답 · number|choice · is_essay=false · non-empty image_path
  assert.ok(block.includes("p.answer_text is not null and btrim(p.answer_text) <> ''"))
  assert.ok(block.includes("p.answer_kind in ('number','choice')"))
  assert.ok(block.includes('p.is_essay = false'))
  assert.ok(block.includes("p.image_path is not null and btrim(p.image_path) <> ''"))
  // Storage 세 조건
  assert.ok(block.includes('o.id is not null'))
  assert.ok(block.includes('o.updated_at is not null'))
  assert.ok(block.includes("o.metadata->>'eTag'") && block.includes("o.metadata->>'etag'"))
  // 서로 다른 원문 5개 이상 — 중복으로 부풀지 않게 distinct
  assert.ok(block.includes('count(distinct p.id)'))
  assert.ok(block.includes('>= 5'))
})

test('유형 목록 RPC 도 standard_types 와 inner join 한다', () => {
  const code = sqlCode(SQL_INSTALL)
  const start = code.indexOf('create function public.server_list_eligible_twin_types')
  assert.ok(start > 0)
  const body = code.slice(start, code.indexOf('$fn$;', start))
  assert.ok(body.includes('join public.standard_types st on st.code = p.type_code'))
  assert.ok(!/left join public\.standard_types/.test(body))
})

test('standard_types.code 중복을 중단 항목으로 센다 (§86)', () => {
  const pre = read(SQL_PRECHECK)
  const block = section(pre, "-- §85: `standard_types.code` 가 유일해야 한다", '-- 인자 없는 정확한 함수')
  assert.ok(block.includes('group by code having count(*) > 1'))
  // 중복이 있으면 v_fail 을 올려야 한다
  assert.ok(block.includes('v_fail := v_fail + 1'))
  assert.ok(pre.includes('v_dup_code'))
})

// ════════════════════════════════════════════════════════════════════
// B) 문제 구조 가드 (D-094)
// ════════════════════════════════════════════════════════════════════

test('v_problem_ok 가드가 있고 기본값이 false 다', () => {
  const pre = read(SQL_PRECHECK)
  assert.ok(/v_problem_ok\s+boolean\s*:=\s*false;/.test(pre),
    '가드가 없거나 기본값이 false 가 아닙니다')
})

test('가드가 problems·standard_types 존재와 칼럼 계약을 모두 본다', () => {
  const pre = read(SQL_PRECHECK)
  const block = section(pre, 'v_problem_ok :=', 'if v_problem_ok then')
  assert.ok(block.includes("to_regclass('public.problems') is not null"))
  assert.ok(block.includes("to_regclass('public.standard_types') is not null"))
  assert.ok(block.includes("v_missing = ''"), '[11] 참조 칼럼 결과를 보지 않습니다')
  assert.ok(block.includes('v_dup_code'), '[7-2] 중복 결과를 보지 않습니다')
  assert.ok(block.includes("data_type = 'bigint'"), 'problems.id 타입 계약을 보지 않습니다')
})

test('구조가 불완전하면 문제 데이터 통계를 실행하지 않는다', () => {
  const pre = read(SQL_PRECHECK)
  assert.ok(pre.includes('if not v_problem_ok then'))
  assert.ok(pre.includes('건너뜀 (구조 불완전)'))
})

test('문제 칼럼을 참조하는 쿼리가 모두 가드 뒤에 있다', () => {
  const pre = read(SQL_PRECHECK)
  const guard = pre.indexOf('v_problem_ok :=')
  assert.ok(guard > 0)

  // 가드 앞에서 problems 의 **데이터 칼럼**을 읽으면 안 된다.
  // information_schema/pg_catalog 조회는 칼럼이 없어도 안전하므로 제외한다.
  const before = pre.slice(0, guard)
  for (const banned of ['from public.problems p', 'into v_essay_null', 'into v_strict',
                        'into v_no_image', 'into v_types_no_twin', 'into v_usable']) {
    assert.ok(!before.includes(banned), `가드 앞에서 ${banned} 를 실행합니다`)
  }
})

test('Storage 데이터 점검도 문제 구조 가드를 함께 본다', () => {
  const pre = read(SQL_PRECHECK)
  assert.ok(pre.includes('if not v_storage_ok or not v_problem_ok then'),
    'problems 를 조인하는 집계가 문제 구조 가드를 보지 않습니다')
})

test('참고 count 가 테이블 존재를 먼저 확인한다', () => {
  const pre = read(SQL_PRECHECK)
  const block = section(pre, '-- §110: 테이블이 없으면 참고 count', '-- ── 결론')
  for (const t of ['public.users', 'auth.users', 'public.problems']) {
    assert.ok(block.includes(`to_regclass('${t}') is null`), `${t} 존재 확인이 없습니다`)
  }
  // 존재 확인 없이 바로 세는 줄이 남아 있으면 안 된다
  assert.ok(!/^  select count\(\*\) into v_rows from auth\.users;/m.test(pre))
})

test('구조가 불완전해도 최종 판정까지 도달한다', () => {
  const pre = read(SQL_PRECHECK)
  // 마지막 결론 블록이 do 블록 안에 하나뿐이고, 그 앞에 return/exception 종료가 없다
  const tail = pre.slice(pre.indexOf('-- ── 결론'))
  assert.ok(tail.includes('판정: 전부 OK'))
  assert.ok(tail.includes('raise exception'))
  // 중간에 조기 종료하는 구문이 없어야 한다
  const body = pre.slice(pre.indexOf('do $check$'), pre.indexOf('-- ── 결론'))
  assert.ok(!/\breturn\b/.test(body), '중간에 return 으로 끊깁니다')
  assert.ok(!/raise exception/.test(body), '최종 판정 전에 예외를 던집니다')
})

test('사전점검이 여전히 읽기 전용이다', () => {
  const code = sqlCode(SQL_PRECHECK)
  const found: string[] = []
  for (const w of ['insert', 'update', 'delete', 'create', 'alter',
                   'drop', 'grant', 'revoke', 'truncate']) {
    const hits = code.match(new RegExp(`\\b${w}\\b`, 'gi'))
    if (hits) found.push(`${w}:${hits.length}`)
  }
  assert.deepEqual(found, [], `변경문이 있습니다: ${found.join(' ')}`)
  assert.ok(!/\btemp\b|\btemporary\b/i.test(code))
})

// ════════════════════════════════════════════════════════════════════
// C) 앱 조회 필터 순서 (D-095)
// ════════════════════════════════════════════════════════════════════

/** 호출 순서를 기록하는 PostgREST 체인 mock. 네트워크를 쓰지 않는다 */
function recordingDb(rows: Record<string, unknown>[]) {
  const calls: string[] = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'not', 'in', 'neq', 'order']) {
    chain[m] = (...args: unknown[]) => {
      calls.push(`${m}(${args.map(a => JSON.stringify(a)).join(',')})`)
      return chain
    }
  }
  chain.limit = async (n: number): Promise<{ data: Record<string, unknown>[]; error: unknown }> => {
    calls.push(`limit(${n})`)
    return { data: rows, error: null }
  }
  return { db: { from: () => chain } as never, calls }
}

const okRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 1, book: '쎈', grade: '공통수학1', semester: 1, type_code: 'T',
  step: 'B', difficulty: '대표', answer_kind: 'number', answer_text: '12',
  image_path: 'a/b.png', is_essay: false, twin_id: null,
  ...over,
})

test('null 제외와 빈 문자열 제외가 모두 limit 보다 먼저 호출된다', async () => {
  const { db, calls } = recordingDb([okRow()])
  await pickSourceProblems(db, 'T', 5)

  const limitAt = calls.findIndex(c => c.startsWith('limit('))
  assert.ok(limitAt > 0, 'limit 이 호출되지 않았습니다')

  const mustBeBefore = [
    'is("twin_id",null)',
    'not("answer_text","is",null)',
    'not("image_path","is",null)',
    'neq("answer_text","")',
    'neq("image_path","")',
    'eq("is_essay",false)',
    'in("answer_kind",["number","choice"])',
  ]
  for (const needle of mustBeBefore) {
    const at = calls.indexOf(needle)
    assert.ok(at >= 0, `${needle} 가 호출되지 않았습니다 (실제: ${calls.join(' ')})`)
    assert.ok(at < limitAt, `${needle} 가 limit 뒤에 있습니다`)
  }
})

test('빈 문자열 원문이 응답에 섞이면 조용히 버리지 않고 실패한다', async () => {
  // 필터를 넣었어도 DB 응답에 계약 위반 행이 오면 fail closed 여야 한다 (§124)
  for (const bad of [{ answer_text: '' }, { image_path: '' },
                     { answer_text: '   ' }, { image_path: '   ' }]) {
    const { db } = recordingDb([okRow(bad)])
    await assert.rejects(
      () => pickSourceProblems(db, 'T', 5),
      (e: unknown) => {
        assert.ok(String((e as Error).message).includes('대상 문항 조회 실패'), String(e))
        return true
      },
      JSON.stringify(bad),
    )
  }
})

test('계약 위반 행을 걸러내고 나머지를 돌려주지 않는다', async () => {
  // 위반 행을 빼고 유효 행만 주는 식으로 숨기면 안 된다. 조회 전체가 실패해야 한다
  const { db } = recordingDb([okRow({ id: 1, image_path: '' }), okRow({ id: 2 })])
  await assert.rejects(() => pickSourceProblems(db, 'T', 5))
})

test('정상 응답은 그대로 통과한다', async () => {
  const { db } = recordingDb([okRow({ id: 1 }), okRow({ id: 2 })])
  const out = await pickSourceProblems(db, 'T', 5)
  assert.equal(out.length, 2)
  assert.equal(out[0].image_path, 'a/b.png')
})

test('앱의 알려진 필터와 유형 RPC 의 eligible 조건이 같은 뜻이다', () => {
  const src = read('lib/twin/targets.ts')
  // 조건에 문자열 리터럴이 들어 있으므로 **원본** 본문에서 본다 (sqlCode 는 리터럴을 지운다)
  const raw = read(SQL_INSTALL)
  const start = raw.indexOf('create function public.server_list_eligible_twin_types')
  assert.ok(start > 0)
  const body = raw.slice(start, raw.indexOf('$fn$;', start))

  // 앱: twin_id null · answer_text not null/<>'' · number|choice · is_essay=false · image_path not null/<>''
  for (const needle of [".is('twin_id', null)", ".not('answer_text', 'is', null)",
                        ".in('answer_kind', ['number', 'choice'])", ".eq('is_essay', false)",
                        ".not('image_path', 'is', null)",
                        ".neq('answer_text', '')", ".neq('image_path', '')"]) {
    assert.ok(src.includes(needle), `앱 조회에 ${needle} 가 없습니다`)
  }
  // RPC: 같은 다섯 축
  assert.ok(body.includes('p.twin_id is null'))
  assert.ok(body.includes("p.answer_text is not null and btrim(p.answer_text) <> ''"))
  assert.ok(body.includes("p.answer_kind in ('number','choice')"))
  assert.ok(body.includes('p.is_essay = false'))
  assert.ok(body.includes("p.image_path is not null and btrim(p.image_path) <> ''"))
})

test('공백만 있는 값은 앱 재검사에서 계속 막힌다', () => {
  const base: {
    twin_id: number | null; answer_text: string; answer_kind: string; is_essay: boolean
  } = { twin_id: null, answer_text: '12', answer_kind: 'number', is_essay: false }
  assert.equal(isEligible({ ...base, image_path: 'a/b.png' }), true)
  // PostgREST 의 neq('') 로는 못 거르는 값들
  assert.equal(isEligible({ ...base, image_path: '   ' }), false)
  assert.equal(isEligible({ ...base, answer_text: '   ', image_path: 'a/b.png' }), false)
})
