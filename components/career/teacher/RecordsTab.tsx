'use client'

// 「학생별 기록」 탭 — 학생 한 명의 동의 · 학생 답 · 학부모 답 · 활동 기록(탐구보고서·세특 …)
// 원장님 2026-11-07 「탐구보고서를 썼다면 어떤 주제로 썼고 만들어왔는지 모두 기록. 세부특기사항도 … 모두 기록」
//
// ★ 보이는 학생은 학생관리와 같다(canViewStudent — 강사는 본인 담당만, 「테스트」는 모두에게).
//   적기·고치기는 canEditStudent (주임모드는 보기만). 지우기는 deleted_at 만 채운다.

import { useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/apiFetch'
import { ACTIVITY_KINDS, ACTIVITY_STATUS, FORMS, QUESTIONS, CONSENT_VERSION, formForGrade } from '@/lib/careerSurvey'
import { isTestStudentId } from '@/lib/testStudents'
import { RECORD_RULES, forbiddenWarnings, letterCount, LETTER_LIMITS } from '@/lib/careerRecordRules'
import { EMPTY_PARTS, PART_LABELS, composeDetail, parseDetail, isSplitKind, type ActivityParts } from '@/lib/activityParts'
import PlanCard from './PlanCard'
import SubjectGuideCard from './SubjectGuideCard'
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
  // ★ 활동은 다섯 칸으로 나눠 묻는다 (원장님 2026-11-10). 세특만 한 칸 그대로.
  const [parts, setParts] = useState<ActivityParts>({ ...EMPTY_PARTS })
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
  // 그 학생이 질문지에 적은 계열·학과 — 권장 이수과목을 찾는 열쇠 (학생 답을 먼저, 없으면 학부모 답)
  const selAnswer = sel ? (surveysOf(sel.id, 'student')[0] ?? surveysOf(sel.id, 'parent')[0])?.answers ?? {} : {}
  const selFields: string[] = Array.isArray(selAnswer.field) ? selAnswer.field : []
  const selMajor: string = String(selAnswer.major ?? '')
  // 다섯 칸을 합친 것이 실제로 저장되는 글이다 — 경고·글자수도 이걸 본다
  const detailText = isSplitKind(f.kind) ? composeDetail(parts) : f.detail
  // 적은 글에 **학생부에 못 들어갈 말**이 있나 (막지 않고 알려만 준다)
  const warns = forbiddenWarnings(f.title, detailText)
  const limit = LETTER_LIMITS[f.kind]
  const count = letterCount(detailText)
  const selHasOptional = sel ? !!(activeConsent(sel.id, 'student')?.optional_agreed || activeConsent(sel.id, 'parent')?.optional_agreed) : false

  // ★ 질문지에 **학생이 적어 준** 동아리·탐구 주제를 활동 기록으로 옮긴다
  //   (원장님 2026-11-10 「학생이 탐구보고서 수행평가 동아리 진로활동 등을 써 줬잖아」).
  //   그냥 두면 질문지 안에만 갇혀 있어서 로드맵이 「활동이 하나도 없어요」라고 말한다.
  const surveyDrafts = useMemo(() => {
    if (!sel) return [] as { kind: string; title: string; grade_at: string }[]
    const lines = (v: any) => String(v ?? '').split(/[\n;]/).map((x) => x.trim()).filter((x) => x.length >= 4)
    const out: { kind: string; title: string; grade_at: string }[] = []
    for (const l of lines(selAnswer.inquiry)) out.push({ kind: '탐구보고서', title: l.slice(0, 200), grade_at: '고1' })
    for (const l of lines(selAnswer.club)) out.push({ kind: '동아리', title: l.slice(0, 200), grade_at: sel.grade ?? '' })
    for (const l of lines(selAnswer.mid_activities)) out.push({ kind: '진로활동', title: l.slice(0, 200), grade_at: '중3' })
    const had = new Set(actsOf(sel.id).map((x) => x.title.trim()))
    return out.filter((x) => !had.has(x.title.trim()))
  }, [sel, surveys, acts])   // eslint-disable-line react-hooks/exhaustive-deps

  // ★ 「활동 적어 줘」 문자 — 학생 링크(/a/<token>)를 보낸다. 미리보기 → 확인 → 발송.
  //   원장님 2026-11-10 「학생에게 바로 보낼 수 있는 버튼도 만들어줘. 학생들은 로그인을 잘 안 하거든」
  const isOwner = currentUser?.role === 'admin'
  async function sendActSms(ask: string[] = []) {
    if (!sel) return
    setBusy(true); setErr('')
    try {
      const pre = await apiFetch('/api/career/act-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: sel.id, ask }),
      })
      const j = await pre.json().catch(() => ({}))
      if (!pre.ok) { setErr(j.error ?? '문자를 준비하지 못했어요.'); return }
      if (!confirm(`${j['받는분']} 에게 이대로 보낼까요?

${j['글']}`)) return
      const go = await apiFetch('/api/career/act-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: sel.id, ask, send: true }),
      })
      const k = await go.json().catch(() => ({}))
      if (!go.ok) { setErr(k.error ?? '문자를 보내지 못했어요.'); return }
      alert(k['테스트모드'] ? '보냈습니다 (OPS 테스트 모드라 실제로는 안 나갔어요).' : '보냈습니다.')
    } finally { setBusy(false) }
  }

  async function importFromSurvey() {
    if (!sel || !surveyDrafts.length) return
    if (!confirm(`질문지에 적어 준 ${surveyDrafts.length}건을 활동 기록으로 가져올까요?
제목만 들어가니, 가져온 뒤 다섯 칸(왜·어떻게·알게 된 것…)을 채워 주세요.`)) return
    setBusy(true); setErr('')
    const rows = surveyDrafts.map((d) => ({
      student_id: sel.id, kind: d.kind, title: d.title, grade_at: d.grade_at || null,
      detail: composeDetail({ free: '질문지에 학생이 적어 준 것이에요. 다섯 칸을 채워 주세요.' }),
      source: 'survey', created_by: currentUser?.id ?? null, created_by_name: currentUser?.name ?? null,
    }))
    const res = await supabase.from('student_activities').insert(rows).select()
    setBusy(false)
    if (res.error) { setErr('가져오지 못했어요: ' + res.error.message); return }
    setActs((p) => [...((res.data ?? []) as Activity[]), ...p])
  }

  function openNew(seed?: Partial<ReturnType<typeof emptyForm>> & { why?: string }) {
    setF({ ...emptyForm(), grade_at: sel?.grade ?? '', ...seed })
    setParts({ ...EMPTY_PARTS, why: seed?.why ?? '' })
    setShowForm(true); setErr('')
  }
  function openEdit(a: Activity) {
    setF({
      id: a.id, kind: a.kind, school_year: a.school_year ? String(a.school_year) : '', semester: a.semester ? String(a.semester) : '',
      grade_at: a.grade_at ?? '', subject: a.subject ?? '', title: a.title, detail: a.detail ?? '', status: a.status ?? '',
      activity_date: a.activity_date ?? '',
    })
    setParts(parseDetail(a.detail))
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
      detail: detailText.trim() || null, status: f.status || null, activity_date: f.activity_date || null,
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
                <LinkRow studentId={sel.id} canHave={!!formForGrade(sel.grade) || isTestStudentId(sel.id)}
                  phone={sel.student_phone ?? null} />
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
                <h3 className="text-sm font-bold text-gray-700">질문지 답</h3>
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

              {/* 적힌 활동으로 본 지금 상태와 다음 걸음 (원장님 2026-11-10) */}
              <PlanCard grade={sel.grade ?? null} answers={selAnswer} acts={actsOf(sel.id)}
                onUseTopic={canEdit ? (t) => openNew({ title: t.title, subject: t.subject, why: t.why }) : undefined}
                onAsk={isOwner ? (ask) => sendActSms(ask) : undefined} busy={busy} />

              {/* 고른 계열·학과 → 2028 권장 이수과목 (원장님 2026-11-10) */}
              <SubjectGuideCard fields={selFields} major={selMajor} />

              <Card>
                <div className="flex items-center">
                  <h3 className="text-sm font-bold text-gray-700">활동 기록 (탐구보고서 · 세특 · 수행평가 …)</h3>
                  {isOwner && !showForm && (
                    <button onClick={() => sendActSms()} disabled={busy}
                      className="ml-auto px-3 py-1.5 rounded-xl text-sm border bg-white disabled:opacity-50" style={{ borderColor: LINE, color: GREEN }}>
                      📩 학생에게 적어 달라고 보내기
                    </button>
                  )}
                  {canEdit && !showForm && surveyDrafts.length > 0 && (
                    <button onClick={importFromSurvey} disabled={busy}
                      className={`${isOwner ? 'ml-2' : 'ml-auto'} px-3 py-1.5 rounded-xl text-sm border bg-white disabled:opacity-50`} style={{ borderColor: LINE, color: GREEN }}>
                      질문지에서 가져오기 {surveyDrafts.length}건
                    </button>
                  )}
                  {canEdit && !showForm && (
                    <button onClick={() => openNew()} className={`${isOwner || surveyDrafts.length > 0 ? 'ml-2' : 'ml-auto'} px-3 py-1.5 rounded-xl text-sm text-white`} style={{ background: GREEN }}>+ 기록 추가</button>
                  )}
                </div>
                {!canEdit && <p className="text-xs text-gray-400 mt-1">본인 담당 학생만 적을 수 있어요(보기 전용).</p>}

                {/* ★ 학생부에 못 들어가는 것 — 적기 전에 보이게 (원장님 2026-11-10).
                    근거는 『2026 학교생활기록부 기재요령(고등학교)』. lib/careerRecordRules.ts 한 곳에 둔다. */}
                <details className="mt-2 rounded-xl p-3" style={{ background: '#FFF7ED', border: '1px solid #FDBA74' }}>
                  <summary className="text-xs font-bold cursor-pointer" style={{ color: '#9A3412' }}>
                    학생부에 못 들어가는 것 — 적기 전에 한 번 보기
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {RECORD_RULES.map((r, i) => (
                      <li key={i} className="text-[11px] leading-relaxed" style={{ color: '#7C2D12' }}>· {r}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px]" style={{ color: '#9A3412' }}>
                    근거: 2026학년도 학교생활기록부 기재요령(고등학교) · 17개 시도교육청
                  </p>
                </details>

                {showForm && (
                  <div className="mt-3 rounded-xl p-4 space-y-2" style={{ background: MINT }}>
                    <div className="flex flex-wrap gap-2">
                      {ACTIVITY_KINDS.map((k) => (
                        <button key={k} type="button" onClick={() => setF((p) => ({ ...p, kind: k }))}
                          className="px-2.5 py-1 rounded-full text-xs border"
                          style={f.kind === k ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE, background: '#fff' }}>{k}</button>
                      ))}
                    </div>
                    {/* ★ 동의는 **둘**이다 — [필수] 진로·학교 활동 / [선택] 학생부 기재 내용(세특).
                        필수만 누른 학생이 많아서, 「또 동의를 받으라는 거냐」로 읽힌다(원장님 2026-11-10).
                        그래서 무엇이 막히고 무엇은 그냥 되는지까지 적는다. */}
                    {f.kind === '세특' && !selHasOptional && (
                      <p className="text-xs text-amber-700">
                        ⚠ {sel.name} 학생은 <b>[필수]</b> 동의만 했고 <b>[선택] 학생부 기재 내용(세특)</b>은 아직이에요.
                        탐구보고서·수행평가·동아리는 그냥 적으시면 되고, <b>학생부 세특 문구를 그대로 옮길 때만</b> 선택 동의가 필요해요.
                        위 「개인정보 동의」 칸에서 「학생부(세특) ✗」로 보이는 그 칸이에요.
                      </p>
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
                      placeholder={f.kind === '세특' ? '세특 한 줄 요약 (예: 공통수학1 — 이차함수로 매점 가격 따져 보기)' : '주제·제목 (예: 우리 학교 급식 잔반은 무엇에 따라 늘어나나)'}
                      className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
                    {/* ★ 다섯 칸으로 나눠 묻는다 (원장님 2026-11-10 「구체적으로 물어서 학생이
                        각각 내용을 구체적으로 쓰게」). 한 칸짜리 「내용」으로 두면 한 줄로 끝나서
                        나중에 읽을 것이 없다. 이 다섯 칸이 그대로 탐구보고서·세특의 뼈대다.
                        세특만 나누지 않는다 — 학생부 문구를 그대로 옮기는 칸이라서. */}
                    {!isSplitKind(f.kind) ? (
                      <textarea value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} rows={5}
                        placeholder="학생부에 적힌 세특 문구 그대로"
                        className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
                    ) : (
                      <div className="space-y-2">
                        {parts.free.trim() && (
                          <div>
                            <label className="text-[11px] text-gray-500">예전에 적어 둔 내용</label>
                            <textarea value={parts.free} onChange={(e) => setParts({ ...parts, free: e.target.value })} rows={2}
                              className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }} />
                          </div>
                        )}
                        {PART_LABELS.map((pl) => (
                          <div key={pl.key}>
                            <label className="text-[11px] font-semibold" style={{ color: GREEN }}>{pl.label}</label>
                            <span className="ml-1.5 text-[10px] text-gray-400">{pl.hint}</span>
                            <textarea value={parts[pl.key]} onChange={(e) => setParts({ ...parts, [pl.key]: e.target.value })}
                              rows={pl.key === 'why' || pl.key === 'found' ? 3 : 2}
                              className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }} />
                          </div>
                        ))}
                        <p className="text-[10px] text-gray-400">
                          다 채우지 않아도 저장돼요. 빈 칸은 「무엇을 더 물어봐야 하는지」로 로드맵에 보여 드려요.
                        </p>
                      </div>
                    )}
                    {/* 글자 수 — 교육정보시스템은 Byte 로 센다(한글 1자 3Byte). 세특은 과목당 500자 */}
                    {limit != null && count.letters > 0 && (
                      <p className={`text-[11px] ${count.letters > limit ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                        {count.letters}자 / {limit}자 ({count.bytes}Byte){count.letters > limit ? ' — 학생부에는 이만큼 못 들어가요' : ''}
                      </p>
                    )}
                    {/* 학생부에 못 들어갈 말이 보이면 알린다 — 저장은 막지 않는다(우리 기록에는 남겨 둘 수 있다) */}
                    {warns.map((w) => (
                      <p key={w} className="text-[11px] text-amber-700">⚠ {w}</p>
                    ))}
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

/**
 * 이 학생의 설문 링크 — 학생용·학부모용. 누르면 복사(카톡으로 직접 보내거나 열어 볼 때).
 * 문자로 한꺼번에 보내는 것은 「응답 현황」 탭(원장님).
 */
function LinkRow({ studentId, canHave, phone }: { studentId: string; canHave: boolean; phone: string | null }) {
  type Links = { student: string; parent: string; newsStudent: string; newsParent: string }
  const [links, setLinks] = useState<Links | null>(null)
  const [msg, setMsg] = useState('')
  if (!canHave) return null
  async function get(): Promise<Links | null> {
    if (links) return links
    const r = await apiFetch('/api/career/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(j.error ?? '링크를 만들지 못했어요.'); return null }
    setLinks(j); return j
  }
  const NAMES: Record<keyof Links, string> = { student: '학생 질문지', parent: '학부모 질문지', newsStudent: '학생 소식', newsParent: '학부모 소식' }
  async function copy(k: keyof Links) {
    const l = await get(); if (!l) return
    try { await navigator.clipboard.writeText(l[k]); setMsg(`${NAMES[k]} 링크를 복사했어요.`) }
    catch { setMsg(l[k]) }
  }
  async function openIt(k: keyof Links) { const l = await get(); if (l) window.open(l[k], '_blank') }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-500">학생 번호 {phone ? <b className="text-gray-700">{phone}</b> : <span className="text-amber-600">없음 (학생관리에서 입력)</span>}</span>
      <span className="text-gray-300">|</span>
      <span className="text-gray-500">질문지 링크</span>
      <button onClick={() => copy('student')} className="px-2 py-1 rounded-lg border" style={{ borderColor: LINE }}>학생용 복사</button>
      <button onClick={() => copy('parent')} className="px-2 py-1 rounded-lg border" style={{ borderColor: LINE }}>학부모용 복사</button>
      <button onClick={() => openIt('student')} className="px-2 py-1 rounded-lg border" style={{ borderColor: LINE }}>학생용 열어 보기 ↗</button>
      <span className="text-gray-300">|</span>
      <span className="text-gray-500">로드맵 소식 링크</span>
      <button onClick={() => copy('newsParent')} className="px-2 py-1 rounded-lg border" style={{ borderColor: LINE }}>학부모용 복사</button>
      <button onClick={() => copy('newsStudent')} className="px-2 py-1 rounded-lg border" style={{ borderColor: LINE }}>학생용 복사</button>
      <button onClick={() => openIt('newsParent')} className="px-2 py-1 rounded-lg border" style={{ borderColor: LINE }}>소식 열어 보기 ↗</button>
      {msg && <span style={{ color: GREEN }}>{msg}</span>}
    </div>
  )
}
