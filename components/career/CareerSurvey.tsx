'use client'

// 진로 설문 — 학생(/student/career)·학부모(/parent/career) 앱에서 여는 화면.
// 설문지 모양은 CareerSurveyForm (학부모 설문과 같은 꼴), 여기서는 불러오기·저장만 한다.
//
// ★ 본인 확인은 서버(/api/career)가 로그인 토큰으로 한다. 이 화면은 학생 id 를 보내지 않는다.
// ★ 테스트 학생(윤수지·테스트)은 학년과 상관없이 예비고1·예비고2 설문을 골라 해 볼 수 있다.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/apiFetch'
import { FORMS, type FormId } from '@/lib/careerSurvey'
import CareerSurveyForm, { type SubmitPayload } from './CareerSurveyForm'

type State = {
  role: 'student' | 'parent'
  student: { name: string; grade: string | null }
  isTest: boolean
  forms: FormId[]
  consent: { signer_name: string | null; optional_agreed: boolean; agreed_at: string } | null
  answers: Record<string, { answers: any; updated_at: string } | null>
}

export function FormPicker({ forms, form, setForm, note }: { forms: FormId[]; form: FormId; setForm: (f: FormId) => void; note: string }) {
  return (
    <div className="px-4 py-3 border-b" style={{ background: '#FFF7ED', borderColor: '#FED7AA' }}>
      <p className="text-[11.5px] font-semibold mb-2" style={{ color: '#9A3412' }}>{note}</p>
      <div className="flex gap-2">
        {forms.map((f) => (
          <button key={f} onClick={() => setForm(f)}
            className="flex-1 rounded-xl py-2 text-[13px] font-bold border"
            style={form === f ? { background: '#085041', color: '#fff', borderColor: '#085041' } : { background: '#fff', color: '#4b5563', borderColor: '#C7DED6' }}>
            {FORMS[f].label} 설문 <span className="font-normal opacity-80">(현 {FORMS[f].fromGrade})</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CareerSurvey() {
  const router = useRouter()
  const [st, setSt] = useState<State | null>(null)
  const [form, setForm] = useState<FormId | null>(null)
  const [loadErr, setLoadErr] = useState('')

  async function load() {
    try {
      if (!sessionStorage.getItem('studycheck_student')) { router.push('/auth/login'); return }
    } catch { /* 저장소를 못 쓰는 브라우저 — 서버 답으로 판단 */ }
    const r = await apiFetch('/api/career')
    if (r.status === 401) { setLoadErr('로그인이 풀렸어요. 다시 로그인해 주세요.'); return }
    const j = await r.json().catch((): any => null)
    if (!r.ok || !j) { setLoadErr(j?.error ?? '불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'); return }
    setSt(j)
    setForm((p) => (p && j.forms.includes(p) ? p : j.forms[0] ?? null))
  }
  useEffect(() => { load() }, [])

  async function post(body: object): Promise<string | null> {
    const r = await apiFetch('/api/career', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return j.error ?? '보내지 못했어요. 잠시 후 다시 눌러 주세요.'
    setSt(j)
    return null
  }

  const back = () => router.push(st?.role === 'parent' ? '/parent/dashboard' : '/student/dashboard')

  if (loadErr) return (
    <div className="p-8 text-center text-sm text-gray-600">
      <p>{loadErr}</p>
      <button onClick={() => router.push('/auth/login')} className="mt-4 px-4 py-2 rounded-xl text-white" style={{ background: '#085041' }}>로그인</button>
    </div>
  )
  if (!st) return <div className="p-10 text-center text-gray-400 text-sm">불러오는 중…</div>
  if (!form) return (
    <div className="p-8 text-center text-sm text-gray-600 leading-relaxed">
      진로 설문은 지금 <b>중3(예비고1)</b>·<b>고1(예비고2)</b> 학생과 학부모님께 받고 있어요.<br />
      {st.student.name} 학생({st.student.grade ?? '-'})은 대상이 아니에요.
      <div><button onClick={back} className="mt-4 underline text-gray-500">돌아가기</button></div>
    </div>
  )

  const a = st.answers[form]
  return (
    <CareerSurveyForm
      form={form} role={st.role} studentName={st.student.name}
      consent={st.consent} initial={a?.answers ?? null} answeredAt={a?.updated_at ?? null}
      mode="live" onBack={back}
      onSubmit={(p: SubmitPayload) => post({ action: 'submit', ...p })}
      onRevoke={async () => { await post({ action: 'revoke' }) }}
      top={st.isTest && st.forms.length > 1
        ? <FormPicker forms={st.forms} form={form} setForm={setForm}
            note="🧪 테스트 학생이라 두 설문을 모두 해 볼 수 있어요. (실제 학생에게는 학년에 맞는 설문 하나만 보입니다)" />
        : undefined}
    />
  )
}
