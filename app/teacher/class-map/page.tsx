'use client'

/**
 * 반배정 시간표 — 원장님 전용.
 *
 * 왜 만들었나 (원장님 2026-10-28)
 *   「신규상담이 오면 전체 어느 강의실에 몇시에 어떤 학생이 있는지가 보여야 반배정을 하기 때문에」
 *   지금까지는 선생님별 엑셀 표를 손으로 만들어 쓰셨는데, 중간에 시간을 바꾸면 반영이 안 됐다.
 *   이 화면은 스터디체크 **시간표(schedules)를 그대로** 그리므로 바꾸는 즉시 맞는다.
 *
 * 보는 법 — 엑셀 표와 같은 꼴이다.
 *   선생님 한 분이 한 묶음, 세로가 시간, 가로가 요일, 칸 안이 그 시간에 그 반에 있는 학생이다.
 *   2교시 수업이면 두 줄에 걸쳐 같은 이름이 나온다(엑셀에서 이름을 두 칸에 적던 것과 같다).
 *
 * ★ 원장 전용인 까닭
 *   전체 시간표는 **학원 전체 인원**과 다른 강사 학생 이름이 그대로 드러난다. 학교 자료집에서
 *   인원수를 감춘 것과 같은 이유로(원장님 2026-10-28) 강사·직원에게는 메뉴도 화면도 열지 않는다.
 */

import { useState, useEffect, useMemo } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx, fetchAllRows } from '@/lib/utils'
import { mainTeacher } from '@/lib/teacherColors'

interface Student {
  id: string
  name: string
  grade: string | null
  school: string | null
  teacher_name: string | null
  on_leave: boolean | null
}
interface Schedule {
  id: string
  student_id: string
  day_of_week: string
  start_time: string
  periods: number
}

/** 요일은 늘 이 순서로 그린다. 학원에 그 요일 수업이 하나도 없으면 칸을 아예 안 만든다. */
const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일']

const DIVISIONS = ['초등부', '중등부', '고등부'] as const
type Division = (typeof DIVISIONS)[number] | '그 외'

function divisionOf(grade?: string | null): Division {
  const g = String(grade ?? '')
  if (g.startsWith('초')) return '초등부'
  if (g.startsWith('중')) return '중등부'
  if (g.startsWith('고')) return '고등부'
  return '그 외'
}

