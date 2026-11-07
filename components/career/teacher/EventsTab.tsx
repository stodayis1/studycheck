'use client'

// 「④ 행사 소식」 탭 — 학생부 로드맵 소식 (계열별 박람회·설명회·컨퍼런스·캠프)
//
// 원장님 2026-11-07 「모든 사이트, 대학교 사이트, 진로진학 사이트 등을 뒤져서 각 계열로 도움이 될 만한
//   박람회, 컨퍼런스, 설명회 등의 정보를 지속적으로 업로드 … 이주일에 한 번 해당 학부모·학생에게 공유」
//   정한 것: 확인 후 발송 · 2주에 한 번 · 문자 + 개인 페이지(/r/<token>) · 질문지 낸 학생·학부모
//
// 흐름: Claude 가 2주마다 찾아 「검토대기」로 올린다 (.claude/skills/roadmap-events)
//      → 원장님이 여기서 읽고 「승인」/「제외」 (고칠 것은 고치기)
//      → 「소식 보내기」: 집마다 그 학생 계열에 맞는 행사 수와 개인 링크가 들어간 문자
// ★ 승인·보내기는 원장님만. 다른 선생님은 보고, 직접 찾은 행사를 「검토대기」로 올릴 수 있다.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/apiFetch'
import { fetchAllRows } from '@/lib/utils'
import { EVENT_KINDS, EVENT_FIELDS, COMMON, fmtWhen, isUpcoming, todaySeoul, type CareerEvent } from '@/lib/careerEvents'
import { GREEN, MINT, LINE, BROWN, Card } from './shared'

type Send = { id: string; created_at: string; recipients: number; sent: number; failed: number; ops_test: boolean; sent_by: string | null; event_ids: string[] }
const GRADES = ['중3', '고1', '고2', '고3']

const SMS_P = '[수학의지혜] 학생부 로드맵 소식\n'
  + '{이름} 학생 어머님·아버님, 안녕하세요.\n'
  + '관심 계열에 맞는 박람회·설명회 등 {건수}건을 골라 두었습니다. 날짜와 신청 방법은 아래에서 보실 수 있어요(로그인 없이).\n'
  + '{링크}'
const SMS_S = '[수학의지혜] 학생부 로드맵 소식\n'
  + '{이름} 학생, 관심 계열에 맞는 행사 {건수}건을 골라 두었어요. 학생부에 남길 활동으로 이어 가 봐요!\n'
  + '{링크}'

const empty = (): Partial<CareerEvent> => ({
  title: '', host: '', kind: '설명회', fields: [], grades: [], starts_on: '', ends_on: '', time_text: '', place: '',
  online: false, url: '', apply_url: '', apply_deadline: '', fee: '', summary: '', source_note: '',
})

