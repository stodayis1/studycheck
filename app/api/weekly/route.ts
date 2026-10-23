// 주간 학습현황 화면이 쓰는 API.
// 학생 x 날짜 표를 그리는 데 필요한 것만 모아서 한 번에 내려준다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { fetchAll } from '@/lib/fetchAll'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// 1000행 제한을 넘기지 않게 나눠서 전부 읽는다
export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const supabase = db()
  const q = new URL(req.url).searchParams
  const from = q.get('from')
  const to = q.get('to')
  if (!from || !to)
    return NextResponse.json({ error: '기간을 지정해 주세요.' }, { status: 400 })

  // 1) 학생 — 화면에서 담당/학년으로 다시 거른다
  const students = await fetchAll<any>((f, t) =>
    supabase
      .from('students')
      .select('id, name, grade, school, teacher_name, class_time, is_active, on_leave')
      .eq('is_active', true)
      .order('grade')
      .order('name')
      .order('id')          // 쪽을 나눠 읽으므로 순서를 못박는다
      .range(f, t)
  )

  // 2) 그 기간의 수업 기록
  const sessions = await fetchAll<any>((f, t) =>
    supabase
      .from('class_sessions')
      .select('id, student_id, session_date, session_type, today_textbook_name, daily_test_unit, daily_test_score, video_url')
      .gte('session_date', from)
      .lte('session_date', to)
      .order('id')
      .range(f, t)
  )

  // 3) 그 수업들의 학습노트
  // 200개씩 나눠 묻되 **한꺼번에** 묻는다 (차례대로 기다리면 묶음 수만큼 느려진다)
  const ids = sessions.map((s) => s.id)
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200))
  const noteRes = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from('learning_notes')
        .select('session_id, student_id, attendance, worksheet_submitted, worksheet_score, worksheet_unit, textbook_submitted, achievement_pct, memo')
        .in('session_id', chunk)
    )
  )
  const noteRows: any[] = []
  for (const { data, error } of noteRes) {
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    noteRows.push(...(data ?? []))
  }
  const noteBySession = new Map(noteRows.map((n) => [n.session_id, n]))

  // 3-2) 영상 과제 — 누가 봤고 증명을 올렸는지
  // ★ 예전에는 학습관리 화면의 **오늘 카드**에서만 보였다. 날짜가 지나면 확인할 길이
  //   아예 없었다 (원장님 2026-10-23 「확인할 방법이 없네」). 주간 표에 배지로 올린다.
  const withVideo = sessions.filter((x) => String(x.video_url ?? '').trim())
  const vIds = withVideo.map((x) => x.id)
  const vChunks: string[][] = []
  for (let i = 0; i < vIds.length; i += 200) vChunks.push(vIds.slice(i, i + 200))
  const [watchRes, proofRes, lvRes] = await Promise.all([
    Promise.all(vChunks.map((c) =>
      supabase.from('video_watch_logs')
        .select('session_id, video_url, coverage_pct, completed_at, watch_seconds, focus_lost_seconds').in('session_id', c))),
    Promise.all(vChunks.map((c) =>
      supabase.from('proof_submissions').select('session_id, video_url, submitted_at').in('session_id', c))),
    vIds.length
      ? supabase.from('lesson_videos').select('youtube_id, kind, title, order_label')
      : Promise.resolve({ data: [] as any[], error: null }),
  ])
  const watchRows: any[] = []
  for (const { data } of watchRes) watchRows.push(...(data ?? []))
  const proofRows: any[] = []
  for (const { data } of proofRes) proofRows.push(...(data ?? []))
  // ★ 없는 칸을 고르면 질의가 통째로 실패한다. 조용히 넘어가면 「증명 없는 날」로
  //   잘못 나오므로, 실패하면 에러로 돌려준다 (2026-10-23 label → order_label).
  if ((lvRes as any).error) {
    return NextResponse.json({ error: (lvRes as any).error.message }, { status: 500 })
  }
  const lv = new Map<string, any>(((lvRes as any).data ?? []).map((v: any) => [v.youtube_id, v]))
  const ytId = (u: string) =>
    u.trim().match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1] ?? null

  for (const x of withVideo) {
    // 주소가 아닌 글이 들어 있는 옛 기록은 세지 않는다
    const urls = String(x.video_url ?? '').split(/\r?\n/)
      .map((u: string) => u.trim()).filter((u: string) => /^https?:\/\//.test(u))
    if (!urls.length) continue
    const logs = watchRows.filter((v) => v.session_id === x.id)
    const subs = proofRows.filter((p) => p.session_id === x.id)
    const logOf = (u: string) => logs.find((v) => v.video_url === u)
    // 유튜브 영상은 앱 안에서 봐서 「실제로 본 비율」이 있다 → 90% 넘게 본 것만 완료.
    // 새 창으로 연 링크는 연 시간만 있어서 그대로 센다 (학습관리 카드와 같은 규칙).
    const doneOf = (u: string) => {
      const l = logOf(u)
      return !!l && (ytId(u) ? !!l.completed_at : (l.watch_seconds ?? 0) > 0)
    }
    const done = urls.filter(doneOf).length
    // 학습관리 화면과 같은 이름 꼴 (lib/lessonVideos.ts · lessonLabel)
    const nameOf = (u: string) => {
      const v = lv.get(ytId(u) ?? '')
      return v ? `${v.order_label} · ${v.title}` : u
    }
    push(x.student_id, x.session_date, {
      kind: 'video',
      label: `영상 ${done}/${urls.length}`,
      value: Math.round((done / urls.length) * 100),
      unit: '%',
      title: urls.map((u, i) => {
        const l = logOf(u)
        const pct = l ? Math.round(Number(l.coverage_pct ?? 0)) : 0
        return `${i + 1}. ${nameOf(u)} — ${l ? `${pct}% 봄${l.completed_at ? ' (완료)' : ''}` : '안 봄'}`
      }).join('\n'),
    })

    // 증명 영상이 섞인 날만 — 증명을 안 내준 날에 「증명 0/0」이 뜨면 잔소리가 된다
    const proofUrls = urls.filter((u) => lv.get(ytId(u) ?? '')?.kind === '증명')
    if (proofUrls.length) {
      const got = proofUrls.filter((u) => subs.some((p) => p.video_url === u)).length
      push(x.student_id, x.session_date, {
        kind: 'proof',
        label: `증명 ${got}/${proofUrls.length}`,
        value: Math.round((got / proofUrls.length) * 100),
        unit: '%',
        title: proofUrls.map((u, i) =>
          `${i + 1}. ${nameOf(u)} — ${subs.some((p) => p.video_url === u) ? '올림' : '안 올림'}`).join('\n'),
      })
    }
  }

  // 4) 같은 기간의 QR 채점 기록 (문제은행 시험지) — 여기서만 오답/유사 재출제가 가능하다
  const gradings = await fetchAll<any>((f, t) =>
    supabase
      .from('gradings')
      .select('id, student_id, student_name, score, total, submitted_at, sheet_id, exam_sheets(title, code)')
      .gte('submitted_at', from)
      .lte('submitted_at', to + 'T23:59:59')
      .order('id')
      .range(f, t)
  )

  // ───── 학생 × 날짜로 묶기 ─────
  // cells[studentId][YYYY-MM-DD] = 배지 배열
  const cells: Record<string, Record<string, any[]>> = {}
  const push = (sid: string, date: string, badge: any) => {
    ;(cells[sid] ??= {})[date] ??= []
    cells[sid][date].push(badge)
  }

  for (const s of sessions) {
    const n = noteBySession.get(s.id)
    const date = s.session_date

    if (n?.attendance && n.attendance !== '정시') {
      push(s.student_id, date, { kind: 'attend', label: n.attendance, value: null })
    }

    if (s.today_textbook_name || n?.textbook_submitted) {
      push(s.student_id, date, {
        kind: 'book',
        // 수업일지의 '과제 달성률' (숙제를 얼마나 해왔나). 교재 진도나 교재 점수가 아니다.
        label: '과제 달성',
        value: n?.achievement_pct ?? null,
        unit: '%',
        title: s.today_textbook_name ? `과제 달성률 · ${s.today_textbook_name}` : '과제 달성률',
      })
    }

    if (n?.worksheet_submitted || n?.worksheet_score != null) {
      push(s.student_id, date, {
        kind: 'sheet',
        // 수업일지의 '과제 성취도' (해온 과제를 얼마나 맞았나). 학습지관리의 레벨학습지 점수가 아니다.
        label: n?.worksheet_unit ? `과제 성취 ${n.worksheet_unit}` : '과제 성취',
        value: n?.worksheet_score ?? null,
        unit: '%',
      })
    }

    if (s.daily_test_score != null || s.daily_test_unit) {
      push(s.student_id, date, {
        kind: 'test',
        label: s.daily_test_unit ? `테스트 ${s.daily_test_unit}` : '테스트',
        value: s.daily_test_score ?? null,
        unit: '점',
      })
    }
  }

  for (const g of gradings) {
    if (!g.student_id) continue
    const date = String(g.submitted_at).slice(0, 10)
    const sheet = Array.isArray(g.exam_sheets) ? g.exam_sheets[0] : g.exam_sheets
    push(g.student_id, date, {
      kind: 'exam',
      label: sheet?.title ?? '시험지',
      value: g.total ? Math.round((g.score / g.total) * 100) : null,
      unit: '점',
      score: g.score,
      total: g.total,
      gradingId: g.id,      // ← 이게 있어야 오답/쌍둥이/유사 재출제를 걸 수 있다
      code: sheet?.code,
    })
  }

  return NextResponse.json({ students, cells })
}
