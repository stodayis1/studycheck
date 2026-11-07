'use client'

// 진로 설문 — 문자로 받은 개인 링크. /c/<token>  (로그인 없이 연다)
//
// 원장님 2026-11-07 「스터디체크에 로그인하려고 하질 않으시거든 … 문자로. 설명회 설문조사처럼」
// 설문지 모양은 앱 안 설문과 같다 (components/career/CareerSurveyForm.tsx). 답은 같은 표에 쌓여
// 선생님 「진로·활동 기록」 화면에 바로 보인다.
//
// ★ 주소가 짧아야 문자가 짧다 — 그래서 /c/ 한 글자.
// ★ 카카오톡·문자 인앱 브라우저에서 열린다 — useSearchParams 를 쓰지 않는다.

import { use, useEffect, useState } from 'react'
import CareerSurveyForm, { type SubmitPayload } from '@/components/career/CareerSurveyForm'
import type { FormId } from '@/lib/careerSurvey'

type State = {
  role: 'student' | 'parent'
  student: { name: string; grade: string | null }
  forms: FormId[]
  consent: { signer_name: string | null; optional_agreed: boolean; agreed_at: string } | null
  answers: Record<string, { answers: any; updated_at: string } | null>
}

export default function CareerLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [st, setSt] = useState<State | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/career/link/${encodeURIComponent(token)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error ?? '설문을 열지 못했어요. 잠시 뒤 다시 눌러 주세요.'); else setSt(j)
    }).catch(() => setErr('인터넷 연결을 확인하고 다시 눌러 주세요.'))
  }, [token])

  async function post(body: object): Promise<string | null> {
    const r = await fetch(`/api/career/link/${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return j.error ?? '보내지 못했어요. 잠시 후 다시 눌러 주세요.'
    setSt(j)
    return null
  }

  if (err) return (
    <div className="min-h-screen grid place-items-center bg-white px-6">
      <p className="text-center text-sm leading-relaxed text-gray-500">{err}</p>
    </div>
  )
  if (!st) return <div className="min-h-screen grid place-items-center text-sm text-gray-400">불러오는 중…</div>

  const form = st.forms[0]
  const a = st.answers[form]
  return (
    <div className="mx-auto max-w-lg">
      <CareerSurveyForm
        form={form} role={st.role} studentName={st.student.name}
        consent={st.consent} initial={a?.answers ?? null} answeredAt={a?.updated_at ?? null}
        mode="live"
        onSubmit={(p: SubmitPayload) => post({ action: 'submit', ...p })}
        onRevoke={async () => { await post({ action: 'revoke' }) }}
      />
    </div>
  )
}
