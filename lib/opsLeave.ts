// 학생의 **휴원 여부**를 수학OPS 에서 가져와 스터디체크에 맞춘다.
//
// 왜 (원장님 2026-11-03~04)
//   중3 학생 한 명이 9월부터 휴원이었는데 **스터디체크에는 휴원으로 표시된 적이 없었다.**
//   휴원·복귀는 OPS 에서 처리하시는데, 그게 이쪽으로 넘어오는 길이 없었다.
//   그래서 그 두 달 동안 스터디체크에서는 줄곧 재원으로 보였다.
//
// 왜 옮겨 적나 — 그냥 읽어 쓰지 않고
//   휴원 여부는 **선생님 화면에서도** 쓰인다(명단·출결·영상과제 배부). 브라우저는 OPS
//   키를 가질 수 없다. 그래서 첫 수업일(lib/opsFirstClass.ts)과 **같은 방식으로** 복사해 둔다.
//
// ★ OPS 를 못 읽어도 던지지 않는다. 못 읽으면 예전 값이 그대로 남을 뿐이다.
// ★ **사람을 지우거나 퇴원시키지 않는다.** 바꾸는 것은 휴원 칸 넷뿐이다.
import { createClient } from '@supabase/supabase-js'

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export interface LeaveRow {
  on_leave: boolean | null
  leave_start_date: string | null
  leave_end_date: string | null
  leave_reason: string | null
}

/** 바꿀 것이 있나 — 있으면 바꿀 값, 없으면 null. 넷 중 하나라도 다르면 바꾼다. */
export function leaveDiff(mine: LeaveRow, ops: LeaveRow): LeaveRow | null {
  const 같나 = (a: any, b: any) => (a ?? null) === (b ?? null)
  const next: LeaveRow = {
    on_leave: !!ops.on_leave,
    leave_start_date: ops.leave_start_date ?? null,
    leave_end_date: ops.leave_end_date ?? null,
    leave_reason: ops.leave_reason ?? null,
  }
  if (같나(!!mine.on_leave, next.on_leave) && 같나(mine.leave_start_date, next.leave_start_date)
    && 같나(mine.leave_end_date, next.leave_end_date) && 같나(mine.leave_reason, next.leave_reason)) return null
  return next
}

/** 사람이 읽을 한 줄 — 무엇이 어떻게 바뀌었나 */
export function leaveLine(name: string, before: LeaveRow, after: LeaveRow): string {
  const 꼴 = (r: LeaveRow) => (r.on_leave ? `휴원${r.leave_start_date ? ` ${r.leave_start_date}~` : ''}` : '재원')
  return `${name} ${꼴(before)} → ${꼴(after)}`
}

export interface LeaveSync {
  checked: number
  changed: string[]
  note?: string
}

export async function syncLeaveFromOps(db: { from: (t: string) => any }): Promise<LeaveSync> {
  const ops = opsClient()
  if (!ops) return { checked: 0, changed: [], note: 'OPS 키가 없어요.' }

  try {
    const { data: students } = await db.from('students')
      .select('id, name, ops_student_id, on_leave, leave_start_date, leave_end_date, leave_reason')
      .eq('is_active', true).not('ops_student_id', 'is', null)
    if (!students?.length) return { checked: 0, changed: [] }

    const ids = students.map((s: any) => s.ops_student_id)
    const opsRows: any[] = []
    // in() 은 100개씩 끊는다 (학생이 100명 넘는다).
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await ops.from('students')
        .select('id, on_leave, leave_start_date, leave_end_date, leave_reason')
        .in('id', ids.slice(i, i + 100))
      if (error) return { checked: 0, changed: [], note: `OPS 읽기 실패: ${error.message}` }
      opsRows.push(...(data ?? []))
    }
    const opsBy = new Map(opsRows.map((r) => [r.id, r]))

    const changed: string[] = []
    for (const st of students as any[]) {
      const o = opsBy.get(st.ops_student_id)
      if (!o) continue                       // OPS 에 없는 사람은 **건드리지 않는다**
      const next = leaveDiff(st, o)
      if (!next) continue
      const { error } = await db.from('students').update(next).eq('id', st.id)
      if (!error) changed.push(leaveLine(st.name, st, next))
    }
    return { checked: students.length, changed }
  } catch (e: any) {
    return { checked: 0, changed: [], note: e?.message ?? '가져오지 못했어요.' }
  }
}
