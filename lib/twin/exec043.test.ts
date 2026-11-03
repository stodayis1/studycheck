/**
 * GPT-EXEC-043 §3 — **실제 연결 코드**의 경계를 본다
 *
 * 무엇을 보나
 *   운영 provider·저장소를 **작성했다**는 것과 **동작한다**는 것은 다른 말이다.
 *   여기서는 돌릴 수 있는 것만 돌린다:
 *     · 운영 모드에서 **시연으로 자동 fallback 하지 않는가**
 *     · 설정이 없을 때 **조용히 넘어가지 않고 멈추는가**
 *     · 채점 규칙이 **기존 QR 경로와 같은가**
 *     · DDL 이 요구된 성질을 **글자로** 갖추고 있는가
 *
 * 하지 않는 것 (그대로 적는다)
 *   운영 Supabase·PostgreSQL 엔진을 **실행하지 않았다.**
 *   그래서 「운영에서 된다」를 주장하지 않는다. 할 수 있는 것은
 *   「시연으로 새지 않는다」와 「글자가 맞다」까지다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { choiceDigits, norm, autoGradable, gradeAnswer, whyNotGradable } from '../learning/grading'
import { FIRST_SET, NotConfiguredError } from '../learning/providers'

// 이 시험은 demo 를 **켜 둔 채** 시작한다. 운영 동작은 `asOperational()` 로 그때만 끈다
process.env.LEARNING_DEMO_MODE = '1'

const ROOT = resolve(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

/** demo 를 끈 채로 돌린다 */
async function asOperational<T>(fn: () => Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>
  const saved = env.LEARNING_DEMO_MODE
  try {
    delete env.LEARNING_DEMO_MODE
    return await fn()
  } finally {
    if (saved === undefined) delete env.LEARNING_DEMO_MODE
    else env.LEARNING_DEMO_MODE = saved
  }
}

/** 운영 설정을 비운 채로 돌린다 */
async function withoutConfig<T>(fn: () => Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>
  const u = env.NEXT_PUBLIC_SUPABASE_URL
  const k = env.SUPABASE_SERVICE_ROLE_KEY
  try {
    delete env.NEXT_PUBLIC_SUPABASE_URL
    delete env.SUPABASE_SERVICE_ROLE_KEY
    return await fn()
  } finally {
    if (u === undefined) delete env.NEXT_PUBLIC_SUPABASE_URL; else env.NEXT_PUBLIC_SUPABASE_URL = u
    if (k === undefined) delete env.SUPABASE_SERVICE_ROLE_KEY; else env.SUPABASE_SERVICE_ROLE_KEY = k
  }
}

// ════════════════════════════════════════════════════════════════════
// P. provider — 운영에서 시연으로 **새지 않는다** (043 §3-A)
// ════════════════════════════════════════════════════════════════════

test('P1 운영 모드는 **시연 카탈로그를 고르지 않는다**', async () => {
  const { contentProvider } = await import('../learning/providers')
  const inDemo = await contentProvider()
  assert.equal(inDemo.source, 'demo')

  await asOperational(async () => {
    const p = await contentProvider()
    assert.equal(p.source, 'supabase', '운영인데 시연 카탈로그를 골랐습니다')
  })
})

test('P2 운영 인증도 **시험 세션으로 돌아가지 않는다**', async () => {
  const { studentAuthProvider } = await import('../learning/providers')
  assert.equal((await studentAuthProvider()).source, 'demo')
  await asOperational(async () => {
    assert.equal((await studentAuthProvider()).source, 'supabase')
  })
})

test('P3 운영 설정이 없으면 **멈춘다** — 시연으로 메우지 않는다', async () => {
  const { contentProvider } = await import('../learning/providers')
  await asOperational(async () => {
    await withoutConfig(async () => {
      const p = await contentProvider()
      await assert.rejects(() => p.listTypes(), (e: Error) => {
        assert.ok(e instanceof NotConfiguredError, `다른 오류가 났습니다: ${e.message}`)
        assert.match(e.message, /시험 자료로 대신하지 않습니다/)
        return true
      })
    })
  })
})

