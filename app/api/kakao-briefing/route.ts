// 카톡 수업 브리핑 — 어제 수업을 다음 날 오전 11시에 학부모에게 일괄 발송.
//
// 왜 "다음 날 오전"인가
//   선생님들이 학습현황을 저장하는 시각을 재 보면 당일 21시까지 55%, 22시까지 72%,
//   23시까지 95%, 나머지는 새벽이다. 그날 밤에 보내면 **절반이 빈 브리핑**으로 간다.
//   다음 날 오전이면 최근 30일 1,809건이 **전부** 기록 완료 상태였다.
//
// 중복 발송은 DB 가 막는다
//   briefing_sends 의 (student_id, session_date) 유일 제약. 코드에서 "이미 보냈나?" 를
//   확인하는 방식은 버튼이 두 번 눌리면 둘 다 통과한다.
//
// 버튼 뒤 페이지는 **그때 값을 떠놓은 사진**(report_links.data)이다.
//   링크를 주워도 살아 있는 DB 로 넘어갈 수 없고, 남의 자녀 자료도 볼 수 없다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { SolapiMessageService } from 'solapi'
import { randomBytes } from 'crypto'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildBriefing, fbImages, hwLines } from '@/lib/briefing'

const APP_URL = 'https://studycheck-five.vercel.app'

// 발송량이 많아 기본 10초로는 끝나지 않는다.
export const maxDuration = 300

/** 한국 날짜 문자열. 서버는 UTC 로 돈다. */
function kstDate(offsetDays = 0) {
  const t = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000)
  return t.toISOString().slice(0, 10)
}

function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 버튼 뒤에서 보여 줄 세 가지를 그때 값으로 떠 둔다. */
async function snapshots(db: SupabaseClient, student: any, date: string, ses: any, note: any, fbs: any[]) {
  const sixMonthsAgo = new Date(Date.parse(date) - 183 * 86400_000).toISOString().slice(0, 10)
  const threeMonthsAgo = new Date(Date.parse(date) - 92 * 86400_000).toISOString().slice(0, 10)

  const [{ data: ws }, { data: pastSessions }] = await Promise.all([
    db.from('student_worksheets')
      .select('unit, unit_name, current_level, score, status, worksheet_type, assigned_at, submitted_at, semester, grade_level')
      .eq('student_id', student.id).gte('assigned_at', sixMonthsAgo)
      .order('assigned_at', { ascending: false }).limit(200),
    db.from('class_sessions')
      .select('id, session_date, progress_content')
      .eq('student_id', student.id).gte('session_date', threeMonthsAgo).lte('session_date', date)
      .order('session_date', { ascending: false }).limit(200),
  ])

  const sessionIds = (pastSessions ?? []).map((s: any) => s.id)
  const { data: pastNotes } = sessionIds.length
    ? await db.from('learning_notes')
        .select('session_id, attendance, achievement_pct, worksheet_score, worksheet_submitted, workbook_done')
        .in('session_id', sessionIds)
    : { data: [] as any[] }
  const noteBy = new Map((pastNotes ?? []).map((n: any) => [n.session_id, n]))

  // ── 레벨학습지 점수 현황 ────────────────────────────────────────────────
  const wsRows = (ws ?? []).map((w: any) => ({
    date: (w.submitted_at ?? w.assigned_at ?? '').slice(0, 10),
    unit: w.unit_name || w.unit || '-',
    level: w.current_level ?? null,
    score: w.score ?? null,
    status: w.status ?? null,
    isRetry: w.worksheet_type === 'similar' || w.worksheet_type === 'twin',
  }))
  const scored = wsRows.filter((r) => r.score != null)
  const worksheetSnapshot = {
    studentName: student.name,
    studentGrade: student.grade,
    periodLabel: `${sixMonthsAgo} ~ ${date}`,
    rows: wsRows,
    count: wsRows.length,
    scoredCount: scored.length,
    avgScore: scored.length ? Math.round(scored.reduce((a, r) => a + (r.score as number), 0) / scored.length) : null,
    passRate: wsRows.length ? Math.round((wsRows.filter((r) => r.status === 'passed').length / wsRows.length) * 100) : null,
  }

  // ── 출결현황 및 과제달성률 현황 ─────────────────────────────────────────
  const attRows = (pastSessions ?? []).map((s: any) => {
    const n: any = noteBy.get(s.id)
    const pct = n?.achievement_pct ?? (n?.workbook_done ? 100 : n?.worksheet_submitted ? 70 : null)
    return {
      date: s.session_date,
      dow: DOW[new Date(s.session_date + 'T00:00:00').getDay()],
      attendance: n?.attendance ?? null,
      pct,
      worksheetScore: n?.worksheet_score ?? null,
    }
  })
  const counted = attRows.filter((r) => r.attendance)
  const tally = (k: string) => counted.filter((r) => r.attendance === k).length
  const pcts = attRows.map((r) => r.pct).filter((p): p is number => p != null)
  const attendanceSnapshot = {
    studentName: student.name,
    studentGrade: student.grade,
    periodLabel: `${threeMonthsAgo} ~ ${date}`,
    rows: attRows,
    total: counted.length,
    onTime: tally('정시'),
    late: tally('지각'),
    absent: tally('결석'),
    onTimeRate: counted.length ? Math.round((tally('정시') / counted.length) * 100) : null,
    avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
  }

  // ── 그날의 알림장·사진 ──────────────────────────────────────────────────
  const noticeSnapshot = {
    studentName: student.name,
    studentGrade: student.grade,
    sessionDate: date,
    progress: [ses.progress_content, ses.today_textbook_name, ses.today_chapter]
      .map((t: any) => (t ?? '').trim())
      .filter((t: string, i: number, arr: string[]) => t && arr.indexOf(t) === i),
    homework: hwLines(ses),
    attendance: note?.attendance ?? null,
    achievementPct: note?.achievement_pct ?? null,
    memo: note?.memo ?? null,
    makeupNote: note?.makeup_note ?? null,
    notices: fbs.map((f: any) => ({
      teacherName: f.teacher_name ?? null,
      content: f.content ?? '',
      images: fbImages(f.ai_message),
    })),
  }

  return { worksheetSnapshot, attendanceSnapshot, noticeSnapshot }
}

