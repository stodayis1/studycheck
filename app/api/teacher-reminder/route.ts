// 수업일지가 덜 된 선생님께 **본인 몫만** 문자로 알린다.
//
// 왜: 원장님이 「학습일지 미작성 보기」로 보시고 한 분씩 따로 연락하셨다. 그 날 안에
// 채워져야 학부모 브리핑이 나가는데, 알리는 일 자체가 매일 손이 갔다(원장님 2026-10-12).
// 앱 푸시는 선생님들이 잘 안 보셔서 문자로 간다.
//
// ★ 자동으로 보내지 않는다. 학부모 브리핑과 같은 방침으로, 원장님이 미리보기를 보시고
//   직접 누르셔야 나간다. 미리보기(dryRun) 없이 바로 보내는 길은 두지 않는다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { findMissingNotes, mainTeacherOf } from '@/lib/missingNotes'
import { fetchOpsTeacherPhones } from '@/lib/opsTeachers'
import { sendSmsViaOps } from '@/lib/opsSms'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://studycheck-five.vercel.app'

function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 「10/12(토)」 */
function dayLabel(date: string) {
  const d = new Date(date + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`
}

export async function POST(req: NextRequest) {
  // 실제 문자가 나가고 요금이 붙는다. 원장님만.
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  try {
    const body = (await req.json().catch(() => ({}))) as { date?: string; dryRun?: boolean; teachers?: string[] }
    const date = body.date ?? kstToday()
    const dryRun = body.dryRun !== false

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } })

    const { data: sessions } = await db.from('class_sessions')
      .select('id, student_id, session_type, progress_content, today_textbook_name, hw_textbook_name, hw_textbook_page, hw_worksheet_range')
      .eq('session_date', date)
    if (!sessions?.length) {
      return NextResponse.json({ date, dryRun, items: [], note: '그날 수업이 없어요.' })
    }

    const [{ data: notes }, { data: students }] = await Promise.all([
      db.from('learning_notes').select('session_id, attendance').in('session_id', sessions.map((s: any) => s.id)),
      db.from('students').select('id, name, grade, teacher_name').in('id', sessions.map((s: any) => s.student_id)),
    ])

    // ★ 원장님 화면의 「학습일지 미작성 보기」와 **같은 함수**를 쓴다(lib/missingNotes.ts).
    //   기준이 갈리면 원장님 화면엔 3건인데 선생님껜 5건이 간다.
    const missing = findMissingNotes({
      sessions: sessions as any, notes: (notes ?? []) as any, students: (students ?? []) as any,
    })

    // 선생님별로 묶는다. 담당이 안 적힌 학생은 누구에게 보낼지 알 수 없어 따로 모아 보고한다.
    const byTeacher = new Map<string, typeof missing>()
    const noTeacher: typeof missing = []
    for (const m of missing) {
      const t = mainTeacherOf(m.teacher)
      if (!t) { noTeacher.push(m); continue }
      byTeacher.set(t, [...(byTeacher.get(t) ?? []), m])
    }

    const phones = await fetchOpsTeacherPhones()
    const only = body.teachers?.length ? new Set(body.teachers) : null

    const items: any[] = []
    let sent = 0
    let testMode = false
    for (const [teacher, rows] of [...byTeacher].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
      if (only && !only.has(teacher)) continue
      const lines = rows.map((r) => `· ${r.name} ${r.grade} — ${r.why}`).join('\n')
      const text =
        `[수학의지혜] ${teacher} 선생님,\n` +
        `${dayLabel(date)} 수업일지 ${rows.length}건이 아직 덜 채워졌어요.\n\n` +
        `${lines}\n\n` +
        `채워 주셔야 학부모님 브리핑이 나갑니다.\n${APP_URL}/teacher/learning-notes`

      const phone = phones.get(teacher)
      const item: any = { teacher, count: rows.length, students: rows.map((r) => `${r.name}(${r.why})`), text, bytes: new TextEncoder().encode(text).length }
      if (!phone) {
        item.ok = false
        item.error = '연락처가 없어요 (수학OPS 직원 정보에서 확인해주세요)'
      } else {
        item.phone = phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')
        if (!dryRun) {
          try {
            const r = await sendSmsViaOps({ to: phone, text, refType: 'teacher_reminder' })
            item.ok = r.ok
            testMode = testMode || !!r.dryRun
            if (!r.ok) item.error = r.error
            else sent++
          } catch (e: any) {
            item.ok = false
            item.error = e?.message ?? '발송 실패'
          }
        }
      }
      items.push(item)
    }

    return NextResponse.json({
      date, dryRun, sent, testMode,
      items,
      noTeacher: noTeacher.map((m) => `${m.name}(${m.why})`),
      note: items.length === 0 ? '덜 채워진 수업일지가 없어요.' : undefined,
    })
  } catch (e: any) {
    console.error('수업일지 알림 오류:', e)
    return NextResponse.json({ error: e?.message ?? '보내지 못했어요.' }, { status: 500 })
  }
}
