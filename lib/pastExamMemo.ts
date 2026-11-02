// 기출유사 결과를 **브리핑이 나가기 직전에** 그날 학습일지 메모에 붙인다.
//
// 왜 발송 안에서 하나 (원장님 2026-11-02)
//   「오늘 수업한 친구들은 어차피 오후 8시에 혹은 내일 오전 11시까지 학습일지가 모두
//   채워질테니 학습일지 나가기 전에 붙이면 됨」.
//
//   따로 돌리면 시각을 맞춰야 하고, 그 사이에 선생님이 일지를 채우면 놓친다.
//   발송하는 그 안에서 붙이면 **그 브리핑에 실려 나간다** — 한 명도 안 빠진다.
//
// ★ 한 번만 간다. 그 학생의 최근 메모 어디에도 그 시험 이름이 없을 때만 붙인다.
// ★ 일지가 아직 없는 학생에게는 **만들지 않는다.** 빈 일지에 메모만 넣으면 저녁 8시
//   껍데기 판정이 「내용 있음」으로 보고 진도 없는 글을 내보낸다(2026-10-22 에 막은 구멍).
//   그런 학생은 어차피 그날 발송 대상이 아니고, 다음 발송 때 붙는다.
import type { SupabaseClient } from '@supabase/supabase-js'

/** 메모에 붙일 한 줄. 「2024 백마중 기출유사 24문항 중 3개 틀렸습니다.」 */
export function memoLine(title: string, total: number, score: number) {
  return `${title} ${total}문항 중 ${total - score}개 틀렸습니다.`
}

/** 며칠 지난 것까지 붙이나 — 그보다 오래된 것은 이제 와서 알려도 늦다. */
export const MAX_DAYS = 21

export interface AttachResult { attached: number; lines: string[]; skippedNoNote: string[] }

/**
 * date 에 발송할 학생들의 메모에 기출유사 결과를 붙인다. 붙인 수를 돌려준다.
 * 부르는 쪽은 이 뒤에 learning_notes 를 **다시 읽어야** 한다(메모가 바뀌었다).
 */
export async function attachPastExamMemos(
  db: SupabaseClient, date: string, studentIds: string[],
): Promise<AttachResult> {
  const out: AttachResult = { attached: 0, lines: [], skippedNoNote: [] }
  if (!studentIds.length) return out
  const from = new Date(Date.parse(date + 'T00:00:00Z') - MAX_DAYS * 86400_000).toISOString().slice(0, 10)

  // 그 기간의 기출유사 — 평가관리에 진단평가로 들어가 있고 제목에 「기출유사」가 있다.
  const exams: any[] = []
  for (let i = 0; i < studentIds.length; i += 100) {
    const { data } = await db.from('exams')
      .select('student_id, title, score, total_score, exam_date')
      .in('student_id', studentIds.slice(i, i + 100))
      .eq('exam_type', '진단평가').like('title', '%기출유사%')
      .gte('exam_date', from).lte('exam_date', date)
    exams.push(...(data ?? []))
  }
  if (!exams.length) return out

  // 그 학생들의 최근 일지 — 「이미 붙었나」를 보고, 붙일 자리(그날 일지)도 여기서 찾는다.
  const ids = [...new Set(exams.map((e) => e.student_id))]
  const notes: any[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('learning_notes')
      .select('id, student_id, session_id, memo, class_sessions!inner(session_date)')
      .in('student_id', ids.slice(i, i + 100))
      .gte('class_sessions.session_date', from)
    notes.push(...(data ?? []))
  }
  const memoOf = new Map<string, string[]>()
  for (const n of notes) {
    const list = memoOf.get(n.student_id) ?? []
    list.push(String(n.memo ?? ''))
    memoOf.set(n.student_id, list)
  }
  const todayNote = new Map<string, any>()
  for (const n of notes) {
    if ((n as any).class_sessions?.session_date === date) todayNote.set(n.student_id, n)
  }

  for (const e of exams) {
    const already = (memoOf.get(e.student_id) ?? []).some((m) => m.includes(e.title))
    if (already) continue
    const note = todayNote.get(e.student_id)
    if (!note) { out.skippedNoNote.push(e.student_id); continue }
    const line = memoLine(e.title, Number(e.total_score), Number(e.score))
    const next = String(note.memo ?? '').trim() ? `${String(note.memo).trim()}\n${line}` : line
    const { error } = await db.from('learning_notes')
      .update({ memo: next, updated_at: new Date().toISOString() }).eq('id', note.id)
    if (error) continue
    note.memo = next
    ;(memoOf.get(e.student_id) ?? []).push(next)
    out.attached++
    out.lines.push(line)
  }
  return out
}
