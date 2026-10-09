'use client'

/**
 * 학교 학사일정 달력 — 선생님 메인 화면(대시보드)에 띄운다.
 *
 * 자료는 나이스에서 자동으로 들어온다(OPS 가 주 1회 받아 school_schedule_periods 로 밀어넣음).
 * 다만 학교가 나이스에 안 올리면 비어 있어서, 선생님이 직접 넣을 수 있게 해 둔다(source='manual').
 * 사람이 넣은 건은 다음 자동 갱신 때 지워지지 않는다.
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadHolidays, dateKey, type Holiday } from '@/lib/holidays'

interface Period {
  id: string
  school: string
  kind: 'exam' | 'suneung' | 'mock' | 'vacation' | string
  event_name: string
  start_date: string
  end_date: string
  grade1: boolean | null
  grade2: boolean | null
  grade3: boolean | null
  source: string
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

// 종류별 색 — 내신(빨강)·수능(보라)·모의고사(주황)·방학(파랑)
const KIND: Record<string, { color: string; bg: string; label: string }> = {
  exam:    { color: '#b91c1c', bg: '#FEF2F2', label: '내신' },
  suneung: { color: '#6d28d9', bg: '#F5F3FF', label: '수능' },
  mock:    { color: '#c2410c', bg: '#FFF7ED', label: '모의' },
  vacation:{ color: '#1d4ed8', bg: '#F0F7FF', label: '방학' },
}
const kindOf = (k: string) => KIND[k] || { color: '#6b7280', bg: '#f9fafb', label: '' }

function gradeLabel(p: Period) {
  const on = [p.grade1 && '1', p.grade2 && '2', p.grade3 && '3'].filter(Boolean)
  if (on.length === 0 || on.length === 3) return ''
  return `${on.join('·')}학년`
}

export default function SchoolScheduleCalendar() {
  const [periods, setPeriods] = useState<Period[]>([])
  const [holidays, setHolidays] = useState<Map<string, Holiday>>(new Map())
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ school: '', event_name: '', start_date: '', end_date: '', kind: 'exam' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data } = await supabase.from('school_schedule_periods').select('*').order('start_date')
    setPeriods((data || []) as Period[])
    setLoading(false)
  }
  useEffect(() => { load(); loadHolidays().then(setHolidays) }, [])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`

  // 이 달에 걸치는 기간만
  const monthPeriods = useMemo(
    () => periods.filter(p => p.start_date <= monthEnd && p.end_date >= monthStart),
    [periods, monthStart, monthEnd])

  const cells = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay()
    const days = new Date(year, month + 1, 0).getDate()
    return [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  }, [year, month])

  const todayStr = dateKey(new Date())

  // 앞으로 60일 안에 시작하는(또는 진행 중인) 시험
  const upcoming = useMemo(() => {
    const limit = new Date(); limit.setDate(limit.getDate() + 60)
    const limitStr = dateKey(limit)
    // 내신·수능·모의고사를 모두 — 고등 학생은 수능·모의고사 일정도 챙겨야 한다
    return periods
      .filter(p => ['exam', 'suneung', 'mock'].includes(p.kind) && p.end_date >= todayStr && p.start_date <= limitStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
  }, [periods, todayStr])

  async function saveManual() {
    if (!form.school.trim() || !form.start_date) { alert('학교와 시작일은 넣어주세요'); return }
    setSaving(true)
    const { error } = await supabase.from('school_schedule_periods').insert({
      school: form.school.trim(),
      kind: form.kind,
      event_name: form.event_name.trim() || (form.kind === 'exam' ? '시험' : '방학'),
      start_date: form.start_date,
      end_date: form.end_date || form.start_date,
      source: 'manual',
    })
    setSaving(false)
    if (error) { alert('저장 실패: ' + error.message); return }
    setForm({ school: '', event_name: '', start_date: '', end_date: '', kind: 'exam' })
    setAdding(false)
    load()
  }

  async function removeManual(p: Period) {
    if (p.source !== 'manual') { alert('나이스에서 받아온 일정은 여기서 지울 수 없어요. 학교 일정이 바뀌었다면 직접 입력으로 추가해주세요.'); return }
    if (!confirm(`${p.school} ${p.event_name}을(를) 지울까요?`)) return
    await supabase.from('school_schedule_periods').delete().eq('id', p.id)
    load()
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #f3f4f6' }}>
        <span className="text-sm font-bold text-gray-800">
          <i className="ti ti-school align-[-0.125em] mr-1" />학교 학사일정
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="px-2 text-gray-400">‹</button>
          <span className="text-xs font-bold text-gray-600">{year}년 {month + 1}월</span>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="px-2 text-gray-400">›</button>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW.map((d, i) => (
            <div key={d} className="text-center text-[10px] font-bold py-0.5"
              style={{ color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#9ca3af' }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`e${idx}`} />
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dow = new Date(ds + 'T00:00:00').getDay()
            const holiday = holidays.get(ds)
            const onDay = monthPeriods.filter(p => p.start_date <= ds && p.end_date >= ds)
            // 중요한 순서: 내신 → 수능 → 모의고사 → 방학
            const ranked = [...onDay].sort((a, b) => {
              const order: Record<string, number> = { exam: 0, suneung: 1, mock: 2, vacation: 3 }
              return (order[a.kind] ?? 9) - (order[b.kind] ?? 9)
            })
            const exams = ranked.filter(p => p.kind !== 'vacation')
            const vacs = ranked.filter(p => p.kind === 'vacation')
            const isToday = ds === todayStr
            return (
              <div key={ds} className="rounded-lg border p-1 min-h-[52px]"
                style={{
                  borderColor: isToday ? '#F5C4B3' : '#f3f4f6',
                  background: exams.length ? kindOf(exams[0].kind).bg : vacs.length ? '#F0F7FF' : '#fff',
                }}>
                <div className="text-[10px] font-bold leading-none mb-0.5"
                  style={{ color: holiday || dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : '#6b7280' }}>
                  {day}
                </div>
                {exams.slice(0, 2).map(p => (
                  <div key={p.id} className="text-[8px] leading-tight truncate" style={{ color: kindOf(p.kind).color }} title={`${p.school} ${p.event_name}`}>
                    {p.kind === 'suneung' ? '수능' : p.kind === 'mock' ? `${p.school} 모의` : p.school}
                  </div>
                ))}
                {exams.length > 2 && <div className="text-[8px]" style={{ color: '#6b7280' }}>+{exams.length - 2}</div>}
                {!exams.length && vacs.slice(0, 1).map(p => (
                  <div key={p.id} className="text-[8px] leading-tight truncate" style={{ color: '#1d4ed8' }} title={`${p.school} ${p.event_name}`}>
                    {p.school} 방학
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* 다가오는 시험 */}
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <p className="text-[11px] font-bold text-gray-400">다가오는 시험 (60일 이내)</p>
            <div className="flex items-center gap-1.5 ml-auto">
              {['exam', 'suneung', 'mock', 'vacation'].map(k => (
                <span key={k} className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: kindOf(k).bg, color: kindOf(k).color }}>{kindOf(k).label}</span>
              ))}
            </div>
          </div>
          {loading ? (
            <p className="text-xs text-gray-300">불러오는 중...</p>
          ) : upcoming.length === 0 ? (
            <p className="text-xs text-gray-400">예정된 시험이 없어요</p>
          ) : (
            <div className="space-y-1">
              {upcoming.map(p => {
                const dday = Math.ceil((new Date(p.start_date + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000)
                return (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: kindOf(p.kind).bg, color: kindOf(p.kind).color }}>{kindOf(p.kind).label}</span>
                    <span className="font-bold text-gray-700 shrink-0">{p.school}</span>
                    <span className="text-gray-500 truncate">{p.event_name}{gradeLabel(p) && ` (${gradeLabel(p)})`}</span>
                    <span className="text-gray-400 ml-auto shrink-0">
                      {p.start_date.slice(5).replace('-', '/')}~{p.end_date.slice(5).replace('-', '/')}
                    </span>
                    <span className="font-bold shrink-0" style={{ color: dday <= 14 ? '#dc2626' : '#9ca3af' }}>
                      {dday > 0 ? `D-${dday}` : '진행중'}
                    </span>
                    {p.source === 'manual' && (
                      <button onClick={() => removeManual(p)} className="text-[10px] text-gray-300 shrink-0">지움</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 안내 문구 — 자동으로 들어오지만 비어 있는 학교는 손으로 넣어야 한다 */}
        <div className="mt-3 rounded-xl px-3 py-2" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <p className="text-[11px] leading-relaxed" style={{ color: '#92400e' }}>
            학교 학사일정은 나이스에서 <b>자동으로 반영</b>돼요(매주 월요일 갱신).
            다만 <b>나이스에 미등록된 학교는 비어 있을 수 있어요.</b> 그런 학교는 아래에서 직접 입력해주세요.
          </p>
          {adding ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1.5">
                <input value={form.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))}
                  placeholder="학교 (예: 신원고)" className="flex-1 rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid #FDE68A' }} />
                <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}
                  className="rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid #FDE68A' }}>
                  <option value="exam">시험</option>
                  <option value="vacation">방학</option>
                </select>
              </div>
              <input value={form.event_name} onChange={e => setForm(f => ({ ...f, event_name: e.target.value }))}
                placeholder="이름 (예: 2학기 기말고사)" className="w-full rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid #FDE68A' }} />
              <div className="flex gap-1.5 items-center">
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid #FDE68A' }} />
                <span className="text-[11px]" style={{ color: '#92400e' }}>~</span>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="flex-1 rounded-lg px-2 py-1.5 text-xs" style={{ border: '1px solid #FDE68A' }} />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setAdding(false)} className="flex-1 rounded-lg py-1.5 text-xs font-bold" style={{ background: 'white', color: '#92400e', border: '1px solid #FDE68A' }}>취소</button>
                <button onClick={saveManual} disabled={saving} className="flex-[2] rounded-lg py-1.5 text-xs font-bold text-white" style={{ background: '#D97706' }}>
                  {saving ? '저장중...' : '저장'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="mt-1.5 text-[11px] font-bold px-2 py-1 rounded-lg"
              style={{ background: 'white', color: '#92400e', border: '1px solid #FDE68A' }}>
              + 학사일정 직접 입력
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
