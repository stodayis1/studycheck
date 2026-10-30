// GPT-EXEC-014 회귀 테스트 — 설치 패키징과 파일럿 유형 manifest
//
// 실행: npm run test:twin
//
//   C) 설치 후 검증 SQL 이 수동 UUID 편집 없이 자동 선택한다   (D-112)
//   D) 실행용 3개 SQL 이 공식 원본과 바이트 단위로 같다         (§150)
//   B) 파일럿 manifest 가 6개 조건을 만족한다                   (§103)
//
// 운영 DB 에 접속하지 않는다. 파일 내용만 본다.
// SQL 을 실행하지 않으므로 "예외 경로" 검사는 **정적 검사**다 — 실행 검증이 아니다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const readRaw = (p: string) => readFileSync(join(ROOT, p))
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)
const sha256 = (p: string) => createHash('sha256').update(readRaw(p)).digest('hex')

const VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const INSTALL = 'docs/sql/쌍둥이_설치.sql'
const ROLLBACK = 'docs/sql/쌍둥이_롤백.sql'
const MANIFEST = 'docs/twin/PILOT_TYPES_014.json'

const RUN_INSTALL = 'INSTALL_TO_RUN_014.sql'
const RUN_POST = 'POSTINSTALL_TO_RUN_014.sql'
const RUN_ROLLBACK = 'ROLLBACK_014.sql'

const CR = String.fromCharCode(13)

/**
 * 주석을 지운 실행 본문.
 *
 * 파일이 CRLF 라 줄 끝에 캐리지리턴이 남는다. JS 정규식에서 `.` 은 그 문자를 포함하지
 * 않으므로 `--.*$` 가 매치되지 않아 **주석이 안 지워진다.** 먼저 떼어 낸다.
 */
