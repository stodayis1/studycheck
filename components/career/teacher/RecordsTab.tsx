'use client'

// 「학생별 기록」 탭 — 학생 한 명의 동의 · 학생 답 · 학부모 답 · 활동 기록(탐구보고서·세특 …)
// 원장님 2026-11-07 「탐구보고서를 썼다면 어떤 주제로 썼고 만들어왔는지 모두 기록. 세부특기사항도 … 모두 기록」
//
// ★ 보이는 학생은 학생관리와 같다(canViewStudent — 강사는 본인 담당만, 「테스트」는 모두에게).
//   적기·고치기는 canEditStudent (주임모드는 보기만). 지우기는 deleted_at 만 채운다.

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ACTIVITY_KINDS, ACTIVITY_STATUS, FORMS, QUESTIONS, CONSENT_VERSION, formForGrade } from '@/lib/careerSurvey'
import { isTestStudentId } from '@/lib/testStudents'
import { GREEN, MINT, LINE, Badge, Card, type Student, type Consent, type Survey, type Activity } from './shared'

const GRADE_TABS = [
  { key: 'pre1', label: '예비고1 (중3)', grades: ['중3'] },
  { key: 'pre2', label: '예비고2 (고1)', grades: ['고1'] },
  { key: 'high', label: '고등 전체', grades: ['고1', '고2', '고3'] },
  { key: 'all', label: '전체', grades: null as string[] | null },
]

const thisYear = new Date().getFullYear()
const emptyForm = () => ({
  id: '', kind: '탐구보고서', school_year: String(thisYear), semester: '', grade_at: '',
  subject: '수학', title: '', detail: '', status: '', activity_date: '',
})

