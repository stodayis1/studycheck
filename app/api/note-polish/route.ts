// 그날 수업일지의 **오타를 잡고 문장을 다듬는다** — 고치지는 않고 「이렇게 바꿀까요」를 내놓는다.
//
// 왜 제안만 하나(원장님과 정한 방식 2026-10-12)
//   학부모께 그대로 나가는 선생님 글이다. 말없이 바꾸면 선생님도 원장님도 모른 채 나간다.
//   게다가 수학 교재·단원 이름은 오타처럼 보여도 정확한 표기인 경우가 많다
//   (쎈B · 개념유형라이트 · 리피트 · 베이직쎈 · 이너프원). 자동으로 고치면 멀쩡한 것을
//   틀리게 바꾼다. 그래서 **원장님이 보시고 고른 것만** 반영한다.
//
// 손대는 칸은 **학부모께 실제로 나가는 두 가지**뿐이다.
//   · class_sessions.progress_content — 브리핑의 「진도」
//   · feedbacks.content               — 브리핑의 「알림장」
//   과제(교재·쪽수·학습지 범위)는 이름과 숫자라서 건드리지 않는다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { denyIfNotStaff } from '@/lib/apiAuth'

// 최신 모델을 쓰되, 계정에서 못 쓰면 쓰던 모델로 내려간다 — 기능이 통째로 죽는 것보다 낫다.
const MODELS = ['claude-sonnet-5-5', 'claude-sonnet-4-5']
// 평일 하루가 70~80건이다(2026-10-07 진도 69 + 알림장 10). 한 번에 다 넣으면 답이 잘리므로
// 나눠서 부르고 합친다. 한 묶음이 너무 작으면 호출만 늘어난다.
const CHUNK = 40
const MAX_ITEMS = 160

const RULES = `너는 수학학원 선생님이 쓴 글을 다듬는 교정자다. 학부모에게 그대로 나가는 글이다.

반드시 지킬 것
1. **없는 사실을 지어내지 마라.** 적힌 내용만 다듬는다. 새 정보를 보태면 안 된다.
2. **교재명·단원명·사람 이름·숫자는 절대 바꾸지 마라.** 아래는 모두 **정확한 표기**다 —
   쎈, 쎈B, 쎈C, 베이직쎈, 개념유형, 개념유형라이트, 리피트, 이너프원, 코어테스트,
   일품, RPM, 최상위, 디딤돌, 수학의힘. 띄어쓰기도 그대로 둬라.
   "쎈비", "쎈 B" 처럼 보여도 교재 이름은 손대지 않는다.
3. 고칠 것은 **맞춤법·띄어쓰기·오타**, 그리고 **끊기거나 어색한 문장**이다.
4. 길이를 크게 늘리지 마라. 원문의 1.3배를 넘기지 않는다.
5. 말투는 선생님이 쓴 그대로 유지한다. 과장된 칭찬이나 인사말을 새로 붙이지 마라.
6. 고칠 것이 없으면 after 를 null 로 둔다. **멀쩡한 글을 굳이 바꾸지 마라.**

출력은 JSON 하나만. 설명이나 코드블록 없이.
{"items":[{"id":"<받은 id 그대로>","after":"<고친 글 또는 null>","why":"<무엇을 왜 고쳤는지 한 줄>"}]}`

