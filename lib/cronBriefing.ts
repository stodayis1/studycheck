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
//
// ── 왜 라우트가 아니라 여기 있나 ────────────────────────────────────────────
// 10월 13일 저녁 8시 발송이 통째로 안 나갔다. CRON_SECRET 은 Vercel 에 들어 있었으니
// (401 응답의 secretSet 으로 확인) 예약이 함수를 아예 안 깨운 것이다. 가장 의심스러운
// 것이 cron 경로에 붙여 둔 `?phase=1` 쿼리였다. 그래서 **쿼리 없는 주소 두 개**로 나눴고
// (…/briefing/evening, …/briefing/morning), 셋이 같은 함수를 부르도록 여기로 옮겼다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { collectPolishTargets, proposePolish, applyPolish, logPolish } from '@/lib/notePolish'
import { buildTeacherReminders, sendTeacherReminders } from '@/lib/teacherReminder'
import { fillOpsExtraFromNotes } from '@/lib/opsExtraFill'
import { syncFirstClassFromOps } from '@/lib/opsFirstClass'

/** 한국 시각 'HH:MM'. 서버는 UTC 로 돈다. */
function kstHhmm() {
  const t = new Date(Date.now() + 9 * 3600_000)
  return t.toISOString().slice(11, 16)
}

function kstDate(offsetDays = 0) {
  const t = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000)
  return t.toISOString().slice(0, 10)
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://studycheck-five.vercel.app'

/**
 * @param phaseFixed 1 = 저녁 8시 · 2 = 다음 날 오전 11시.
 *   주지 않으면 `?phase=` 를 읽는다(원장님이 직접 부를 때 쓴다).
 */
export async function runBriefingCron(req: NextRequest, phaseFixed?: 1 | 2) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  if (!secret || auth !== `Bearer ${secret}`) {
    // 막힌 이유를 **값 없이** 알려 준다. 2026-10-13 저녁 8시 발송이 통째로 안 나갔는데,
    // 「예약이 함수를 안 깨웠나」와 「깨웠지만 401 로 막혔나」가 구분이 안 돼서 하루를
    // 더 기다려야 했다. CRON_SECRET 이 Vercel 에 들어 있는지만 즉시 볼 수 있으면 된다.
    //
    // ★ 비밀값 자체는 내보내지 않는다. 있다/없다만 보낸다. 없으면 어차피 아무도 들어올
    //   수 없으므로(항상 401) 이 사실만으로 열리는 문은 없다.
    return NextResponse.json(
      { error: '권한이 없어요.', secretSet: Boolean(secret), authHeaderSent: Boolean(auth) },
      { status: 401 },
    )
  }

  const q = new URL(req.url).searchParams
  const phase = phaseFixed ?? (q.get('phase') === '2' ? 2 : 1)
  const date = q.get('date') ?? (phase === 1 ? kstDate(0) : kstDate(-1))
  const out: any = { phase, date, startedAt: new Date().toISOString() }

  const db = admin()

  // ── 언제 돌까 ───────────────────────────────────────────────────────────
  // Vercel 예약은 40~50분 늦게 깨운다(저녁 8시 것이 20:41, 오전 11시 것이 11:50 에 돌았다).
  // 그래서 **10분마다 깨우고** 여기서 두 가지로 막는다 (원장님 2026-10-17).
  //   ① 정해진 시각 전이면 그냥 돌아간다
  //   ② 그날 이미 돌았으면 그냥 돌아간다
  // 그러면 정해진 시각 직후 첫 깨움이 일을 하고 나머지는 조용히 지나간다.
  //
  // ?force=1 을 주면 두 가지를 모두 건너뛴다 — 손으로 다시 돌릴 때 쓴다.
  const force = q.get('force') === '1'
  const phaseName = phase === 1 ? 'evening' : 'morning'
  const notBefore = phase === 1 ? '20:00' : '11:00'
  const now = kstHhmm()
  if (!force && now < notBefore) {
    return NextResponse.json({ ...out, skipped: `아직 ${notBefore} 전이에요 (지금 ${now})` })
  }

  // ② 하루 한 번 — 먼저 자리를 잡는다. 이미 있으면 다른 깨움이 벌써 했다는 뜻이다.
  if (!force) {
    const { data: claimed } = await db.from('cron_runs')
      .upsert({ phase: phaseName, run_date: kstDate(0) }, { onConflict: 'phase,run_date', ignoreDuplicates: true })
      .select('id')
    if (!claimed?.length) {
      return NextResponse.json({ ...out, skipped: '오늘은 이미 돌았어요' })
    }
    out.runId = claimed[0].id
  }

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
      // 고친 것과 건너뛴 것을 모두 남긴다 — 사람 없이 고치는 일이라 추적이 돼야 한다.
      await logPolish(db, date, items, 'auto', new Set(done.filter((d) => d.ok).map((d) => d.id)))
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

  // ── ①-1 첫 수업일을 수학OPS 에서 가져온다 ───────────────────────────────
  // 아직 수업을 시작하지 않은 학생이 「미작성」으로 잡히면 안 된다. 그 판단을
  // 선생님 화면에서도 하므로(브라우저는 OPS 키가 없다) 값을 옮겨 둔다.
  try {
    out.firstClass = await syncFirstClassFromOps(db)
  } catch (e: any) {
    out.firstClass = { error: e?.message ?? '첫 수업일 동기화 실패' }
  }

  // ── ①-2 본수업에 이어서 한 추가수업을 수학OPS 에 옮겨 적는다 ─────────────
  // 선생님은 스터디체크에 일지를 한 번 쓰는데 OPS 추가수업 칸은 따로 비어 있어서
  // 같은 내용을 또 적어야 했다(원장님 2026-10-16). 그날 배운 **교재**만 옮긴다.
  // ★ 교정(①) 뒤에 한다 — 다듬어진 글이 OPS 로 가야 한다.
  try {
    out.opsExtra = await fillOpsExtraFromNotes(db, date)
  } catch (e: any) {
    out.opsExtra = { error: e?.message ?? 'OPS 반영 실패' }
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

  // ── ④ 담당 강사 샘플 ───────────────────────────────────────────────────
  // 선생님이 **본인이 쓴 글**이 학부모님께 어떤 모양으로 가는지 한 통 받아 보신다.
  // 담당 학생 브리핑이 나가는 시각에 맞춘다 — 저녁에 나가는 분은 저녁에,
  // 다음 날 나가는 분은 다음 날에(원장님 2026-10-15).
  //
  // ★ 학부모 발송 **뒤에** 부른다. 그래야 그날 기록이 다 들어간 상태에서 고른다.
  try {
    const res = await fetch(
      `${APP_URL}/api/kakao-briefing?date=${date}&sample=${phase === 1 ? 'evening' : 'morning'}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    )
    out.sample = await res.json()
  } catch (e: any) {
    out.sample = { error: e?.message ?? '샘플 발송 실패' }
  }

  out.finishedAt = new Date().toISOString()

  // 무엇을 했는지 남긴다 — 「예약이 돌았나」를 이 표만 보면 알 수 있다.
  if (out.runId) {
    try {
      await db.from('cron_runs').update({ finished_at: out.finishedAt, result: out }).eq('id', out.runId)
    } catch { /* 기록이 안 남아도 발송은 끝났다 */ }
  }

  return NextResponse.json(out)
}
