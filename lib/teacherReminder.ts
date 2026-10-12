// 수업일지가 덜 된 선생님께 보내는 알림. 화면(원장님이 미리보기 보고 누르는 길)과
// 자동 발송(밤 8시·다음 날 오전 11시)이 **같은 함수**를 쓴다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { findMissingNotes, mainTeacherOf } from './missingNotes'
import { fetchOpsTeacherPhones } from './opsTeachers'
import { sendSmsViaOps } from './opsSms'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://studycheck-five.vercel.app'

/** 「10/12(토)」 */
export function dayLabel(date: string) {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`
}

export interface ReminderItem {
  teacher: string
  count: number
  students: string[]
  text: string
  bytes: number
  phone?: string
  ok?: boolean
  error?: string
}

/** 선생님별로 보낼 문구까지 만들어 돌려준다. 보내지는 않는다. */
export async function buildTeacherReminders(db: SupabaseClient, date: string, opts?: { when?: string }) {
  const { data: sessions } = await db.from('class_sessions')
    .select('id, student_id, session_type, progress_content, today_textbook_name, hw_textbook_name, hw_textbook_page, hw_worksheet_range')
    .eq('session_date', date)
  if (!sessions?.length) return { items: [] as ReminderItem[], noTeacher: [] as string[], note: '그날 수업이 없어요.' }

  const [{ data: notes }, { data: students }] = await Promise.all([
    db.from('learning_notes').select('session_id, attendance').in('session_id', sessions.map((s: any) => s.id)),
    db.from('students').select('id, name, grade, teacher_name').in('id', sessions.map((s: any) => s.student_id)),
  ])

  // ★ 원장님 화면의 「학습일지 미작성 보기」와 같은 함수다(lib/missingNotes.ts).
  const missing = findMissingNotes({
    sessions: sessions as any, notes: (notes ?? []) as any, students: (students ?? []) as any,
  })

  const byTeacher = new Map<string, typeof missing>()
  const noTeacher: typeof missing = []
  for (const m of missing) {
    const t = mainTeacherOf(m.teacher)
    if (!t) { noTeacher.push(m); continue }
    byTeacher.set(t, [...(byTeacher.get(t) ?? []), m])
  }

  const items: ReminderItem[] = []
  for (const [teacher, rows] of [...byTeacher].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
    const lines = rows.map((r) => `· ${r.name} ${r.grade} — ${r.why}`).join('\n')
    const tail = opts?.when === 'morning'
      ? '오늘 오전까지 안 채워지면 그 학생은 브리핑이 못 나갑니다.'
      : '채워 주셔야 학부모님 브리핑이 나갑니다.'
    const text =
      `[수학의지혜] ${teacher} 선생님,\n` +
      `${dayLabel(date)} 수업일지 ${rows.length}건이 아직 덜 채워졌어요.\n\n` +
      `${lines}\n\n${tail}\n${APP_URL}/teacher/learning-notes`
    items.push({
      teacher, count: rows.length,
      students: rows.map((r) => `${r.name}(${r.why})`),
      text, bytes: new TextEncoder().encode(text).length,
    })
  }
  return { items, noTeacher: noTeacher.map((m) => `${m.name}(${m.why})`), note: undefined as string | undefined }
}

/** 만들어 둔 문구를 실제로 보낸다. 번호가 없으면 그 선생님만 건너뛴다. */
export async function sendTeacherReminders(items: ReminderItem[], only?: Set<string>) {
  const phones = await fetchOpsTeacherPhones()
  let sent = 0
  for (const it of items) {
    if (only && !only.has(it.teacher)) continue
    const phone = phones.get(it.teacher)
    if (!phone) {
      it.ok = false
      it.error = '연락처가 없어요 (수학OPS 직원 정보에서 확인해주세요)'
      continue
    }
    it.phone = phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')
    const r = await sendSmsViaOps({ to: phone, text: it.text, refType: 'teacher_reminder' })
    it.ok = r.ok
    if (!r.ok) it.error = r.error
    else sent++
  }
  return sent
}