test('P4 운영 인증은 설정이 없으면 `not_configured` — 통과시키지 않는다', async () => {
  const { studentAuthProvider } = await import('../learning/providers')
  await asOperational(async () => {
    await withoutConfig(async () => {
      const a = await studentAuthProvider()
      // HTTP 머리글은 ASCII 만 담는다. 한글을 넣으면 Request 가 만들어지지 않는다
      const req = new Request('http://x/', { headers: { authorization: 'Bearer dummy-token' } })
      const r = await a.resolve(req)
      assert.equal(r.deny, 'not_configured')
      assert.equal(r.student, null)
    })
  })
})

test('P5 첫 세트 범위가 **요청서와 같다**', () => {
  assert.deepEqual([...FIRST_SET.typeCodes], ['공수1-01-02', '공수1-01-07'])
  assert.equal(FIRST_SET.maxProblems, 10)
  assert.equal(FIRST_SET.maxProblemsPerType, 5)
  assert.equal(FIRST_SET.maxVideos, 3)
})

test('P6 운영 어댑터는 **시연 파일을 import 하지 않는다**', () => {
  for (const f of ['lib/learning/supabaseContent.ts', 'lib/learning/supabaseAuth.ts',
                   'lib/learning/supabaseStore.ts']) {
    const src = read(f)
    // **값**을 끌어오면 안 된다. `import type` 은 모양만 빌리는 것이라 괜찮다
    for (const line of src.split('\n')) {
      const t = line.trim()
      if (!t.startsWith('import ') || t.startsWith('import type ')) continue
      for (const bad of ['./demoContent', './demoAuth', './catalog']) {
        assert.ok(!t.includes(bad), `${f} 가 시연 자료를 값으로 끌어옵니다: ${t}`)
      }
    }
    // 시연 상수 이름이 본문에 나오면 안 된다
    for (const bad of ['PROBLEMS', 'ASSETS', 'PILOT_TYPES']) {
      assert.ok(!src.includes(bad), `${f} 가 시연 상수 ${bad} 를 씁니다`)
    }
  }
})

