/**
 * S코어반 학습 기록 보고서 — 링크 만들기 (원장님 2026-11-19).
 *
 *   GET  /api/score-class-report?from=&to=   → 고를 수 있는 학생 + 이미 만든 링크
 *   POST /api/score-class-report             → { studentIds, from, to } 로 링크를 만든다
 *
 * ★ 링크를 찍을 때 값을 report_links.data 에 **그대로 박아 둔다**(스냅샷).
 *   나중에 학습지가 지워지거나 교재가 바뀌어도 보내 드린 보고서는 그대로여야 한다.
 * ★ 이 라우트는 서비스롤로 RLS 를 지나간다 — **반드시** 직원 확인을 먼저 한다.
 *   보고서를 만드는 것은 **원장님만**이다(adminOnly).
 * ★ **보내지 않는다.** 링크만 만들고 문자는 원장님이 직접 보내신다
 *   (원장님 2026-11-19 「보내는건 내가 보낼거야」).
 * ★ 2026-11-20 — 보고서에 **보완해야 할 점**이 들어간다. 기록에서 기계로 뽑고,
 *   원장님이 적어 넣으신 한 줄(`notes[studentId]`)을 그 아래에 그대로 싣는다.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildScoreClassReport, isAhead, 반단원고르기, 같은날같은값 } from '@/lib/scoreClassReport'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TYPE = 'score_class'
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://studycheck-five.vercel.app'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
}

/** 기본 구간 — 올해 들어 지금까지. 보고서는 「그동안」을 보여 주는 것이라 길게 잡는다. */
function 기본구간() {
  const 오늘 = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  return { from: 오늘.slice(0, 4) + '-01-01', to: 오늘 }
}

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  const db = admin()
  const url = new URL(req.url)
  const { from, to } = { ...기본구간(), ...Object.fromEntries(url.searchParams) } as any

  // 고를 수 있는 학생 — 재원·휴원 (가상 학생은 뺀다)
  const { data: students, error } = await db.from('students')
    .select('id, name, grade, teacher_name, parent_phone, is_test')
    .or('is_active.eq.true,on_leave.eq.true').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: links } = await db.from('report_links')
    .select('student_id, token, period_label, created_at')
    .eq('report_type', TYPE).order('created_at', { ascending: false }).limit(200)

  return NextResponse.json({
    from, to,
    students: (students ?? []).filter((s: any) => !s.is_test)
      .map(({ is_test, parent_phone, ...s }: any) => ({ ...s, hasPhone: !!String(parent_phone ?? '').trim() })),
    links: (links ?? []).map((l: any) => ({ ...l, url: `${APP}/report/${l.token}` })),
  })
}

/**
 * 반이 지금 나가는 단원 — 고른 학생들의 **최근 8주 선행 학습지**에서 과반이 푼 단원.
 * 자료가 모자라면 null 을 돌려주고, 그러면 보고서에 진도 줄이 아예 안 들어간다.
 */
async function 반단원(db: any, ids: string[], to: string): Promise<string | null> {
  const 여드레주전 = new Date(new Date(to + 'T00:00:00Z').getTime() - 56 * 86400_000).toISOString().slice(0, 10)
  const { data: ss } = await db.from('students').select('id, grade').in('id', ids)
  const 학년 = new Map<string, string | null>((ss ?? []).map((s: any) => [s.id, s.grade]))

  const { data: ws } = await db.from('student_worksheets')
    .select('student_id, grade_level, unit_name, unit, submitted_at')
    .in('student_id', ids).not('score', 'is', null)
    .gte('submitted_at', 여드레주전).lte('submitted_at', to + 'T23:59:59')

  const 사람별 = ids.map((id) => (ws ?? [])
    .filter((w: any) => w.student_id === id && isAhead(학년.get(id), w.grade_level))
    .map((w: any) => ({ unit: String(w.unit_name ?? w.unit ?? ''), date: String(w.submitted_at ?? '').slice(0, 10) })))
  return 반단원고르기(사람별)
}

