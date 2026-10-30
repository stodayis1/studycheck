// GPT-EXEC-012 회귀 테스트 — 파일럿 준비 수치 조회 SQL
//
// 실행: npm run test:twin
//
//   A) 두 파일이 바이트 단위로 같다                          (§177)
//   B) 실행 본문에 변경·금지 구문이 0건이고 결과 집합이 하나   (§178~182)
//   C) 금지 출력 열이 결과에 실리지 않는다                    (D-104 · §183)
//   D) `[12]`~`[24]` 조건이 판정 SQL 과 같은 뜻이다            (§184)
//   E) 유형별 원문 수 합이 구조적으로 맞는다                   (§186)
//   F) 판정 SQL 은 이번 회차에 변경되지 않았다                 (D-103)
//
// 운영 DB 에 접속하지 않는다. 파일 내용만 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const readRaw = (p: string) => readFileSync(join(ROOT, p))
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)

const COUNTS = 'docs/sql/쌍둥이_설치전_수치조회.sql'
const COUNTS_COPY = 'PREFLIGHT_COUNTS_TO_RUN_012.sql'
const PRECHECK = 'docs/sql/쌍둥이_설치전_점검.sql'
const PRECHECK_COPY = 'PREFLIGHT_TO_RUN_010.sql'

/** 주석을 지운 실행 본문 */
function exec(path: string): string {
  const noBlock = read(path).replace(/\/\*[\s\S]*?\*\//g, ' ')
  return noBlock.split(NL).map(l => l.replace(/--.*$/, '')).join(NL)
}

/** 주석과 문자열 리터럴을 지운 실행 본문 (키워드 검사용) */
function execNoLit(path: string): string {
  return exec(path).replace(/'(?:[^']|'')*'/g, " '' ")
}

const sha256 = (p: string) => createHash('sha256').update(readRaw(p)).digest('hex')

// ════════════════════════════════════════════════════════════════════
// A) 두 파일이 같다
// ════════════════════════════════════════════════════════════════════

test('수치조회 원본과 실행용 사본이 바이트 단위로 같다', () => {
  const a = readRaw(COUNTS)
  const b = readRaw(COUNTS_COPY)
  assert.equal(a.length, b.length, '길이가 다릅니다')
  assert.ok(a.equals(b), '내용이 다릅니다')
  assert.equal(sha256(COUNTS), sha256(COUNTS_COPY))
})

// ════════════════════════════════════════════════════════════════════
// B) 읽기 전용이고 결과 집합이 하나다
// ════════════════════════════════════════════════════════════════════

test('수치조회에 변경 키워드가 0건이다', () => {
  const code = execNoLit(COUNTS)
  const found: string[] = []
  for (const w of ['create', 'alter', 'drop', 'insert', 'update',
                   'delete', 'grant', 'revoke', 'truncate']) {
    const hits = code.match(new RegExp(`\\b${w}\\b`, 'gi'))
    if (hits) found.push(`${w}:${hits.length}`)
  }
  assert.deepEqual(found, [], `변경 키워드가 있습니다: ${found.join(' ')}`)
})

test('DO · RAISE · CALL · COPY · set_config · 임시 테이블이 0건이다', () => {
  const code = execNoLit(COUNTS)
  for (const w of ['do', 'raise', 'call', 'copy', 'set_config',
                   'temp', 'temporary', 'commit', 'rollback', 'begin']) {
    const hits = code.match(new RegExp(`\\b${w}\\b`, 'gi')) ?? []
    assert.equal(hits.length, 0, `${w} 가 ${hits.length}건 있습니다`)
  }
})

test('최상위가 WITH ... SELECT 하나이고 결과 집합이 하나다', () => {
  const code = execNoLit(COUNTS)
  // 세미콜론이 하나뿐이어야 한다 — 여러 문장이면 결과 탭이 여러 개가 된다
  assert.equal(code.split(';').length - 1, 1, '문장이 하나가 아닙니다')
  assert.match(code.trimStart(), /^with\b/i, 'WITH 로 시작하지 않습니다')
  assert.match(code.trimEnd(), /;$/)
})

test('정렬이 section_order · row_order · type_code 로 결정적이다', () => {
  const code = execNoLit(COUNTS)
  assert.match(code, /order by section_order, row_order, type_code;/)
  // 임의 LIMIT 을 두지 않는다 (§132)
  assert.ok(!/\blimit\b/i.test(code), 'LIMIT 이 있습니다')
})

test('구조 검사 로직을 다시 넣지 않았다 (§87)', () => {
  const code = execNoLit(COUNTS)
  assert.ok(!/to_regclass/i.test(code))
  assert.ok(!/information_schema/i.test(code))
})

// ════════════════════════════════════════════════════════════════════
// C) 금지 출력 (D-104)
// ════════════════════════════════════════════════════════════════════

