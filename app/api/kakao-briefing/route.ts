// 카톡 수업 브리핑 — 두 번에 나눠 보낸다(원장님 결정 2026-10-08).
//
//   1차  수업 당일 저녁 8시 — **초등부**
//   2차  다음 날 오전 11시 — **중고등부 + 1차에 못 나간 초등부**
//
// 왜 이렇게 나누나 — 선생님들이 학습일지를 저장하는 시각이 학년별로 전혀 다르다
// (최근 30일 1,865건):
//     초등   당일 20시까지 85% · 당일 안에 100%
//     중고등 당일 20시까지 19% · 당일 안에  94%
//   초등은 저녁 8시면 거의 다 차 있어 그날 바로 보낼 수 있다.
//   중고등을 같이 보내면 열에 여덟이 빈 브리핑으로 나간다.
//
// 1차에 기록이 안 끝나 못 나간 초등부는 2차에서 함께 나간다 —
// briefing_sends 의 (학생, 날짜) 유일 제약이 "이미 보낸 사람"을 자동으로 걸러 준다.
//
// 중복 발송은 DB 가 막는다
//   briefing_sends 의 (student_id, session_date) 유일 제약. 코드에서 "이미 보냈나?" 를
//   확인하는 방식은 버튼이 두 번 눌리면 둘 다 통과한다.
//
// 버튼 뒤 페이지는 **그때 값을 떠놓은 사진**(report_links.data)이다.
//   링크를 주워도 살아 있는 DB 로 넘어갈 수 없고, 남의 자녀 자료도 볼 수 없다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { aligoConfig, sendAlimtalk, AligoError, type AligoConfig } from '@/lib/aligo'
import { randomBytes } from 'crypto'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildBriefing } from '@/lib/briefing'
import { snapshots } from '@/lib/briefingSnapshots'
import { fetchOpsMakeups } from '@/lib/opsMakeups'
import { isExamAbsence } from '@/lib/attendance'
import { fetchOpsTeacherPhones } from '@/lib/opsTeachers'

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

export interface BriefingSummary {
  date: string
  /** 1 = 당일 저녁 8시(초등) · 2 = 다음 날 오전 11시(전원) */
  phase?: number
  dryRun: boolean
  /** 알리고 testMode — 켜져 있으면 요금도 안 나가고 학부모에게도 안 간다 */
  testMode?: boolean
  sent: number
  failed: number
  skippedAlreadySent: number
  skippedNoPhone: { name: string }[]
  skippedNoRecord: { name: string }[]
  /** 시험기간 결석이라 일부러 안 보낸 학생 */
  skippedExam: { name: string }[]
  errors: { name: string; error: string }[]
  previews?: { studentId: string; name: string; phone: string; bodyLen: number; body: string }[]
  cleanedExpiredLinks?: number
  /** 알리고가 돌려준 남은 포인트 · 건당 단가 */
  pointLeft?: number
  unitCost?: number
}

