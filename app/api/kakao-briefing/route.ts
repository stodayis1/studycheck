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
import { denyIfNotStaff, staffOrDeny } from '@/lib/apiAuth'
import { resolveBriefingTemplateCodes, pickCodes } from '@/lib/briefingTemplate'
import { buildBriefing } from '@/lib/briefing'
import { snapshots } from '@/lib/briefingSnapshots'
import { fetchOpsMakeups } from '@/lib/opsMakeups'
import { isExamAbsence } from '@/lib/attendance'
import { fetchOpsTeacherPhones } from '@/lib/opsTeachers'
import { mainTeacherOf } from '@/lib/teachers'

const APP_URL = 'https://studycheck-five.vercel.app'

/**
 * 담당강사 샘플을 **저녁 8시에** 받을 선생님.
 *
 * 왜 나누나 (원장님 2026-10-15)
 *   이 두 분은 그날 안에 기록을 끝내셔서 담당 학생 브리핑이 저녁 8시에 다 나간다.
 *   그러니 본인 글을 보시는 샘플도 그때 같이 가는 것이 맞다. 나머지 선생님은
 *   학생 브리핑이 다음 날 오전 11시에 나가므로 샘플도 그때 간다.
 *
 * ★ 선생님이 바뀌거나 기록 습관이 바뀌면 이 줄만 고치면 된다.
 */
export const EVENING_SAMPLE_TEACHERS = ['윤주희', '조윤희']

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
  /** 저녁 8시에 「출결만 찍혀 있어」 다음 날 오전 11시로 미룬 학생 */
  skippedThin: { name: string }[]
  /** 어느 판으로 나가는지 — 「예전 판」이면 새 템플릿이 아직 안 잡힌 것이다 */
  template?: string
  errors: { name: string; error: string }[]
  previews?: {
    studentId: string; name: string; phone: string; bodyLen: number; body: string
    attendance?: string | null
    /** 담당 강사 칸 그대로 (「조윤희, 이규숙」처럼 여럿일 수 있다) */
    teacherName?: string | null
    /** 학부모님께 이미 나간 학생. 보낼 대상 수에는 안 들어가지만 목록에는 보인다. */
    alreadySent?: boolean
    /** 출결 말고 적힌 것이 없는 건 — 저녁 8시 자동 발송에서는 다음 날 11시로 미뤄진다. */
    thin?: boolean
  }[]
  /** 「선생님께 보내기」에서 고를 수 있는 분 — 원장·주임 (담당 강사는 줄마다 따로) */
  staffOptions?: { admins: string[]; supervisors: string[] }
  cleanedExpiredLinks?: number
  /** 알리고가 돌려준 남은 포인트 · 건당 단가 */
  pointLeft?: number
  unitCost?: number
}

