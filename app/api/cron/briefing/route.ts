// 카톡 수업 브리핑 자동 발송 — 하루 두 번, 순서대로 세 가지를 한다.
//
//   ① 오타·문장 자동 교정   (안전한 것만. lib/polishGuard 의 기계 검사를 통과한 것)
//   ② 학부모 발송           (기록이 끝난 학생만. 이미 보낸 학생은 건너뛴다)
//   ③ 담당 강사 알림        (그때까지 수업일지가 덜 된 건을 선생님별로 묶어 문자로)
//
// 시각 (원장님 지시 2026-10-12)
//   · 밤 8시(11:00 UTC)        phase=1 — 그날 수업 중 **작성이 끝난 것**을 보낸다(학년 구분 없음)
//   · 다음 날 오전 11시(02:00 UTC) phase=2 — 전날 수업 중 **그때 못 보낸 나머지**를 보낸다
//
// 중복은 briefing_sends 가 막는다 — 같은 학생·같은 수업일은 두 번 나가지 않는다.
// 그래서 2차에는 자연히 「1차에 못 나간 것」만 남는다.
//
// ★ 순서가 중요하다. 교정을 **발송 전에** 끝내야 고쳐진 글이 나간다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { collectPolishTargets, proposePolish, applyPolish } from '@/lib/notePolish'
import { buildTeacherReminders, sendTeacherReminders } from '@/lib/teacherReminder'

// 111명 발송이 51초였다(2026-10-12 실측). 교정·알림까지 더해도 여유가 있어야 한다.
export const maxDuration = 300

function kstDate(offsetDays = 0) {
  const t = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000)
  return t.toISOString().slice(0, 10)
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://studycheck-five.vercel.app'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: '권한이 없어요.' }, { status: 401 })
  }

  const q = new URL(req.url).searchParams
  const phase = q.get('phase') === '2' ? 2 : 1
  const date = q.get('date') ?? (phase === 1 ? kstDate(0) : kstDate(-1))
  const out: any = { phase, date, startedAt: new Date().toISOString() }

  const db = admin()

  // ── ① 오타·문장 자동 교정 ───────────────────────────────────────────────
  // 사람이 없는 시각이라, AI 가 내놓은 교정을 **기계 검사에 통과한 것만** 반영한다.
  // 통과 못 한 것(숫자·교재명이 바뀌거나 길이가 튀는 것)은 손대지 않는다 —
  // 선생님 글이 그냥 나가는 편이 잘못 고쳐져 나가는 것보다 낫다.
  try {
    const targets = await collectPolishTargets(db, date)
    if (targets.length) {
      const { items, failed, checked } = await proposePolish(targets)
      const safe = items.filter((i) => i.safe)
      const done = safe.length
        ? await applyPolish(db, safe.map((i) => ({ id: i.id, kind: i.kind, after: i.after })))
        : []
      out.polish = {
        checked,
        제안: items.length,
        고침: done.filter((d) => d.ok).length,
        건너뜀: items.filter((i) => !i.safe).map((i) => `${i.student}(${i.unsafeReason})`),
        실패: failed.length || undefined,
      }
    } else {
      out.polish = { checked: 0 }
    }
  } catch (e: any) {
    // 교정이 안 돼도 발송은 나가야 한다.
    out.polish = { error: e?.message ?? '점검 실패' }
  }

  // ── ② 학부모 발송 ───────────────────────────────────────────────────────
  // 기존 발송 경로를 그대로 쓴다(한 곳에서만 보낸다). 내부 호출이라 CRON_SECRET 을 그대로 쓴다.
  try {
    const res = await fetch(`${APP_URL}/api/kakao-briefing?phase=${phase}&date=${date}`, {
      headers: { Authorization: `Bearer ${secret}` },
    })
    out.send = await res.json()
  } catch (e: any) {
    out.send = { error: e?.message ?? '발송 실패' }
  }

  // ── ③ 담당 강사 알림 ────────────────────────────────────────────────────
  // 발송 **뒤에** 본다. 그래야 「지금 이 시각에도 덜 된 것」이 정확히 잡힌다.
  try {
    const { items, noTeacher } = await buildTeacherReminders(db, date, { when: phase === 2 ? 'morning' : 'evening' })
    const sent = items.length ? await sendTeacherReminders(items) : 0
    out.remind = {
      보냄: sent,
      선생님: items.map((i) => `${i.teacher}(${i.count}건${i.ok === false ? ` · ${i.error}` : ''})`),
      담당없는학생: noTeacher.length ? noTeacher : undefined,
    }
  } catch (e: any) {
    out.remind = { error: e?.message ?? '알림 실패' }
  }

  out.finishedAt = new Date().toISOString()
  return NextResponse.json(out)
}
