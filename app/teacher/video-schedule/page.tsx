'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'

interface Concept {
  id: string
  grade: string
  semester: number
  chapter: string
  sub_chapter: string
  concept_order: number
  concept_name: string
}

interface ScheduleEntry {
  date: Date
  concept: Concept
}

const START_DATE_DEFAULT = '2026-09-07'
const DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isSameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function VideoSchedulePage() {
  const { currentUser, canManageAllStudents } = useAuth()
  const router = useRouter()

  const [concepts, setConcepts] = useState<Concept[]>([])
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const [startDate, setStartDate] = useState(START_DATE_DEFAULT)
  const [mode, setMode] = useState<'weekday' | 'daily'>('weekday')
  const [perDay, setPerDay] = useState(2)
  const [search, setSearch] = useState('')

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  useEffect(() => {
    if (currentUser && !canManageAllStudents()) {
      router.push('/teacher/dashboard')
      return
    }
    if (currentUser) fetchData()
  }, [currentUser])

  async function fetchData() {
    setLoading(true)
    const [{ data: cData }, { data: pData }] = await Promise.all([
      supabase.from('concepts').select('*').in('grade', ['중1', '중2', '중3']).order('grade').order('semester').order('concept_order'),
      supabase.from('concept_video_progress').select('concept_id'),
    ])
    if (cData) {
      // grade 오름차순은 문자열 정렬이라 중1,중2,중3 순서가 맞지 않을 수 있어 명시적으로 재정렬
      const gradeOrder: Record<string, number> = { '중1': 1, '중2': 2, '중3': 3 }
      const sorted = [...cData].sort((a, b) => {
        if (gradeOrder[a.grade] !== gradeOrder[b.grade]) return gradeOrder[a.grade] - gradeOrder[b.grade]
        if (a.semester !== b.semester) return a.semester - b.semester
        return a.concept_order - b.concept_order
      })
      setConcepts(sorted)
    }
    if (pData) setDoneIds(new Set(pData.map((r: any) => r.concept_id)))
    setLoading(false)
  }

  async function toggleDone(conceptId: string) {
    setSavingId(conceptId)
    const isDone = doneIds.has(conceptId)
    if (isDone) {
      await supabase.from('concept_video_progress').delete().eq('concept_id', conceptId)
      setDoneIds(prev => { const next = new Set(prev); next.delete(conceptId); return next })
    } else {
      await supabase.from('concept_video_progress').insert({ concept_id: conceptId, filmed_by: currentUser?.id ?? null })
      setDoneIds(prev => new Set(prev).add(conceptId))
    }
    setSavingId(null)
  }

  const schedule = useMemo<ScheduleEntry[]>(() => {
    if (concepts.length === 0) return []
    const [y, m, d] = startDate.split('-').map(Number)
    let date = new Date(y, m - 1, d)
    const sched: ScheduleEntry[] = []
    let i = 0
    while (i < concepts.length) {
      const dow = date.getDay()
      const isWeekend = dow === 0 || dow === 6
      if (mode === 'daily' || !isWeekend) {
        for (let k = 0; k < perDay && i < concepts.length; k++) {
          sched.push({ date: new Date(date), concept: concepts[i] })
          i++
        }
      }
      date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
    }
    return sched
  }, [concepts, startDate, mode, perDay])

  const scheduleByDate = useMemo(() => {
    const map: Record<string, ScheduleEntry[]> = {}
    schedule.forEach(s => {
      const k = fmtDate(s.date)
      if (!map[k]) map[k] = []
      map[k].push(s)
    })
    return map
  }, [schedule])

  const total = concepts.length
  const doneCount = doneIds.size
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const nextUndone = schedule.find(s => !doneIds.has(s.concept.id))

  if (loading || !currentUser) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const startDow = firstOfMonth.getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const filteredList = schedule.filter(s => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (s.concept.concept_name + ' ' + s.concept.chapter + ' ' + s.concept.sub_chapter).toLowerCase().includes(q)
  })

  return (
    <div>
      <Header title="중등 개념강의 촬영 스케줄러" subtitle={`${doneCount} / ${total}개 완료`} showBack />
      <div className="px-4 py-4 space-y-4 md:px-6 max-w-3xl mx-auto">

        {/* 요약 카드 */}
        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-4 flex items-center gap-4 flex-wrap">
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 84 84" className="w-20 h-20 -rotate-90">
              <circle cx="42" cy="42" r="36" fill="none" stroke="#f1ece4" strokeWidth="9" />
              <circle cx="42" cy="42" r="36" fill="none" stroke="#F5A97F" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 36 * pct / 100} ${2 * Math.PI * 36}`} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-base font-extrabold text-orange-800">{pct}%</div>
          </div>
          <div className="flex-1 min-w-[140px]">
            <div className="text-sm font-extrabold text-gray-800">{doneCount} / {total}개 촬영완료</div>
            <div className="text-xs text-gray-400 mt-0.5">
              남은 개념 {total - doneCount}개
              {schedule.length > 0 && ` · ${fmtDate(schedule[0].date)} ~ ${fmtDate(schedule[schedule.length - 1].date)}`}
            </div>
          </div>
          {nextUndone ? (
            <div className="bg-white border border-orange-100 rounded-xl px-3 py-2 text-xs text-gray-600">
              다음 촬영일 <b className="text-orange-500">{fmtDate(nextUndone.date)}</b>
              <br />{nextUndone.concept.grade} {nextUndone.concept.semester}학기 #{nextUndone.concept.concept_order} {nextUndone.concept.concept_name}
            </div>
          ) : (
            <div className="bg-white border border-orange-100 rounded-xl px-3 py-2 text-xs text-gray-600">🎉 전체 촬영 완료!</div>
          )}
        </div>

        {/* 컨트롤 */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setMode('weekday')} className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border',
            mode === 'weekday' ? 'bg-orange-200 border-orange-200 text-orange-900' : 'bg-white border-gray-200 text-gray-600')}>평일만</button>
          <button onClick={() => setMode('daily')} className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border',
            mode === 'daily' ? 'bg-orange-200 border-orange-200 text-orange-900' : 'bg-white border-gray-200 text-gray-600')}>매일</button>
          <span className="w-px h-5 bg-gray-200" />
          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => setPerDay(n)} className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border',
              perDay === n ? 'bg-orange-200 border-orange-200 text-orange-900' : 'bg-white border-gray-200 text-gray-600')}>하루 {n}개</button>
          ))}
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs border border-gray-200" />
          <button onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white border-gray-200 text-gray-600">오늘로 이동</button>
        </div>

        {/* 캘린더 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-extrabold text-gray-800">{viewYear}년 {viewMonth + 1}월</div>
            <div className="flex gap-1.5">
              <button onClick={() => { let m = viewMonth - 1, y = viewYear; if (m < 0) { m = 11; y--; } setViewMonth(m); setViewYear(y) }}
                className="px-2.5 py-1 rounded-lg text-xs border bg-white border-gray-200 text-gray-600">◀ 이전달</button>
              <button onClick={() => { let m = viewMonth + 1, y = viewYear; if (m > 11) { m = 0; y++; } setViewMonth(m); setViewYear(y) }}
                className="px-2.5 py-1 rounded-lg text-xs border bg-white border-gray-200 text-gray-600">다음달 ▶</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {DOW_NAMES.map(dow => (
              <div key={dow} className="text-center text-[10px] font-bold text-gray-300 py-1">{dow}</div>
            ))}
            {Array.from({ length: startDow }).map((_, i) => <div key={'e' + i} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const cellDate = new Date(viewYear, viewMonth, day)
              const entries = scheduleByDate[fmtDate(cellDate)]
              const dow = cellDate.getDay()
              const isWeekend = dow === 0 || dow === 6
              const isToday = isSameDate(cellDate, today)
              const allDone = entries && entries.every(e => doneIds.has(e.concept.id))
              return (
                <div key={day} className={cx('rounded-lg border p-1 text-[10px] min-h-[86px]',
                  allDone ? 'bg-green-50 border-green-200' : entries ? 'bg-white border-gray-100' : isWeekend ? 'bg-gray-50 border-transparent opacity-50' : 'border-transparent')}>
                  <div className={cx('text-[10px] font-bold mb-0.5', isToday ? 'text-orange-500' : 'text-gray-300')}>{day}</div>
                  {entries?.map(e => {
                    const isDone = doneIds.has(e.concept.id)
                    return (
                      <button key={e.concept.id} onClick={() => toggleDone(e.concept.id)} disabled={savingId === e.concept.id}
                        className={cx('block w-full text-left rounded px-1 py-0.5 mb-0.5', isDone ? 'opacity-60' : 'hover:bg-orange-50')}>
                        <div className="text-[8.5px] font-bold text-orange-300 leading-tight">
                          {e.concept.grade} {e.concept.semester}학기 #{e.concept.concept_order}{isDone ? ' ✅' : ''}
                        </div>
                        <div className={cx('text-[9px] leading-tight line-clamp-2', isDone ? 'line-through text-green-600' : 'text-gray-600')}>
                          {e.concept.concept_name}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* 목록 */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="text-sm font-extrabold text-gray-800">전체 목록 ({total}개)</div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="개념명, 단원명 검색..."
              className="flex-1 max-w-[220px] px-3 py-1.5 rounded-lg text-xs border border-gray-200" />
          </div>
          <div className="border border-gray-100 rounded-xl max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-300">
                  <th className="w-6" />
                  <th className="text-left py-1.5 px-2">촬영일</th>
                  <th className="text-left py-1.5 px-2">학년</th>
                  <th className="text-left py-1.5 px-2">단원</th>
                  <th className="text-left py-1.5 px-2">개념명</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-300 py-6">검색 결과가 없어요</td></tr>
                )}
                {filteredList.map(s => {
                  const isDone = doneIds.has(s.concept.id)
                  return (
                    <tr key={s.concept.id} className="border-t border-gray-50">
                      <td className="px-2 py-1.5 cursor-pointer" onClick={() => toggleDone(s.concept.id)}>{isDone ? '✅' : '⬜'}</td>
                      <td className={cx('px-2 py-1.5', isDone && 'text-gray-300')}>{fmtDate(s.date)}</td>
                      <td className="px-2 py-1.5">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500">{s.concept.grade} {s.concept.semester}학기</span>
                      </td>
                      <td className={cx('px-2 py-1.5', isDone && 'text-gray-300 line-through')}>{s.concept.chapter.trim()} &gt; {s.concept.sub_chapter.trim()}</td>
                      <td className={cx('px-2 py-1.5', isDone && 'text-gray-300 line-through')}>#{s.concept.concept_order} {s.concept.concept_name}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
