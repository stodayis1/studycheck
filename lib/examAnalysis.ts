// 시험지 분석 — 화면과 서버가 같이 쓰는 규칙 모음.
// (파일명 규칙, 출처 열쇠 source_key, 한꺼번에 붙여넣기 해석)

export const SCHOOLS = ['도래울중', '지축중', '고양제일중', '원흥중', '신원중']
export const GRADES = ['중1', '중2', '중3']
export const EXAM_TYPES = ['중간고사', '기말고사']
// '원본' = 학교에서 받은 시험지 원본·한글(HWP) 작업 원본. 원장만 열어 볼 수 있다 (서버가 걸러 준다)
export const FILE_KINDS = ['문제', '정답', '해설', '문제정답해설', '손풀이', '원본', '기타']
export const ORIGINAL_EXT = /\.(pdf|hwp|hwpx|png|jpe?g)$/i
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
  if (kind === '원본') {
    // 2026_2학기중간_도래울중_중3_원본.hwp  (뒤에 _2 같은 꼬리는 괜찮다)
    const head = `${examPrefix(p)}_${p.school_name}_${p.grade}_원본`
    return name.startsWith(head) && ORIGINAL_EXT.test(name)
      ? null
      : `원본 파일명은 「${head}.hwp」 (또는 .pdf · .jpg) 모양이어야 해요.`
  }
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

// 파일명 끝으로 구분을 알아낸다: …_문제.pdf → 문제, …_원본.hwp → 원본, …_손풀이_김T.png → 손풀이
export function kindOfFile(fileName: string) {
  const n = fileName.normalize('NFC')
  if (n.includes('_손풀이_')) return '손풀이'
  if (/_원본[^_]*\.[a-z]+$/i.test(n) || /_원본_/.test(n)) return '원본'
  const m = n.match(/_(문제정답해설|문제|정답|해설)\.pdf$/i)
  return m ? m[1] : '기타'
}

// 규칙대로 지은 파일명에서 어느 시험인지 읽는다 (지난 기출을 한꺼번에 올릴 때 쓴다)
//   2025_1학기기말_신원중_중2_문제.pdf → { 2025, 1, 기말고사, 신원중, 중2 }
export function parseExamFileName(fileName: string): PaperKey | null {
  const m = fileName.normalize('NFC').match(/^(\d{4})_([12])학기(중간|기말)_(.+?)_(중[1-3]|고[1-3])_/)
  if (!m) return null
  return {
    exam_year: Number(m[1]), term: Number(m[2]),
    exam_type: m[3] === '기말' ? '기말고사' : '중간고사',
    school_name: m[4], grade: m[5],
  }
}

