'use client'

// 「로드맵 읽기」 카드 — 그 학생의 활동을 모아 여태 한 것 · 비어 있는 것 · 다음에 해 볼 것.
//
// 원장님 2026-11-10 「그걸 바탕으로 이러이러한 내용을 가면 좋겠다는 걸 그려 줘야 분석 아니냐」
//
// ★ 앱이 AI 를 부르지 않는다(유료 API). 세는 규칙 + 미리 만들어 둔 주제 사전으로만 그린다.
// ★ 말투를 평범하게 — 원장님 「AI 스럽지 않게」. 주제도 **그대로 베끼지 말라**고 적어 둔다
//   (학교가 AI 추천 주제를 알아보는 경우가 있다 — 원장님 2026-11-10).

import { useMemo } from 'react'
import { makePlan, type PlanAct } from '@/lib/careerPlan'
import { GREEN, MINT, LINE, Card } from './shared'

export default function PlanCard({ grade, answers, acts, onUseTopic }: {
  grade: string | null
  answers: Record<string, any> | null
  acts: PlanAct[]
  /** 「이 주제로 기록 추가」 — 기록 폼을 제목·왜 칸까지 채워 연다 */
  onUseTopic?: (t: { title: string; why: string; subject: string }) => void
}) {
  const plan = useMemo(() => makePlan({ grade, answers, acts }), [grade, answers, acts])

  return (
    <Card>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-gray-700">로드맵 읽기</h3>
        <span className="text-[11px] text-gray-400">적힌 활동으로 본 지금 상태와 다음 걸음</span>
      </div>

      <p className="mt-2 text-sm font-semibold" style={{ color: GREEN }}>{plan.headline}</p>

      {plan.counts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {plan.counts.map((c) => (
            <span key={c.kind} className="px-2 py-0.5 rounded-full text-[11px] border bg-white" style={{ borderColor: LINE }}>
              {c.kind} <b style={{ color: GREEN }}>{c.n}</b>
            </span>
          ))}
        </div>
      )}

      {plan.gaps.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-bold text-gray-600">채워야 할 것</div>
          <ul className="mt-1 space-y-1">
            {plan.gaps.map((g) => (
              <li key={g} className="text-xs leading-relaxed" style={{ color: '#9A3412' }}>· {g}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.thin.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-bold text-gray-600">더 물어볼 것 (기록이 너무 짧아요)</div>
          <ul className="mt-1 space-y-1">
            {plan.thin.slice(0, 5).map((t) => (
              <li key={t.title} className="text-xs text-gray-600">
                · <b>{t.title}</b> — {t.missing.join(' · ')} 이 비어 있어요
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.topics.length > 0 && (
        <div className="mt-3 rounded-xl p-3" style={{ background: MINT }}>
          <div className="text-xs font-bold" style={{ color: GREEN }}>다음에 해 볼 만한 것</div>
          <p className="text-[10px] text-gray-500 mt-0.5">{plan.topicWhy}</p>
          <div className="mt-2 space-y-2">
            {plan.topics.map((t) => (
              <div key={t.id} className="rounded-lg bg-white p-2.5 border" style={{ borderColor: LINE }}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-800">{t.title}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{t.question}</div>
                    <div className="text-[11px] text-gray-500 mt-1">해 보는 법 — {t.how}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{t.subject} · {t.concepts}</div>
                  </div>
                  {onUseTopic && (
                    <button
                      onClick={() => onUseTopic({ title: t.title, why: t.question, subject: t.subject })}
                      className="ml-auto shrink-0 px-2.5 py-1 rounded-lg text-[11px] text-white" style={{ background: GREEN }}>
                      이 주제로 기록
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-gray-500">
            그대로 베껴 쓰지 말고 <b>그 학생이 직접 모은 자료</b>로 바꿔 주세요. 같은 제목이 여러 학생 학생부에
            똑같이 적히면 곤란해져요.
          </p>
        </div>
      )}
    </Card>
  )
}
