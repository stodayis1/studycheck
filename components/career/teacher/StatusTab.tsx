'use client'

// 「응답 현황」 탭 — 학부모 설문(/teacher/survey)처럼 설문별로 몇 명이 냈는지, 무엇을 골랐는지, 누가 아직인지.
//   · 대상 = 지금 그 학년이고 볼 수 있는 학생 (테스트 학생은 숫자에서 뺀다 — 맨 아래 따로 보여 준다)
//   · 설문 문자 = 원장님만. 학생·학부모마다 **자기 링크**(로그인 없이 열림)를 넣어 보낸다 (/api/career/sms)
//     원장님 2026-11-07 「스터디체크 로그인을 하려고 하질 않으시거든 … 설명회 설문조사처럼 문자로. 학생도」

import { useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { FORMS, CONSENT_VERSION, formForGrade, surveyKeyOf, questionsOf, type FormId } from '@/lib/careerSurvey'
import { isTestStudentId } from '@/lib/testStudents'
import { GREEN, MINT, LINE, BROWN, SMS_PARENT, SMS_STUDENT, Card, Badge, fmtDate, type Student, type Consent, type Survey } from './shared'

export default function StatusTab({ students, consents, surveys, isOwner, onOpenStudent }: {
  students: Student[]; consents: Consent[]; surveys: Survey[]; isOwner: boolean
  onOpenStudent: (id: string) => void
}) {
  const [form, setForm] = useState<FormId>('pre2')
  const [who, setWho] = useState<'student' | 'parent'>('student')
  const key = surveyKeyOf(form)

  const targets = students.filter((s) => formForGrade(s.grade) === form && !isTestStudentId(s.id))
  const tests = students.filter((s) => isTestStudentId(s.id))
  const sv = (sid: string, role: string) => surveys.find((x) => x.student_id === sid && x.survey_key === key && x.respondent === role)
  const ok = (sid: string, role: string) => consents.some((c) => c.student_id === sid && c.signer_role === role && !c.revoked_at && c.consent_version === CONSENT_VERSION)

  const n = {
    stuDone: targets.filter((s) => sv(s.id, 'student')).length,
    parDone: targets.filter((s) => sv(s.id, 'parent')).length,
    stuOk: targets.filter((s) => ok(s.id, 'student')).length,
    parOk: targets.filter((s) => ok(s.id, 'parent')).length,
  }

  // 집계 — 고르는 문항만. 고른 학생 수를 센다
  const answersOf = targets.map((s) => sv(s.id, who)?.answers).filter(Boolean) as Record<string, any>[]
  const tallies = questionsOf(form).filter((q) => q.options).map((q) => {
    const c = new Map<string, number>()
    for (const a of answersOf) {
      const v = a[q.id]
      for (const o of Array.isArray(v) ? v : v ? [v] : []) c.set(o, (c.get(o) ?? 0) + 1)
    }
    return { q, rows: q.options!.map((o) => [o, c.get(o) ?? 0] as [string, number]).filter(([, k]) => k > 0).sort((a, b) => b[1] - a[1]) }
  })
  const hasPhone = (s: Student) => /^01\d{8,9}$/.test(String(s.student_phone ?? '').replace(/\D/g, ''))

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['pre1', 'pre2'] as FormId[]).map((f) => (
          <button key={f} onClick={() => setForm(f)} className="px-4 py-2 rounded-xl text-sm font-bold border"
            style={form === f ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE, background: '#fff' }}>
            {FORMS[f].label} 설문 <span className="font-normal opacity-80">(현 {FORMS[f].fromGrade})</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="대상 학생" v={`${targets.length}명`} sub={`학생 번호 있음 ${targets.filter(hasPhone).length}`} />
        <Stat label="학생 응답" v={`${n.stuDone} / ${targets.length}`} sub={`동의 ${n.stuOk}`} />
        <Stat label="학부모 응답" v={`${n.parDone} / ${targets.length}`} sub={`동의 ${n.parOk}`} />
        <Stat label="아직 둘 다 안 냄" v={`${targets.filter((s) => !sv(s.id, 'student') && !sv(s.id, 'parent')).length}명`} />
      </div>

      {isOwner && <SmsBox targets={targets} tests={tests} sv={sv} hasPhone={hasPhone} />}

      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold" style={{ color: GREEN }}>무엇을 골랐나</h3>
          {(['student', 'parent'] as const).map((r) => (
            <button key={r} onClick={() => setWho(r)} className="px-3 py-1 rounded-full text-xs border"
              style={who === r ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE }}>{r === 'student' ? '학생 답' : '학부모 답'}</button>
          ))}
          <span className="text-xs text-gray-400">{answersOf.length}명 기준</span>
        </div>
        {answersOf.length === 0 ? <p className="text-sm text-gray-400 mt-3">아직 답이 없어요.</p> : (
          <div className="mt-3 grid md:grid-cols-2 gap-4">
            {tallies.map(({ q, rows }) => (
              <div key={q.id}>
                <div className="text-xs font-semibold text-gray-600 mb-1">{q.label}</div>
                {rows.length === 0 && <div className="text-xs text-gray-300">고른 사람 없음</div>}
                {rows.map(([o, k]) => (
                  <div key={o} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="w-28 shrink-0 truncate">{o}</span>
                    <span className="h-3 rounded" style={{ width: `${(k / answersOf.length) * 100}%`, maxWidth: '60%', minWidth: 4, background: '#9FE1CB' }} />
                    <span className="tabular-nums text-gray-500">{k}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-bold" style={{ color: GREEN }}>학생별 응답</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 text-left">
              <th className="py-1.5">학생</th><th>학생 번호</th><th>동의</th><th>학생 답</th><th>학부모 답</th><th>관심 계열</th><th>희망</th>
            </tr></thead>
            <tbody>
              {targets.map((s) => {
                const a = sv(s.id, 'student') ?? sv(s.id, 'parent')
                return (
                  <tr key={s.id} className="border-t cursor-pointer hover:bg-gray-50" style={{ borderColor: '#EEF2F1' }} onClick={() => onOpenStudent(s.id)}>
                    <td className="py-1.5"><b>{s.name}</b> <span className="text-xs text-gray-400">{s.school}</span></td>
                    <td className="text-xs">{hasPhone(s) ? '✓' : <span className="text-amber-600">없음</span>}</td>
                    <td className="space-x-1"><Badge on={ok(s.id, 'student')}>학생</Badge><Badge on={ok(s.id, 'parent')}>학부모</Badge></td>
                    <td className="text-xs">{sv(s.id, 'student') ? `✓ ${fmtDate(sv(s.id, 'student')!.updated_at)}` : <span className="text-gray-300">—</span>}</td>
                    <td className="text-xs">{sv(s.id, 'parent') ? `✓ ${fmtDate(sv(s.id, 'parent')!.updated_at)}` : <span className="text-gray-300">—</span>}</td>
                    <td className="text-xs">{(a?.answers.field ?? []).join(', ')}</td>
                    <td className="text-xs">{a?.answers.job1 ?? ''}</td>
                  </tr>
                )
              })}
              {targets.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-gray-400 text-xs">볼 수 있는 대상 학생이 없어요.</td></tr>}
            </tbody>
          </table>
        </div>
        {tests.length > 0 && (
          <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: '#FFF7ED', color: '#9A3412' }}>
            🧪 테스트 학생 (숫자에서 뺌):{' '}
            {tests.map((t) => (
              <button key={t.id} onClick={() => onOpenStudent(t.id)} className="underline mr-2">
                {t.name} — 학생 {sv(t.id, 'student') ? '✓' : '—'} · 학부모 {sv(t.id, 'parent') ? '✓' : '—'}
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl px-4 py-3" style={{ border: `1px solid ${LINE}` }}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color: GREEN }}>{v}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  )
}

/**
 * 설문 문자 — 설명회 설문처럼 **문자 속 주소를 누르면 바로** 열린다(로그인 없음).
 * 학생·학부모마다 자기 링크가 따로 들어간다. 받는 분 확인(미리보기) → 이대로 보내기.
 */
function SmsBox({ targets, tests, sv, hasPhone }: {
  targets: Student[]; tests: Student[]
  sv: (sid: string, role: string) => Survey | undefined
  hasPhone: (s: Student) => boolean
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [toParent, setToParent] = useState(true)
  const [toStudent, setToStudent] = useState(true)
  const [pText, setPText] = useState(SMS_PARENT)
  const [sText, setSText] = useState(SMS_STUDENT)
  const [pre, setPre] = useState<any>(null)
  const [done, setDone] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pool = useMemo(() => [...targets, ...tests], [targets, tests])
  const notYet = useMemo(() => targets.filter((s) => !sv(s.id, 'parent') || !sv(s.id, 'student')), [targets, sv])

  const reset = () => { setPre(null); setDone(null); setErr('') }
  const toggle = (id: string) => { setPicked((p) => { const nx = new Set(p); nx.has(id) ? nx.delete(id) : nx.add(id); return nx }); reset() }

  async function ask(send: boolean) {
    if (send && !confirm(`문자 ${pre?.보낼문자 ?? 0}통을 보냅니다. 보낸 문자는 되돌릴 수 없어요. 보낼까요?`)) return
    setBusy(true); setErr('')
    const r = await apiFetch('/api/career/sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: [...picked], toParent, toStudent, parentText: pText, studentText: sText, send }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? '실패했어요.'); return }
    send ? setDone(j) : setPre(j)
  }

  return (
    <Card>
      <h3 className="font-bold" style={{ color: GREEN }}>📩 설문 문자 보내기 <span className="text-xs font-normal text-gray-400">(원장님만 · 로그인 없이 문자 속 주소로 바로 설문)</span></h3>
      <p className="text-xs text-gray-500 mt-1">학생·학부모마다 <b>자기 링크</b>가 따로 들어가요. 낸 답은 이 화면에 바로 쌓여요. 문자 속 <b>{'{이름}'}</b>은 학생 이름, <b>{'{링크}'}</b>는 그 사람 링크로 바뀝니다.</p>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={toParent} onChange={(e) => { setToParent(e.target.checked); reset() }} /> 학부모에게 (보호자 번호)</label>
        <label className="flex items-center gap-1.5 ml-3"><input type="checkbox" checked={toStudent} onChange={(e) => { setToStudent(e.target.checked); reset() }} /> 학생에게 (학생 번호)</label>
      </div>

      <div className="mt-3 flex gap-2 text-xs flex-wrap">
        <button onClick={() => { setPicked(new Set(notYet.map((s) => s.id))); reset() }} className="px-2.5 py-1 rounded-lg border" style={{ borderColor: LINE }}>아직 덜 낸 {notYet.length}명 모두 고르기</button>
        <button onClick={() => { setPicked(new Set()); reset() }} className="px-2.5 py-1 rounded-lg border" style={{ borderColor: LINE }}>모두 빼기</button>
        <span className="self-center text-gray-500">{picked.size}명 고름</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {pool.map((s) => {
          const t = isTestStudentId(s.id)
          return (
            <button key={s.id} onClick={() => toggle(s.id)} className="px-2.5 py-1 rounded-full text-xs border"
              title={hasPhone(s) ? '' : '학생 번호 없음'}
              style={picked.has(s.id) ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: t ? '#FDBA74' : LINE, background: t ? '#FFF7ED' : '#fff' }}>
              {t ? '🧪 ' : ''}{s.name}{sv(s.id, 'parent') && sv(s.id, 'student') ? ' ✓' : ''}{!hasPhone(s) && toStudent ? ' ·번호없음' : ''}
            </button>
          )
        })}
      </div>

      <div className="mt-3 grid md:grid-cols-2 gap-3">
        {toParent && (
          <label className="block"><span className="text-xs font-semibold text-gray-600">학부모 문자</span>
            <textarea value={pText} onChange={(e) => { setPText(e.target.value); reset() }} rows={7} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          </label>
        )}
        {toStudent && (
          <label className="block"><span className="text-xs font-semibold text-gray-600">학생 문자</span>
            <textarea value={sText} onChange={(e) => { setSText(e.target.value); reset() }} rows={7} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
          </label>
        )}
      </div>

      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {!pre && <button disabled={busy || !picked.size} onClick={() => ask(false)} className="mt-3 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>{busy ? '확인 중…' : '받는 분 확인 (아직 안 보냄)'}</button>}
      {pre && !done && (
        <div className="mt-3 rounded-xl p-3 text-xs space-y-1.5" style={{ background: MINT }}>
          <div><b>문자 {pre.보낼문자}통</b>이 나갑니다.</div>
          {pre.번호없음?.length > 0 && <div className="text-amber-700">번호 없어 빠짐 {pre.번호없음.length}: {pre.번호없음.join(', ')} — 학생관리에서 번호를 넣으면 보낼 수 있어요.</div>}
          {pre.대상아님?.length > 0 && <div className="text-gray-500">대상 아님: {pre.대상아님.join(', ')}</div>}
          <div className="max-h-40 overflow-y-auto text-gray-600">{pre.받는분?.map((x: string) => <div key={x}>{x}</div>)}</div>
          {pre.예시 && <pre className="whitespace-pre-wrap rounded-lg bg-white p-2 text-[11px] text-gray-700">{pre.예시}</pre>}
          <button disabled={busy || !pre.보낼문자} onClick={() => ask(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: BROWN }}>{busy ? '보내는 중…' : '이대로 보내기'}</button>
        </div>
      )}
      {done && (
        <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: MINT, color: GREEN }}>
          {done.보냄}통 보냄{done.실패 ? ` · 실패 ${done.실패.length}: ${done.실패.map((f: any) => f.label).join(', ')}` : ''}
          {done.테스트모드 ? ' · ⚠ OPS 가 테스트 모드라 실제로는 안 나갔어요' : ''}
        </div>
      )}
    </Card>
  )
}