export default function RecordsTab({ students, consents, surveys, acts, setActs, selId, setSelId }: {
  students: Student[]; consents: Consent[]; surveys: Survey[]; acts: Activity[]
  setActs: React.Dispatch<React.SetStateAction<Activity[]>>
  selId: string | null; setSelId: (id: string | null) => void
}) {
  const { currentUser, canEditStudent } = useAuth()
  const [tab, setTab] = useState('pre2')
  const [q, setQ] = useState('')
  const [f, setF] = useState(emptyForm())
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const tabDef = GRADE_TABS.find((t) => t.key === tab)!
  const list = students
    .filter((s) => !tabDef.grades || tabDef.grades.includes(String(s.grade)) || (tab !== 'high' && isTestStudentId(s.id)))
    .filter((s) => !q.trim() || s.name.includes(q.trim()) || String(s.school ?? '').includes(q.trim()))

  const activeConsent = (sid: string, role: string) =>
    [...consents].reverse().find((c) => c.student_id === sid && c.signer_role === role && !c.revoked_at && c.consent_version === CONSENT_VERSION)
  const surveysOf = (sid: string, role: string) => surveys.filter((s) => s.student_id === sid && s.respondent === role)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const actsOf = (sid: string) => acts.filter((a) => a.student_id === sid)

  const sel = students.find((s) => s.id === selId) ?? null
  const canEdit = sel ? canEditStudent(sel) : false
  const selHasOptional = sel ? !!(activeConsent(sel.id, 'student')?.optional_agreed || activeConsent(sel.id, 'parent')?.optional_agreed) : false

  function openNew() { setF({ ...emptyForm(), grade_at: sel?.grade ?? '' }); setShowForm(true); setErr('') }
  function openEdit(a: Activity) {
    setF({
      id: a.id, kind: a.kind, school_year: a.school_year ? String(a.school_year) : '', semester: a.semester ? String(a.semester) : '',
      grade_at: a.grade_at ?? '', subject: a.subject ?? '', title: a.title, detail: a.detail ?? '', status: a.status ?? '',
      activity_date: a.activity_date ?? '',
    })
    setShowForm(true); setErr('')
  }

  async function save() {
    if (!sel) return
    if (!f.title.trim()) { setErr('주제·제목을 적어 주세요.'); return }
    if (f.kind === '세특' && !selHasOptional
      && !confirm('이 학생은 「학생부 내용(세특) 수집」 선택 동의가 아직 없습니다.\n그래도 저장할까요? (동의를 먼저 받는 것을 권합니다)')) return
    setBusy(true); setErr('')
    const row = {
      kind: f.kind, school_year: f.school_year ? Number(f.school_year) : null, semester: f.semester ? Number(f.semester) : null,
      grade_at: f.grade_at.trim() || null, subject: f.subject.trim() || null, title: f.title.trim().slice(0, 200),
      detail: f.detail.trim() || null, status: f.status || null, activity_date: f.activity_date || null,
      updated_at: new Date().toISOString(),
    }
    const res = f.id
      ? await supabase.from('student_activities').update(row).eq('id', f.id).select().single()
      : await supabase.from('student_activities').insert({
          ...row, student_id: sel.id, source: 'teacher', created_by: currentUser?.id ?? null, created_by_name: currentUser?.name ?? null,
        }).select().single()
    setBusy(false)
    if (res.error) { setErr('저장하지 못했어요: ' + res.error.message); return }
    const saved = res.data as Activity
    setActs((p) => [saved, ...p.filter((a) => a.id !== saved.id)])
    setShowForm(false)
  }

  async function remove(a: Activity) {
    if (!confirm(`「${a.title}」 기록을 지울까요?`)) return
    const { error } = await supabase.from('student_activities').update({ deleted_at: new Date().toISOString() }).eq('id', a.id)
    if (error) { alert('지우지 못했어요: ' + error.message); return }
    setActs((p) => p.filter((x) => x.id !== a.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {GRADE_TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-1.5 rounded-full text-sm border"
            style={tab === t.key ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE, background: '#fff' }}>
            {t.label}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·학교 검색"
          className="ml-auto rounded-xl border px-3 py-1.5 text-sm bg-white" style={{ borderColor: LINE }} />
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <div className="bg-white rounded-2xl overflow-hidden self-start" style={{ border: `1px solid ${LINE}` }}>
          {list.length === 0 && <div className="p-6 text-sm text-gray-400 text-center">학생이 없어요.</div>}
          {list.map((s) => {
            const n = actsOf(s.id).length
            return (
              <button key={s.id} onClick={() => { setSelId(s.id); setShowForm(false) }}
                className="w-full text-left px-4 py-2.5 border-b flex items-center gap-2 hover:bg-gray-50"
                style={{ borderColor: '#F1F5F4', background: selId === s.id ? MINT : undefined }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{s.name}{isTestStudentId(s.id) ? ' 🧪' : ''}</div>
                  <div className="text-[11px] text-gray-400 truncate">{s.school} · {s.grade}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Badge on={!!(activeConsent(s.id, 'student') || activeConsent(s.id, 'parent'))}>동의</Badge>
                  <Badge on={!!(surveysOf(s.id, 'student').length || surveysOf(s.id, 'parent').length)}>설문</Badge>
                  <Badge on={n > 0}>활동 {n}</Badge>
                </div>
              </button>
            )
          })}
        </div>

        <div className="space-y-4">
          {!sel && <Card className="text-center text-sm text-gray-400 !p-10">왼쪽에서 학생을 고르세요.</Card>}
          {sel && (
            <>
              <Card>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-lg font-bold" style={{ color: GREEN }}>{sel.name}</h2>
                  <span className="text-sm text-gray-500">{sel.school} · {sel.grade}</span>
                  {formForGrade(sel.grade) && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: MINT, color: GREEN }}>{FORMS[formForGrade(sel.grade)!].label}</span>}
                  {isTestStudentId(sel.id) && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FFF7ED', color: '#9A3412' }}>🧪 테스트 학생</span>}
                </div>
                <h3 className="mt-4 text-sm font-bold text-gray-700">개인정보 동의 (진로·활동 기록용)</h3>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  {(['student', 'parent'] as const).map((role) => {
                    const c = activeConsent(sel.id, role)
                    const revoked = !c && consents.some((x) => x.student_id === sel.id && x.signer_role === role && x.revoked_at)
                    return (
                      <div key={role} className="rounded-xl p-3 text-sm" style={{ background: c ? MINT : '#F9FAFB' }}>
                        <div className="font-semibold">{role === 'student' ? '학생' : '학부모'}</div>
                        {c ? (
                          <div className="text-xs text-gray-600 mt-1">
                            {c.signer_name} · {new Date(c.agreed_at).toLocaleDateString('ko-KR')} 동의<br />
                            필수 ✓ · 학생부(세특) {c.optional_agreed ? '✓' : '✗'}
                          </div>
                        ) : <div className="text-xs text-gray-400 mt-1">{revoked ? '철회함' : '아직 없음'}</div>}
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-bold text-gray-700">진로 설문 답</h3>
                <div className="mt-2 grid md:grid-cols-2 gap-3">
                  {(['student', 'parent'] as const).map((role) => {
                    const list = surveysOf(sel.id, role)
                    return (
                      <div key={role} className="rounded-xl p-3" style={{ background: '#F9FAFB' }}>
                        <div className="text-sm font-semibold">{role === 'student' ? '학생 답' : '학부모 답'}</div>
                        {!list.length && <div className="text-xs text-gray-400 mt-1">아직 안 냄</div>}
                        {list.map((sv) => (
                          <div key={sv.id} className="mt-2">
                            <div className="text-[11px] text-gray-400">{sv.survey_key} · {new Date(sv.updated_at).toLocaleDateString('ko-KR')}</div>
                            <dl className="mt-1 space-y-1.5">
                              {QUESTIONS.filter((qq) => sv.answers[qq.id] != null && sv.answers[qq.id] !== '').map((qq) => (
                                <div key={qq.id}>
                                  <dt className="text-[11px] text-gray-400">{qq.label}</dt>
                                  <dd className="text-sm text-gray-800 whitespace-pre-wrap">
                                    {Array.isArray(sv.answers[qq.id]) ? sv.answers[qq.id].join(', ') : sv.answers[qq.id]}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </Card>

              <Card>
                <div className="flex items-center">
                  <h3 className="text-sm font-bold text-gray-700">활동 기록 (탐구보고서 · 세특 · 수행평가 …)</h3>
                  {canEdit && !showForm && (
                    <button onClick={openNew} className="ml-auto px-3 py-1.5 rounded-xl text-sm text-white" style={{ background: GREEN }}>+ 기록 추가</button>
                  )}
                </div>
                {!canEdit && <p className="text-xs text-gray-400 mt-1">본인 담당 학생만 적을 수 있어요(보기 전용).</p>}

                {showForm && (
                  <div className="mt-3 rounded-xl p-4 space-y-2" style={{ background: MINT }}>
                    <div className="flex flex-wrap gap-2">
                      {ACTIVITY_KINDS.map((k) => (
                        <button key={k} type="button" onClick={() => setF((p) => ({ ...p, kind: k }))}
                          className="px-2.5 py-1 rounded-full text-xs border"
                          style={f.kind === k ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE, background: '#fff' }}>{k}</button>
                      ))}
                    </div>
                    {f.kind === '세특' && !selHasOptional && (
                      <p className="text-xs text-amber-700">⚠ 학생부(세특) 수집 선택 동의가 아직 없습니다. 동의를 먼저 받아 주세요.</p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <input value={f.school_year} onChange={(e) => setF({ ...f, school_year: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="학년도" className="rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: LINE }} />
                      <select value={f.semester} onChange={(e) => setF({ ...f, semester: e.target.value })} className="rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: LINE }}>
                        <option value="">학기</option><option value="1">1학기</option><option value="2">2학기</option>
                      </select>
                      <input value={f.grade_at} onChange={(e) => setF({ ...f, grade_at: e.target.value })} placeholder="그때 학년 (고1)" className="rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: LINE }} />
                      <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="과목" className="rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: LINE }} />
                      <input type="date" value={f.activity_date} onChange={(e) => setF({ ...f, activity_date: e.target.value })} className="rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: LINE }} />
                    </div>
                    <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200}
                      placeholder={f.kind === '세특' ? '세특 한 줄 요약 (예: 공통수학1 — 이차함수 최적화 탐구)' : '주제·제목 (예: 피보나치 수열과 황금비)'}
                      className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
                    <textarea value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} rows={5}
                      placeholder={f.kind === '세특' ? '학생부에 적힌 세특 문구 그대로' : '내용 · 방법 · 결과 · 선생님 의견'}
                      className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-gray-500">진행:</span>
                      {ACTIVITY_STATUS.map((s) => (
                        <button key={s} type="button" onClick={() => setF((p) => ({ ...p, status: p.status === s ? '' : s }))}
                          className="px-2.5 py-1 rounded-full text-xs border"
                          style={f.status === s ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE, background: '#fff' }}>{s}</button>
                      ))}
                    </div>
                    {err && <p className="text-sm text-red-600">{err}</p>}
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg text-sm border bg-white" style={{ borderColor: LINE }}>취소</button>
                      <button disabled={busy} onClick={save} className="px-4 py-1.5 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: GREEN }}>{busy ? '저장 중…' : '저장'}</button>
                    </div>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {actsOf(sel.id).length === 0 && !showForm && <div className="text-xs text-gray-400">아직 기록이 없어요.</div>}
                  {actsOf(sel.id).map((a) => (
                    <div key={a.id} className="rounded-xl p-3 border" style={{ borderColor: '#EEF2F1' }}>
                      <div className="flex items-start gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded-full shrink-0" style={{ background: MINT, color: GREEN }}>{a.kind}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800">{a.title}</div>
                          <div className="text-[11px] text-gray-400">
                            {[a.school_year && `${a.school_year}년`, a.semester && `${a.semester}학기`, a.grade_at, a.subject, a.status, a.activity_date].filter(Boolean).join(' · ')}
                            {a.created_by_name && ` · 적은 사람 ${a.created_by_name}`}
                          </div>
                          {a.detail && <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{a.detail}</div>}
                        </div>
                        {canEdit && (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEdit(a)} className="text-xs text-gray-500 hover:text-gray-800">고치기</button>
                            <button onClick={() => remove(a)} className="text-xs text-red-400 hover:text-red-600">지우기</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
