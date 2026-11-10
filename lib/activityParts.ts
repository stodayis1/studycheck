/**
 * 활동 기록을 **다섯 칸으로 나눠 묻는다** — 왜 · 어떻게 · 알게 된 것 · 막힌 점 · 다음.
 *
 * 왜 (원장님 2026-11-10 「구체적으로 물어서 학생이 각각 내용을 구체적으로 쓰게 한다던가」)
 *   「내용·방법·결과」 한 칸이면 선생님마다 한 줄로 끝난다. 그러면 나중에 읽어도 분석할 재료가 없고,
 *   학생도 세특으로 이어 쓸 거리가 없다. 다섯 칸은 **그대로 탐구보고서의 뼈대**이기도 하다.
 *
 * ★ 세특은 나누지 않는다 — 학생부에 적힌 문구를 **그대로** 옮기는 칸이라 쪼개면 원문이 망가진다.
 *
 * ★ 표를 바꾸지 않았다. `student_activities.detail`(글 한 칸)에 머리표를 붙여 담고 다시 읽는다.
 *   예전에 한 줄로 적어 둔 기록은 머리표가 없으므로 **통째로 「내용」**으로 읽힌다(그대로 보인다).
 */

export interface ActivityParts {
  /** 왜 이 주제를 골랐나 — 진로와 어떻게 이어지나 */
  why: string
  /** 어떻게 했나 — 자료·방법·도구 */
  how: string
  /** 무엇을 알게 됐나 — 결과·결론 */
  found: string
  /** 막힌 점·아쉬운 점 */
  stuck: string
  /** 다음에 더 해 볼 것 */
  next: string
  /** 머리표 없이 적힌 옛 기록(또는 세특 문구) */
  free: string
}

export const EMPTY_PARTS: ActivityParts = { why: '', how: '', found: '', stuck: '', next: '', free: '' }

/** 칸 이름 — 화면과 저장 글에 **같은 말**을 쓴다 */
export const PART_LABELS: { key: keyof ActivityParts; label: string; hint: string }[] = [
  { key: 'why', label: '왜 이 주제를', hint: '어쩌다 궁금해졌는지 · 진로와 어떻게 이어지는지' },
  { key: 'how', label: '어떻게 했나', hint: '무슨 자료를 어디서 구했고 어떤 방법으로 따져 봤는지' },
  { key: 'found', label: '무엇을 알게 됐나', hint: '숫자·결과와, 그래서 무슨 말을 할 수 있는지' },
  { key: 'stuck', label: '막힌 점', hint: '잘 안 된 것 · 아쉬운 것 (이게 다음 탐구가 된다)' },
  { key: 'next', label: '다음에 더 할 것', hint: '이어서 해 볼 것 · 다른 과목과 이어 볼 것' },
]

const ORDER: (keyof ActivityParts)[] = ['why', 'how', 'found', 'stuck', 'next']
const LABEL_OF = Object.fromEntries(PART_LABELS.map((p) => [p.key, p.label])) as Record<string, string>
const KEY_OF = Object.fromEntries(PART_LABELS.map((p) => [p.label, p.key])) as Record<string, keyof ActivityParts>

/** 다섯 칸 → 저장할 글 한 덩이. 빈 칸은 **아예 안 적는다**(빈 머리표만 남으면 지저분하다) */
export function composeDetail(parts: Partial<ActivityParts>): string {
  const out: string[] = []
  if (parts.free?.trim()) out.push(parts.free.trim())
  for (const k of ORDER) {
    const v = (parts[k] ?? '').trim()
    if (v) out.push(`[${LABEL_OF[k]}]\n${v}`)
  }
  return out.join('\n\n')
}

/** 저장된 글 → 다섯 칸. 머리표가 없으면 통째로 `free` 로 둔다 */
export function parseDetail(detail: string | null | undefined): ActivityParts {
  const text = String(detail ?? '')
  const parts: ActivityParts = { ...EMPTY_PARTS }
  if (!text.trim()) return parts

  const re = /^\[([^\]\n]{1,20})\]\s*$/
  let cur: keyof ActivityParts | null = null
  const buf: Record<string, string[]> = {}
  for (const line of text.split('\n')) {
    const m = re.exec(line.trim())
    const key = m ? KEY_OF[m[1].trim()] : undefined
    if (key) { cur = key; buf[cur] = buf[cur] ?? []; continue }
    const where = cur ?? 'free'
    buf[where] = buf[where] ?? []
    buf[where].push(line)
  }
  for (const k of Object.keys(buf) as (keyof ActivityParts)[]) {
    parts[k] = buf[k].join('\n').trim()
  }
  return parts
}

/** 다섯 칸 중 적힌 것이 몇 개인가 — 분석에서 「얼마나 구체적인가」로 쓴다 */
export function filledCount(parts: ActivityParts): number {
  return ORDER.filter((k) => parts[k].trim().length >= 5).length
}

/** 세특은 나누지 않는다 (학생부 문구 그대로) */
export const isSplitKind = (kind: string) => kind !== '세특'
