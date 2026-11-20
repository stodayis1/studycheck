/**
 * S코어반 학습 기록 보고서 — 링크 만들기 (원장님 2026-11-19).
 *
 *   GET    /api/score-class-report?from=&to= → 고를 수 있는 학생 + 이미 만든 링크
 *   POST   /api/score-class-report           → { studentIds, from, to } 로 링크를 만든다
 *   DELETE /api/score-class-report           → { tokens } 로 만든 링크를 지운다
 *
 * ★ 링크를 찍을 때 값을 report_links.data 에 **그대로 박아 둔다**(스냅샷).
 *   나중에 학습지가 지워지거나 교재가 바뀌어도 보내 드린 보고서는 그대로여야 한다.
 * ★ 이 라우트는 서비스롤로 RLS 를 지나간다 — **반드시** 직원 확인을 먼저 한다.
 *   보고서를 만드는 것은 **원장님만**이다(adminOnly).
 * ★ **보내지 않는다.** 링크만 만들고 문자는 원장님이 직접 보내신다
 *   (원장님 2026-11-19 「보내는건 내가 보낼거야」).
 * ★ 2026-11-20 — 보고서에 **보완해야 할 점**이 들어간다. 기록에서 기계로 뽑고,
 *   원장님이 적어 넣으신 한 줄(`notes[studentId]`)을 그 아래에 그대로 싣는다.
 * ★ 2026-11-20 — 진도는 **진도표**(progress_checks × concepts)에서 읽는다. 학습지 단원 이름으로
 *   추정하지 않는다. 반 진도 글은 원장님이 `classProgress` 로 적어 넣으실 수 있다.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildScoreClassReport, 진도모으기, 반과정고르기, 같은날같은값 } from '@/lib/scoreClassReport'

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
  // ※ created_at 은 **시각까지** 내려보낸다 — 같은 날 여러 번 만들면 날짜만으로는 어느 것이
  //   어느 것인지 가릴 수 없다(2026-11-20 에 하루 다섯 번 만들어 스무 줄이 쌓였다).

  return NextResponse.json({
    from, to,
    students: (students ?? []).filter((s: any) => !s.is_test)
      .map(({ is_test, parent_phone, ...s }: any) => ({ ...s, hasPhone: !!String(parent_phone ?? '').trim() })),
    links: (links ?? []).map((l: any) => ({ ...l, url: `${APP}/report/${l.token}` })),
  })
}

/** 1000행 벽을 넘겨 전부 읽는다. order 없이 range 를 쓰면 행을 놓친다 */
async function 전부(make: () => any): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await make().range(i, i + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return out
  }
}

/**
 * 반이 지금 하고 있는 과정 — **진도표**에서 과반이 닿은 가장 앞선 과정.
 *
 * ★ 학습지 단원 이름으로 추정하지 않는다. 2026-11-20 에 학습지로 뽑았더니 반 진도가
 *   「1. 기본도형」으로 나왔는데, 실제 반 진도는 **중1-2 개념서 1회를 끝내고 유형서 2회독 중**이었다.
 *   학습지에는 오답·전범위가 섞이고, 수업에서 나간 것이 학습지로 안 나올 수도 있다.
 * ★ 과정표(concepts)는 **한 번만** 읽어 학생마다 돌려 쓴다 (926행).
 */
async function 반과정(db: any, ids: string[]) {
  const concepts = await 전부(() => db.from('concepts').select('id, grade, semester').order('id'))
  const checks = await 전부(() => db.from('progress_checks')
    .select('student_id, concept_id, check_count, student_textbook_id').in('student_id', ids).order('id'))
  const 사람별 = ids.map((id) =>
    진도모으기(checks.filter((c: any) => String(c.student_id) === String(id)) as any, concepts as any))
  return { concepts, classCourse: 반과정고르기(사람별) }
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

  // ★ 보고서에 적을 「반 진도」를 **한 번만** 구한다.
  //   반을 가르는 칸이 DB 에 없으므로 **이번에 고른 학생들**을 한 반으로 본다.
  //   (원장님 2026-11-20 「다른 학생에 비해 중1과정이 느리다는 걸 좀 돌려서 써줘」)
  //   ★ 원장님이 적어 넣으신 글이 있으면 **그 글이 보고서에 나간다** — 수업에서 지금 나가는 곳은
  //     진도표보다 앞서 있을 수 있고, 그건 기계가 알 수 없다.
  const { concepts, classCourse } = await 반과정(db, ids)
  const classLabel = String(body?.classProgress ?? '').trim().slice(0, 60)
  // ★ 반 전체가 같은 날 같은 성취도로 적힌 날은 **그 학생의 기록이 아니다** — 보고서에서 뺀다
  //   (2026-11-02 에 여섯 명 전원이 0% 로 적혀 있었다).
  const skipDates = await 한꺼번에적힌날(db, ids, from, to)

  const 메모: Record<string, string> = (body?.notes && typeof body.notes === 'object') ? body.notes : {}

  const out: { studentId: string; name: string; url: string | null; error?: string }[] = []
  for (const id of ids) {
    try {
      const built = await buildScoreClassReport(db, id, from, to, { classLabel, classCourse, concepts, skipDates })
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

/**
 * 만든 링크를 지운다 — `{ tokens: string[] }`.
 *
 * ★ **지우면 그 주소는 그 자리에서 죽는다.** 이미 보내 드린 링크라면 학부모님이 여셨을 때
 *   「없는 주소」가 된다. 되돌릴 수 없다(스냅샷까지 같이 사라진다) — 화면에서 한 번 더 여쭌다.
 * ★ **이 보고서 종류만** 지운다(`report_type = 'score_class'`). 월간 리포트·카톡 브리핑 링크가
 *   같은 표에 있어서, 종류를 안 걸면 엉뚱한 링크가 지워진다.
 * ★ 토큰으로만 지운다 — 학생 id 로 지우면 「그 학생 것 전부」가 날아간다.
 * ★ 지운 **줄 수를 세어 돌려준다.** 화면이 그 숫자로 확인한다 — 「성공」은 성공이 아니다.
 */
export async function DELETE(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 }) }
  const tokens: string[] = Array.isArray(body?.tokens)
    ? Array.from(new Set(body.tokens.map((t: any) => String(t ?? '').trim()).filter(Boolean)))
    : []
  if (!tokens.length) return NextResponse.json({ error: '지울 것을 골라 주세요.' }, { status: 400 })
  // 한 번에 너무 많이 지우지 않는다 — 실수로 전부 고르고 눌렀을 때의 마지막 막이다.
  if (tokens.length > 100) {
    return NextResponse.json({ error: '한 번에 100개까지만 지울 수 있어요.' }, { status: 400 })
  }

  const db = admin()
  const { data, error } = await db.from('report_links')
    .delete().eq('report_type', TYPE).in('token', tokens).select('token')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const deleted = (data ?? []).length
  return NextResponse.json({ ok: true, deleted, asked: tokens.length })
}
