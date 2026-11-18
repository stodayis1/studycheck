/**
 * 점수는 들어왔는데 **아직 안 닫힌 학습지를 쓸어 담는다.**
 *
 * 왜 (원장님 2026-11-18)
 *   「날짜 지난지 오래된거나 학습일지에 올라가서 학습브리핑이 발송된건 앞으로 자동으로 닫아줘」
 *
 *   `statusAfterScore`(lib/worksheetStatus.ts)는 **점수가 들어오는 그 순간**에만 닫는다.
 *   그래서 그 규칙이 생기기 전에 들어온 줄, 선생님이 점수만 넣고 다음 단계를 안 고르신 줄은
 *   영영 열린 채로 남는다 — 2026-11-18 기준 21건이 그랬다(7월 것 3건 포함).
 *   이 파일은 그렇게 남은 것을 **날마다 한 번** 쓸어 담는다.
 *
 * 닫는 까닭은 둘뿐이다. 둘 다 「이제 와서 선생님이 손댈 일이 없다」가 기준이다.
 *   · `briefed` — 그 학생의 **그날 학부모 브리핑이 이미 나갔다**. 점수가 학부모께 간 뒤라
 *     다시 고를 것이 없다.
 *   · `old`     — 푼 지 `SWEEP_AFTER_DAYS` 일이 지났다. 수업일지 수정 마감이 「당일 + 다음
 *     수업일 오후 2시」라 길어야 사나흘이고, 주 1회 수업도 이레면 지난다.
 *
 * ★ **점수가 없는 줄은 건드리지 않는다.** 배정만 해 둔 것(assigned·similar_assigned)은
 *   아직 풀지 않은 숙제다 — 닫으면 그 숙제가 목록에서 사라진다.
 * ★ **날짜를 모르는 줄도 안 닫는다.** 언제 푼 것인지 모르면 「오래됐다」를 말할 수 없다.
 * ★ 닫아도 「70점 못 넘기고 멈춘 단원」 목록은 그대로다 — 그 표는 상태가 아니라 **점수**를
 *   보고 그린다(`app/teacher/assignments/page.tsx`).
 */

/** 푼 지 이만큼 지나면 닫는다. */
export const SWEEP_AFTER_DAYS = 7

export interface SweepRow {
  id: string
  student_id: string | null
  score: number | null
  status: string | null
  /** 'YYYY-MM-DD...' — 푼 날 */
  submitted_at: string | null
}

export type SweepReason = 'briefed' | 'old'

/** 그 학생의 그날 브리핑이 나갔나 — 열쇠는 `학생id|YYYY-MM-DD`. */
export const briefKey = (studentId: string | null | undefined, date: string) => `${studentId ?? ''}|${date}`

const 날 = (v?: string | null) => String(v ?? '').slice(0, 10)

/** 두 날짜 사이의 일수 (a 가 b 보다 앞서면 양수). */
function 며칠전(a: string, b: string): number {
  const x = Date.parse(a + 'T00:00:00Z'), y = Date.parse(b + 'T00:00:00Z')
  if (Number.isNaN(x) || Number.isNaN(y)) return 0
  return Math.round((y - x) / 86400_000)
}

/**
 * 이 줄을 닫아도 되나 — 닫을 까닭, 아니면 null.
 *
 * @param briefed 브리핑이 나간 `학생id|날짜` 묶음
 * @param today   오늘(한국 날짜)
 */
export function sweepReasonFor(
  w: SweepRow,
  opts: { briefed: Set<string>; today: string; afterDays?: number },
): SweepReason | null {
  if (w.score == null) return null            // 아직 안 푼 숙제
  if (w.status === 'passed') return null       // 이미 닫혔다
  const d = 날(w.submitted_at)
  if (!d) return null                          // 언제 푼 것인지 모른다
  if (opts.briefed.has(briefKey(w.student_id, d))) return 'briefed'
  if (며칠전(d, opts.today) >= (opts.afterDays ?? SWEEP_AFTER_DAYS)) return 'old'
  return null
}

