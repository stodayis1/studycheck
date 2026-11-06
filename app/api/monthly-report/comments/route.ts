/**
 * 한 줄 평을 **여러 학생 것 한꺼번에** 만들어 돌려준다. 아직 아무것도 남기지 않는다.
 *
 * 원장님 2026-11-06
 *   「한명한명 모두 선생님 코멘트를 AI생성해야 볼수 있는건가? … 담당 학생 또는 학년별로
 *    알림장 코멘트를 한 화면에서 요약정리하게 보여주면 해당학생의 월간보고서에 한꺼번에
 *    씌워서 일괄발송되게 해주는게 더 좋을거 같아」
 *
 * ★ 여기서는 **만들어 보여 주기만** 한다. 링크도 안 찍고 카톡도 안 보낸다 —
 *   원장님이 한 화면에서 읽고 고치신 뒤 그 글을 그대로 들고 발송으로 넘어간다.
 * ★ 알림장이 없는 학생은 **부르지 않는다**(돈만 든다). 그 학생은 빈 칸으로 돌려준다.
 * ★ 한 명이 실패해도 나머지는 계속 간다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildMonthlyReport } from '@/lib/monthlyReport'
import { AI_TEXT_MODEL, NO_THINKING, textOf } from '@/lib/aiModels'
import { commentPrompt, hasSomethingToSummarize, toneProblems } from '@/lib/monthlyComment'

export const runtime = 'nodejs'
export const maxDuration = 300

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  const b = await req.json().catch((): any => null)
  const ids: string[] = b?.studentIds ?? []
  const year = Number(b?.year), month = Number(b?.month)
  const months: 1 | 2 = Number(b?.months) === 2 ? 2 : 1
  if (!ids.length || !year || !month) {
    return NextResponse.json({ error: '학생과 기간을 골라 주세요.' }, { status: 400 })
  }

  const supabase = db()
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const out: any[] = []

  for (const id of ids) {
    try {
      const data = await buildMonthlyReport(supabase, id, year, month, months)
      if (!data) { out.push({ studentId: id, name: '?', error: '학생을 찾지 못했어요.' }); continue }

      const 알림장수 = (data.notices ?? []).filter((n: any) => String(n?.content ?? '').trim()).length
      const 재료 = {
        studentName: data.student.name, studentGrade: data.student.grade,
        months, notices: data.notices ?? [],
        numbers: {
          sessions: data.lessons.total, onTime: data.lessons.onTime,
          late: data.lessons.late, absent: data.lessons.absent,
          hwRate: data.homework.achievement, hwScore: data.homework.score,
        },
      }
      const 공통 = {
        studentId: id, name: data.student.name, grade: data.student.grade,
        teacher: data.student.teacher, notices: 알림장수,
      }
      if (!hasSomethingToSummarize(재료)) {
        out.push({ ...공통, comment: '', note: '알림장이 없어 못 만들었어요. 직접 적어 주세요.' })
        continue
      }

      const 한번 = async (덧말?: string) => textOf(await ai.messages.create({
        model: AI_TEXT_MODEL, thinking: NO_THINKING, max_tokens: 1500,
        messages: [{ role: 'user', content: commentPrompt(재료) + (덧말 ?? '') }],
      }))
      let comment = await 한번()
      let 문제 = toneProblems(comment)
      if (문제.length) {
        const 다시 = await 한번(`\n\n방금 쓴 글에 이런 문제가 있었습니다: ${문제.join(', ')}.`
          + ` 그 표현을 빼고 다시 써 주세요. 선생님이 쓰신 글을 줄이는 것이지 새로 평가하는 글이 아닙니다.`)
        if (다시 && toneProblems(다시).length < 문제.length) { comment = 다시; 문제 = toneProblems(다시) }
      }
      out.push({ ...공통, comment, tone: 문제 })
    } catch (e: any) {
      out.push({ studentId: id, name: '?', error: e?.message ?? '만들지 못했어요.' })
    }
  }
  return NextResponse.json({ ok: true, items: out })
}
