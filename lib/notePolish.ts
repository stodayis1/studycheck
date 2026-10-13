// 수업일지 오타·문장 점검. 화면(원장님이 고르는 길)과 자동 발송(밤 8시)이 **같은 함수**를 쓴다.
//
// 자동일 때는 lib/polishGuard.ts 의 기계 검사를 통과한 것만 반영한다.
// 통과 못 한 것은 손대지 않는다 — 선생님 글이 그냥 나가는 편이 잘못 고쳐져 나가는 것보다 낫다.
import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { checkPolish } from './polishGuard'

// 최신 모델을 쓰되, 계정에서 못 쓰면 쓰던 모델로 내려간다 — 기능이 통째로 죽는 것보다 낫다.
const MODELS = ['claude-sonnet-5-5', 'claude-sonnet-4-5']
const CHUNK = 40
const MAX_ITEMS = 160

const RULES = `너는 수학학원 선생님이 쓴 글을 다듬는 교정자다. 학부모에게 그대로 나가는 글이다.

반드시 지킬 것
1. **없는 사실을 지어내지 마라.** 적힌 내용만 다듬는다. 새 정보를 보태면 안 된다.
2. **교재명·단원명·사람 이름·숫자는 절대 바꾸지 마라.** 아래는 모두 **정확한 표기**다 —
   쎈, 쎈B, 쎈C, 베이직쎈, 쎈연산, 개념유형, 개념+유형라이트, 리피트, 초능력연산,
   디딤돌 문제유형, 이너프원, 코어테스트, 일품, RPM, 최상위, 우공비, 수학의힘.
   띄어쓰기도 그대로 둬라. "쎈비", "쎈 B" 처럼 보여도 교재 이름은 손대지 않는다.
3. 고칠 것은 **맞춤법·띄어쓰기·오타**, 그리고 **끊기거나 어색한 문장**이다.
4. 길이를 크게 늘리지 마라. 원문의 1.3배를 넘기지 않는다.
5. 말투는 선생님이 쓴 그대로 유지한다. 과장된 칭찬이나 인사말을 새로 붙이지 마라.
6. 고칠 것이 없으면 after 를 null 로 둔다. **멀쩡한 글을 굳이 바꾸지 마라.**

출력은 JSON 하나만. 설명이나 코드블록 없이.
{"items":[{"id":"<받은 id 그대로>","after":"<고친 글 또는 null>","why":"<무엇을 왜 고쳤는지 한 줄>"}]}`

export interface PolishItem {
  id: string
  kind: 'progress' | 'notice'
  student: string
  teacher: string | null
  before: string
  after: string
  why: string
  /** 자동 반영해도 되는가 (lib/polishGuard) */
  safe: boolean
  unsafeReason?: string
}

