// 시험지 분석 — 화면과 서버가 같이 쓰는 규칙 모음.
// (파일명 규칙, 출처 열쇠 source_key, 한꺼번에 붙여넣기 해석)

export const SCHOOLS = ['도래울중', '지축중', '고양제일중', '원흥중', '신원중']
export const GRADES = ['중1', '중2', '중3']
export const EXAM_TYPES = ['중간고사', '기말고사']
export const FILE_KINDS = ['문제', '정답', '해설', '문제정답해설', '손풀이', '기타']
export const Q_TYPES = ['객관식', '단답형', '서술형']
export const MATCH_LEVELS = ['쌍둥이', '매우 유사', '유형 유사', '참고']
export const REVIEW_DIFFICULTIES = ['쉬움', '보통', '어려움', '매우 어려움']
export const CIRCLES = ['①', '②', '③', '④', '⑤']

// 선생님 체크리스트 (exam_papers.tasks 의 열쇠)
export const TASKS: { key: string; label: string }[] = [
  { key: 'upload', label: '시험지 업로드' },
  { key: 'answers', label: '정답 작업' },
  { key: 'discriminating', label: '변별문항 2~3개 선정' },
  { key: 'handsolve', label: '손풀이 이미지 업로드' },
  { key: 'review', label: '시험 총평 작성' },
  { key: 'needs_check', label: '윤T 확인 필요' },
  { key: 'done', label: '완료' },
]

export type PaperKey = {
  exam_year: number
  term: number
  exam_type: string
  school_name: string
  grade: string
}

// 2026_2학기중간   (파일명·출처 열쇠의 앞머리)
export function examPrefix(p: PaperKey) {
  return `${p.exam_year}_${p.term}학기${p.exam_type === '기말고사' ? '기말' : '중간'}`
}

// 문항번호 표기: '18' → '18번', '서술형2' 는 그대로
export function noLabel(no: string) {
  const s = String(no ?? '').trim().replace(/번$/, '')
  return /^\d+$/.test(s) ? `${s}번` : s
}

// 문항번호를 한 가지 모양으로: '18번' ' 18 ' → '18'
export function normNo(no: string) {
  return String(no ?? '').trim().replace(/\s+/g, '').replace(/번$/, '')
}

// 2026_2학기중간_도래울중_중3_18번
export function sourceKey(p: PaperKey, no: string) {
  return `${examPrefix(p)}_${p.school_name}_${p.grade}_${noLabel(normNo(no))}`
}

// 번호 순서: 숫자 문항 먼저, 서술형은 뒤로
export function sortOrderOf(no: string) {
  const s = normNo(no)
  const n = Number((s.match(/\d+/) ?? ['0'])[0])
  return /^\d+$/.test(s) ? n : 1000 + n
}

// 시험지 파일명: 2026_2학기중간_도래울중_중3_문제.pdf
export function expectedPaperFileName(p: PaperKey, kind: string) {
  return `${examPrefix(p)}_${p.school_name}_${p.grade}_${kind}.pdf`
}

// 파일명 규칙 검사. 맞으면 null, 틀리면 안내 문구를 돌려준다 (올리는 것 자체는 막지 않는다)
export function checkFileName(p: PaperKey, kind: string, fileName: string): string | null {
  const name = fileName.normalize('NFC')
  if (kind === '기타') return null
  if (kind === '손풀이') {
    // 학교명_학년_문항번호_손풀이_담당자명.png|jpg
    const m = name.match(/^(.+?)_(중[1-3])_(.+?)_손풀이_(.+)\.(png|jpe?g)$/i)
    if (!m) return `손풀이 파일명은 「${p.school_name}_${p.grade}_18번_손풀이_김T.png」 모양이어야 해요.`
    if (m[1] !== p.school_name || m[2] !== p.grade)
      return `파일명의 학교·학년(${m[1]} ${m[2]})이 이 시험(${p.school_name} ${p.grade})과 달라요.`
    return null
  }
  const want = expectedPaperFileName(p, kind)
  return name === want ? null : `파일명이 규칙과 달라요. 「${want}」 로 맞춰 주세요.`
}

// 손풀이 파일명에서 문항번호 뽑기: 도래울중_중3_18번_손풀이_김T.png → '18번'
export function handsolveLabel(fileName: string): string | null {
  const m = fileName.normalize('NFC').match(/^.+?_중[1-3]_(.+?)_손풀이_/)
  return m ? m[1] : null
}

// ───────────────────── 한꺼번에 붙여넣기 해석 ─────────────────────
// [문항 1]
// 유형: 객관식
// 단원: … / 세부단원: … / 난이도: …
// 문제: (여러 줄)
// 보기:
// ① … ⑤ …
// 정답: … / 해설: (여러 줄)
export type ParsedQuestion = {
  question_no: string
  q_type: string
  unit_name: string
  sub_unit_name: string
  difficulty: string | null
  level: number | null
  body: string
  choices: string[]
  answer: string
  solution: string
}