export interface SweepPlan {
  ids: string[]
  briefed: number
  old: number
  /** 아직 닫지 않고 둔 것 (오늘·어제 것이고 브리핑도 아직 안 나갔다) */
  kept: number
}

/** 쓸어 담을 목록을 만든다. DB 를 안 보므로 검사에서 그대로 돌려 볼 수 있다. */
export function planSweep(
  rows: SweepRow[],
  opts: { briefed: Set<string>; today: string; afterDays?: number },
): SweepPlan {
  const out: SweepPlan = { ids: [], briefed: 0, old: 0, kept: 0 }
  for (const w of rows) {
    const why = sweepReasonFor(w, opts)
    if (!why) { if (w.score != null && w.status !== 'passed') out.kept++; continue }
    out.ids.push(w.id)
    if (why === 'briefed') out.briefed++
    else out.old++
  }
  return out
}

/** supabase-js 손잡이 — 필요한 것은 `from` 하나뿐이다. */
export interface SweepDb { from(table: string): any }

export interface SweepResult {
  닫음: number
  브리핑나감: number
  오래됨: number
  남음: number
  실패?: string[]
}

/**
 * 실제로 쓸어 담는다. **날마다 한 번** 브리핑 예약이 끝낸 뒤에 부른다
 * (`lib/cronBriefing.ts` 의 ⑤). 몇 번을 불러도 결과는 같다 — 이미 닫힌 줄은 안 집는다.
 *
 * ★ 읽을 때 `order('id')` 를 붙인다. 없이 `range` 로 돌면 행을 놓친다.
 * ★ `in()` 은 100개씩 끊는다 — 긴 목록은 조용히 잘린다.
 */
export async function runWorksheetSweep(
  db: SweepDb, today: string, opts?: { afterDays?: number },
): Promise<SweepResult> {
  const rows: SweepRow[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('student_worksheets')
      .select('id, student_id, score, status, submitted_at')
      .not('score', 'is', null).neq('status', 'passed')
      .order('id').range(from, from + 499)
    if (error) return { 닫음: 0, 브리핑나감: 0, 오래됨: 0, 남음: 0, 실패: [error.message] }
    rows.push(...((data ?? []) as SweepRow[]))
    if (!data || data.length < 500) break
  }
  if (!rows.length) return { 닫음: 0, 브리핑나감: 0, 오래됨: 0, 남음: 0 }

  // 그 날짜들의 브리핑 발송 기록 — 「나감(sent)」만 센다
  const dates = [...new Set(rows.map((r) => String(r.submitted_at ?? '').slice(0, 10)).filter(Boolean))]
  const briefed = new Set<string>()
  for (let i = 0; i < dates.length; i += 100) {
    const { data } = await db.from('briefing_sends')
      .select('student_id, session_date, status').in('session_date', dates.slice(i, i + 100))
    for (const b of (data ?? []) as any[]) {
      if (b?.status === 'sent') briefed.add(briefKey(b.student_id, String(b.session_date).slice(0, 10)))
    }
  }

  const plan = planSweep(rows, { briefed, today, afterDays: opts?.afterDays })
  const 실패: string[] = []
  let 닫음 = 0
  for (let i = 0; i < plan.ids.length; i += 100) {
    const chunk = plan.ids.slice(i, i + 100)
    const { error } = await db.from('student_worksheets')
      .update({ status: 'passed', last_action: 'auto_complete', updated_at: new Date().toISOString() })
      .in('id', chunk)
    if (error) 실패.push(error.message)
    else 닫음 += chunk.length
  }
  return {
    닫음, 브리핑나감: plan.briefed, 오래됨: plan.old, 남음: plan.kept,
    실패: 실패.length ? 실패 : undefined,
  }
}
