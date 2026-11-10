/**
 * 학생 한 명의 **로드맵 읽기** — 적힌 활동을 모아 「여태 한 것 · 비어 있는 것 · 다음에 해 볼 것」을 그린다.
 *
 * 왜 (원장님 2026-11-10 「그걸 바탕으로 이러이러한 내용을 가면 좋겠다는 걸 그려 줘야 분석 아니냐」)
 *
 * ★ 앱 안에서 AI 를 부르지 않는다(유료 API). 여기 있는 것은 **세는 규칙**뿐이고,
 *   주제는 미리 만들어 둔 사전(`lib/data/mathTopics.ts`)에서 고른다.
 * ★ 글투를 평범하게 쓴다 — 원장님 2026-11-10 「AI 스럽지 않게」.
 *   「~를 통해」·「~에 대한 고찰」·「융합적 사고」 같은 말을 쓰지 않는다.
 */
import { FIELD_WORDS } from './subjectGuide'
import { MATH_TOPICS, type MathTopic } from './data/mathTopics'
import { parseDetail, filledCount, PART_LABELS, type ActivityParts } from './activityParts'

export interface PlanAct {
  kind: string
  title: string
  detail?: string | null
  subject?: string | null
  school_year?: number | null
  semester?: number | null
  activity_date?: string | null
}

export interface PlanInput {
  /** 지금 학년 (고1 …) */
  grade?: string | null
  /** 질문지 답 — field[] · major 를 본다 */
  answers?: Record<string, any> | null
  acts: PlanAct[]
  /** 오늘 (검사에서 고정하려고 받는다) */
  today?: string
}

export interface ThinAct { title: string; missing: string[] }

export interface CareerPlan {
  /** 한 줄 요약 */
  headline: string
  /** 종류별 건수 (많은 순) */
  counts: { kind: string; n: number }[]
  /** 진로(계열·학과)와 말이 이어지는 활동 수 */
  linked: number
  /** 비어 있는 것 — 그대로 화면에 띄운다 */
  gaps: string[]
  /** 적히긴 했는데 너무 짧은 기록 (무슨 칸이 비었는지까지) */
  thin: ThinAct[]
  /** 다음에 해 볼 주제 */
  topics: MathTopic[]
  /** 왜 이 주제들을 골랐는지 */
  topicWhy: string
}

const KIND_ORDER = ['탐구보고서', '세특', '수행평가', '동아리', '진로활동', '독서', '대회·행사', '기타']

const norm = (s: string) => String(s ?? '').replace(/\s+/g, '').toLowerCase()

/** 그 활동이 학생 진로와 말이 이어지나 — 계열 낱말이나 학과 이름이 글에 보이면 */
export function isLinked(act: PlanAct, fields: string[], major: string): boolean {
  const hay = norm(`${act.title} ${act.detail ?? ''} ${act.subject ?? ''}`)
  const mk = norm(major).replace(/(전공|계열|과|부)$/u, '')
  if (mk.length >= 2 && hay.includes(mk)) return true
  return fields.some((f) => (FIELD_WORDS[f] ?? []).some((w) => hay.includes(norm(w))))
}

/**
 * 다음에 해 볼 주제 고르기.
 *   ① 학생 계열에 맞는 것(계열이 없으면 공통)
 *   ② 학년에 맞는 것
 *   ③ **이미 한 것과 겹치지 않는 것** — 같은 말이 제목에 있으면 뺀다
 *   ④ 기록이 늘수록 다른 주제가 보이게 한 칸씩 돌린다
 */
export function pickTopics(fields: string[], grade: string | null | undefined, acts: PlanAct[], n = 3): MathTopic[] {
  const real = fields.filter((f) => f && f !== '아직 모름')
  const done = acts.map((a) => norm(a.title))
  const fit = MATH_TOPICS.filter((t) => {
    const fOk = real.length ? t.fields.some((f) => real.includes(f) || f === '공통') : t.fields.includes('공통')
    const gOk = !grade || !t.grades.length || t.grades.includes(grade)
    return fOk && gOk
  })
  // 이미 한 주제와 낱말이 겹치면 뒤로 민다 (아주 겹치면 아예 뺀다)
  const score = (t: MathTopic) => {
    const key = norm(t.title)
    const hit = done.filter((d) => d.length > 3 && (d.includes(key.slice(0, 6)) || key.includes(d.slice(0, 6)))).length
    const own = real.length && t.fields.some((f) => real.includes(f)) ? 0 : 1   // 계열이 딱 맞는 것 먼저
    return hit * 10 + own
  }
  const sorted = [...fit].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))
  const fresh = sorted.filter((t) => score(t) < 10)
  const pool = fresh.length >= n ? fresh : sorted
  if (!pool.length) return []
  const start = acts.length % pool.length
  return Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[(start + i) % pool.length])
}