/** 최종 결과 SELECT 두 분기 (요약 + 유형별). 여기에 실리는 것이 곧 출력이다 */
function finalSelects(): string {
  const code = exec(COUNTS)
  const at = code.indexOf('from summary s')
  assert.ok(at > 0, '최종 SELECT 를 찾지 못했습니다')
  // 최종 요약 SELECT 시작 지점부터 끝까지
  const start = code.lastIndexOf('select', code.indexOf('s.section_order'))
  return code.slice(start)
}

test('최종 결과에 정답·경로·객체명·ETag 값이 없다', () => {
  const out = finalSelects()
  for (const banned of ['answer_text', 'image_path', 'o.name', 'o.id',
                        'metadata', 'eTag', 'etag', 'bucket_id']) {
    assert.ok(!out.includes(banned), `결과에 ${banned} 가 실립니다`)
  }
})

test('결과 열이 계약대로다', () => {
  const out = finalSelects()
  for (const col of ['section_order', 'row_order', 'section', 'check_no', 'label',
                     'metric_value', 'status', 'note', 'type_code', 'grade',
                     'chapter_title', 'type_title',
                     'usable_source_count', 'usable_number_count', 'usable_choice_count']) {
    assert.ok(out.includes(col), `결과 열 ${col} 가 없습니다`)
  }
})