/** 그날 점검할 글을 모은다 — 학부모께 실제로 나가는 진도·알림장만. */
export async function collectPolishTargets(db: SupabaseClient, date: string) {
  const { data: sessions } = await db.from('class_sessions')
    .select('id, student_id, session_type, progress_content')
    .eq('session_date', date)
  if (!sessions?.length) return []

  const studentIds = [...new Set(sessions.map((s: any) => s.student_id))]
  const [{ data: students }, { data: fbs }] = await Promise.all([
    db.from('students').select('id, name, grade, teacher_name').in('id', studentIds),
    db.from('feedbacks').select('id, student_id, content, teacher_name')
      .in('student_id', studentIds)
      .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`),
  ])
  const stuBy = new Map((students ?? []).map((s: any) => [s.id, s]))

  const out: { id: string; kind: 'progress' | 'notice'; student: string; teacher: string | null; before: string }[] = []
  for (const s of sessions as any[]) {
    // 보강·추가수업은 수학OPS 가 만든 수업이라 선생님이 쓴 글이 아니다.
    if (s.session_type && s.session_type !== '정규') continue
    const text = String(s.progress_content ?? '').trim()
    const st = stuBy.get(s.student_id)
    if (!text || !st) continue
    out.push({ id: s.id, kind: 'progress', student: st.name, teacher: st.teacher_name ?? null, before: text })
  }
  for (const f of (fbs ?? []) as any[]) {
    const text = String(f.content ?? '').trim()
    const st = stuBy.get(f.student_id)
    if (!text || !st) continue
    out.push({ id: f.id, kind: 'notice', student: st.name, teacher: f.teacher_name ?? st.teacher_name ?? null, before: text })
  }
  return out
}

/** AI 에게 물어 고칠 것을 받아 온다. 못 받으면 빈 목록 — 발송 자체를 막으면 안 된다. */
export async function proposePolish(targets: Awaited<ReturnType<typeof collectPolishTargets>>) {
  const batch = targets.slice(0, MAX_ITEMS)
  if (!batch.length) return { items: [] as PolishItem[], failed: [] as string[], checked: 0, truncated: 0 }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const byId = new Map(batch.map((i) => [`${i.kind}:${i.id}`, i]))
  const items: PolishItem[] = []
  const failed: string[] = []

  // ★ 묶음을 **동시에** 부른다. 밤 8시 자동 발송은 60초 안에 점검·발송·알림을 다 해야 하는데,
  //   40건씩 차례로 부르면 그것만으로 예산을 다 쓴다.
  const parts: (typeof batch)[] = []
  for (let at = 0; at < batch.length; at += CHUNK) parts.push(batch.slice(at, at + CHUNK))

  const texts = await Promise.all(parts.map(async (part) => {
    const payload = part.map((i) => ({ id: `${i.kind}:${i.id}`, 종류: i.kind === 'progress' ? '진도' : '알림장', 글: i.before }))
    let lastErr: any = null
    for (const model of MODELS) {
      try {
        const msg = await client.messages.create({
          model, max_tokens: 8000,
          messages: [{ role: 'user', content: `${RULES}\n\n다듬을 글 ${part.length}건:\n${JSON.stringify(payload, null, 1)}` }],
        })
        return msg.content[0].type === 'text' ? msg.content[0].text : ''
      } catch (e: any) { lastErr = e }
    }
    // 한 묶음이 실패해도 나머지는 살린다.
    failed.push(lastErr?.message ?? '알 수 없는 오류')
    return ''
  }))

  for (const text of texts) {
    if (!text) continue
    const m = text.match(/\{[\s\S]*\}/)
    let parsed: any = null
    try { parsed = JSON.parse(m?.[0] ?? text) } catch { /* 아래에서 처리 */ }
    if (!parsed?.items) { failed.push('AI 응답을 읽지 못했어요'); continue }

    for (const r of parsed.items as any[]) {
      const src = byId.get(String(r.id))
      const after = (r.after ?? '').toString().trim()
      if (!src || !after || after === src.before) continue
      const guard = checkPolish(src.before, after)
      items.push({
        ...src, after,
        why: String(r.why ?? '').trim() || '문장을 다듬었어요',
        safe: guard.ok, unsafeReason: guard.reason,
      })
    }
  }

  items.sort((a, b) => (a.teacher ?? '').localeCompare(b.teacher ?? '', 'ko') || a.student.localeCompare(b.student, 'ko'))
  return { items, failed, checked: batch.length, truncated: targets.length > MAX_ITEMS ? targets.length - MAX_ITEMS : 0 }
}

/** 고른 교정을 실제로 반영한다. */
export async function applyPolish(
  db: SupabaseClient,
  picks: { id: string; kind: 'progress' | 'notice'; after: string }[],
) {
  const done: { id: string; ok: boolean; error?: string }[] = []
  for (const it of picks) {
    const text = String(it.after ?? '').trim()
    if (!text) { done.push({ id: it.id, ok: false, error: '빈 글은 넣지 않아요' }); continue }
    const { error } = it.kind === 'progress'
      ? await db.from('class_sessions').update({ progress_content: text }).eq('id', it.id)
      : await db.from('feedbacks').update({ content: text }).eq('id', it.id)
    done.push({ id: it.id, ok: !error, error: error?.message })
  }
  return done
}

/**
 * 무엇을 고쳤고 무엇을 건너뛰었는지 남긴다 (note_polish_log).
 *
 * 밤 8시 자동 교정은 **사람 없이** 선생님 글을 바꾼다. 기록이 없으면 나중에
 * 「이 문장 내가 이렇게 안 썼는데」가 나왔을 때 확인할 길이 없다(2026-10-13).
 * 기록이 실패해도 발송은 막지 않는다 — 곁들이는 정보다.
 */
export async function logPolish(
  db: SupabaseClient,
  date: string,
  items: PolishItem[],
  source: 'auto' | 'manual',
  appliedIds?: Set<string>,
) {
  if (!items.length) return
  try {
    await db.from('note_polish_log').insert(items.map((i) => ({
      session_date: date,
      kind: i.kind,
      ref_id: i.id,
      student_name: i.student,
      teacher_name: i.teacher,
      before_text: i.before,
      after_text: i.after,
      why: i.why,
      applied: appliedIds ? appliedIds.has(i.id) : i.safe,
      skip_reason: i.safe ? null : i.unsafeReason,
      source,
    })))
  } catch {
    // 기록이 안 남아도 발송은 나가야 한다.
  }
}
