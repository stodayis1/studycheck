// 학생의 **첫 수업일**을 수학OPS 에서 가져와 스터디체크에 채운다.
//
// 왜 (원장님 2026-10-17)
//   아직 수업을 시작하지 않은 학생이 「학습일지 미작성」으로 떴다. 등록하면서 시간표를
//   먼저 넣어 두기 때문이다. 첫 수업일은 OPS 에만 있었다.
//
// 왜 옮겨 적나 — 그냥 읽어 쓰지 않고
//   「그날 일지를 써야 하는 학생」을 고르는 일(lib/expectedToday.ts)은 **선생님 화면에서도**
//   돈다. 브라우저는 OPS 키를 가질 수 없다. 그래서 값을 스터디체크 쪽에 복사해 둔다.
//
// ★ OPS 를 못 읽어도 던지지 않는다. 못 읽으면 예전 값이 그대로 남을 뿐이다.
import { createClient } from '@supabase/supabase-js'

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export interface FirstClassSync {
  checked: number
  updated: { name: string; date: string | null }[]
  note?: string
}

export async function syncFirstClassFromOps(
  db: { from: (t: string) => any },
): Promise<FirstClassSync> {
  const ops = opsClient()
  if (!ops) return { checked: 0, updated: [], note: 'OPS 키가 없어요.' }

  try {
    const { data: students } = await db.from('students')
      .select('id, name, ops_student_id, first_class_date, first_class_time')
      .eq('is_active', true).not('ops_student_id', 'is', null)
    if (!students?.length) return { checked: 0, updated: [] }

    const { data: opsRows, error } = await ops.from('students')
      .select('id, first_class_date, first_class_time')
      .in('id', students.map((s: any) => s.ops_student_id))
    if (error) return { checked: 0, updated: [], note: `OPS 읽기 실패: ${error.message}` }
    const opsBy = new Map((opsRows ?? []).map((r: any) => [r.id, r]))

    const updated: FirstClassSync['updated'] = []
    for (const st of students as any[]) {
      const o: any = opsBy.get(st.ops_student_id)
      if (!o) continue
      const d = o.first_class_date ?? null
      const t = o.first_class_time ?? null
      if (d === st.first_class_date && t === st.first_class_time) continue
      const { error: upErr } = await db.from('students')
        .update({ first_class_date: d, first_class_time: t }).eq('id', st.id)
      if (!upErr) updated.push({ name: st.name, date: d })
    }
    return { checked: students.length, updated }
  } catch (e: any) {
    return { checked: 0, updated: [], note: e?.message ?? '가져오지 못했어요.' }
  }
}