const FIELD: Record<string, string> = {
  유형: 'q_type', 문항유형: 'q_type', 단원: 'unit_name', 단원명: 'unit_name',
  세부단원: 'sub_unit_name', 세부단원명: 'sub_unit_name', 난이도: 'difficulty',
  문제: 'body', 본문: 'body', 보기: 'choices', 정답: 'answer', 해설: 'solution',
}

export function parseBulk(text: string): { questions: ParsedQuestion[]; warnings: string[] } {
  const warnings: string[] = []
  const questions: ParsedQuestion[] = []
  const blocks = text.replace(/\r/g, '').split(/^\s*\[\s*문항\s*([^\]]+?)\s*\]\s*$/m)
  // split 결과: [머리말, 번호1, 내용1, 번호2, 내용2 …]
  for (let i = 1; i < blocks.length; i += 2) {
    const no = normNo(blocks[i])
    const raw: Record<string, string[]> = {}
    let cur: string | null = null
    for (const line of (blocks[i + 1] ?? '').split('\n')) {
      const m = line.match(/^\s*([가-힣]+)\s*[:：]\s*(.*)$/)
      if (m && FIELD[m[1]]) {
        cur = FIELD[m[1]]
        raw[cur] = m[2].trim() ? [m[2].trim()] : []
      } else if (cur) {
        raw[cur].push(line)
      }
    }
    const join = (k: string) => (raw[k] ?? []).join('\n').trim()

    let qType = join('q_type')
    if (!Q_TYPES.includes(qType)) {
      if (qType) warnings.push(`문항 ${no}: 유형 「${qType}」 을 알 수 없어 객관식으로 넣었어요.`)
      qType = '객관식'
    }

    // 보기: ①~⑤ 로 시작하는 줄마다 하나
    const choices: string[] = []
    for (const line of raw.choices ?? []) {
      const t = line.trim()
      if (!t) continue
      const idx = CIRCLES.indexOf(t[0])
      if (idx >= 0) choices[idx] = t.slice(1).trim()
      else if (choices.length) choices[choices.length - 1] += '\n' + t
    }
    for (let k = 0; k < choices.length; k++) choices[k] = choices[k] ?? ''

    // 난이도: 하/중/상 이면 difficulty, 1~6 이면 level
    const d = join('difficulty')
    const difficulty = ['하', '중', '상'].includes(d) ? d : null
    const level = /^[1-6]$/.test(d) ? Number(d) : null
    if (d && !difficulty && !level)
      warnings.push(`문항 ${no}: 난이도 「${d}」 는 하·중·상 또는 1~6 으로 적어 주세요.`)

    const q: ParsedQuestion = {
      question_no: no, q_type: qType,
      unit_name: join('unit_name'), sub_unit_name: join('sub_unit_name'),
      difficulty, level, body: join('body'), choices,
      answer: join('answer'), solution: join('solution'),
    }
    if (!q.body) warnings.push(`문항 ${no}: 문제 본문이 비어 있어요.`)
    if (qType === '객관식' && choices.length !== 5)
      warnings.push(`문항 ${no}: 보기가 ${choices.length}개예요 (①~⑤ 5개여야 해요).`)
    if (questions.some((x) => x.question_no === no))
      warnings.push(`문항 ${no}: 같은 번호가 두 번 나와요. 뒤의 것으로 덮어써요.`)
    questions.push(q)
  }
  if (!questions.length) warnings.push('「[문항 1]」 같은 머리줄을 찾지 못했어요.')
  return { questions, warnings }
}

// 문제은행(problems)의 정답 칸으로 바꾸기.
//  객관식 → choice ('③' / '③, ⑤'), 숫자 하나 → number, 그 밖은 image(학생 자기채점)
export function bankAnswer(qType: string, answer: string | null): { kind: string; text: string | null } {
  const a = String(answer ?? '').trim()
  if (!a) return { kind: 'image', text: null }
  if (qType === '객관식') {
    const picks = Array.from(a)
      .map((c) => (CIRCLES.includes(c) ? c : /[1-5]/.test(c) ? CIRCLES[Number(c) - 1] : ''))
      .filter(Boolean)
    if (picks.length) return { kind: 'choice', text: Array.from(new Set(picks)).sort().join(', ') }
    return { kind: 'image', text: a }
  }
  if (qType === '단답형' && /^-?\d+(\.\d+)?$/.test(a.replace(/\s/g, '')))
    return { kind: 'number', text: a.replace(/\s/g, '') }
  return { kind: 'image', text: a }
}