export interface BriefingSummary {
  date: string
  dryRun: boolean
  sent: number
  failed: number
  skippedAlreadySent: number
  skippedNoPhone: { name: string }[]
  skippedNoRecord: { name: string }[]
  errors: { name: string; error: string }[]
  previews?: { name: string; phone: string; bodyLen: number; body: string }[]
  cleanedExpiredLinks?: number
}

async function run(opts: { date: string; dryRun: boolean; studentIds?: string[] }): Promise<BriefingSummary> {
  const db = admin()
  const { date, dryRun } = opts
  const out: BriefingSummary = {
    date, dryRun, sent: 0, failed: 0, skippedAlreadySent: 0,
    skippedNoPhone: [], skippedNoRecord: [], errors: [], previews: [],
  }

  let q = db.from('class_sessions').select('*').eq('session_date', date)
  if (opts.studentIds?.length) q = q.in('student_id', opts.studentIds)
  const { data: sessions, error: sesErr } = await q
  if (sesErr) throw new Error(`수업 기록을 읽지 못했어요: ${sesErr.message}`)
  if (!sessions?.length) return out

  const studentIds = [...new Set(sessions.map((s: any) => s.student_id))]
  const sessionIds = sessions.map((s: any) => s.id)
  const [{ data: students }, { data: notes }, { data: fbs }, { data: already }] = await Promise.all([
    db.from('students').select('id, name, grade, parent_phone, is_active').in('id', studentIds),
    db.from('learning_notes').select('*').in('session_id', sessionIds),
    // 알림장은 session_id 가 없어 작성 시각으로 묶는다. 한국 날짜 하루치를 UTC 범위로 받는다.
    db.from('feedbacks').select('*').in('student_id', studentIds)
      .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`),
    db.from('briefing_sends').select('student_id').eq('session_date', date),
  ])

  const studentBy = new Map((students ?? []).map((s: any) => [s.id, s]))
  const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))
  const sentAlready = new Set((already ?? []).map((r: any) => r.student_id))

  const key = process.env.SOLAPI_API_KEY
  const secret = process.env.SOLAPI_API_SECRET
  const pfId = process.env.SOLAPI_PF_ID
  const templateId = process.env.SOLAPI_BRIEFING_TEMPLATE_ID ?? process.env.SOLAPI_TEMPLATE_ID
  const senderPhone = process.env.SOLAPI_SENDER_PHONE
  if (!dryRun && (!key || !secret || !pfId || !templateId || !senderPhone)) {
    throw new Error('Solapi 설정값(SOLAPI_API_KEY · SOLAPI_PF_ID · SOLAPI_BRIEFING_TEMPLATE_ID 등)이 Vercel 에 없어요.')
  }
  const solapi = dryRun ? null : new SolapiMessageService(key!, secret!)

  for (const ses of sessions) {
    const student: any = studentBy.get(ses.student_id)
    if (!student) continue
    const note: any = noteBy.get(ses.id)

    // 기록이 안 끝난 학생은 보내지 않는다 — 빈 브리핑이 가는 것이 안 가는 것보다 나쁘다.
    if (!note || !note.attendance) { out.skippedNoRecord.push({ name: student.name }); continue }
    if (!student.parent_phone) { out.skippedNoPhone.push({ name: student.name }); continue }
    if (sentAlready.has(student.id)) { out.skippedAlreadySent++; continue }

    const dayFbs = (fbs ?? []).filter((f: any) => f.student_id === student.id)
    const brief = buildBriefing({ studentName: student.name, session: ses, note, feedbacks: dayFbs })

    if (dryRun) {
      out.previews!.push({
        name: student.name,
        phone: String(student.parent_phone).replace(/^(\d{3})\d+(\d{4})$/, '$1****$2'),
        bodyLen: brief.bodyLen,
        body: brief.body,
      })
      out.sent++
      continue
    }

    try {
      const snaps = await snapshots(db, student, date, ses, note, dayFbs)
      const mk = async (report_type: string, data: any) => {
        const token = randomBytes(16).toString('hex')
        const { error } = await db.from('report_links').insert({
          student_id: student.id, report_type, period_label: date,
          period_start: date, period_end: date, data, token,
          sent_at: new Date().toISOString(),
        })
        if (error) throw new Error(`링크 생성 실패: ${error.message}`)
        return token
      }
      const [tScore, tAtt, tNotice] = await Promise.all([
        mk('worksheet_scores', snaps.worksheetSnapshot),
        mk('attendance_rate', snaps.attendanceSnapshot),
        mk('daily_notice', snaps.noticeSnapshot),
      ])

      await solapi!.send({
        to: String(student.parent_phone).replace(/-/g, ''),
        from: senderPhone!.replace(/-/g, ''),
        kakaoOptions: {
          pfId: pfId!,
          templateId: templateId!,
          variables: {
            ...brief.vars,
            '#{점수토큰}': tScore,
            '#{출결토큰}': tAtt,
            '#{알림장토큰}': tNotice,
          },
        },
      })

      // 성공을 적는다. 유일 제약에 걸리면(동시에 두 번 돌았다) 발송은 이미 됐으므로 조용히 넘긴다.
      await db.from('briefing_sends').insert({
        student_id: student.id, session_date: date, session_id: ses.id,
        to_phone: String(student.parent_phone), status: 'sent', body_len: brief.bodyLen,
      })
      out.sent++
    } catch (e: any) {
      out.failed++
      out.errors.push({ name: student.name, error: e?.message ?? '알 수 없는 오류' })
      await db.from('briefing_sends').insert({
        student_id: student.id, session_date: date, session_id: ses.id,
        status: 'failed', error: String(e?.message ?? e).slice(0, 500), body_len: brief.bodyLen,
      })
    }
  }

  if (!dryRun) delete out.previews
  return out
}

// ── Vercel Cron (매일 오전 11시 한국시간 = 02:00 UTC) ────────────────────────
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 401 })
  }
  try {
    const date = new URL(req.url).searchParams.get('date') ?? kstDate(-1)
    const summary = await run({ date, dryRun: false })
    // 만료된 링크를 치운다 — 쌓이면 표가 무거워지고, 만료된 링크를 남길 이유도 없다.
    const { count } = await admin().from('report_links').delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString())
    summary.cleanedExpiredLinks = count ?? 0
    return NextResponse.json(summary)
  } catch (e: any) {
    console.error('카톡 브리핑 자동 발송 오류:', e)
    return NextResponse.json({ error: e?.message ?? '발송에 실패했어요.' }, { status: 500 })
  }
}

// ── 원장님이 화면에서 직접 (미리보기 → 발송) ────────────────────────────────
export async function POST(req: NextRequest) {
  // 실제 요금이 나가고 학부모에게 바로 도착한다. 원장님만.
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  try {
    const body = (await req.json().catch(() => ({}))) as { date?: string; dryRun?: boolean; studentIds?: string[] }
    const date = body.date ?? kstDate(-1)
    const summary = await run({ date, dryRun: body.dryRun !== false, studentIds: body.studentIds })
    return NextResponse.json(summary)
  } catch (e: any) {
    console.error('카톡 브리핑 발송 오류:', e)
    return NextResponse.json({ error: e?.message ?? '발송에 실패했어요.' }, { status: 500 })
  }
}
