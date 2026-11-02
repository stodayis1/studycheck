/**
 * 브리핑 **선생님 알림장 칸**이 제대로 채워지는지 시험한다.
 *
 * 왜 필요한가 (2026-11-02)
 *   알림장 글을 **통째로** 진도와 견주고 있었다. 앞 30자만 겹쳐도 같은 글로 보기 때문에,
 *   「진도와 같은 줄 + 그 뒤에 덧붙인 줄」인 알림장이 통째로 사라졌다. 그날 기출유사
 *   결과를 메모 끝에 붙여 내보냈는데, 진도를 그대로 적어 두신 학생 셋은 알림장 칸이 비어
 *   「알림장 없는 판」으로 나갔다 — 점수 줄이 통째로 날아갔고 **에러는 하나도 안 났다.**
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-notice-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-notice-check.ts <다른 briefing.ts>
 *     ↑ 일부러 옛 코드로 되돌린 사본을 넣으면 **실패해야** 한다.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/briefing.ts')
const { buildBriefing } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

const 진도 = '1교시 고등부 <다항식의 연산> 판서 수업\n2교시 이너프원 오답 첨삭'
const 기출1 = '2024 ○○중 기출유사 24문항 중 3개 틀렸습니다.'
const 기출2 = '중3 △△중 기출유사 23문항 중 2개 틀렸습니다.'

/** 알림장 칸만 꺼내 본다 (실명은 쓰지 않는다 — 가짜 이름) */
function 알림장(memo: string | null, opts: { progress?: string; feedback?: string } = {}): string[] {
  const b = buildBriefing({
    studentName: '홍길동', studentGrade: '중3',
    session: { session_date: '2026-11-02', progress_content: opts.progress ?? 진도, hw_worksheet_range: '시험대비', video_url: null, daily_test_score: null },
    note: { attendance: '정시', memo, worksheet_score: 90, hw_done_rate: 100 },
    feedbacks: opts.feedback ? [{ content: opts.feedback, student_id: 'x' }] : [],
    videos: { total: 0, proof: 0 }, worksheets: [], makeup: null,
    useV2: true, useV3: false, noNoteTemplate: false, noNoteTemplateV3: false,
  })
  const m = String(b.body).match(/▶ 선생님 알림장\n([\s\S]*?)(?:\n\n|$)/)
  return m ? m[1].split('\n').map((x) => x.trim()).filter(Boolean) : []
}

// ★ 이것이 2026-11-02 에 실제로 난 일이다.
T('진도와 같은 줄 뒤에 붙인 줄은 살아남는다 (기출유사 점수)', () => {
  const got = 알림장(`${진도}\n${기출1}\n${기출2}`)
  return got.length === 2 && got[0] === 기출1 && got[1] === 기출2
})

// 알림장이 비면 「알림장 있는 판」에서는 한 줄을 채운다(머리글만 덩그러니 남지 않게).
//   알림장 없는 판으로 나갈지는 발송 쪽이 정한다.
const 빈줄 = '오늘은 따로 남긴 말씀이 없어요.'

T('진도와 똑같기만 한 알림장은 비운다 (같은 글을 두 번 읽히지 않는다)', () =>
  알림장(진도).join('') === 빈줄 && 알림장('1교시 고등부 <다항식의 연산> 판서 수업').join('') === 빈줄)

T('진도의 **두 번째 줄**과 같은 줄도 뺀다', () =>
  알림장(`2교시 이너프원 오답 첨삭\n${기출1}`).length === 1)

T('진도와 겹치지 않는 알림장은 그대로 다 남는다', () => {
  const got = 알림장(`${기출1}\n${기출2}`)
  return got.length === 2
})

T('피드백과 알림장에 같은 글이 있으면 한 번만 나간다', () =>
  알림장(기출1, { feedback: 기출1 }).length === 1)

T('알림장이 없으면 빈 줄 하나만 채운다', () =>
  알림장(null).join('') === 빈줄 && 알림장('   ').join('') === 빈줄)

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
