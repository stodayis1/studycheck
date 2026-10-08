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
import { aligoConfig, sendAlimtalk, AligoError, type AligoConfig } from '@/lib/aligo'
import { randomBytes } from 'crypto'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildBriefing } from '@/lib/briefing'
import { snapshots } from '@/lib/briefingSnapshots'
import { fetchOpsMakeups } from '@/lib/opsMakeups'

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
  dryRun: boolean
  /** 알리고 testMode — 켜져 있으면 요금도 안 나가고 학부모에게도 안 간다 */
  testMode?: boolean
  sent: number
  failed: number
  skippedAlreadySent: number
  skippedNoPhone: { name: string }[]
  skippedNoRecord: { name: string }[]
  errors: { name: string; error: string }[]
  previews?: { studentId: string; name: string; phone: string; bodyLen: number; body: string }[]
  cleanedExpiredLinks?: number
  /** 알리고가 돌려준 남은 포인트 · 건당 단가 */
  pointLeft?: number
  unitCost?: number
}

async function run(opts: { date: string; dryRun: boolean; studentIds?: string[]; testPhone?: string }): Promise<BriefingSummary> {
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
    if (!note || !note.attendance) { out.skippedNoRecord.push({ name: student.name }); continue }
    if (!student.parent_phone) { out.skippedNoPhone.push({ name: student.name }); continue }
    if (!opts.testPhone && sentAlready.has(student.id)) { out.skippedAlreadySent++; continue }

    const dayFbs = (fbs ?? []).filter((f: any) => f.student_id === student.id)
    const brief = buildBriefing({
      studentName: student.name, session: ses, note, feedbacks: dayFbs,
      makeup: makeupFor(student),
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
      const [tScore, tAtt, tNotice] = await Promise.all([
        mk('worksheet_scores', snaps.worksheetSnapshot),
        mk('attendance_rate', snaps.attendanceSnapshot),
        mk('daily_notice', snaps.noticeSnapshot),
      ])

      // ★ 알리고는 변수 치환을 해 주지 않는다. 완성된 본문을 그대로 보내고,
      //   그 본문이 승인된 템플릿 서식과 일치해야 한다(lib/briefing.ts 가 그 틀을 지킨다).
      //   버튼 링크도 토큰 변수가 아니라 진짜 주소를 넣는다.
      const to = opts.testPhone ?? String(student.parent_phone)
      const r = await sendAlimtalk(cfg!, {
        to,
        name: student.name,
        subject: `${student.name} 학생 수업 브리핑`,
        message: brief.body,
        buttons: [
          { name: '레벨학습지 점수 현황', linkType: 'WL', linkMo: `${APP_URL}/report/${tScore}`, linkPc: `${APP_URL}/report/${tScore}` },
          { name: '출결·과제달성률 현황', linkType: 'WL', linkMo: `${APP_URL}/report/${tAtt}`, linkPc: `${APP_URL}/report/${tAtt}` },
          { name: '알림장·사진 보기', linkType: 'WL', linkMo: `${APP_URL}/report/${tNotice}`, linkPc: `${APP_URL}/report/${tNotice}` },
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
    const body = (await req.json().catch(() => ({}))) as
      { date?: string; dryRun?: boolean; studentIds?: string[]; testPhone?: string }
    const date = body.date ?? kstDate(-1)
    const summary = await run({
      date, dryRun: body.dryRun !== false, studentIds: body.studentIds,
      // 테스트 번호를 주면 그 번호로만 가고 발송 기록도 남기지 않는다(진짜 발송을 막지 않게).
      testPhone: body.testPhone?.trim() || undefined,
    })
    return NextResponse.json(summary)
  } catch (e: any) {
    console.error('카톡 브리핑 발송 오류:', e)
    return NextResponse.json({ error: e?.message ?? '발송에 실패했어요.' }, { status: 500 })
  }
}
