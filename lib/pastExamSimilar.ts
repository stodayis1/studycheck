/**
 * 내신대비 보강에서 푸는 **학교 기출유사 모의고사** 결과를 읽는다.
 *
 * 왜 이 꼴인가 (원장님 2026-10-31)
 *   「내신대비 보강에 우리가 기출문제를 모의고사로 풀리거든 … 이런식으로 담당 선생님이
 *   기록해주셔」. 담당 선생님이 **틀린 개수로 묶어서** 적어 주신다 — 점수가 아니다.
 *
 *     [2024 백마중학교 기출유사 총 24문항]
 *
 *     김윤아 -0
 *     신성우 박서준 노우석 -1
 *     류연서 김민희 -3
 *
 *   한 줄에 여러 사람이 오고, 줄 끝의 「-N」이 **그 줄 사람들 전부의 틀린 개수**다.
 *
 * ★ 학교 이름은 **문제지의 출처**다. 그 학교 학생이라는 뜻이 아니다 — 2026-10-24 백마중
 *   기출유사를 푼 17명은 전원 **신원중** 중3이었다. 그래서 학생의 school 과 맞춰 보지 않는다.
 *
 * ★ 순수 함수다(DB·시계를 안 만진다). 시험은 scripts/past-exam-check.ts 에 있다.
 */

/**
 * 머리줄 「[2024 백마중학교 기출유사 총 24문항]」.
 *
 * ★ 대괄호는 **있을 수도 없을 수도 있다.** 2026-10-24 자는 대괄호가 있었고
 *   2026-10-31 자는 「중3 지축중학교 기출유사 총 23문항」처럼 없었다. 선생님마다·날마다
 *   다르므로 **괄호로 가르지 않는다** — 「총 N문항」이 적혀 있고 줄 끝에 「-개수」가 없으면
 *   머리줄이다(사람 줄은 반드시 「-개수」로 끝난다).
 */
const HEAD = /^\[\s*(.+?)\s*\]$/
/** 「총 24문항」 — 머리줄에서 문항 수를 떼어낸다. 「총24문항」·「24문항」도 받는다. */
const TOTAL = /\s*총?\s*(\d{1,3})\s*문항\s*/
/**
 * 사람 줄 「김윤아 신성우 -1」. 꼬리의 빼기표는 하이픈·엔대시·엠대시를 다 받는다
 * (선생님이 붙여넣는 글에 섞여 들어온다). 줄 끝 공백도 받는다 — 실제로 들어왔다.
 */
const ROW = /^(.+?)\s*[-–—]\s*(\d{1,3})\s*$/

/** 「백마중학교」 → 「백마중」. 제목이 학교마다 같은 꼴로 모이게 한다. */
function shortSchool(s: string) {
  return s
    .replace(/초등학교/g, '초')
    .replace(/중학교/g, '중')
    .replace(/고등학교/g, '고')
}

export interface PastExamRow {
  /** 선생님이 적으신 이름 그대로. 「김서율j」처럼 동명이인 꼬리가 붙어 있을 수 있다 */
  name: string
  /** 틀린 개수 */
  wrong: number
  /** 몇 번째 줄에서 왔나 (화면에서 짚어 주려고 들고 다닌다) */
  line: number
}

export interface PastExamBlock {
  /** 「2024 백마중 기출유사」 — 문항 수를 뗀 제목 */
  title: string
  /** 총 문항 수 */
  total: number
  rows: PastExamRow[]
  line: number
}

export interface ParsePastExamResult {
  blocks: PastExamBlock[]
  /** 읽지 못한 줄. **조용히 버리지 않는다** — 그대로 띄워 사람이 본다 */
  skipped: { line: number; text: string; why: string }[]
}

export function parsePastExamSimilar(text: string): ParsePastExamResult {
  const blocks: PastExamBlock[] = []
  const skipped: ParsePastExamResult['skipped'] = []
  let cur: PastExamBlock | null = null

  const lines = String(text ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1
    const t = lines[i].trim()
    if (!t) continue

    const bracket = HEAD.exec(t)
    // 괄호가 없어도 「총 N문항」이 있고 사람 줄이 아니면 머리줄로 본다.
    const looksHead = !!bracket || (TOTAL.test(t) && !ROW.test(t))
    if (looksHead) {
      const inside = bracket ? bracket[1] : t
      const m = TOTAL.exec(inside)
      if (!m) {
        skipped.push({ line, text: t, why: '총 몇 문항인지 안 적혀 있어요 (예: 2024 ○○중 기출유사 총 24문항)' })
        cur = null
        continue
      }
      const title = shortSchool((inside.slice(0, m.index) + inside.slice(m.index + m[0].length)).trim())
        .replace(/\s+/g, ' ')
      if (!title) {
        skipped.push({ line, text: t, why: '시험 이름이 없어요' })
        cur = null
        continue
      }
      cur = { title, total: Number(m[1]), rows: [], line }
      blocks.push(cur)
      continue
    }

    const row = ROW.exec(t)
    if (!row) {
      skipped.push({ line, text: t, why: '줄 끝에 「-틀린개수」가 없어요' })
      continue
    }
    if (!cur) {
      skipped.push({ line, text: t, why: '위에 「[… 총 N문항]」 머리줄이 없어요' })
      continue
    }
    const wrong = Number(row[2])
    if (wrong > cur.total) {
      skipped.push({ line, text: t, why: `틀린 개수(${wrong})가 총 문항(${cur.total})보다 많아요` })
      continue
    }
    const names = row[1].split(/[\s,·]+/).map((s) => s.trim()).filter(Boolean)
    if (!names.length) {
      skipped.push({ line, text: t, why: '이름이 없어요' })
      continue
    }
    for (const name of names) cur.rows.push({ name, wrong, line })
  }

  // 사람이 한 명도 없는 머리줄은 들고 다니지 않는다 — 붙여넣다 끊긴 것이다.
  for (const b of blocks.filter((b) => b.rows.length === 0)) {
    skipped.push({ line: b.line, text: `[${b.title} 총 ${b.total}문항]`, why: '이 시험에 적힌 사람이 없어요' })
  }
  return { blocks: blocks.filter((b) => b.rows.length > 0), skipped }
}

/** 평가관리에 넣을 값. 틀린 개수를 **맞은 개수**로 바꿔 넣는다(화면이 맞은/총으로 퍼센트를 낸다). */
export function examRowFor(block: PastExamBlock, row: PastExamRow) {
  return {
    // ★ exams.exam_type 에는 CHECK 제약이 있다 — 입학테스트·진단평가·코어테스트·학교시험뿐.
    //   기출유사는 성격이 「주간 개별 진단」이라 진단평가에 넣고, 구별은 title 로 한다
    //   (원장님 「단원평가는 진단평가로」와 같은 결).
    exam_type: '진단평가' as const,
    title: block.title,
    score: block.total - row.wrong,
    total_score: block.total,
    memo: `기출유사 · ${block.total}문항 중 ${row.wrong}개 틀림`,
  }
}

/** 학습일지 메모에 붙일 한 줄. */
export function memoLineFor(block: PastExamBlock, row: PastExamRow) {
  return `${block.title} ${block.total}문항 중 ${row.wrong}개 틀렸습니다.`
}