export function makePlan(input: PlanInput): CareerPlan {
  const today = input.today ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const a = input.answers ?? {}
  const fields: string[] = Array.isArray(a.field) ? a.field : []
  const realFields = fields.filter((f) => f && f !== '아직 모름')
  const major = String(a.major ?? '')
  const acts = input.acts ?? []

  // 종류별 건수
  const byKind = new Map<string, number>()
  for (const x of acts) byKind.set(x.kind, (byKind.get(x.kind) ?? 0) + 1)
  const counts = [...byKind.entries()]
    .map(([kind, n]) => ({ kind, n }))
    .sort((x, y) => y.n - x.n || KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind))

  const linked = acts.filter((x) => isLinked(x, realFields, major)).length

  // 비어 있는 것
  const gaps: string[] = []
  if (!Object.keys(a).length) gaps.push('질문지를 아직 안 냈어요. 계열을 모르면 다음 주제를 고를 수 없어요.')
  else if (!realFields.length) gaps.push('관심 계열이 「아직 모름」이에요. 계열부터 좁혀 보는 이야기가 먼저예요.')
  if (!acts.length) gaps.push('적힌 활동이 하나도 없어요. 지난 학기 수행평가부터 한 줄씩 채워 보세요.')
  for (const k of ['탐구보고서', '수행평가', '동아리']) {
    if (acts.length && !byKind.get(k)) gaps.push(`${k} 기록이 없어요.`)
  }
  if (acts.length && linked === 0 && realFields.length) {
    gaps.push(`적힌 활동이 ${realFields.join('·')} 와 말로 이어지지 않아요. 같은 활동이라도 진로와 닿는 쪽으로 한 걸음 틀면 좋아요.`)
  }
  const dates = acts.map((x) => x.activity_date ?? '').filter(Boolean).sort()
  const last = dates[dates.length - 1]
  if (last) {
    const months = (Date.parse(today) - Date.parse(last)) / (30 * 86400_000)
    if (months >= 4) gaps.push(`마지막 기록이 ${last} 예요. 넉 달 넘게 비어 있어요.`)
  }
  const mathish = acts.filter((x) => /수학|통계|미적|확률|기하|대수/.test(`${x.subject ?? ''} ${x.title}`)).length
  if (acts.length >= 3 && mathish === 0) gaps.push('수학과 이어진 활동이 없어요. 우리 수업에서 나온 것을 하나 끌어와 보세요.')

  // 너무 짧게 적힌 기록
  const thin: ThinAct[] = []
  for (const x of acts) {
    if (x.kind === '세특') continue                       // 세특은 학생부 문구 그대로라 나누지 않는다
    const parts: ActivityParts = parseDetail(x.detail)
    if (filledCount(parts) >= 3) continue
    const missing = PART_LABELS.filter((p) => (parts[p.key] ?? '').trim().length < 5).map((p) => p.label)
    thin.push({ title: x.title, missing })
  }

  const topics = pickTopics(realFields, input.grade, acts)
  const topicWhy = realFields.length
    ? `${realFields.join(' · ')} 쪽 학생에게 맞춘 것 중에서, 이미 한 것과 겹치지 않는 것으로 골랐어요.`
    : '계열을 아직 안 정해서, 어느 쪽으로 가도 쓸 수 있는 것으로 골랐어요.'

  const headline = !acts.length
    ? '아직 적힌 활동이 없어요.'
    : `활동 ${acts.length}건 · 진로와 이어지는 것 ${linked}건${thin.length ? ` · 더 적어야 할 기록 ${thin.length}건` : ''}`

  return { headline, counts, linked, gaps, thin, topics, topicWhy }
}