/** 주석을 뺀 **코드만** 본다 — 설명 글에 적힌 옛 경로가 걸리지 않게 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

test('P7 운영 어댑터는 **검수 없는 영상을 내보내지 않는다**', () => {
  // ⚠️ 045 §4 로 **승인 입력의 자리가 바뀌었다.** 전에는 조회 어댑터가 「유형이 겹치면
  //   관계를 만들고 검수 칸을 false 로 둔다」였다. 그러면 승인되지 않은 관계가 목록에
  //   생기고, 막아 주는 쪽(`disqualify`)에만 기댄다. 지금은 **관계 자체가 생기지 않는다.**
  //   그래서 아래 세 겹은 전보다 더 센 주장이다.

  // ① 조회 어댑터는 관계를 **만들지 않는다**
  const src = codeOnly(read('lib/learning/supabaseContent.ts'))
  const rel = src.slice(src.indexOf('async relationsFor('))
  assert.ok(/^\s*async relationsFor\([^)]*\)[^{]*\{\s*return \[\]\s*\}/m.test(rel.slice(0, 300)),
    '조회 어댑터가 아직 관계를 만들고 있습니다')
  assert.ok(!/relationReviewed/.test(src), '조회 어댑터가 검수 칸을 쓰고 있습니다')

  // ② 승인 명세가 **비어 있다** → 운영 관계는 0개다 (지금의 사실)
  const spec = JSON.parse(read('lib/learning/approvals/first-set.approval.json')) as {
    relations: unknown[]; problemRoles: unknown[]
  }
  assert.deepEqual(spec.relations, [],
    '승인 명세에 줄이 생겼습니다 — 사람이 검수한 것인지 확인하고 이 시험을 고치세요')

  // ③ 명세를 옮기는 함수가 검수를 **스스로 통과시키지 않는다**
  //   (자료형 선언 `verdict: 'safe' | 'reveals' | ...` 는 값 대입이 아니므로 가른다)
  const ap = codeOnly(read('lib/learning/approval.ts'))
  assert.ok(!/relationReviewed: true/.test(ap))
  assert.ok(!/assetReviewed: true/.test(ap))
  // 값 대입(`verdict: 'safe',`)만 본다. 자료형 선언(`verdict: 'safe' | ...`)은 대입이 아니다
  assert.ok(!/verdict:\s*'safe'\s*,/.test(ap), '코드가 노출 검수를 safe 로 만들고 있습니다')
})

// ════════════════════════════════════════════════════════════════════
// G. 채점 — **기존 QR 경로와 같은 규칙** (043 §3-A)
// ════════════════════════════════════════════════════════════════════

test('G1 객관식은 동그라미를 숫자 집합으로 견준다', () => {
  assert.deepEqual(choiceDigits('③'), ['3'])
  assert.deepEqual(choiceDigits('③, ⑤'), ['3', '5'])
  assert.deepEqual(choiceDigits(null), [])
  const p = { answerKind: 'choice' as const, answerText: '③', isEssay: false }
  assert.equal(gradeAnswer(p, '③'), 'correct')
  assert.equal(gradeAnswer(p, '3'), 'correct')
  assert.equal(gradeAnswer(p, '④'), 'wrong')
  assert.equal(gradeAnswer(p, ''), 'wrong')
  // 복수정답은 **집합**으로 본다. 순서가 달라도 같다
  const multi = { answerKind: 'choice' as const, answerText: '③⑤', isEssay: false }
  assert.equal(gradeAnswer(multi, '⑤③'), 'correct')
  assert.equal(gradeAnswer(multi, '③'), 'wrong')
})

test('G2 숫자형은 공백·쉼표만 지우고 견준다 — 원본 `norm` 그대로', () => {
  assert.equal(norm(' 1, 2 '), '12')
  const p = { answerKind: 'number' as const, answerText: '14', isEssay: false }
  assert.equal(gradeAnswer(p, ' 14 '), 'correct')
  assert.equal(gradeAnswer(p, '15'), 'wrong')
})

test('G3 **자동 채점할 수 없는 것**은 첫 세트에 넣지 않는다', () => {
  const cases: Array<[Parameters<typeof autoGradable>[0], RegExp]> = [
    [{ answerKind: 'number', answerText: '1', isEssay: true }, /서술형/],
    [{ answerKind: 'image', answerText: '1', isEssay: false }, /정답이 그림/],
    [{ answerKind: 'number', answerText: null, isEssay: false }, /정답 글자가 없어/],
    [{ answerKind: 'choice', answerText: '보기 없음', isEssay: false }, /보기 번호를 읽을 수 없어/],
  ]
  for (const [p, why] of cases) {
    assert.equal(autoGradable(p), false, `${JSON.stringify(p)} 를 채점 가능이라 했습니다`)
    assert.match(String(whyNotGradable(p)), why)
    // 「할 수 없다」와 「틀렸다」는 다른 말이다
    assert.equal(gradeAnswer(p, '아무거나'), null)
  }
})

test('G4 채점 규칙이 **기존 QR 경로 원문과 같다**', () => {
  const qrPage = read('app/grade/[code]/page.tsx')
  const qrRoute = read('app/api/grade/[code]/route.ts')
  // 같은 정규화·같은 동그라미표
  assert.ok(qrPage.includes("s.replace(/[\\s,]/g, '').trim()"), 'QR 쪽 norm 이 바뀌었습니다')
  assert.ok(qrRoute.includes("const CIRCLE = '①②③④⑤'"), 'QR 쪽 동그라미표가 바뀌었습니다')
  assert.equal(norm(' 1, 2 '), ' 1, 2 '.replace(/[\s,]/g, '').trim())
})

// ════════════════════════════════════════════════════════════════════
// D. DDL 초안이 **요구된 성질을 갖추고 있는가** (043 §3-C)
//    글자 검사다. PostgreSQL 엔진으로 돌려 보지 **않았다**
// ════════════════════════════════════════════════════════════════════

const DDL = 'docs/sql/migrations/043_learning_actions.sql'

test('D1 UNIQUE 와 **「충돌도 둘 다 보존」이 양립**한다', () => {
  const sql = read(DDL)
  // 유일키를 canonical 줄에만 건다
  assert.match(sql, /create unique index[\s\S]*?learning_actions \(student_id, producer, action_id\)[\s\S]*?where is_canonical/)
  // 충돌 줄은 is_canonical=false 로 들어간다 → 유일키에 안 걸린다
  assert.match(sql, /p_producer, false,\s*--.*유일키에 안 걸린다/)
  assert.match(sql, /'conflict'/)
})

test('D2 **학생에게 insert 정책을 주지 않는다**', () => {
  const sql = read(DDL)
  assert.ok(!/create policy \w+ on public\.learning_(actions|attempts) for insert/.test(sql),
    '학생이 직접 넣을 수 있는 정책이 있습니다')
  assert.match(sql, /학생 own_insert 정책이 임의 채점결과 주입 통로가 되지 않게/)
  // 쓰기는 SECURITY DEFINER 함수로만
  assert.match(sql, /security definer/)
})

test('D3 `is_staff()` 를 **감싼다** — 행마다 돌지 않게', () => {
  const sql = read(DDL)
  // `(select public.is_staff())` 가 아닌 **날것**만 센다
  const all = (sql.match(/public\.is_staff\(\)/g) ?? []).length
  const wrapped = (sql.match(/\(select public\.is_staff\(\)\)/g) ?? []).length
  assert.ok(all > 0, 'is_staff() 를 쓰지 않습니다')
  assert.equal(all, wrapped, `감싸지 않은 is_staff() 가 ${all - wrapped}곳 있습니다`)
})

test('D4 기존 운영 표를 **고치지 않는다**', () => {
  const sql = read(DDL)
  const protectedTables = ['gradings', 'grading_answers', 'video_watch_logs',
                           'learning_notes', 'lesson_videos', 'problems', 'standard_types',
                           'type_learning_assets', 'students']
  for (const t of protectedTables) {
    assert.ok(!new RegExp(`alter table public\\.${t}\\b`).test(sql), `${t} 를 고칩니다`)
    assert.ok(!new RegExp(`drop (table|policy)[^;]*public\\.${t}\\b`).test(sql), `${t} 를 지웁니다`)
    assert.ok(!new RegExp(`(insert into|update) public\\.${t}\\b`).test(sql), `${t} 에 씁니다`)
  }
  // 참조는 해도 된다
  assert.match(sql, /references public\.students\(id\)/)
  assert.match(sql, /references public\.problems\(id\)/)
})

test('D5 되돌리기가 **범위를 좁힌다** — DROP·전체삭제를 기본으로 쓰지 않는다', () => {
  const sql = read('docs/sql/migrations/043_learning_actions_rollback.sql')
  // 모든 실행문이 주석 처리돼 있다 (초안이므로)
  for (const line of sql.split('\n')) {
    const t = line.trim()
    if (t === '' || t.startsWith('--')) continue
    assert.fail(`초안인데 실행되는 줄이 있습니다: ${t}`)
  }
  assert.match(sql, /1단계 — 멈추기만 한다/)
  assert.match(sql, /run_id = :'run_id'/)
  assert.match(sql, /기본안이 아니다/)
  // 범위 없는 전체 삭제를 제시하지 않는다
  assert.ok(!/delete from public\.learning_actions;\s*$/m.test(sql))
  assert.ok(!/where is_test\s*;/.test(sql), '전체 is_test 삭제를 제시합니다')
})

test('D6 시험 자료는 **run_id 로 가른다**', () => {
  const sql = read(DDL)
  assert.match(sql, /run_id\s+text not null/)
  assert.match(sql, /unique \(student_id, problem_id, run_id\)/)
  const store = read('lib/learning/supabaseStore.ts')
  assert.match(store, /p_run_id: this\.opts\.runId/)
})

test('D7 저장 어댑터는 **RPC 한 번**으로 확정한다 — 순차 write 가 아니다', () => {
  const src = read('lib/learning/supabaseStore.ts')
  // 045 에서 client 를 `learningClient()` 한 곳으로 모아 수신자 이름이 바뀌었다.
  // 주장은 그대로다 — **RPC 한 번**이다
  assert.match(src, /\.rpc\('apply_learning_action'/)
  // applyAction 안에서 insert/update 를 따로 부르지 않는다
  const body = src.slice(src.indexOf('async applyAction'), src.indexOf('async loadAttempt'))
  assert.ok(!/\.insert\(|\.update\(|\.upsert\(/.test(body),
    'applyAction 이 SDK write 를 따로 부릅니다 (트랜잭션이 아닙니다)')
})

test('D8 상태는 **행동 목록에서 다시 세운다** — 상태 칸을 읽지 않는다', () => {
  const src = read('lib/learning/supabaseStore.ts')
  assert.match(src, /is_canonical', true/)
  assert.match(src, /emptyAttempt\(/)
  // first_result 같은 상태 칸을 만들지 않았다
  const ddl = read(DDL)
  for (const bad of ['first_result', 'retry_result', 'last_result', 'stuck_axis ']) {
    assert.ok(!ddl.includes(bad), `상태 칸 ${bad} 를 만들었습니다 (042 §3-A 로 없앤 것)`)
  }
})