async function run(opts: {
  date: string; dryRun: boolean; studentIds?: string[]; testPhone?: string
  /** 'elementary' 면 초등부만, 'secondary' 면 중·고등부만. 안 주면 전원. */
  only?: 'elementary' | 'secondary'
  /** 다시 보낸 사람 이름 — 기록에 남긴다 */
  by?: string
  /**
   * 저녁 8시 1차인가. 1차에서는 **출결만 찍힌 껍데기**를 보내지 않고 다음 날 오전 11시로 미룬다.
   * ★ 선생님들은 출결을 먼저 찍고 진도·과제·알림장을 나중에 채우신다. 그 사이에 8시가 지나면
   *   「진도 기록 없음 / 따로 낸 과제가 없어요」만 적힌 글이 학부모님께 가 버리고, 뒤에 채운
   *   내용은 영영 안 나간다 (2026-10-21 이지훈·최다윤 153자 — 지금 값으로는 519·540자다.
   *   10월 들어 같은 모양이 45건). 원장님 2026-10-22 결정: 출결뿐이면 미룬다.
   * ★ 2차(오전 11시)는 **마지막 기회**라 이 기준을 쓰지 않는다. 안 그러면 진도·과제 칸을
   *   잘 안 쓰시는 고등부가 아예 한 통도 못 나간다.
   */
  eveningRun?: boolean
  /**
   * ★ 이미 보낸 학생도 **포함**해서 글을 만든다 (미리보기 전용).
   *   담당강사 샘플은 「학부모님께 이렇게 나갔습니다」를 보여 주는 것이라, 이미 나간
   *   학생이 오히려 대상이다. 그런데 이미 보낸 사람을 걸러 버려서, 학부모 발송이 끝난
   *   뒤에는 늘 「보낼 수 있는 학생이 없어요」가 됐다 (2026-10-14 신애진 선생님이
   *   샘플을 못 받으신 이유).
   */
  includeSent?: boolean
  /**
   * 원장님이 **일부러** 다시 보내는 것. 「이미 보냄」을 건너뛰지 않는다.
   * (원장님 2026-10-27 「못 받았다는 사람 다시 보내지」 — 알림톡이 나갔다고 떠도
   *  카카오 쪽에서 못 닿는 일이 있고, 그건 우리 기록에 안 남는다.)
   * ★ 자동 발송(저녁 8시·다음 날 11시)은 이 값을 **절대 안 준다.** 두 번 나가면 안 된다.
   */
  resend?: boolean
}): Promise<BriefingSummary> {
  const db = admin()
  const { date, dryRun } = opts
  const out: BriefingSummary = {
    date, dryRun, sent: 0, failed: 0, skippedAlreadySent: 0,
    skippedNoPhone: [], skippedNoRecord: [], skippedExam: [], skippedThin: [], errors: [], previews: [],
  }

  let q = db.from('class_sessions').select('*').eq('session_date', date)
  if (opts.studentIds?.length) q = q.in('student_id', opts.studentIds)
  const { data: sessions, error: sesErr } = await q
  if (sesErr) throw new Error(`수업 기록을 읽지 못했어요: ${sesErr.message}`)
  if (!sessions?.length) return out

  const studentIds = [...new Set(sessions.map((s: any) => s.student_id))]
  const sessionIds = sessions.map((s: any) => s.id)
  const [{ data: students }, { data: notes }, { data: fbs }, { data: already }] = await Promise.all([
    db.from('students').select('id, name, grade, parent_phone, is_active, ops_student_id, teacher_name').in('id', studentIds),
    db.from('learning_notes').select('*').in('session_id', sessionIds),
    // 알림장은 session_id 가 없어 작성 시각으로 묶는다. 한국 날짜 하루치를 UTC 범위로 받는다.
    db.from('feedbacks').select('*').in('student_id', studentIds)
      .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`),
    db.from('briefing_sends').select('student_id').eq('session_date', date),
  ])

  const studentBy = new Map((students ?? []).map((s: any) => [s.id, s]))

  // ★ 영상 과제를 브리핑의 「다음 시간까지 과제」에 적으려면 **몇 편이고 그중 증명이 몇 편인지**를
  //   알아야 한다. 어떤 영상이 증명인지는 lesson_videos 만 안다 — 그날치를 한 번에 읽어 둔다
  //   (학생마다 부르면 60번 왕복한다).
  const ytId = (u: string) => u.trim().match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1] ?? null
  const allYt = [...new Set(sessions.flatMap((x: any) =>
    String(x.video_url ?? '').split(/\r?\n/).map((u: string) => ytId(u)).filter(Boolean)))] as string[]
  const kindOf = new Map<string, string>()
  if (allYt.length) {
    const { data: lv } = await db.from('lesson_videos').select('youtube_id, kind').in('youtube_id', allYt)
    for (const v of (lv ?? []) as any[]) kindOf.set(v.youtube_id, v.kind)
  }
  const videosOf = (x: any) => {
    // 주소가 아닌 글이 들어 있는 옛 기록은 세지 않는다(「도형의 성질 Lv. 3.5」 2026-07-24).
    const urls = String(x.video_url ?? '').split(/\r?\n/)
      .map((u: string) => u.trim()).filter((u: string) => /^https?:\/\//.test(u))
    const proof = urls.filter((u) => kindOf.get(ytId(u) ?? '') === '증명').length
    return { total: urls.length, proof }
  }

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

  // ★ 어느 판으로 보낼지 **알리고에 물어서** 정한다 (원장님 2026-10-19).
  //   승인된 새 판을 두고도 환경변수에 코드를 안 넣어 예전 판으로 나가고 있었다.
  //   사람이 기억해야 하는 단계는 언젠가 빠진다 — 그 단계를 없앤다.
  //   못 물어보면(키 없음·연결 실패) 예전처럼 환경변수로 떨어진다.
  const tpl = pickCodes(await resolveBriefingTemplateCodes())
  out.template = tpl.v3 ? '데일리테스트 판' : tpl.v2 ? '과제 성취도 판' : '예전 판'

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

    // ★ 저녁 8시 1차 — 출결 말고 **적힌 것이 하나라도** 있어야 보낸다.
    //   결석은 그 자체가 할 말이라(보강 안내가 붙는다) 이 기준을 쓰지 않는다.
    const 껍데기 = note.attendance !== '결석'
      && !([ses.progress_content, ses.today_textbook_name, ses.today_chapter,
            ses.hw_textbook_name, ses.hw_textbook_page, ses.hw_worksheet_range,
            ses.video_url, note.memo, note.makeup_note,
           ].some((t: any) => String(t ?? '').trim())
        || ses.daily_test_score != null
        || (fbs ?? []).some((f: any) => f.student_id === student.id && String(f.content ?? '').trim()))
    if (opts.eveningRun && 껍데기) { out.skippedThin.push({ name: student.name }); continue }

    if (!student.parent_phone) { out.skippedNoPhone.push({ name: student.name }); continue }
    // ★ 미리보기에서는 **이미 보낸 학생도 보여 준다.** 원장님이 그 줄에서 「선생님께 보내기」를
    //   하시기 때문이다. 예전에는 빼 버려서, 학부모 발송이 끝난 학생은 목록에서 사라졌다
    //   (2026-10-16 조은서 학생이 안 뜬 이유). 보낼 대상 수에는 안 들어간다.
    const already = !opts.testPhone && sentAlready.has(student.id)
    if (already && !dryRun && !opts.includeSent && !opts.resend) { out.skippedAlreadySent++; continue }

    const dayFbs = (fbs ?? []).filter((f: any) => f.student_id === student.id)
    const brief = buildBriefing({
      studentName: student.name, studentGrade: student.grade, session: ses, note, feedbacks: dayFbs,
      videos: videosOf(ses),
      makeup: makeupFor(student),
      // 「알림장 없는 판」은 심사를 통과해 코드가 들어와 있을 때만 쓴다.
      // ★ 「알림장 없는 판」은 **쓰는 판에 맞는 코드가 있을 때만** 쓴다.
      //   새 판으로 넘어갔는데 새 판의 알림장-없는 코드가 아직 없으면, 본문만 알림장 없는
      //   꼴로 만들어 놓고 코드는 알림장 있는 것을 보내게 되어 서식이 어긋난다(그러면 안 나간다).
      noNoteTemplate: tpl.v2 ? !!tpl.v2NoNote : !!tpl.v1NoNote,
      // 새 판 코드가 들어오면 그때부터 「과제 성취도」 판으로 나간다.
      useV2: !!tpl.v2,
      // ★ 데일리테스트 줄이 있는 판(V3). 코드가 있고 **그날 점수가 있을 때만** 그 판으로 간다
      //   (원장님 2026-10-17: 고등부는 데일리테스트를 더 많이 쓰신다).
      useV3: !!tpl.v3,
      noNoteTemplateV3: !!tpl.v3NoNote,
    })

    if (dryRun) {
      out.previews!.push({
        studentId: student.id,
        name: student.name,
        phone: String(student.parent_phone).replace(/^(\d{3})\d+(\d{4})$/, '$1****$2'),
        attendance: note.attendance ?? null,
        teacherName: student.teacher_name ?? null,
        bodyLen: brief.bodyLen,
        body: brief.body,
        alreadySent: already,
        // 출결 말고는 아무것도 안 적힌 건 — 저녁 8시 자동 발송에서는 다음 날로 미뤄진다.
        thin: 껍데기,
      })
      if (already) out.skippedAlreadySent++
      else out.sent++
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
      // ★ 새 판(「과제 성취도」)이 심사를 통과하면 그 코드로 보낸다. 코드가 없으면 예전 판 그대로.
      //   본문도 lib/briefing.ts 가 같은 조건으로 새 판 서식에 맞춰 만든다 — 둘이 어긋나면 안 나간다.
      // ★ 본문을 어느 판으로 만들었는지(brief)와 보내는 코드가 **반드시 같아야** 한다.
      //   어긋나면 에러도 없이 그냥 안 나간다. brief 가 고른 것을 그대로 따른다.
      const tplForThis = brief.dailyShown
        ? (brief.template === 'nonote' ? (tpl.v3NoNote || tpl.v3!) : tpl.v3!)
        : brief.template === 'nonote'
          ? (tpl.v2 ? (tpl.v2NoNote || tpl.v2) : (tpl.v1NoNote || cfg!.tplCode))
          : (tpl.v2 || cfg!.tplCode)
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
        const 보낸기록 = {
          student_id: student.id, session_date: date, session_id: ses.id,
          to_phone: String(student.parent_phone), status: 'sent', body_len: brief.bodyLen,
          sent_at: new Date().toISOString(),
        }
        if (opts.resend && already) {
          // 유일 제약 때문에 두 번째 줄은 못 넣는다 — 그 줄을 덮어쓰고 횟수만 올린다.
          const { data: old } = await db.from('briefing_sends')
            .select('resend_count').eq('student_id', student.id).eq('session_date', date).maybeSingle()
          await db.from('briefing_sends').update({
            ...보낸기록,
            resend_count: ((old as any)?.resend_count ?? 0) + 1,
            last_resent_at: new Date().toISOString(),
            last_resent_by: opts.by ?? null,
          }).eq('student_id', student.id).eq('session_date', date)
        } else {
          await db.from('briefing_sends').insert(보낸기록)
        }
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
  // 「선생님께 보내기」에서 고를 분 — 원장·주임. 담당 강사는 줄마다 다르므로 거기서 읽는다.
  if (dryRun) {
    const { data: staff } = await db.from('users')
      .select('name, role, supervisor_grades').in('role', ['admin', 'teacher', 'staff'])
    out.staffOptions = {
      admins: (staff ?? []).filter((u: any) => u.role === 'admin').map((u: any) => u.name).filter(Boolean),
      supervisors: (staff ?? [])
        .filter((u: any) => Array.isArray(u.supervisor_grades) && u.supervisor_grades.length > 0)
        .map((u: any) => u.name).filter(Boolean),
    }
  }

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

    // 담당강사 샘플 — 자동 발송이 부른다. 화면 버튼은 POST 쪽을 쓴다.
    const sample = q.get('sample')
    if (sample === 'evening' || sample === 'morning') {
      return NextResponse.json(await runTeacherSample(date, sample))
    }
    // ★ 1차를 초등부만 보내던 것을 **학년 구분 없이** 바꿨다(원장님 2026-10-12).
    //   기준이 학년이 아니라 「그 시각까지 작성이 끝났나」다. 밤 8시에 끝난 것은 그날 나가고,
    //   못 끝낸 것은 다음 날 오전 11시에 나간다. 중복은 briefing_sends 가 막는다.
    const summary = await run({ date, dryRun: false, eveningRun: phase === 1 })
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
 * ★ 결석한 날은 뺀다(원장님 2026-10-12). 결석 브리핑은 선생님이 쓴 글이 아니라
 *   「결석으로 수업에 참여하지 못했습니다」 같은 자동 문구라서, 본인 글을 보시라는
 *   이 기능의 뜻에 안 맞는다. 게다가 글이 짧아 「가장 짧은 글」에 자꾸 뽑혔다.
 *
 * 번호는 OPS profiles 에서 읽는다(스터디체크 users 에는 전화 칸이 없다).
 * 학부모 발송 기록(briefing_sends)은 남기지 않는다 — 진짜 발송을 막으면 안 된다.
 */
/**
 * **고른 학생 한 명의 브리핑을 고른 선생님들께** 보낸다 (원장님 2026-10-16).
 *
 * 왜 따로 두나 — 「담당강사에게 샘플」은 선생님마다 글이 가장 짧은 학생을 **자동으로**
 * 고른다. 그런데 「이 학생 글을 이 선생님께 보여 주고 싶다」가 종종 생긴다
 * (조은서 학생 10/15 브리핑을 윤지혜·윤주희 선생님께, 같은 식).
 *
 * 학부모 발송 기록(briefing_sends)은 남기지 않는다 — 진짜 발송을 막으면 안 된다.
 */
async function sendBriefingToTeachers(date: string, studentId: string, teachers: string[]) {
  const phones = await fetchOpsTeacherPhones()
  const out: any[] = []
  for (const name of teachers) {
    const phone = phones.get(name)
    if (!phone) { out.push({ teacher: name, ok: false, error: '연락처가 없어요 (수학OPS 직원 정보)' }); continue }
    const r = await run({ date, dryRun: false, studentIds: [studentId], testPhone: phone })
    const ok = r.sent > 0
    out.push({
      teacher: name, ok,
      phone: phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2'),
      error: ok ? undefined
        : r.errors?.[0]?.error
          ?? (r.skippedNoRecord?.length ? '그날 기록이 없어요' : '발송 실패'),
    })
  }
  return { date, studentId, sent: out.filter((x) => x.ok).length, results: out }
}

async function runTeacherSample(
  date: string,
  /** 'evening' 이면 위 두 분만, 'morning' 이면 나머지만. 안 주면 전원(원장님이 버튼으로 부를 때). */
  who?: 'evening' | 'morning',
) {
  // ① 먼저 미리보기로 그날 **기록이 있는** 학생과 글 길이를 모은다.
  //   ★ 이미 학부모님께 나간 학생도 포함한다 — 샘플은 「이렇게 나갔습니다」를 보여 주는
  //     것이라 나간 학생이 오히려 대상이다.
  const preview = await run({ date, dryRun: true, includeSent: true })
  const previews: any[] = preview.previews ?? []
  if (!previews.length) {
    return { date, sent: 0, picks: [], note: '그날 보낼 수 있는 학생이 없어요.' }
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
  const { data: students } = await db.from('students')
    .select('id, name, teacher_name').in('id', previews.map((p) => p.studentId))
  const teacherOf = new Map((students ?? []).map((s: any) =>
    [s.id, mainTeacherOf(s.teacher_name)]))

  // ② 선생님마다 **글이 가장 짧은** 한 명을 고른다. 결석한 날은 빼고 본다.
  const pickBy = new Map<string, any>()
  const onlyAbsent = new Set<string>()
  for (const p of previews) {
    const t = teacherOf.get(p.studentId)
    if (!t) continue
    if (p.attendance === '결석') { onlyAbsent.add(t); continue }
    const cur = pickBy.get(t)
    if (!cur || (p.bodyLen ?? 0) < (cur.bodyLen ?? 0)) pickBy.set(t, p)
  }
  // ★ 선생님마다 자기 학생 브리핑이 나가는 시각이 다르다. 그 시각에 맞춰 거른다.
  if (who) {
    const evening = (t: string) => EVENING_SAMPLE_TEACHERS.includes(t)
    for (const t of [...pickBy.keys()]) {
      if (who === 'evening' ? !evening(t) : evening(t)) pickBy.delete(t)
    }
    for (const t of [...onlyAbsent]) {
      if (who === 'evening' ? !evening(t) : evening(t)) onlyAbsent.delete(t)
    }
  }

  // 그날 담당 학생이 전부 결석이면 보낼 것이 없다 — 조용히 넘기지 말고 알린다.
  const absentOnly = [...onlyAbsent].filter((t) => !pickBy.has(t))

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
  for (const t of absentOnly) {
    picks.push({ teacher: t, student: null, ok: false, error: '그날 담당 학생이 모두 결석이라 보낼 글이 없어요' })
  }
  picks.sort((a, b) => a.teacher.localeCompare(b.teacher, 'ko'))
  return { date, sent, picks }
}

export async function POST(req: NextRequest) {
  // 실제 요금이 나가고 학부모에게 바로 도착한다. 원장님만.
  // ★ 누가 보냈는지도 받는다 — 다시 보낸 기록에 이름을 남긴다.
  const who = await staffOrDeny(req, { adminOnly: true })
  if (who.deny) return who.deny
  try {
    const body = (await req.json().catch(() => ({}))) as
      { date?: string; dryRun?: boolean; studentIds?: string[]; testPhone?: string
        only?: 'elementary' | 'secondary'; teacherSample?: boolean; toTeachers?: string[]
        resend?: boolean }
    const date = body.date ?? kstDate(-1)
    // 담당 강사에게 본인 글 한 통씩 — 학부모 발송과 섞이지 않게 길을 따로 둔다.
    if (body.teacherSample) return NextResponse.json(await runTeacherSample(date))
    // 고른 학생 글을 고른 선생님들께 — 학부모에게는 가지 않는다.
    if (body.toTeachers?.length && body.studentIds?.length) {
      return NextResponse.json(await sendBriefingToTeachers(date, body.studentIds[0], body.toTeachers))
    }
    const summary = await run({
      date, dryRun: body.dryRun !== false, studentIds: body.studentIds,
      // 테스트 번호를 주면 그 번호로만 가고 발송 기록도 남기지 않는다(진짜 발송을 막지 않게).
      testPhone: body.testPhone?.trim() || undefined,
      only: body.only,
      // ★ 한 사람씩 고른 경우에만 다시 보낼 수 있다. 통째로 다시 돌리는 길은 열지 않는다.
      resend: body.resend === true && (body.studentIds?.length ?? 0) > 0,
      by: who.name || undefined,
    })
    return NextResponse.json(summary)
  } catch (e: any) {
    console.error('카톡 브리핑 발송 오류:', e)
    return NextResponse.json({ error: e?.message ?? '발송에 실패했어요.' }, { status: 500 })
  }
}