async function run(opts: {
  date: string; dryRun: boolean; studentIds?: string[]; testPhone?: string
  /** 'elementary' 면 초등부만, 'secondary' 면 중·고등부만. 안 주면 전원. */
  only?: 'elementary' | 'secondary'
}): Promise<BriefingSummary> {
  const db = admin()
  const { date, dryRun } = opts
  const out: BriefingSummary = {
    date, dryRun, sent: 0, failed: 0, skippedAlreadySent: 0,
    skippedNoPhone: [], skippedNoRecord: [], skippedExam: [], errors: [], previews: [],
  }

  let q = db.from('class_sessions').select('*').eq('session_date', date)
  if (opts.studentIds?.length) q = q.in('student_id', opts.studentIds)
  const { data: sessions, error: sesErr } = await q
  if (sesErr) throw new Error(`수업 기록을 읽지 못했어요: ${sesErr.message}`)
  if (!sessions?.length) return out

  const studentIds = [...new Set(sessions.map((s: any) => s.student_id))]
  const sessionIds = sessions.map((s: any) => s.id)
  const [{ data: students }, { data: notes }, { data: fbs }, { data: already }] = await Promise.all([
    db.from('students').select('id, name, grade, parent_phone, is_active, ops_student_id').in('id', studentIds),
    db.from('learning_notes').select('*').in('session_id', sessionIds),
    // 알림장은 session_id 가 없어 작성 시각으로 묶는다. 한국 날짜 하루치를 UTC 범위로 받는다.
    db.from('feedbacks').select('*').in('student_id', studentIds)
      .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`),
    db.from('briefing_sends').select('student_id').eq('session_date', date),
  ])

  const studentBy = new Map((students ?? []).map((s: any) => [s.id, s]))

  // ★ 결석한 날 학부모가 가장 알고 싶은 것은 「보강이 언제인가」다.
  //   보강은 OPS 가 들고 있다. 학생 전체 것을 **한 번에** 읽어 둔다
  //   (학생마다 부르면 60번 왕복한다).
  const opsIds = (students ?? []).map((s: any) => s.ops_student_id).filter(Boolean)
  const makeupsBy = await fetchOpsMakeups(opsIds, date)
  const makeupFor = (st: any) =>
    (st.ops_student_id ? makeupsBy.get(st.ops_student_id) ?? [] : [])
      .find((m) => m.absentDate === date) ?? null
  const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))
  const sentAlready = new Set((already ?? []).map((r: any) => r.student_id))

  // 설정이 빠졌으면 **여기서** 멈춘다. 반쯤 보내 놓고 멈추는 것이 제일 나쁘다.
  const cfg: AligoConfig | null = dryRun ? null : aligoConfig()
  if (cfg) out.testMode = cfg.testMode

  for (const ses of sessions) {
    const student: any = studentBy.get(ses.student_id)
    if (!student) continue
    const note: any = noteBy.get(ses.id)

    // 기록이 안 끝난 학생은 보내지 않는다 — 빈 브리핑이 가는 것이 안 가는 것보다 나쁘다.
    // 1차(초등)·2차(전원) 를 학년으로 가른다. 학년은 '초3' '중2' '고1' 꼴이다.
    if (opts.only) {
      const 초등 = String(student.grade ?? '').startsWith('초')
      if (opts.only === 'elementary' && !초등) continue
      if (opts.only === 'secondary' && 초등) continue
    }
    if (!note || !note.attendance) { out.skippedNoRecord.push({ name: student.name }); continue }
    // ★ 시험기간은 **아예 보내지 않는다**(원장님 결정 2026-10-08).
    //   중·고등은 시험기간에 학원을 안 나와도 봐주시는데, 그걸 「결석」으로 통보하면
    //   학부모도 아는 상황을 굳이 들춰 보는 꼴이 된다. 보낼 내용도 없다.
    if (isExamAbsence(note.attendance)) { out.skippedExam.push({ name: student.name }); continue }
    if (!student.parent_phone) { out.skippedNoPhone.push({ name: student.name }); continue }
    if (!opts.testPhone && sentAlready.has(student.id)) { out.skippedAlreadySent++; continue }

    const dayFbs = (fbs ?? []).filter((f: any) => f.student_id === student.id)
    const brief = buildBriefing({
      studentName: student.name, session: ses, note, feedbacks: dayFbs,
      makeup: makeupFor(student),
      // 「알림장 없는 판」은 심사를 통과해 코드가 들어와 있을 때만 쓴다.
      noNoteTemplate: !!process.env.ALIGO_BRIEFING_TPL_CODE_NONOTE,
    })

    if (dryRun) {
      out.previews!.push({
        studentId: student.id,
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
      // 알림장 없는 날은 「알림장·사진」 버튼을 안 보내므로 링크도 만들지 않는다.
      const needNotice = brief.template !== 'nonote'
      const [tScore, tAtt, tNotice] = await Promise.all([
        mk('worksheet_scores', snaps.worksheetSnapshot),
        mk('attendance_rate', snaps.attendanceSnapshot),
        needNotice ? mk('daily_notice', snaps.noticeSnapshot) : Promise.resolve(''),
      ])

      // ★ 알리고는 변수 치환을 해 주지 않는다. 완성된 본문을 그대로 보내고,
      //   그 본문이 승인된 템플릿 서식과 일치해야 한다(lib/briefing.ts 가 그 틀을 지킨다).
      //   버튼 링크도 토큰 변수가 아니라 진짜 주소를 넣는다.
      const to = opts.testPhone ?? String(student.parent_phone)
      // ★ 알림장이 없는 날은 그 칸이 **아예 없는 템플릿**으로 보낸다(빈말을 넣지 않으려고).
      //   아직 심사 전이면 그 코드가 없으니 원래 템플릿으로 떨어뜨린다 — 그 경우에만 빈말이 나간다.
      const tplForThis = brief.template === 'nonote'
        ? (process.env.ALIGO_BRIEFING_TPL_CODE_NONOTE || cfg!.tplCode)
        : cfg!.tplCode
      const r = await sendAlimtalk({ ...cfg!, tplCode: tplForThis }, {
        to,
        name: student.name,
        subject: `${student.name} 학생 수업 브리핑`,
        message: brief.body,
        // ★ 버튼은 **승인된 템플릿에 등록된 것과 개수·이름·링크가 같아야** 한다.
        //   알림장이 없는 날은 「알림장·사진 보기」를 눌러도 빈 화면이라 그 판에는 버튼을 안 둔다
        //   (그 판 템플릿도 버튼 2개로 등록해야 한다 — docs/카톡브리핑.md).
        buttons: [
          { name: '레벨학습지 점수 현황', linkType: 'WL', linkMo: `${APP_URL}/report/${tScore}`, linkPc: `${APP_URL}/report/${tScore}` },
          { name: '출결·과제달성률 현황', linkType: 'WL', linkMo: `${APP_URL}/report/${tAtt}`, linkPc: `${APP_URL}/report/${tAtt}` },
          ...(brief.template === 'nonote' ? [] : [
            { name: '알림장·사진 보기', linkType: 'WL' as const, linkMo: `${APP_URL}/report/${tNotice}`, linkPc: `${APP_URL}/report/${tNotice}` },
          ]),
        ],
        failoverMessage: brief.body,
      })
      if (r.point != null) out.pointLeft = r.point
      if (r.unit != null) out.unitCost = r.unit

      // 성공을 적는다. 유일 제약에 걸리면(동시에 두 번 돌았다) 발송은 이미 됐으므로 조용히 넘긴다.
      // ★ **테스트로 보낸 것은 기록하지 않는다** — 기록하면 그 학생의 진짜 발송이 영영 막힌다.
      //   테스트 번호로 보낸 경우와, 알리고 테스트 모드(ALIGO_TEST_MODE 가 N 이 아닐 때)가 그렇다.
      //   테스트 모드에서는 알리고가 실제로 보내지도, 요금을 받지도 않는다.
      if (!opts.testPhone && !cfg!.testMode) {
        await db.from('briefing_sends').insert({
          student_id: student.id, session_date: date, session_id: ses.id,
          to_phone: String(student.parent_phone), status: 'sent', body_len: brief.bodyLen,
        })
      }
      out.sent++
    } catch (e: any) {
      out.failed++
      out.errors.push({ name: student.name, error: e?.message ?? '알 수 없는 오류' })
      if (!opts.testPhone && !cfg!.testMode) {
        await db.from('briefing_sends').insert({
          student_id: student.id, session_date: date, session_id: ses.id,
          status: 'failed', error: String(e?.message ?? e).slice(0, 500), body_len: brief.bodyLen,
        })
      }
      // 설정이 틀렸거나 포인트가 없으면 남은 사람도 전부 같은 이유로 실패한다. 거기서 멈춘다.
      if (e instanceof AligoError && (e.code === -99 || /포인트|인증|설정/.test(e.message ?? ''))) {
        out.errors.push({ name: '—', error: '같은 오류가 반복될 것 같아 여기서 멈췄어요.' })
        break
      }
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
    const q = new URL(req.url).searchParams
    // 1차 = 당일 저녁 8시, 초등부 / 2차 = 다음 날 오전 11시, 전원(초등 못 나간 것 포함)
    const phase = q.get('phase') === '1' ? 1 : 2
    const date = q.get('date') ?? (phase === 1 ? kstDate(0) : kstDate(-1))
    const summary = await run({ date, dryRun: false, only: phase === 1 ? 'elementary' : undefined })
    summary.phase = phase
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
/**
 * 담당 강사에게 **본인이 쓴 브리핑 한 통**을 보내 준다.
 *
 * 왜: 선생님은 자기가 적은 글이 학부모님께 어떤 모양으로 가는지 볼 수가 없었다.
 * 그날 본인 담당 학생 중 **글이 가장 짧은 한 명**을 골라 그 선생님 번호로 보낸다
 * (원장님 2026-10-10). 짧은 글이 기준인 이유 — 적게 쓴 날이 어떻게 보이는지가
 * 제일 도움이 되기 때문이다.
 *
 * 번호는 OPS profiles 에서 읽는다(스터디체크 users 에는 전화 칸이 없다).
 * 학부모 발송 기록(briefing_sends)은 남기지 않는다 — 진짜 발송을 막으면 안 된다.
 */
async function runTeacherSample(date: string) {
  // ① 먼저 미리보기로 그날 보낼 수 있는 학생과 글 길이를 모은다.
  const preview = await run({ date, dryRun: true })
  const previews: any[] = preview.previews ?? []
  if (!previews.length) {
    return { date, sent: 0, picks: [], note: '그날 보낼 수 있는 학생이 없어요.' }
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
  const { data: students } = await db.from('students')
    .select('id, name, teacher_name').in('id', previews.map((p) => p.studentId))
  const teacherOf = new Map((students ?? []).map((s: any) =>
    [s.id, String(s.teacher_name ?? '').split(/[,，、]/)[0].trim()]))

  // ② 선생님마다 **글이 가장 짧은** 한 명을 고른다.
  const pickBy = new Map<string, any>()
  for (const p of previews) {
    const t = teacherOf.get(p.studentId)
    if (!t) continue
    const cur = pickBy.get(t)
    if (!cur || (p.bodyLen ?? 0) < (cur.bodyLen ?? 0)) pickBy.set(t, p)
  }

  const phones = await fetchOpsTeacherPhones()
  const picks: any[] = []
  let sent = 0
  for (const [teacher, p] of pickBy) {
    const phone = phones.get(teacher)
    if (!phone) { picks.push({ teacher, student: p.name, ok: false, error: '연락처가 없어요(수학OPS 직원 정보)' }); continue }
    const r = await run({ date, dryRun: false, studentIds: [p.studentId], testPhone: phone })
    const ok = r.sent > 0
    if (ok) sent++
    picks.push({
      teacher, student: p.name, bodyLen: p.bodyLen, ok,
      error: ok ? undefined : (r.errors?.[0]?.error ?? '발송 실패'),
    })
  }
  picks.sort((a, b) => a.teacher.localeCompare(b.teacher, 'ko'))
  return { date, sent, picks }
}

export async function POST(req: NextRequest) {
  // 실제 요금이 나가고 학부모에게 바로 도착한다. 원장님만.
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  try {
    const body = (await req.json().catch(() => ({}))) as
      { date?: string; dryRun?: boolean; studentIds?: string[]; testPhone?: string
        only?: 'elementary' | 'secondary'; teacherSample?: boolean }
    const date = body.date ?? kstDate(-1)
    // 담당 강사에게 본인 글 한 통씩 — 학부모 발송과 섞이지 않게 길을 따로 둔다.
    if (body.teacherSample) return NextResponse.json(await runTeacherSample(date))
    const summary = await run({
      date, dryRun: body.dryRun !== false, studentIds: body.studentIds,
      // 테스트 번호를 주면 그 번호로만 가고 발송 기록도 남기지 않는다(진짜 발송을 막지 않게).
      testPhone: body.testPhone?.trim() || undefined,
      only: body.only,
    })
    return NextResponse.json(summary)
  } catch (e: any) {
    console.error('카톡 브리핑 발송 오류:', e)
    return NextResponse.json({ error: e?.message ?? '발송에 실패했어요.' }, { status: 500 })
  }
}
