/**
 * 신입생 상담 알림 — 매일 아침 한 번 돌며 **수학OPS 전달사항**에 꽂는다. (원장님 2026-11-06)
 *
 *   첫 수업 +7일  → 신입 상담 (수업 방향 설정, 현재 진도 상황 공유)
 *   첫 수업 +30일 → 적응 상담 (한 달 수업 뒤 적응 상황)
 *
 * ★ 전달사항(staff_notes)에 넣으면 **OPS 첫 화면**과 **스터디체크 대시보드**에 둘 다 뜬다.
 *   「확인」은 OPS 에서만 누른다 — 기록이 한 곳에만 남아야 한다.
 * ★ 담당 선생님(키움쌤·채움쌤) **모두**에게 간다. 둘 다 그 학생을 맡은 분이다.
 * ★ 한 학생·한 단계는 **한 번만** 알린다(new_student_consult_notices 에 적어 둔다).
 *   매일 도는 크론이라 이게 없으면 같은 알림이 날마다 쌓인다.
 * ★ 상담을 적으면 더 안 뜬다 — 기준일 이후의 상담 기록이 있으면 건너뛴다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { dueStagesFor, noteText, STAGES } from '@/lib/newStudentConsult'
import { teachersOf } from '@/lib/teachers'
import { fetchAllRows } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(req: NextRequest) {
  // 크론은 CRON_SECRET 으로만 부른다 — 열려 있으면 아무나 알림을 쏟을 수 있다.
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 401 })
  }

  const today = new URL(req.url).searchParams.get('date') ?? kstToday()
  const 미리보기 = new URL(req.url).searchParams.get('dry') === '1'
  const db = admin()

  try {
    // ── 재원 학생 (연습용 제외) ──────────────────────────────────────
    const students = await fetchAllRows<any>(() => db.from('students')
      .select('id, name, grade, school, teacher_name, clinic_teacher_name, is_active, on_leave, skip_lesson_note')
      .eq('is_active', true).order('id'))
    const 대상학생 = students.filter((s) => !s.on_leave && !s.skip_lesson_note)
    const ids = 대상학생.map((s) => s.id)
    if (!ids.length) return NextResponse.json({ ok: true, date: today, items: [] })

    // ── 첫 수업일 · 상담 기록 · 이미 알린 것 ─────────────────────────
    const [sessions, consults, already] = await Promise.all([
      fetchAllRows<any>(() => db.from('class_sessions').select('student_id, session_date').order('id')),
      fetchAllRows<any>(() => db.from('consultations').select('student_id, consulted_at').order('id')),
      fetchAllRows<any>(() => db.from('new_student_consult_notices').select('student_id, stage').order('id')),
    ])
    const 첫수업 = new Map<string, string>()
    for (const r of sessions) {
      const d = String(r.session_date ?? '').slice(0, 10)
      if (!d) continue
      const cur = 첫수업.get(r.student_id)
      if (!cur || d < cur) 첫수업.set(r.student_id, d)
    }
    const 상담 = new Map<string, string[]>()
    for (const c of consults) {
      if (!상담.has(c.student_id)) 상담.set(c.student_id, [])
      상담.get(c.student_id)!.push(String(c.consulted_at ?? '').slice(0, 10))
    }
    const 알린것 = new Map<string, Set<string>>()
    for (const a of already) {
      if (!알린것.has(a.student_id)) 알린것.set(a.student_id, new Set())
      알린것.get(a.student_id)!.add(a.stage)
    }

    // ── 오늘 알려야 할 것 ────────────────────────────────────────────
    const 할것: { s: any; stage: any; first: string }[] = []
    for (const s of 대상학생) {
      const first = 첫수업.get(s.id)
      for (const stage of dueStagesFor(first, 상담.get(s.id) ?? [], 알린것.get(s.id) ?? new Set(), today)) {
        할것.push({ s, stage, first: first! })
      }
    }
    if (!할것.length) return NextResponse.json({ ok: true, date: today, items: [] })

    const items = 할것.map(({ s, stage, first }) => ({
      student: s.name, stage: stage.key, firstLesson: first,
      teachers: teachersOf(s), text: noteText({ name: s.name, grade: s.grade, school: s.school, stage, firstLesson: first, today }),
    }))
    if (미리보기) return NextResponse.json({ ok: true, date: today, dry: true, items })

    // ── 수학OPS 전달사항에 꽂는다 ────────────────────────────────────
    const ops = opsClient()
    if (!ops) {
      return NextResponse.json({ error: '수학OPS 설정값(OPS_SUPABASE_URL 등)이 없어요.', items }, { status: 500 })
    }
    // 선생님 이름 → OPS 계정. 같은 이름이 둘이면(퇴사 계정 등) **살아 있는 것**만 쓴다.
    const 이름들 = [...new Set(items.flatMap((i) => i.teachers))]
    const { data: profiles } = await ops.from('profiles').select('id, name, active').in('name', 이름들).eq('active', true)
    const 계정 = new Map<string, string>()
    for (const p of (profiles ?? []) as any[]) {
      // 같은 이름이 둘 이상 살아 있으면 누구에게 보낼지 알 수 없다 — 건너뛰고 알린다
      계정.has(p.name) ? 계정.set(p.name, '') : 계정.set(p.name, p.id)
    }

    const 결과: any[] = []
    for (const [n, it] of items.entries()) {
      const { s, stage } = 할것[n]
      const 받는이 = it.teachers.map((t) => 계정.get(t)).filter(Boolean) as string[]
      const 없는이 = it.teachers.filter((t) => !계정.get(t))
      if (!받는이.length) {
        결과.push({ ...it, ok: false, error: `수학OPS 계정을 못 찾았어요 (${없는이.join(', ') || '이름 없음'})` })
        continue
      }
      const { data: 꽂은것, error } = await ops.from('staff_notes')
        .insert(받는이.map((to) => ({ content: it.text, note_date: today, assigned_to: to })))
        .select('id')
      if (error) { 결과.push({ ...it, ok: false, error: error.message }); continue }

      // ★ 적어 둔다 — 안 적으면 내일 또 같은 알림이 간다.
      await db.from('new_student_consult_notices').insert({
        student_id: s.id, stage: stage.key, first_lesson: it.firstLesson,
        ops_note_ids: (꽂은것 ?? []).map((x: any) => x.id),
      })
      결과.push({ ...it, ok: true, sentTo: 받는이.length, 못찾음: 없는이 })
    }
    return NextResponse.json({ ok: true, date: today, items: 결과 })
  } catch (e: any) {
    console.error('신입 상담 알림 오류:', e)
    return NextResponse.json({ error: e?.message ?? '알림을 만들지 못했어요.' }, { status: 500 })
  }
}