export default function EventsTab({ isOwner, myName }: { isOwner: boolean; myName: string }) {
  const [events, setEvents] = useState<CareerEvent[]>([])
  const [sends, setSends] = useState<Send[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'검토대기' | '승인' | '제외' | '지난'>('검토대기')
  const [edit, setEdit] = useState<Partial<CareerEvent> | null>(null)
  const [err, setErr] = useState('')

  async function load() {
    const [ev, sd] = await Promise.all([
      fetchAllRows<CareerEvent>(() => supabase.from('career_events').select('*').order('starts_on', { ascending: true }).order('id')),
      supabase.from('career_news_sends').select('*').order('created_at', { ascending: false }).limit(5),
    ])
    setEvents(ev); setSends((sd.data ?? []) as Send[]); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const today = todaySeoul()
  const lists = useMemo(() => ({
    검토대기: events.filter((e) => e.status === '검토대기' && isUpcoming(e, today)),
    승인: events.filter((e) => e.status === '승인' && isUpcoming(e, today)),
    제외: events.filter((e) => e.status === '제외'),
    지난: events.filter((e) => e.status !== '제외' && !isUpcoming(e, today)),
  }), [events, today])

  async function setStatus(e: CareerEvent, status: '승인' | '제외' | '검토대기') {
    const patch: any = { status, updated_at: new Date().toISOString() }
    if (status === '승인') { patch.approved_by = myName; patch.approved_at = new Date().toISOString() }
    const { error } = await supabase.from('career_events').update(patch).eq('id', e.id)
    if (error) { alert('바꾸지 못했어요: ' + error.message); return }
    setEvents((p) => p.map((x) => (x.id === e.id ? { ...x, ...patch } : x)))
  }

  async function save() {
    if (!edit) return
    if (!edit.title?.trim() || !edit.url?.trim()) { setErr('행사 이름과 공식 안내 주소는 꼭 적어 주세요.'); return }
    if (!edit.fields?.length) { setErr('계열을 하나 이상 골라 주세요 (모든 계열이면 「공통」).'); return }
    const row: any = {
      title: edit.title.trim(), host: edit.host?.trim() || null, kind: edit.kind || '기타',
      fields: edit.fields, grades: edit.grades ?? [], starts_on: edit.starts_on || null, ends_on: edit.ends_on || null,
      time_text: edit.time_text?.trim() || null, place: edit.place?.trim() || null, online: !!edit.online,
      url: edit.url.trim(), apply_url: edit.apply_url?.trim() || null, apply_deadline: edit.apply_deadline || null,
      fee: edit.fee?.trim() || null, summary: edit.summary?.trim() || null, source_note: edit.source_note?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const res = edit.id
      ? await supabase.from('career_events').update(row).eq('id', edit.id).select().single()
      : await supabase.from('career_events').insert({ ...row, status: '검토대기', found_by: myName }).select().single()
    if (res.error) { setErr('저장하지 못했어요: ' + res.error.message); return }
    const saved = res.data as CareerEvent
    setEvents((p) => [...p.filter((x) => x.id !== saved.id), saved].sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on))))
    setEdit(null); setErr('')
  }

  if (loading) return <div className="p-10 text-center text-sm text-gray-400">불러오는 중…</div>
  const shown = lists[view]

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-bold" style={{ color: GREEN }}>학생부 로드맵 소식 — 이렇게 돌아갑니다</h2>
        <ol className="mt-2 text-sm space-y-1 text-gray-700 list-decimal pl-5">
          <li><b>Claude 가 2주마다</b> 대학 입학처·진로진학 사이트·박람회 일정을 뒤져 계열별 행사를 <b>「검토대기」</b>로 올립니다. 공식 안내 주소와 확인한 내용(검토 메모)이 함께 붙어요.</li>
          <li><b>원장님이 읽고 「승인」</b>하세요. 틀린 곳은 「고치기」, 안 보낼 것은 「제외」.</li>
          <li><b>「소식 보내기」</b> — 질문지를 낸 집마다 그 학생 <b>계열에 맞는 행사 수</b>와 <b>개인 링크</b>(로그인 없이)가 들어간 문자가 나가요.</li>
        </ol>
        <p className="mt-2 text-xs text-gray-500">
          마지막으로 보낸 날: {sends[0] ? `${new Date(sends[0].created_at).toLocaleDateString('ko-KR')} (${sends[0].sent}통${sends[0].ops_test ? ', OPS 테스트 모드' : ''})` : '아직 없음'}
        </p>
      </Card>

      <div className="flex flex-wrap gap-2 items-center">
        {(['검토대기', '승인', '제외', '지난'] as const).map((k) => (
          <button key={k} onClick={() => setView(k)} className="px-3 py-1.5 rounded-full text-sm border"
            style={view === k ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE, background: '#fff' }}>
            {k === '승인' ? '승인 · 진행 예정' : k === '지난' ? '지난 행사' : k} {lists[k].length}
          </button>
        ))}
        <button onClick={() => { setEdit(empty()); setErr('') }} className="ml-auto px-3 py-1.5 rounded-xl text-sm text-white" style={{ background: GREEN }}>+ 행사 직접 올리기</button>
      </div>

      {edit && <EditBox ev={edit} set={setEdit} onSave={save} onCancel={() => setEdit(null)} err={err} />}

      {shown.length === 0 && <Card className="text-center text-sm text-gray-400">{view === '검토대기' ? '검토할 행사가 없어요.' : '없어요.'}</Card>}
      {shown.map((e) => (
        <Card key={e.id}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="px-2 py-0.5 rounded-full" style={{ background: MINT, color: GREEN }}>{e.kind}</span>
                {e.fields.map((f) => <span key={f} className="px-2 py-0.5 rounded-full border" style={{ borderColor: LINE }}>{f === COMMON ? '모든 계열' : f}</span>)}
                {e.grades.length > 0 && <span className="text-gray-500">대상 {e.grades.join('·')}</span>}
              </div>
              <h3 className="mt-1.5 font-bold text-gray-900">{e.title}</h3>
              <p className="text-sm text-gray-600">{[e.host, fmtWhen(e), e.online ? `온라인${e.place ? ' · ' + e.place : ''}` : e.place, e.fee].filter(Boolean).join(' · ')}</p>
              {e.apply_deadline && <p className="text-sm" style={{ color: BROWN }}>신청 마감 {fmtWhen({ starts_on: e.apply_deadline, ends_on: null, time_text: null })}</p>}
              {e.summary && <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{e.summary}</p>}
              {e.source_note && <p className="mt-2 text-xs rounded-lg px-2.5 py-1.5" style={{ background: '#FFF7ED', color: '#9A3412' }}>검토 메모 · {e.source_note}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: GREEN }}>공식 안내 열기 ↗</a>
                {e.apply_url && <a href={e.apply_url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: GREEN }}>신청 페이지 ↗</a>}
                <span className="text-gray-400">올린 사람 {e.found_by ?? '-'}{e.approved_by ? ` · 승인 ${e.approved_by}` : ''}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {isOwner && e.status !== '승인' && <button onClick={() => setStatus(e, '승인')} className="px-3 py-1.5 rounded-lg text-sm text-white" style={{ background: GREEN }}>승인</button>}
              {isOwner && e.status !== '제외' && <button onClick={() => setStatus(e, '제외')} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: LINE }}>제외</button>}
              {isOwner && e.status !== '검토대기' && <button onClick={() => setStatus(e, '검토대기')} className="px-3 py-1.5 rounded-lg text-xs text-gray-500">검토로 되돌리기</button>}
              <button onClick={() => { setEdit(e); setErr('') }} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: LINE }}>고치기</button>
            </div>
          </div>
        </Card>
      ))}

      {isOwner && <NewsSms approved={lists.승인.length} onSent={load} />}
    </div>
  )
}