function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  // 선생님 글을 바꾸는 일이다. 원장님만.
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  try {
    const body = (await req.json().catch(() => ({}))) as {
      date?: string
      apply?: { id: string; kind: 'progress' | 'notice'; after: string }[]
    }
    const date = body.date ?? kstToday()
    const sc = db()

    // ── 고치기 ────────────────────────────────────────────────────────────
    if (body.apply?.length) {
      const done: any[] = []
      for (const it of body.apply) {
        const text = String(it.after ?? '').trim()
        if (!text) { done.push({ id: it.id, ok: false, error: '빈 글은 넣지 않아요' }); continue }
        const { error } = it.kind === 'progress'
          ? await sc.from('class_sessions').update({ progress_content: text }).eq('id', it.id)
          : await sc.from('feedbacks').update({ content: text }).eq('id', it.id)
        done.push({ id: it.id, ok: !error, error: error?.message })
      }
      return NextResponse.json({ applied: done.filter((d) => d.ok).length, done })
    }

    // ── 점검 ──────────────────────────────────────────────────────────────
    const { data: sessions } = await sc.from('class_sessions')
      .select('id, student_id, session_type, progress_content')
      .eq('session_date', date)
    if (!sessions?.length) return NextResponse.json({ date, items: [], note: '그날 수업이 없어요.' })

    const studentIds = [...new Set(sessions.map((s: any) => s.student_id))]
    const [{ data: students }, { data: fbs }] = await Promise.all([
      sc.from('students').select('id, name, grade, teacher_name').in('id', studentIds),
      sc.from('feedbacks').select('id, student_id, content, teacher_name')
        .in('student_id', studentIds)
        .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`),
    ])
    const stuBy = new Map((students ?? []).map((s: any) => [s.id, s]))

    type Item = { id: string; kind: 'progress' | 'notice'; student: string; teacher: string | null; before: string }
    const items: Item[] = []
    for (const s of sessions as any[]) {
      // 보강·추가수업은 수학OPS 가 만든 수업이라 선생님이 쓴 글이 아니다.
      if (s.session_type && s.session_type !== '정규') continue
      const text = String(s.progress_content ?? '').trim()
      const st = stuBy.get(s.student_id)
      if (!text || !st) continue
      items.push({ id: s.id, kind: 'progress', student: st.name, teacher: st.teacher_name ?? null, before: text })
    }
    for (const f of (fbs ?? []) as any[]) {
      const text = String(f.content ?? '').trim()
      const st = stuBy.get(f.student_id)
      if (!text || !st) continue
      items.push({ id: f.id, kind: 'notice', student: st.name, teacher: f.teacher_name ?? st.teacher_name ?? null, before: text })
    }
    if (!items.length) return NextResponse.json({ date, items: [], note: '점검할 글이 없어요.' })

    const batch = items.slice(0, MAX_ITEMS)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const byId = new Map(batch.map((i) => [`${i.kind}:${i.id}`, i]))
    const out: any[] = []
    const failed: string[] = []

    for (let at = 0; at < batch.length; at += CHUNK) {
      const part = batch.slice(at, at + CHUNK)
      const payload = part.map((i) => ({ id: `${i.kind}:${i.id}`, 종류: i.kind === 'progress' ? '진도' : '알림장', 글: i.before }))

      let text = ''
      let lastErr: any = null
      for (const model of MODELS) {
        try {
          const msg = await client.messages.create({
            model, max_tokens: 8000,
            messages: [{ role: 'user', content: `${RULES}\n\n다듬을 글 ${part.length}건:\n${JSON.stringify(payload, null, 1)}` }],
          })
          text = msg.content[0].type === 'text' ? msg.content[0].text : ''
          break
        } catch (e: any) { lastErr = e }
      }
      // 한 묶음이 실패해도 나머지는 살린다 — 전부 날리는 것보다 낫다.
      if (!text) { failed.push(lastErr?.message ?? '알 수 없는 오류'); continue }

      // 코드블록으로 감싸 오는 경우가 있어 JSON 부분만 떼어 낸다.
      const m = text.match(/\{[\s\S]*\}/)
      let parsed: any = null
      try { parsed = JSON.parse(m?.[0] ?? text) } catch { /* 아래에서 처리 */ }
      if (!parsed?.items) { failed.push('AI 응답을 읽지 못했어요'); continue }

      for (const r of parsed.items as any[]) {
        const src = byId.get(String(r.id))
        const after = (r.after ?? '').toString().trim()
        // 바뀐 것이 없으면 보여 줄 필요가 없다.
        if (!src || !after || after === src.before) continue
        out.push({ ...src, after, why: String(r.why ?? '').trim() || '문장을 다듬었어요' })
      }
    }

    if (!out.length && failed.length) {
      return NextResponse.json({ error: `AI 점검에 실패했어요: ${failed[0]}` }, { status: 500 })
    }
    out.sort((a, b) => (a.teacher ?? '').localeCompare(b.teacher ?? '', 'ko') || a.student.localeCompare(b.student, 'ko'))

    return NextResponse.json({
      date, checked: batch.length, items: out,
      truncated: items.length > MAX_ITEMS ? items.length - MAX_ITEMS : 0,
      partialError: failed.length ? `${failed.length}묶음은 못 봤어요 — ${failed[0]}` : undefined,
      note: out.length === 0 ? `${batch.length}건을 봤는데 고칠 것이 없어요.` : undefined,
    })
  } catch (e: any) {
    console.error('수업일지 점검 오류:', e)
    return NextResponse.json({ error: e?.message ?? '점검하지 못했어요.' }, { status: 500 })
  }
}