// 아무렇게나 지은 파일명에서 어느 시험인지 **짐작**한다 (지난 기출을 올릴 때 칸을 미리 채워 주려고).
// 못 알아낸 칸은 비워 둔다 — 화면에서 사람이 고른다.
//   2026_1학기기말_신원중_중2_(답안입력완료).pdf · 26년 도래울중3-1 중간.pdf · 2026년 1학기 기말_원흥중2_원본.pdf
export type ExamGuess = { exam_year: number | null; term: number | null; exam_type: string; school_name: string; grade: string; kind: string }
export function guessExamFile(fileName: string): ExamGuess {
  const n = fileName.normalize('NFC').replace(/\.[a-z0-9]+$/i, '')
  const ext = (fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()
  const y4 = n.match(/(20\d{2})/)
  const y2 = n.match(/(?:^|[^\d])(\d{2})년/)
  const exam_year = y4 ? Number(y4[1]) : y2 ? 2000 + Number(y2[1]) : null
  // 학기: 「1학기」 또는 「중3-1」「2-1」의 뒤 숫자
  const t1 = n.match(/([12])\s?학기/)
  const t2 = n.match(/[1-3]\s?-\s?([12])(?!\d)/)
  const term = t1 ? Number(t1[1]) : t2 ? Number(t2[1]) : null
  const exam_type = /기말/.test(n) ? '기말고사' : /중간/.test(n) ? '중간고사' : ''
  // 학교: 「…중」「…고」로 끝나는 낱말. 「도래울_중3」처럼 중·고가 빠진 것도 받는다
  let school_name = ''
  let level = ''
  const s1 = Array.from(n.matchAll(/([가-힣]{2,6}(중|고))(?=\s?[1-3]|[_\s(.-]|$)/g)).find((m) => !/학기중|기중$/.test(m[1]))
  const s2 = n.match(/([가-힣]{2,6})_(중|고)[1-3]/)
  if (s1) { school_name = s1[1]; level = s1[2] }
  else if (s2) { school_name = s2[1] + s2[2]; level = s2[2] }
  // 학년: 「중3」「원흥중2」「도래울중 2-1」「_중2」
  let grade = ''
  const g1 = n.match(/(중|고)\s?([1-3])(?!\s?학기)(?!\d)/)
  const g2 = school_name ? n.slice(n.indexOf(school_name) + school_name.length).match(/^[\s_]*(?:(중|고))?\s?([1-3])(?!\s?학기)/) : null
  if (g2) grade = `${g2[1] ?? level ?? '중'}${g2[2]}`
  else if (g1) grade = `${g1[1]}${g1[2]}`
  // 종류: 한글 파일 · 「원본」 · 「필기삭제」(스캔본) 은 원본 보관, 나머지 PDF 는 작업한 문제지
  const kind = /원본|필기삭제|스캔/.test(n) || ext === 'hwp' || ext === 'hwpx' || ext === 'png' || ext === 'jpg' || ext === 'jpeg'
    ? '원본'
    : /문제정답해설/.test(n) ? '문제정답해설' : /해설/.test(n) ? '해설' : /정답(?!입력)/.test(n) && !/답안입력/.test(n) ? '정답' : '문제'
  return { exam_year, term, exam_type, school_name, grade, kind }
}

// 보관할 때 붙이는 표준 파일명. 올리는 사람이 이름을 맞출 필요가 없게 앱이 붙인다.
//   2026_1학기기말_신원중_중2_문제.pdf  ·  같은 종류가 또 있으면 …_원본2.hwp
export function standardFileName(p: PaperKey, kind: string, originalName: string, nth = 1) {
  const ext = (originalName.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'pdf').toLowerCase().replace('jpeg', 'jpg')
  return `${examPrefix(p)}_${p.school_name}_${p.grade}_${kind}${nth > 1 ? nth : ''}.${ext}`
}

// 손풀이 파일명에서 문항번호 뽑기: 도래울중_중3_18번_손풀이_김T.png → '18번'
export function handsolveLabel(fileName: string): string | null {
  const m = fileName.normalize('NFC').match(/^.+?_중[1-3]_(.+?)_손풀이_/)
  return m ? m[1] : null
}

// ───────────────────── 적중률 ─────────────────────
// 적중 = 이너프원에 쌍둥이 · 매우 유사 · 유형 유사 문항이 있는 기출 문항. 「참고」는 적중으로 세지 않는다.
// (원장님 결정 2026-10-03)
export const HIT_LEVELS = ['쌍둥이', '매우 유사', '유형 유사']

// 정답표(한 줄에 「번호 정답」)에서 문항번호만 뽑는다
export function answerNos(text: string | null | undefined): string[] {
  return String(text ?? '').split(/\r?\n/)
    .map((l) => normNo(l.trim().split(/\s+/)[0] ?? ''))
    .filter(Boolean)
}

// 전체 문항 = 정답표의 번호 + 타이핑한 문항 번호 (둘 다 없으면 적중률을 낼 수 없다)
export function hitSummary(
  answersText: string | null | undefined,
  questionNos: string[],
  matches: { question_no?: string | null; match_level?: string | null }[]
) {
  const all = Array.from(new Set([...answerNos(answersText), ...questionNos.map(normNo)].filter(Boolean)))
    .sort((a, b) => sortOrderOf(a) - sortOrderOf(b))
  // 문항마다 가장 높은 매칭 정도 하나만 센다
  const best: Record<string, string> = {}
  for (const m of matches) {
    const no = normNo(m.question_no ?? '')
    if (!no || !m.match_level) continue
    const rank = MATCH_LEVELS.indexOf(m.match_level)
    if (!(no in best) || rank < MATCH_LEVELS.indexOf(best[no])) best[no] = m.match_level
  }
  const total = all.length
  // 정답표에 없는 번호(오타)는 세지 않는다 — 분자만 커져 적중률이 부풀지 않게
  const counted = Object.keys(best).filter((no) => !total || all.includes(no))
  const hitNos = counted.filter((no) => HIT_LEVELS.includes(best[no]))
  const byLevel: Record<string, number> = {}
  for (const no of counted) byLevel[best[no]] = (byLevel[best[no]] ?? 0) + 1
  return {
    total, hit: hitNos.length, byLevel, best,
    rate: total ? Math.round((hitNos.length / total) * 100) : null,
    missNos: all.filter((no) => !hitNos.includes(no)),
    // 정답표에 없는 번호로 적은 매칭 (번호 오타일 수 있다)
    strayNos: total ? Object.keys(best).filter((no) => !all.includes(no)) : [],
  }
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
