// 주간 학습현황 화면이 쓰는 API.
// 학생 x 날짜 표를 그리는 데 필요한 것만 모아서 한 번에 내려준다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'

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
async function all<T>(make: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

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
  const students = await all<any>((f, t) =>
    supabase
      .from('students')
      .select('id, name, grade, school, teacher_name, class_time, is_active, on_leave')
      .eq('is_active', true)
      .order('grade')
      .order('name')
      .range(f, t)
  )

  // 2) 그 기간의 수업 기록
  const sessions = await all<any>((f, t) =>
    supabase
      .from('class_sessions')
      .select('id, student_id, session_date, session_type, today_textbook_name, daily_test_unit, daily_test_score')
      .gte('session_date', from)
      .lte('session_date', to)
      .range(f, t)
  )

  // 3) 그 수업들의 학습노트
  const noteRows: any[] = []
  const ids = sessions.map((s) => s.id)
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    if (!chunk.length) break
    const { data, error } = await supabase
      .from('learning_notes')
      .select('session_id, student_id, attendance, worksheet_submitted, worksheet_score, worksheet_unit, textbook_submitted, achievement_pct, memo')
      .in('session_id', chunk)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    noteRows.push(...(data ?? []))
  }
  const noteBySession = new Map(noteRows.map((n) => [n.session_id, n]))

  // 4) 같은 기간의 QR 채점 기록 (문제은행 시험지) — 여기서만 오답/유사 재출제가 가능하다
  const gradings = await all<any>((f, t) =>
    supabase
      .from('gradings')
      .select('id, student_id, student_name, score, total, submitted_at, sheet_id, exam_sheets(title, code)')
      .gte('submitted_at', from)
      .lte('submitted_at', to + 'T23:59:59')
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