/** 반 전체가 같은 날 같은 성취도로 적힌 날 — 한꺼번에 들어간 값이라 보고서에서 뺀다 */
async function 한꺼번에적힌날(db: any, ids: string[], from: string, to: string): Promise<string[]> {
  const { data: ln } = await db.from('learning_notes')
    .select('student_id, achievement_pct, created_at')
    .in('student_id', ids).not('achievement_pct', 'is', null)
    .gte('created_at', from).lte('created_at', to + 'T23:59:59')
  const 사람별 = ids.map((id) => (ln ?? [])
    .filter((n: any) => n.student_id === id)
    .map((n: any) => ({ date: String(n.created_at ?? '').slice(0, 10), pct: Number(n.achievement_pct) })))
  return 같은날같은값(사람별)
}

export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 }) }
  const ids: string[] = Array.isArray(body?.studentIds) ? body.studentIds.map(String) : []
  if (!ids.length) return NextResponse.json({ error: '학생을 한 명 이상 골라 주세요.' }, { status: 400 })
  const 기본 = 기본구간()
  const from = String(body?.from || 기본.from).slice(0, 10)
  const to = String(body?.to || 기본.to).slice(0, 10)
  if (from > to) return NextResponse.json({ error: '시작일이 끝일보다 뒤예요.' }, { status: 400 })

  const db = admin()

  // ★ 보고서 종류가 DB 에 열려 있는지 먼저 본다. 안 열려 있으면 **한 건도 만들지 않고** 멈춘다 —
  //   사람마다 되고 안 되고가 갈리면 누구 것이 나갔는지 알 수 없게 된다.
  const { error: 막힘 } = await db.from('report_links').select('id').eq('report_type', TYPE).limit(1)
  if (막힘) return NextResponse.json({ error: 막힘.message }, { status: 500 })

  // ★ 보고서에 적을 「반이 지금 나가는 단원」을 **한 번만** 구한다.
  //   반을 가르는 칸이 DB 에 없으므로 **이번에 고른 학생들**을 한 반으로 본다.
  //   (원장님 2026-11-20 「다른 학생에 비해 중1과정이 느리다는 걸 좀 돌려서 써줘」)
  const classUnit = await 반단원(db, ids, to)
  // ★ 반 전체가 같은 날 같은 성취도로 적힌 날은 **그 학생의 기록이 아니다** — 보고서에서 뺀다
  //   (2026-11-02 에 여섯 명 전원이 0% 로 적혀 있었다).
  const skipDates = await 한꺼번에적힌날(db, ids, from, to)

  const 메모: Record<string, string> = (body?.notes && typeof body.notes === 'object') ? body.notes : {}

  const out: { studentId: string; name: string; url: string | null; error?: string }[] = []
  for (const id of ids) {
    try {
      const built = await buildScoreClassReport(db, id, from, to, { classUnit, skipDates })
      const note = String(메모[id] ?? '').trim().slice(0, 400)
      const data = { ...built, teacherNote: note || null }
      const token = randomBytes(16).toString('hex')
      const { error } = await db.from('report_links').insert({
        student_id: id, report_type: TYPE,
        period_label: data.period.label, period_start: from, period_end: to,
        data, token, sent_at: new Date().toISOString(),
      })
      if (error) {
        out.push({
          studentId: id, name: data.student.name, url: null,
          error: /report_type/.test(error.message)
            ? 'docs/sql/S코어반보고서_종류추가.sql 을 먼저 넣어 주세요.'
            : error.message,
        })
        continue
      }
      out.push({ studentId: id, name: data.student.name, url: `${APP}/report/${token}` })
    } catch (e: any) {
      out.push({ studentId: id, name: '', url: null, error: e?.message ?? '만들지 못했어요.' })
    }
  }
  return NextResponse.json({ ok: true, from, to, results: out })
}