function EditBox({ ev, set, onSave, onCancel, err }: {
  ev: Partial<CareerEvent>; set: (v: Partial<CareerEvent>) => void; onSave: () => void; onCancel: () => void; err: string
}) {
  const inp = (k: keyof CareerEvent, ph: string, type = 'text') => (
    <input type={type} value={String(ev[k] ?? '')} placeholder={ph} onChange={(e) => set({ ...ev, [k]: e.target.value })}
      className="w-full rounded-lg border px-2.5 py-1.5 text-sm" style={{ borderColor: LINE }} />
  )
  const toggle = (k: 'fields' | 'grades', v: string) => {
    const arr = (ev[k] ?? []) as string[]
    set({ ...ev, [k]: arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] })
  }
  return (
    <Card className="space-y-2" >
      <div className="font-bold text-sm" style={{ color: GREEN }}>{ev.id ? '행사 고치기' : '행사 올리기 (검토대기로 올라가요)'}</div>
      {inp('title', '행사 이름 *')}
      <div className="grid sm:grid-cols-2 gap-2">{inp('host', '주최 (○○대학교 입학처)')}{inp('url', '공식 안내 주소 * (https://…)')}</div>
      <div className="flex flex-wrap gap-1.5">
        {EVENT_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => set({ ...ev, kind: k })} className="px-2.5 py-1 rounded-full text-xs border"
            style={ev.kind === k ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE }}>{k}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center"><span className="text-xs text-gray-500">계열 *</span>
        {EVENT_FIELDS.map((f) => (
          <button key={f} type="button" onClick={() => toggle('fields', f)} className="px-2.5 py-1 rounded-full text-xs border"
            style={(ev.fields ?? []).includes(f) ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE }}>{f === COMMON ? '공통(모든 계열)' : f}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center"><span className="text-xs text-gray-500">대상 학년 (안 고르면 무관)</span>
        {GRADES.map((g) => (
          <button key={g} type="button" onClick={() => toggle('grades', g)} className="px-2.5 py-1 rounded-full text-xs border"
            style={(ev.grades ?? []).includes(g) ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE }}>{g}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="text-xs text-gray-500">시작일{inp('starts_on', '', 'date')}</label>
        <label className="text-xs text-gray-500">끝나는 날{inp('ends_on', '', 'date')}</label>
        <label className="text-xs text-gray-500">신청 마감{inp('apply_deadline', '', 'date')}</label>
        <label className="text-xs text-gray-500">시간{inp('time_text', '오후 2시~5시')}</label>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">{inp('place', '장소')}{inp('apply_url', '신청 페이지 주소')}{inp('fee', '참가비 (무료)')}</div>
      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!ev.online} onChange={(e) => set({ ...ev, online: e.target.checked })} /> 온라인 행사</label>
      <textarea value={ev.summary ?? ''} onChange={(e) => set({ ...ev, summary: e.target.value })} rows={3} placeholder="학부모님께 보여 줄 두세 줄 소개"
        className="w-full rounded-lg border px-2.5 py-1.5 text-sm" style={{ borderColor: LINE }} />
      <textarea value={ev.source_note ?? ''} onChange={(e) => set({ ...ev, source_note: e.target.value })} rows={2} placeholder="검토 메모 — 어디서 찾았고 무엇을 확인했는지 (학부모님께는 안 보임)"
        className="w-full rounded-lg border px-2.5 py-1.5 text-sm" style={{ borderColor: LINE }} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: LINE }}>취소</button>
        <button onClick={onSave} className="px-4 py-1.5 rounded-lg text-sm text-white" style={{ background: GREEN }}>저장</button>
      </div>
    </Card>
  )
}