function exec(path: string): string {
  const noBlock = read(path).replace(/\/\*[\s\S]*?\*\//g, ' ')
  return noBlock
    .split(NL)
    .map(l => l.split(CR).join('').replace(/--.*$/, ''))
    .join(NL)
}

// ════════════════════════════════════════════════════════════════════
// D) 실행용 파일이 공식 원본과 같다 (§150)
// ════════════════════════════════════════════════════════════════════

// GPT-EXEC-016 이후: `POSTINSTALL_TO_RUN_014.sql` 은 **폐기된 구판**이다.
// 운영에서 42501 로 실패했고(D-120), 공식 검증 SQL 은 016 에서 고쳐졌다.
// 그래서 여기서 014 판을 공식 원본과 비교하지 않는다 — 그 검사는
// `exec016.test.ts` 가 `POSTINSTALL_TO_RUN_016.sql` 로 이어받았다.
test('실행용 설치·롤백 SQL 이 공식 원본과 바이트 단위로 같다', () => {
  for (const [src, run] of [[INSTALL, RUN_INSTALL],
                            [ROLLBACK, RUN_ROLLBACK]] as const) {
    const a = readRaw(src)
    const b = readRaw(run)
    assert.equal(a.length, b.length, `${run} 길이가 다릅니다`)
    assert.ok(a.equals(b), `${run} 내용이 다릅니다`)
    assert.equal(sha256(src), sha256(run), `${run} 해시가 다릅니다`)
  }
})

test('파일럿 manifest 사본도 원본과 같다', () => {
  assert.ok(readRaw(MANIFEST).equals(readRaw('PILOT_TYPES_014.json')))
})

test('실행용 파일에 원장님이 바꿔 넣을 값이 없다 (§144)', () => {
  for (const f of [RUN_INSTALL, RUN_POST, RUN_ROLLBACK, 'POSTINSTALL_TO_RUN_016.sql']) {
    const s = read(f)
    for (const token of ['PUT-', 'PUT_', '<<', 'TODO:', 'FIXME',
                         'YOUR-', 'XXXX-XXXX', '여기에 입력', '여기 두 줄만 고치']) {
      assert.ok(!s.includes(token), `${f} 에 채워 넣을 자리(${token})가 남아 있습니다`)
    }
  }
})

// ════════════════════════════════════════════════════════════════════
// C) 설치 후 검증 SQL — 자동 선택 (D-112)
// ════════════════════════════════════════════════════════════════════

test('수동 UUID placeholder 가 0건이다', () => {
  const s = read(VERIFY)
  assert.equal((s.match(/PUT-/g) ?? []).length, 0)
  assert.ok(!s.includes('ADMIN-UUID-HERE'))
  assert.ok(!s.includes('STUDENT-UUID-HERE'))
})

test('관리자를 결정적으로 1건 자동 선택한다', () => {
  const code = exec(VERIFY)
  const blk = code.slice(code.indexOf('create temp table _twin_verify_cfg'),
                         code.indexOf('as student_uid_text'))
  assert.ok(blk.includes('from auth.users a'), 'auth.users 를 보지 않습니다')
  assert.ok(blk.includes('join public.users u on u.id = a.id'), 'public.users 와 연결하지 않습니다')
  assert.ok(blk.includes("where u.role = 'admin'"), "role='admin' 조건이 없습니다")
  assert.ok(blk.includes('order by a.id::text'), '정렬 기준이 없어 결정적이지 않습니다')
  assert.ok(blk.includes('limit 1'), '1건으로 좁히지 않습니다')
})

test('학생을 결정적으로 1건 자동 선택한다', () => {
  const code = exec(VERIFY)
  const blk = code.slice(code.indexOf('as admin_uid_text'),
                         code.indexOf('as student_uid_text'))
  assert.ok(blk.includes('from public.students s'))
  assert.ok(blk.includes('where s.session_uid is not null'))
  assert.ok(blk.includes('order by s.session_uid::text'), '정렬 기준이 없어 결정적이지 않습니다')
  assert.ok(blk.includes('limit 1'))
})

test('후보가 없으면 원인을 구분해 예외를 던진다 (§120)', () => {
  const code = exec(VERIFY)
  const cfg = code.slice(code.indexOf('do $cfg$'), code.indexOf('$cfg$;'))
  assert.ok(cfg.includes('if v_admin is null then'), '관리자 없음 분기가 없습니다')
  assert.ok(cfg.includes('if v_stu is null then'), '학생 없음 분기가 없습니다')
  // 두 분기가 각각 예외를 던지고, 메시지가 서로 달라야 원인을 알 수 있다
  const raises = cfg.match(/raise exception/g) ?? []
  assert.ok(raises.length >= 2, `예외가 ${raises.length}개뿐입니다`)
  const s = read(VERIFY)
  assert.ok(s.includes('관리자 계정을 찾지 못했습니다'))
  assert.ok(s.includes('session_uid 가 있는 학생을 찾지 못했습니다'))
})

test('선택한 uuid 를 결과표·notice·예외문에 출력하지 않는다 (§122)', () => {
  const code = exec(VERIFY)
  // raise 구문의 인자 목록에 uid 변수가 실리면 안 된다
  for (const m of code.matchAll(/raise\s+(?:notice|exception)[^;]*;/gi)) {
    const stmt = m[0]
    for (const v of ['v_admin', 'v_stu', 'admin_uid_text', 'student_uid_text']) {
      assert.ok(!stmt.includes(v), `출력문에 ${v} 가 실립니다: ${stmt.slice(0, 90)}`)
    }
  }
  // cfg 를 **결과표로** 내보내면 안 된다. 단 plpgsql 의 `select ... into 변수` 는
  // 결과표가 아니라 변수 대입이므로 제외한다.
  for (const m of code.matchAll(/select[^;]*_twin_verify_cfg[^;]*;/gi)) {
    assert.match(m[0], /\binto\b/i,
      `cfg 를 결과표로 내보냅니다: ${m[0].slice(0, 90)}`)
  }
})

test('begin 으로 시작하고 rollback 으로 끝나며 commit 이 없다 (§123)', () => {
  const code = exec(VERIFY)
  const stmts = code.split(NL).map(l => l.trim()).filter(l => l !== '')
  assert.equal(stmts[0], 'begin;', `첫 구문이 begin 이 아닙니다: ${stmts[0]}`)
  assert.equal(stmts[stmts.length - 1], 'rollback;',
    `마지막 구문이 rollback 이 아닙니다: ${stmts[stmts.length - 1]}`)
  // `on commit drop` 의 commit 은 트랜잭션 commit 이 아니다. 그것만 빼고 센다
  const withoutOnCommit = code.replace(/on\s+commit\s+drop/gi, ' ')
  assert.equal((withoutOnCommit.match(/\bcommit\b/gi) ?? []).length, 0,
    'commit 이 있습니다')
})

test('임시 객체가 트랜잭션 밖으로 남지 않는다 (§126)', () => {
  const code = exec(VERIFY)
  // 임시 테이블은 허용되지만 on commit drop 이어야 하고, 전체가 rollback 이라 어차피 사라진다
  assert.ok(code.includes('create temp table _twin_verify_cfg on commit drop'))
  // 운영 객체를 만드는 구문이 없어야 한다
  assert.ok(!/create\s+(?!temp\b)(table|function|schema|index|view)/i.test(code),
    '검증 SQL 이 운영 객체를 만듭니다')
})

test('설치 SQL 의 객체·권한·RLS 의미를 바꾸지 않았다 (§124)', () => {
  // 설치 SQL 은 이번 회차에 손대지 않았다. RPC 10개가 그대로 있는지만 확인한다
  const s = read(INSTALL)
  for (const n of ['admin_list_twin_candidates', 'admin_get_twin_candidate',
                   'admin_approve_twin_candidate', 'admin_reject_twin_candidate',
                   'admin_set_student_publish_approval', 'admin_set_practice_publication',
                   'server_create_twin_candidate', 'server_update_twin_validation',
                   'server_list_eligible_twin_types', 'server_get_twin_batch_state']) {
    assert.ok(s.includes(`create function public.${n}(`), `설치 SQL 에서 ${n} 가 사라졌습니다`)
  }
})

test('검증 항목이 그대로 남아 있다 (의미 보존)', () => {
  const s = read(VERIFY)
  for (const marker of ['[1]', '[2]', '[3-가]', '[3-나]', '[3-다]', '[3-라]', '[3-마]', '[3-바]',
                        '[4-1]', '[4-5]', '[4-6]', '[4-8]', '[4-11]', '[4-12]',
                        '[4-13]', '[4-14]', '[5-가]', '[5-나]', '[5-다]']) {
    assert.ok(s.includes(marker), `검증 항목 ${marker} 가 사라졌습니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// B) 파일럿 manifest 자동 검증 (§103)
// ════════════════════════════════════════════════════════════════════

type PilotType = {
  type_code: string
  grade: string
  chapter_title: string
  type_title: string
  usable_source_count: number
  usable_number_count: number
  usable_choice_count: number
  selection_reason: string
}

function manifest(): { types: PilotType[] } & Record<string, unknown> {
  return JSON.parse(read(MANIFEST)) as { types: PilotType[] } & Record<string, unknown>
}

test('manifest 가 유효한 JSON 이고 필수 필드를 모두 갖는다', () => {
  const m = manifest()
  assert.ok(Array.isArray(m.types))
  for (const t of m.types) {
    for (const f of ['type_code', 'grade', 'chapter_title', 'type_title',
                     'usable_source_count', 'usable_number_count',
                     'usable_choice_count', 'selection_reason']) {
      assert.ok(f in t, `${t.type_code} 에 ${f} 가 없습니다`)
    }
    assert.ok(t.selection_reason.trim().length > 10, `${t.type_code} 의 선정 이유가 비었습니다`)
  }
})

test('1. 총 10개다', () => {
  assert.equal(manifest().types.length, 10)
})

test('2. type_code 중복이 0개다', () => {
  const codes = manifest().types.map(t => t.type_code)
  assert.equal(new Set(codes).size, codes.length, `중복: ${codes.join(' ')}`)
})

test('3. 5개 단원에서 정확히 2개씩이다', () => {
  const byChapter = new Map<string, number>()
  for (const t of manifest().types) {
    byChapter.set(t.chapter_title, (byChapter.get(t.chapter_title) ?? 0) + 1)
  }
  assert.equal(byChapter.size, 5, `단원이 ${byChapter.size}개입니다`)
  for (const [ch, n] of byChapter) {
    assert.equal(n, 2, `${ch} 단원이 ${n}개입니다`)
  }
})

test('4. usable_source_count = number + choice 가 모든 항목에서 성립한다', () => {
  for (const t of manifest().types) {
    assert.equal(t.usable_source_count, t.usable_number_count + t.usable_choice_count,
      `${t.type_code}: ${t.usable_source_count} != ${t.usable_number_count} + ${t.usable_choice_count}`)
  }
})

test('5. 모든 항목의 유효 원문 수가 5개 이상이다', () => {
  for (const t of manifest().types) {
    assert.ok(t.usable_source_count >= 5, `${t.type_code}: ${t.usable_source_count}개`)
    // 파일럿은 유형당 원문 5개를 쓴다 (D-073). 정확히 5개면 여유가 없다는 뜻이라 같이 본다
    assert.ok(Number.isInteger(t.usable_source_count))
    assert.ok(t.usable_number_count >= 0 && t.usable_choice_count >= 0)
  }
})

test('6. 모든 grade 가 공통수학1 이다 (D-110)', () => {
  for (const t of manifest().types) {
    assert.equal(t.grade, '공통수학1', `${t.type_code} 의 grade 가 ${t.grade} 입니다`)
  }
})

test('manifest 가 파일럿 범위와 출처를 밝힌다', () => {
  const m = manifest()
  assert.equal(m.decision, 'D-111')
  assert.ok(String(m.scope_note).includes('공통수학1'), '범위 한정(D-110)이 없습니다')
  // 수치의 출처와 Claude 가 직접 확인하지 못했다는 사실을 남긴다
  assert.ok(String(m.origin_note).includes('PREFLIGHT_COUNTS_TO_RUN_012.sql'))
  assert.ok(String(m.origin_note).includes('직접 확인하지 못했다'))
  const plan = m.pilot_plan as Record<string, unknown>
  assert.equal(plan.types, 10)
  assert.equal(plan.sources_per_type, 5)
  assert.equal(plan.candidates_per_source, 2)
  assert.equal(plan.total_candidates, 100)
})

test('manifest 의 type_code 가 공통수학1 형식이다', () => {
  for (const t of manifest().types) {
    assert.match(t.type_code, /^공수1-\d{2}-\d{2}$/, `${t.type_code} 형식이 다릅니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 실행 안내문
// ════════════════════════════════════════════════════════════════════

test('runbook 이 지금은 실행 금지라고 맨 위에 적는다 (§139)', () => {
  const s = read('INSTALL_RUNBOOK_014.md')
  const head = s.slice(0, 400)
  assert.ok(head.includes('지금은 실행하지 마십시오'), '맨 위에 실행 금지 표시가 없습니다')
  assert.ok(s.includes('설치'), '설치 순서가 없습니다')
  assert.ok(s.includes('설치 후 검증'))
  assert.ok(s.includes('오류 전문'), '실패 시 오류 전문 전달 안내가 없습니다')
  assert.ok(s.includes('추가 SQL 을 임의로 실행하지'), '임의 실행 금지 안내가 없습니다')
  assert.ok(s.includes('GPT Work 가 명시적으로'), '롤백 조건 안내가 없습니다')
})

test('runbook 에 실제 uuid 가 없다 (§199)', () => {
  const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
  for (const f of ['INSTALL_RUNBOOK_014.md', MANIFEST, 'PILOT_TYPES_014.json']) {
    assert.ok(!uuid.test(read(f)), `${f} 에 uuid 형태 문자열이 있습니다`)
  }
})