test('SUMMARY 의 유형 열은 null 이고 숫자 열은 숫자형을 유지한다 (§115)', () => {
  const out = finalSelects()
  for (const col of ['type_code', 'grade', 'chapter_title', 'type_title']) {
    assert.ok(out.includes(`null::text   as ${col}`) || out.includes(`null::text as ${col}`),
      `SUMMARY 의 ${col} 이 null 이 아닙니다`)
  }
  for (const col of ['usable_source_count', 'usable_number_count', 'usable_choice_count']) {
    assert.ok(out.includes(`null::bigint as ${col}`), `SUMMARY 의 ${col} 이 null::bigint 가 아닙니다`)
  }
  // metric_value 를 표시용 문자열로 바꾸지 않았다
  assert.ok(!/metric_value::text/.test(out))
  assert.ok(!/to_char\s*\(/i.test(out))
})

test('학생·학부모·직원 테이블을 건드리지 않는다', () => {
  const code = execNoLit(COUNTS)
  for (const t of ['students', 'parents', 'public.users', 'auth.users',
                   'student_login', 'guardian']) {
    assert.ok(!code.includes(t), `${t} 를 참조합니다`)
  }
})

test('읽는 테이블이 problems · standard_types · storage.objects 셋뿐이다', () => {
  const code = execNoLit(COUNTS)
  const refs = new Set(
    [...code.matchAll(/(?:from|join)\s+((?:public|storage)\.\w+)/gi)].map(m => m[1].toLowerCase()),
  )
  assert.deepEqual([...refs].sort(),
    ['public.problems', 'public.standard_types', 'storage.objects'])
})

// ════════════════════════════════════════════════════════════════════
// D) 조건이 판정 SQL 과 같은 뜻인가 (§184)
// ════════════════════════════════════════════════════════════════════

test('기본조건 네 축이 판정 SQL 과 같다', () => {
  const counts = exec(COUNTS)
  const pre = exec(PRECHECK)
  for (const cond of ["twin_id is null",
                      "answer_text is not null and btrim(p.answer_text) <> ''",
                      "answer_kind in ('number','choice')",
                      "type_code is not null and btrim(p.type_code) <> ''"]) {
    assert.ok(counts.includes(cond), `수치조회에 ${cond} 가 없습니다`)
  }
  // 판정 SQL 도 같은 축을 쓴다 (표기만 p. 접두어 유무가 다를 수 있다)
  assert.ok(pre.includes('twin_id is null'))
  assert.ok(pre.includes("answer_kind in ('number','choice')"))
})

test('엄격조건이 is_essay = false 와 이미지 있음이다', () => {
  const counts = exec(COUNTS)
  assert.ok(counts.includes('is_essay = false'), 'D-082 조건이 없습니다')
  // coalesce(is_essay,false) 로 null 을 통과시키지 않는다
  assert.ok(!/coalesce\s*\(\s*\w*\.?is_essay/i.test(counts))
  assert.ok(counts.includes("image_path is not null and btrim(b.image_path) <> ''"),
    'D-088 조건이 없습니다')
})

test('사용 가능 조건 세 축이 판정 SQL 과 같다', () => {
  const counts = exec(COUNTS)
  assert.ok(counts.includes('o.id is not null'))
  assert.ok(counts.includes('o.updated_at is not null'))
  assert.ok(counts.includes("o.metadata->>'eTag'") && counts.includes("o.metadata->>'etag'"))
  // ETag 후보 키를 늘리지 않았다 (D-086)
  const keys = [...counts.matchAll(/metadata->>'(\w+)'/g)].map(m => m[1])
  assert.deepEqual([...new Set(keys)].sort(), ['eTag', 'etag'])
  // 버킷 이름이 판정 SQL 과 같다
  assert.ok(counts.includes("o.bucket_id = 'problem-images'"))
})

test('파일럿 유형 조건이 판정 SQL 의 [24] 와 같다', () => {
  const counts = exec(COUNTS)
  const block = counts.slice(counts.indexOf('pilot_types as ('), counts.indexOf('metrics as ('))
  assert.ok(block.includes('join public.standard_types st on st.code = tu.type_code'),
    'standard_types inner join 이 없습니다 (D-093)')
  assert.ok(!/left join public\.standard_types/.test(block))
  assert.ok(block.includes('tt.twin_cnt = 0'), '기존 쌍둥이 0 조건이 없습니다')
  assert.ok(block.includes('tu.usable_cnt >= 5'), '5개 이상 조건이 없습니다')
})

test('요약 14줄이 모두 있다 (§92)', () => {
  const counts = exec(COUNTS)
  for (const no of ['[12]', '[13]', '[14]', '[15]', '[16]', '[18]', '[19]',
                    '[20]', '[21]', '[22]', '[23]', '[24]', '[참고]', '[판정]']) {
    const hits = counts.split(`'${no}'`).length - 1
    assert.ok(hits >= 1, `요약에 ${no} 가 없습니다`)
  }
})

test('[판정] 이 10유형 기준으로 READY / NOT_READY 를 낸다', () => {
  const counts = exec(COUNTS)
  assert.ok(counts.includes('m24 >= 10'), '10유형 기준이 없습니다')
  assert.ok(counts.includes("'READY'") && counts.includes("'NOT_READY'"))
})

test('[20]~[22] 를 경고로 표시한다 (D-089)', () => {
  const counts = exec(COUNTS)
  for (const no of ['[20]', '[21]', '[22]']) {
    const at = counts.indexOf(`'${no}'`)
    assert.ok(at > 0)
    const line = counts.slice(at, at + 320)
    assert.ok(line.includes("'WARN'"), `${no} 가 경고가 아닙니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// E) 원문 수 합이 구조적으로 맞는가 (§186)
// ════════════════════════════════════════════════════════════════════

test('strict_storage 가 원문당 한 행이라 조인이 수를 부풀리지 않는다', () => {
  const counts = exec(COUNTS)
  const block = counts.slice(counts.indexOf('strict_storage as ('), counts.indexOf('type_twin as ('))
  // group by 로 접어야 원문당 한 행이 된다
  assert.ok(block.includes('group by b.id, b.type_code, b.answer_kind'))
  // 그래서 count(distinct) 없이도 distinct 와 같은 뜻이다
  assert.ok(block.includes('bool_or('))
})

test('usable_source_count = number + choice 가 구조적으로 성립한다', () => {
  const counts = exec(COUNTS)
  const block = counts.slice(counts.indexOf('type_usable as ('), counts.indexOf('pilot_types as ('))
  // 세 집계가 모두 같은 usable 조건 위에 있고, answer_kind 는 두 값뿐이다
  assert.ok(block.includes('count(*) filter (where ss.usable)'))
  assert.ok(block.includes("count(*) filter (where ss.usable and ss.answer_kind = 'number')"))
  assert.ok(block.includes("count(*) filter (where ss.usable and ss.answer_kind = 'choice')"))
  // answer_kind 제한은 base 에 있다
  assert.ok(counts.includes("p.answer_kind in ('number','choice')"))
})

test('고아 참조 집계는 count(distinct p.id) 를 쓴다', () => {
  // 여기만 left join 을 직접 세므로 distinct 가 필요하다.
  // 나머지 집계는 strict_storage 가 원문당 한 행이라 distinct 없이도 같은 뜻이다.
  const counts = exec(COUNTS)
  assert.ok(counts.includes('count(distinct p.id)'))
  const block = counts.slice(counts.indexOf('as m_orphan') - 500, counts.indexOf('as m_orphan'))
  assert.ok(block.includes('count(distinct p.id)'), '고아 참조 집계에 distinct 가 없습니다')
})

// ════════════════════════════════════════════════════════════════════
// F) 판정 SQL 은 이번 회차에 바뀌지 않았다 (D-103)
// ════════════════════════════════════════════════════════════════════

test('판정용 사전점검 SQL 과 실행 사본이 011 실행 당시와 같다', () => {
  // 011 에서 원장님이 실제로 돌린 파일의 해시다. 수치조회를 만들면서
  // 판정 파일을 건드리면 여기서 깨진다.
  const expected = '723419f0f998c43ee97c96666cafca8e2274f7b3c4de22ec445cb0d8fbf2023a'
  assert.equal(sha256(PRECHECK), expected, '판정 SQL 이 바뀌었습니다')
  assert.equal(sha256(PRECHECK_COPY), expected, '판정 SQL 사본이 바뀌었습니다')
})

test('수치조회와 판정 SQL 은 서로 다른 파일이다', () => {
  assert.notEqual(sha256(COUNTS), sha256(PRECHECK))
  // 수치조회에는 판정 로직(v_fail)이 없다
  assert.ok(!exec(COUNTS).includes('v_fail'))
})