/** 학년 색 — 초록(초) · 파랑(중) · 주황(고). 한 화면에 여러 부가 섞여도 바로 갈린다. */
const DIV_COLOR: Record<Division, { bg: string; border: string; text: string }> = {
  초등부: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  중등부: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
  고등부: { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412' },
  '그 외': { bg: '#F3F4F6', border: '#E5E7EB', text: '#4B5563' },
}

/** '17:30:00' → 17.5 */
function toHours(t: string) {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}
/** 14 → '14시', 14.5 → '14:30' */
function hourLabel(h: number) {
  return Number.isInteger(h) ? `${h}시` : `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
}
function timeLabel(t: string) {
  return String(t).slice(0, 5)
}

type Slot = {
  student: Student
  teacher: string
  day: string
  start: number
  end: number
  startLabel: string
}

export default function ClassMapPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [division, setDivision] = useState<Division>('중등부')
  const [q, setQ] = useState('')
  /** 상담 중에 「목요일 5시」를 짚으면 그 칸만 또렷하게 보이게 한다. */
  const [pickDay, setPickDay] = useState<string>('')
  const [pickHour, setPickHour] = useState<number | null>(null)
  /** 휴원 학생은 자리를 비운 것뿐이라 기본으로 같이 본다(돌아오면 그 자리로 온다). */
  const [showLeave, setShowLeave] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, scData] = await Promise.all([
      supabase.from('students').select('id, name, grade, school, teacher_name, on_leave')
        .eq('is_active', true).order('name'),
      // 시간표는 600줄이 넘어 PostgREST 기본 상한(1000행)에 곧 닿는다 — 끝까지 돈다.
      fetchAllRows<Schedule>(() => supabase.from('schedules')
        .select('id, student_id, day_of_week, start_time, periods').eq('is_active', true).order('id')),
    ])
    if (sData) setStudents(sData as Student[])
    if (scData) setSchedules(scData.map((s: any) => ({ ...s, periods: Number(s.periods) })))
    setLoading(false)
  }

  /** 시간표 한 줄 = 학생 한 명이 그 요일 그 시각에 앉아 있는 것. */
  const slots = useMemo<Slot[]>(() => {
    const byId = new Map(students.map((s) => [s.id, s]))
    const out: Slot[] = []
    for (const sc of schedules) {
      const st = byId.get(sc.student_id)
      if (!st) continue
      const start = toHours(sc.start_time)
      const periods = Number(sc.periods) || 1
      out.push({
        student: st,
        teacher: mainTeacher(st.teacher_name) || '담당 없음',
        day: sc.day_of_week,
        start,
        end: start + periods,
        startLabel: timeLabel(sc.start_time),
      })
    }
    return out
  }, [students, schedules])

  const divSlots = useMemo(
    () => slots.filter((s) => divisionOf(s.student.grade) === division && (showLeave || !s.student.on_leave)),
    [slots, division, showLeave],
  )

  /** 그 부가 실제로 쓰는 요일·시간만 그린다. 아무도 없는 줄은 만들지 않는다. */
  const days = useMemo(
    () => DAY_ORDER.filter((d) => divSlots.some((s) => s.day === d)),
    [divSlots],
  )
  const hours = useMemo(() => {
    const set = new Set<number>()
    for (const s of divSlots) {
      for (let h = Math.floor(s.start); h < Math.ceil(s.end); h++) set.add(h)
    }
    return [...set].sort((a, b) => a - b)
  }, [divSlots])

  /** 「선생님|요일|시」 → 그 칸에 있는 학생들. 칸마다 훑지 않도록 한 번에 만든다. */
  const cells = useMemo(() => {
    const m = new Map<string, Slot[]>()
    for (const s of divSlots) {
      for (let h = Math.floor(s.start); h < Math.ceil(s.end); h++) {
        const k = `${s.teacher}|${s.day}|${h}`
        const arr = m.get(k)
        if (arr) arr.push(s)
        else m.set(k, [s])
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.start - b.start || a.student.name.localeCompare(b.student.name, 'ko'))
    }
    return m
  }, [divSlots])

  /** 선생님 목록 — 그 부 학생이 많은 분부터. */
  const teachers = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of divSlots) {
      const set = m.get(s.teacher) ?? new Set<string>()
      set.add(s.student.id)
      m.set(s.teacher, set)
    }
    return [...m.entries()]
      .map(([name, set]) => ({ name, count: set.size }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  }, [divSlots])

  /** 요일×시간 전체 인원 — 어느 시간이 꽉 찼고 어디가 비는지 한눈에. */
  const totals = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of divSlots) {
      for (let h = Math.floor(s.start); h < Math.ceil(s.end); h++) {
        const k = `${s.day}|${h}`
        const set = m.get(k) ?? new Set<string>()
        set.add(s.student.id)
        m.set(k, set)
      }
    }
    const out = new Map<string, number>()
    let max = 0
    for (const [k, set] of m) { out.set(k, set.size); if (set.size > max) max = set.size }
    return { get: (d: string, h: number) => out.get(`${d}|${h}`) ?? 0, max }
  }, [divSlots])

  /** 그 부인데 시간표가 한 줄도 없는 학생 — 조용히 빠지면 안 된다. */
  const noSchedule = useMemo(() => {
    const has = new Set(slots.map((s) => s.student.id))
    return students.filter((s) => divisionOf(s.grade) === division && !has.has(s.id))
  }, [students, slots, division])

  const divCount = useMemo(
    () => new Set(divSlots.map((s) => s.student.id)).size,
    [divSlots],
  )

  const hit = (name: string) => q.trim().length > 0 && name.includes(q.trim())
  const picked = (d: string, h: number) =>
    (!pickDay || pickDay === d) && (pickHour === null || pickHour === h) && (!!pickDay || pickHour !== null)

  if (!isAdmin()) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-500">관리자만 접근할 수 있습니다.</p>
    </div>
  )

  const color = DIV_COLOR[division]

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header title="반배정 시간표" subtitle="상담할 때 보는 전체 시간표 · 원장님만 보입니다" />

      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 부 고르기 */}
        <div className="flex flex-wrap items-center gap-2">
          {DIVISIONS.map((d) => {
            const n = new Set(students.filter((s) => divisionOf(s.grade) === d).map((s) => s.id)).size
            return (
              <button key={d} onClick={() => setDivision(d)}
                className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                  division === d ? 'text-white' : 'bg-white text-gray-600 border-gray-200')}
                style={division === d ? { background: '#0F6E56', borderColor: '#0F6E56' } : undefined}>
                {d} <span className="opacity-70 font-normal">{n}명</span>
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학생 이름으로 찾기"
              className="px-3 py-2 text-sm rounded-xl border border-gray-200 w-44" />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showLeave} onChange={(e) => setShowLeave(e.target.checked)} />
              휴원 학생도 보기
            </label>
            <button onClick={fetchData} disabled={loading}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-gray-200 bg-white text-gray-700 disabled:opacity-50">
              <i className="ti ti-refresh mr-1 align-[-0.125em]" />{loading ? '불러오는 중…' : '새로고침'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">시간표를 불러오는 중이에요…</p>
        ) : divSlots.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">{division} 시간표가 아직 없어요.</p>
        ) : (
          <>
            {/* ── 어느 시간이 비나 ─────────────────────────────────────────
                상담 중에 「목요일 5시 가능하세요?」를 들으면 여기부터 본다.
                칸을 누르면 아래 표에서 그 칸만 또렷해진다. */}
            <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <i className="ti ti-clock-hour-4" style={{ fontSize: 16, color: '#0F6E56' }} />
                <span className="text-sm font-bold text-gray-800">어느 시간에 몇 명</span>
                <span className="text-[11px] text-gray-400">{division} 전체 {divCount}명 · 칸을 누르면 아래에서 그 자리만 또렷해져요</span>
                {(pickDay || pickHour !== null) && (
                  <button onClick={() => { setPickDay(''); setPickHour(null) }}
                    className="ml-auto text-[11px] font-semibold text-gray-500 underline">짚은 것 풀기</button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
                  <thead>
                    <tr>
                      <th className="w-14" />
                      {days.map((d) => (
                        <th key={d}>
                          <button onClick={() => setPickDay(pickDay === d ? '' : d)}
                            className={cx('w-14 py-1 rounded-lg font-bold',
                              pickDay === d ? 'text-white' : 'text-gray-600 bg-gray-50')}
                            style={pickDay === d ? { background: '#0F6E56' } : undefined}>{d}</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hours.map((h) => (
                      <tr key={h}>
                        <td>
                          <button onClick={() => setPickHour(pickHour === h ? null : h)}
                            className={cx('w-14 py-1 rounded-lg font-bold text-[11px]',
                              pickHour === h ? 'text-white' : 'text-gray-500 bg-gray-50')}
                            style={pickHour === h ? { background: '#0F6E56' } : undefined}>{hourLabel(h)}</button>
                        </td>
                        {days.map((d) => {
                          const n = totals.get(d, h)
                          const ratio = totals.max > 0 ? n / totals.max : 0
                          return (
                            <td key={d} className="text-center">
                              <div className={cx('w-14 py-1 rounded-lg font-bold',
                                picked(d, h) && 'ring-2 ring-offset-1')}
                                style={{
                                  background: n === 0 ? '#FAFAFA' : color.bg,
                                  color: n === 0 ? '#D1D5DB' : color.text,
                                  // 사람이 많을수록 진하게 — 빈 시간이 바로 눈에 띈다
                                  opacity: n === 0 ? 1 : 0.45 + ratio * 0.55,
                                  ...(picked(d, h) ? { boxShadow: `0 0 0 2px ${color.text}` } : {}),
                                }}>
                                {n === 0 ? '·' : n}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── 선생님별 시간표 ───────────────────────────────────────── */}
            {teachers.map((t) => (
              <section key={t.name} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
                  style={{ background: color.bg, borderBottom: `1px solid ${color.border}` }}>
                  <span className="text-sm font-bold" style={{ color: color.text }}>{t.name} 선생님</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/70"
                    style={{ color: color.text }}>{division} {t.count}명</span>
                  {days.map((d) => {
                    const n = new Set(divSlots.filter((s) => s.teacher === t.name && s.day === d).map((s) => s.student.id)).size
                    if (n === 0) return null
                    return (
                      <span key={d} className="text-[11px] text-gray-500">{d} {n}</span>
                    )
                  })}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 120 + days.length * 150 }}>
                    <thead>
                      <tr style={{ background: '#FAFAFA' }}>
                        <th className="w-[72px] px-2 py-1.5 text-[11px] font-bold text-gray-400 border-b border-gray-100">시간</th>
                        {days.map((d) => (
                          <th key={d} className="px-2 py-1.5 text-[11px] font-bold text-gray-500 border-b border-l border-gray-100">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {hours.map((h) => (
                        <tr key={h}>
                          <td className="px-2 py-1 text-[11px] font-bold text-gray-400 align-top border-b border-gray-50">
                            {hourLabel(h)}
                          </td>
                          {days.map((d) => {
                            const list = cells.get(`${t.name}|${d}|${h}`) ?? []
                            const on = picked(d, h)
                            return (
                              <td key={d}
                                className="px-1.5 py-1 align-top border-b border-l border-gray-50"
                                style={on ? { background: color.bg } : undefined}>
                                <div className="flex flex-wrap gap-1">
                                  {list.map((s) => {
                                    const 휴 = !!s.student.on_leave
                                    const 찾음 = hit(s.student.name)
                                    return (
                                      <span key={s.student.id + s.day + s.start}
                                        title={`${s.student.name} · ${s.student.grade ?? ''} · ${s.startLabel}~${hourLabel(s.end)}${s.student.school ? ` · ${s.student.school}` : ''}${휴 ? ' · 휴원중' : ''}`}
                                        className={cx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap',
                                          찾음 && 'ring-2')}
                                        style={{
                                          background: 휴 ? '#F9FAFB' : color.bg,
                                          border: `1px solid ${휴 ? '#E5E7EB' : color.border}`,
                                          color: 휴 ? '#9CA3AF' : color.text,
                                          opacity: 휴 ? 0.75 : 1,
                                          ...(찾음 ? { boxShadow: '0 0 0 2px #F59E0B' } : {}),
                                        }}>
                                        {s.student.name}
                                        <span className="font-normal opacity-60">{s.student.grade}</span>
                                        {/* 정시에 시작하지 않는 수업은 시각을 적어 둔다(16:30 등) */}
                                        {!Number.isInteger(s.start) && h === Math.floor(s.start) && (
                                          <span className="font-normal opacity-60">{s.startLabel}</span>
                                        )}
                                        {휴 && <span className="font-normal">휴</span>}
                                      </span>
                                    )
                                  })}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            {/* ── 시간표가 없는 학생 ──────────────────────────────────────
                위 표에 한 번도 안 나오는 학생들이다. 조용히 빠지면 반배정이 어긋난다. */}
            {noSchedule.length > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">
                  <i className="ti ti-alert-triangle mr-1 align-[-0.125em]" />
                  시간표가 없는 {division} 학생 {noSchedule.length}명 — 위 표에 안 나와요
                </p>
                <p className="text-[11px] text-amber-700 mt-1">학습관리 → 「+ 시간표」에서 요일·시각을 넣어 주세요.</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {noSchedule.map((s) => (
                    <span key={s.id} className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white border border-amber-200 text-amber-900">
                      {s.name} <span className="font-normal opacity-60">{s.grade}</span>
                      {s.teacher_name && <span className="font-normal opacity-60"> · {mainTeacher(s.teacher_name)}</span>}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
