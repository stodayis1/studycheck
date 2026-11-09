/**
 * 시험지 파일명에서 「어느 시험인지」 짐작하는 규칙(lib/examAnalysis.ts guessExamFile)을 시험한다.
 *
 * 왜 필요한가
 *   짐작한 값은 올리기 창의 칸에 **미리 채워져** 있고, 사람은 빨간 칸(못 읽은 곳)만 본다.
 *   그래서 **그럴듯하게 틀린 값**은 아무도 안 보고 그대로 올라간다 — 에러도 안 난다.
 *   2026-11-09 에 「2025년고양중…」 파일이 학교 「년고양중」으로 저장됐다(원장님 「제목이 이상하게 잡혀싸」).
 *   학교 이름이 갈라지면 시험대비·적중 대조가 영원히 안 걸리므로(AGENTS.md 5번) 값을 하나하나 대조한다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/exam-file-guess-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/exam-file-guess-check.ts <다른 examAnalysis.ts 경로>
 *     ↑ 일부러 틀리게 고친 사본을 넣으면 **실패해야** 한다.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/examAnalysis.ts')
const { guessExamFile, renameForPaper, defaultExamName, examSheetTitle, sourceKey } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) }
  else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

type Want = { exam_year?: number | null; term?: number | null; exam_type?: string; school_name?: string; grade?: string; kind?: string }
function 짐작(name: string, want: Want) {
  T(name, () => {
    const g = guessExamFile(name)
    for (const [k, v] of Object.entries(want)) {
      if (g[k] !== v) throw new Error(`${k}: 「${g[k]}」 (바란 값 「${v}」)`)
    }
    return true
  })
}

// ── 연도가 학교 이름에 붙은 꼴 — 이번에 사고가 난 자리 ──────────────────────────
짐작('2025년고양중 중1 2학기 기말고사.pdf', { exam_year: 2025, term: 2, exam_type: '기말고사', school_name: '고양중', grade: '중1' })
짐작('2025년고양중1-2기말.pdf', { exam_year: 2025, term: 2, exam_type: '기말고사', school_name: '고양중', grade: '중1' })
짐작('2025년도래울중3-2중간.pdf', { exam_year: 2025, term: 2, exam_type: '중간고사', school_name: '도래울중', grade: '중3' })
짐작('26년신원고 고1 1학기 중간.pdf', { exam_year: 2026, term: 1, exam_type: '중간고사', school_name: '신원고', grade: '고1' })
짐작('2026년 11월 원흥중2 기말.pdf', { exam_year: 2026, school_name: '원흥중', grade: '중2' })

// 학교를 못 읽으면 **비워** 둔다 (빨간 칸으로 떠서 사람이 고른다). 학년은 그래도 읽는다.
짐작('2025년중1 기말.pdf', { school_name: '', grade: '중1', exam_year: 2025, exam_type: '기말고사' })

// ── 원래 되던 것이 그대로 되는가 (고치면서 망가뜨리지 않았는지) ────────────────
짐작('2026_1학기기말_신원중_중2_(답안입력완료).pdf', { exam_year: 2026, term: 1, exam_type: '기말고사', school_name: '신원중', grade: '중2', kind: '문제' })
짐작('26년 도래울중3-1 중간.pdf', { exam_year: 2026, term: 1, exam_type: '중간고사', school_name: '도래울중', grade: '중3' })
짐작('2026년 1학기 기말_원흥중2_원본.pdf', { exam_year: 2026, term: 1, exam_type: '기말고사', school_name: '원흥중', grade: '중2', kind: '원본' })
짐작('2025_2학기중간_고양일고_고1_문제.pdf', { exam_year: 2025, term: 2, exam_type: '중간고사', school_name: '고양일고', grade: '고1', kind: '문제' })
짐작('2025_2학기기말_고양중_중1_원본.hwp', { school_name: '고양중', grade: '중1', kind: '원본' })
짐작('고양제일중_중3_필기삭제.pdf', { school_name: '고양제일중', grade: '중3', kind: '원본' })
짐작('2026_2학기중간_신원고_고1_문제정답해설.pdf', { school_name: '신원고', grade: '고1', kind: '문제정답해설' })
짐작('2026_2학기중간_신원고_고1_해설.pdf', { kind: '해설' })
짐작('2026_2학기중간_신원고_고1_정답.pdf', { kind: '정답' })

// ── 시험 정보 바로잡기(원장님 전용)가 딸린 것까지 같이 고치는가 ──────────────────
//    학교 이름이 틀린 채 올라간 것을 고칠 때, 파일 이름 · 출처 열쇠 · 인쇄 제목이 같이 안 바뀌면
//    목록에는 「고양중」, 내려받는 파일은 「년고양중」이 되어 더 헷갈린다.
const 틀린것 = { exam_year: 2025, term: 2, exam_type: '기말고사', school_name: '년고양중', grade: '중1' }
const 바른것 = { exam_year: 2025, term: 2, exam_type: '기말고사', school_name: '고양중', grade: '중1' }

T('시험지 파일 이름이 따라 바뀐다', () =>
  renameForPaper(틀린것, 바른것, '2025_2학기기말_년고양중_중1_원본.pdf') === '2025_2학기기말_고양중_중1_원본.pdf')
T('손풀이 파일 이름도 따라 바뀐다', () =>
  renameForPaper(틀린것, 바른것, '년고양중_중1_18번_손풀이_김T.png') === '고양중_중1_18번_손풀이_김T.png')
T('학년 · 연도까지 바꾸면 파일 이름도 다 바뀐다', () =>
  renameForPaper(바른것, { ...바른것, exam_year: 2026, grade: '중2', term: 1, exam_type: '중간고사' },
    '2025_2학기기말_고양중_중1_문제.pdf') === '2026_1학기중간_고양중_중2_문제.pdf')
T('규칙과 다른 이름은 **그대로 둔다** (지어내지 않는다)', () =>
  renameForPaper(틀린것, 바른것, '아무렇게나 지은 이름.pdf') === '아무렇게나 지은 이름.pdf')
T('문항 출처 열쇠가 새 학교 이름으로 지어진다', () =>
  sourceKey(바른것, '18') === '2025_2학기기말_고양중_중1_18번')
T('시험명 · 인쇄 학습지 제목', () =>
  defaultExamName(바른것) === '2025 2학기 기말고사' && examSheetTitle(바른것) === '25년 고양중 2학기 기말고사')

console.log(`\n통과 ${pass} / 전체 ${total}`)
if (pass !== total) process.exit(1)
