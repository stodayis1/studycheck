// 쌍둥이 만들기 요청을 줄(twin_requests)에 올린다.
// 문제은행 「쌍둥이 만들기 요청」 버튼과 재출제(쌍둥이 문제)가 같이 쓴다.
// 실제로 만드는 건 Claude — scripts/twin-gen/README.md
//
// 같은 문제가 교재 서너 권에 실리므로(쎈·쎈B …) 묶음(twin_group)마다 한 번만 요청한다.
// 묶음에 이미 만든 쌍둥이(book='쌍둥이')가 있거나 요청이 걸려 있으면 건너뛴다.
import type { SupabaseClient } from '@supabase/supabase-js'

export const TWIN_BOOK = '쌍둥이'

export async function requestTwins(
  supabase: SupabaseClient,
  problemIds: number[],
  opts: { source: 'manual' | 'reprint'; by?: string | null },
): Promise<{ added: number; skipped: number }> {
  const ids = Array.from(new Set(problemIds.filter(Boolean)))
  if (!ids.length) return { added: 0, skipped: 0 }

  const rows: any[] = []
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase.from('problems').select('id, book, twin_group').in('id', ids.slice(i, i + 500))
    rows.push(...(data ?? []))
  }
  const own = rows.filter((p) => p.book !== TWIN_BOOK)
  const groups = Array.from(new Set(own.map((p) => p.twin_group).filter(Boolean))) as number[]

  // 묶음 식구 전부 — 이미 쌍둥이가 있는지, 식구 중 누가 요청돼 있는지 본다
  const members = new Map<number, number[]>()
  const done = new Set<number>()
  for (let i = 0; i < groups.length; i += 300) {
    const { data } = await supabase.from('problems').select('id, book, twin_group').in('twin_group', groups.slice(i, i + 300)).limit(10000)
    for (const m of data ?? []) {
      if (m.book === TWIN_BOOK) done.add(m.twin_group)
      members.set(m.twin_group, [...(members.get(m.twin_group) ?? []), m.id])
    }
  }
  const allIds = Array.from(new Set([...own.map((p) => p.id), ...Array.from(members.values()).flat()]))
  const requested = new Set<number>()
  for (let i = 0; i < allIds.length; i += 500) {
    const { data } = await supabase.from('twin_requests').select('problem_id').in('problem_id', allIds.slice(i, i + 500))
    for (const r of data ?? []) requested.add(r.problem_id)
  }

  const seenGroup = new Set<number>()
  const add: number[] = []
  for (const p of own.sort((a, b) => a.id - b.id)) {
    const g = p.twin_group as number | null
    if (g) {
      if (done.has(g) || seenGroup.has(g)) continue
      seenGroup.add(g)
      if ((members.get(g) ?? []).some((id) => requested.has(id))) continue
    } else if (requested.has(p.id)) continue
    add.push(p.id)
  }

  if (add.length) {
    const { error } = await supabase.from('twin_requests').upsert(
      add.map((problem_id) => ({ problem_id, source: opts.source, requested_by_name: opts.by ?? null })),
      { onConflict: 'problem_id', ignoreDuplicates: true },
    )
    if (error) throw new Error(error.message)
  }
  return { added: add.length, skipped: ids.length - add.length }
}