function NewsSms({ approved, onSent }: { approved: number; onSent: () => void }) {
  const [toParent, setToParent] = useState(true)
  const [toStudent, setToStudent] = useState(true)
  const [testOnly, setTestOnly] = useState(true)
  const [pText, setPText] = useState(SMS_P)
  const [sText, setSText] = useState(SMS_S)
  const [pre, setPre] = useState<any>(null)
  const [done, setDone] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const reset = () => { setPre(null); setDone(null); setErr('') }

  async function ask(send: boolean) {
    if (send && !confirm(`문자 ${pre?.보낼문자 ?? 0}통을 보냅니다${testOnly ? ' (테스트 학생에게만)' : ''}. 되돌릴 수 없어요. 보낼까요?`)) return
    setBusy(true); setErr('')
    const r = await apiFetch('/api/career/news-sms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toParent, toStudent, parentText: pText, studentText: sText, testOnly, send }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? '실패했어요.'); return }
    if (send) { setDone(j); onSent() } else setPre(j)
  }

  return (
    <Card>
      <h3 className="font-bold" style={{ color: GREEN }}>📩 소식 보내기 <span className="text-xs font-normal text-gray-400">(원장님만 · 승인 · 진행 예정 {approved}건)</span></h3>
      <p className="text-xs text-gray-500 mt-1">질문지를 낸 집마다 그 학생 계열에 맞는 행사만 골라 개인 링크로 보내요. <b>{'{건수}'}</b>는 맞는 행사 수, <b>{'{링크}'}</b>는 그 사람 링크로 바뀌어요.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={toParent} onChange={(e) => { setToParent(e.target.checked); reset() }} /> 학부모에게</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={toStudent} onChange={(e) => { setToStudent(e.target.checked); reset() }} /> 학생에게</label>
        <label className="flex items-center gap-1.5 font-semibold" style={{ color: '#9A3412' }}><input type="checkbox" checked={testOnly} onChange={(e) => { setTestOnly(e.target.checked); reset() }} /> 🧪 먼저 테스트 학생(윤수지·테스트)에게만</label>
      </div>
      <div className="mt-3 grid md:grid-cols-2 gap-3">
        {toParent && <textarea value={pText} onChange={(e) => { setPText(e.target.value); reset() }} rows={6} className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: LINE }} />}
        {toStudent && <textarea value={sText} onChange={(e) => { setSText(e.target.value); reset() }} rows={6} className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: LINE }} />}
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {!pre && <button disabled={busy} onClick={() => ask(false)} className="mt-3 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>{busy ? '확인 중…' : '받는 분 확인 (아직 안 보냄)'}</button>}
      {pre && !done && (
        <div className="mt-3 rounded-xl p-3 text-xs space-y-1.5" style={{ background: MINT }}>
          <div><b>문자 {pre.보낼문자}통</b> · 승인 행사 {pre.행사}건 기준</div>
          {pre.맞는행사없음?.length > 0 && <div className="text-gray-500">맞는 행사 없어 빠짐: {pre.맞는행사없음.join(', ')}</div>}
          {pre.번호없음?.length > 0 && <div className="text-amber-700">번호 없어 빠짐: {pre.번호없음.join(', ')}</div>}
          <div className="max-h-40 overflow-y-auto text-gray-600">{pre.받는분?.map((x: string) => <div key={x}>{x}</div>)}</div>
          {pre.예시 && <pre className="whitespace-pre-wrap rounded-lg bg-white p-2 text-[11px] text-gray-700">{pre.예시}</pre>}
          <button disabled={busy || !pre.보낼문자} onClick={() => ask(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: BROWN }}>{busy ? '보내는 중…' : '이대로 보내기'}</button>
        </div>
      )}
      {done && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: MINT, color: GREEN }}>{done.보냄}통 보냄{done.실패 ? ` · 실패 ${done.실패.length}` : ''}{done.테스트모드 ? ' · ⚠ OPS 테스트 모드라 실제로는 안 나갔어요' : ''}</div>}
    </Card>
  )
}
