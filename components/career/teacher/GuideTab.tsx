'use client'

// 「설문 안내 · 미리보기」 탭 — 이 설문이 누구에게, 어디에, 어떤 순서로 나가는지를 한 화면에.
// 원장님 2026-11-07 「지금 이게 어떤 설문이 어떻게 진행되는지 알 길이 없는데」
//
//   · 미리보기        — 학생·학부모가 보는 설문지 그대로. 저장하지 않는다.
//   · 테스트 학생으로 — 원장님은 윤수지, 강사는 테스트 학생으로 **실제로 저장**한다(/api/career/test).
//                       저장된 답은 「응답 현황」·「학생별 기록」에 바로 보인다.

import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { FORMS, SECTIONS, SURVEY_ROUND, CONSENT_TEXT, questionsOf, type FormId } from '@/lib/careerSurvey'
import { TEST_STUDENTS } from '@/lib/testStudents'
import CareerSurveyForm, { type SubmitPayload } from '@/components/career/CareerSurveyForm'
import { GREEN, MINT, LINE, BROWN, Card } from './shared'

type Open = { form: FormId; mode: 'preview' | 'test' } | null

export default function GuideTab({ counts, myTestId, onTested }: {
  counts: Record<FormId, number>
  myTestId: string
  onTested: () => void
}) {
  const me = TEST_STUDENTS.find((t) => t.id === myTestId)!
  const [open, setOpen] = useState<Open>(null)
  const [showQ, setShowQ] = useState<FormId>('pre1')

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-bold" style={{ color: GREEN }}>진로 설문은 이렇게 진행됩니다</h2>
        <p className="text-xs text-gray-500 mt-1">설문 차수 {SURVEY_ROUND} · 한 학생에 학생 답 1장 + 학부모 답 1장</p>

        <div className="mt-4 grid md:grid-cols-2 gap-3 text-sm">
          <Box t="① 누구에게">
            {(['pre1', 'pre2'] as FormId[]).map((f) => (
              <div key={f}><b>{FORMS[f].label}</b> 설문 — 지금 <b>{FORMS[f].fromGrade}</b> 학생 {counts[f]}명과 그 학부모님</div>
            ))}
            <div className="text-xs text-gray-500 mt-1">다른 학년에게는 보이지 않아요. 테스트 학생(윤수지·테스트)에게는 두 설문이 다 보여요.</div>
          </Box>
          <Box t="② 어떻게 받나">
            <b>문자</b>로 나가요 (설명회 설문처럼). 학생·학부모마다 <b>자기 링크</b>가 들어 있어서 <b>로그인 없이</b> 누르면 바로 설문이 열려요.
            <div className="text-xs text-gray-500 mt-1">학부모는 보호자 번호로, 학생은 학생 번호로 갑니다. 앱에 로그인하면 첫 화면 「진로 설문」 띠로도 할 수 있어요.</div>
          </Box>
          <Box t="③ 어떤 순서로">
            <ol className="space-y-0.5">
              {SECTIONS.map((s, i) => <li key={s.id}>{i + 1}단계 · <b>{s.title}</b> <span className="text-xs text-gray-500">— {s.note}</span></li>)}
            </ol>
          </Box>
          <Box t="④ 답은 어디서 보나">
            이 화면 <b>「응답 현황」</b> 탭에서 학년별 집계·미응답 명단을, <b>「학생별 기록」</b> 탭에서 학생 한 명의 동의·학생 답·학부모 답을 봐요.
            <div className="text-xs text-gray-500 mt-1">설문 문자는 「응답 현황」 탭 「📩 설문 문자 보내기」에서 보냅니다(원장님).</div>
          </Box>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold" style={{ color: GREEN }}>직접 해 보기</h2>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {(['pre1', 'pre2'] as FormId[]).map((f) => (
            <div key={f} className="rounded-xl p-4" style={{ background: MINT, border: `1px solid ${LINE}` }}>
              <div className="font-bold" style={{ color: GREEN }}>{FORMS[f].label} 설문 <span className="text-xs font-normal text-gray-500">(현 {FORMS[f].fromGrade})</span></div>
              <div className="text-xs text-gray-600 mt-1 whitespace-pre-line">{FORMS[f].heading.replace('\n', ' ')}</div>
              <div className="mt-3 flex flex-col gap-2">
                <button onClick={() => setOpen({ form: f, mode: 'preview' })}
                  className="rounded-lg py-2 text-sm font-semibold border bg-white" style={{ borderColor: GREEN, color: GREEN }}>
                  👀 미리보기 (저장 안 됨)
                </button>
                <button onClick={() => setOpen({ form: f, mode: 'test' })}
                  className="rounded-lg py-2 text-sm font-semibold text-white" style={{ background: GREEN }}>
                  🧪 테스트 학생 「{me.name}」으로 해 보기
                </button>
                <TestLink form={f} studentId={myTestId} name={me.name} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          「테스트 학생으로 해 보기」는 실제로 저장돼요. {me.name} 학생 앱·학부모 앱으로 로그인해도 같은 설문이 보입니다.
          (원장님 테스트 학생: 윤수지 · 강사 테스트 학생: 테스트)
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-bold" style={{ color: GREEN }}>문항 한눈에 보기</h2>
          {(['pre1', 'pre2'] as FormId[]).map((f) => (
            <button key={f} onClick={() => setShowQ(f)} className="px-3 py-1 rounded-full text-xs border"
              style={showQ === f ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE }}>{FORMS[f].label}</button>
          ))}
        </div>
        <table className="mt-3 w-full text-sm">
          <tbody>
            <tr className="border-t" style={{ borderColor: LINE }}>
              <td className="py-2 pr-2 w-24 text-xs text-gray-500 align-top">1단계</td>
              <td className="py-2"><b>{CONSENT_TEXT.title}</b><div className="text-xs text-gray-500">[필수] 진로·학교 활동 정보 · [선택] 학생부(세특) 내용 · 보유 3년 · 동의한 사람 이름</div></td>
            </tr>
            {SECTIONS.filter((s) => s.id !== 'consent').map((s, i) => {
              const list = questionsOf(showQ).filter((q) => q.section === s.id)
              if (!list.length) return null
              return (
                <tr key={s.id} className="border-t align-top" style={{ borderColor: LINE }}>
                  <td className="py-2 pr-2 text-xs text-gray-500">{i + 2}단계<br />{s.title}</td>
                  <td className="py-2 space-y-1">
                    {list.map((q) => (
                      <div key={q.id}>
                        {q.label}{q.required && <b style={{ color: BROWN }}> *</b>}
                        <span className="text-xs text-gray-400"> — {q.type === 'single' ? '하나 고르기' : q.type === 'multi' ? '여러 개 고르기' : '직접 쓰기'}
                          {q.options ? `: ${q.options.join(' · ')}` : ''}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {open && <PreviewModal open={open} me={me} onClose={() => setOpen(null)} onTested={onTested} />}
    </div>
  )
}

function Box({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: '#F9FAFB' }}>
      <div className="text-xs font-bold mb-1.5" style={{ color: GREEN }}>{t}</div>
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

/** 휴대폰 크기 창에 설문지를 그대로 띄운다 */
function PreviewModal({ open, me, onClose, onTested }: {
  open: { form: FormId; mode: 'preview' | 'test' }; me: { id: string; name: string }; onClose: () => void; onTested: () => void
}) {
  const [role, setRole] = useState<'student' | 'parent'>('student')
  const [st, setSt] = useState<any>(null)
  const [err, setErr] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const test = open.mode === 'test'

  useEffect(() => {
    if (!test) { setSt(null); return }
    setSt(null); setErr('')
    apiFetch(`/api/career/test?respondent=${role}`).then(async (r) => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error ?? '테스트 학생을 불러오지 못했어요.'); else setSt(j)
    })
  }, [test, role])

  async function submit(p: SubmitPayload): Promise<string | null> {
    if (!test) return null   // 미리보기 — 저장하지 않는다
    const r = await apiFetch('/api/career/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', respondent: role, ...p }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return j.error ?? '저장하지 못했어요.'
    setSt(j); onTested()
    box.current?.scrollTo({ top: 0 })
    return null
  }
  async function revoke() {
    const r = await apiFetch('/api/career/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke', respondent: role }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setSt(j); onTested() }
  }

  const a = st?.answers?.[open.form]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="w-full max-w-[420px] h-[92vh] bg-white rounded-2xl overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ background: test ? '#FFF7ED' : '#F9FAFB' }}>
          <span className="text-xs font-bold" style={{ color: test ? '#9A3412' : '#374151' }}>
            {test ? `🧪 테스트 학생 「${me.name}」 — 실제로 저장됨` : '👀 미리보기 — 저장 안 됨'}
          </span>
          <button onClick={onClose} className="ml-auto text-sm text-gray-500">닫기 ✕</button>
        </div>
        <div className="px-4 py-2 flex gap-2 border-b">
          {(['student', 'parent'] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)} className="flex-1 rounded-lg py-1.5 text-xs font-bold border"
              style={role === r ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE }}>
              {r === 'student' ? '학생 화면으로' : '학부모 화면으로'}
            </button>
          ))}
        </div>
        <div ref={box} className="flex-1 overflow-y-auto">
          {err && <div className="p-6 text-sm text-red-600">{err}</div>}
          {test && !st && !err && <div className="p-10 text-center text-sm text-gray-400">불러오는 중…</div>}
          {(!test || st) && (
            <CareerSurveyForm
              key={`${open.form}-${role}-${open.mode}`}
              form={open.form} role={role} studentName={test ? me.name : '김예시'}
              consent={test ? st.consent : null}
              initial={test ? a?.answers ?? null : null} answeredAt={test ? a?.updated_at ?? null : null}
              mode={open.mode} onSubmit={submit} onRevoke={test ? revoke : undefined}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** 테스트 학생의 실제 문자 링크(/c/<token>)를 새 창으로 연다 — 학부모님·학생이 문자로 받아 여는 화면 그대로 */
function TestLink({ form, studentId, name }: { form: FormId; studentId: string; name: string }) {
  const [err, setErr] = useState('')
  async function go(k: 'student' | 'parent') {
    setErr('')
    const r = await apiFetch('/api/career/links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, testForm: form }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error ?? '링크를 만들지 못했어요.'); return }
    window.open(j[k], '_blank')
  }
  return (
    <div className="flex gap-2">
      <button onClick={() => go('student')} className="flex-1 rounded-lg py-1.5 text-xs font-semibold border bg-white" style={{ borderColor: LINE }}>📩 {name} 학생 문자 링크 열기</button>
      <button onClick={() => go('parent')} className="flex-1 rounded-lg py-1.5 text-xs font-semibold border bg-white" style={{ borderColor: LINE }}>📩 학부모 문자 링크 열기</button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  )
}
