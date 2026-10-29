'use client'

/**
 * 반배정 시간표 — 원장님 전용.
 *
 * 왜 만들었나 (원장님 2026-10-28)
 *   「신규상담이 오면 전체 어느 강의실에 몇시에 어떤 학생이 있는지가 보여야 반배정을 하기 때문에」
 *   지금까지는 선생님별 엑셀 표를 손으로 만들어 쓰셨는데, 중간에 시간을 바꾸면 반영이 안 됐다.
 *   이 화면은 스터디체크 **시간표(schedules)를 그대로** 그리므로 바꾸는 즉시 맞는다.
 *
 * 그리는 꼴 (원장님 2026-10-28 「학년별로 같은 색으로 해주고, 같은이름은 연결해서 보여주면」)
 *   엑셀과 같이 **세로가 시간, 가로가 요일**이고, 한 요일 안에서 학생마다 세로 칸 하나를 쓴다.
 *   2교시 수업은 두 줄로 쪼개지 않고 **한 덩어리로 이어 붙인다** — 몇 시부터 몇 시까지인지가
 *   길이로 바로 보인다. 글씨는 엑셀처럼 세워서 쓴다(가로로 쓰면 한 요일이 화면을 다 먹는다).
 *   색은 **학년별**이다. 색만 보고 외우게 하면 안 되므로 맨 위에 범례를 같이 둔다.
 *
 * 누가 무엇을 보나 (원장님 2026-10-29 「각 선생님들도 본인 시간표 볼 수 있도록. 본인 학생만.
 * 형태는 내가 보는 것과 똑같이」)
 *   · 원장·행정 — 전체. 신규 상담 때 어느 시간이 비는지 보는 **반배정 시간표**.
 *   · 선생님   — **본인 담당 학생만**(주임모드면 담당 학년). 메뉴 이름은 「내 시간표」.
 *   그리는 꼴은 똑같다 — 「어느 시간에 몇 명」도, 선생님별 표도, 색도 그대로다.
 *
 * ★ 전체 인원이 새지 않는 까닭
 *   이 화면은 `students` 를 그대로 그린다. 2026-10-29 부터 조회 정책이 **강사는 담당 학생만**
 *   읽히게 조여져 있어서(docs/보안.md), 인원·요일 인원·범례 숫자가 전부 본인 범위에서만 세진다.
 *   화면에서 또 `canViewStudent()` 로 거르는 것은 **주임모드 토글을 따르기 위한 것**이다
 *   (정책은 주임에게 중등 전체를 열어 주므로, 강사모드로 보실 때 본인 학생만 보이게 한다).
 */

import { useState, useEffect, useMemo } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx, fetchAllRows } from '@/lib/utils'
import { mainTeacher } from '@/lib/teacherColors'
import { packLanes, toHours, divisionOf, type Division } from '@/lib/classMap'

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

/** 요일은 늘 이 순서로 그린다. 그 요일 수업이 하나도 없으면 칸을 아예 안 만든다. */
const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일']

const DIVISIONS = ['초등부', '중등부', '고등부'] as const

/**
 * 학년 색 — **학년마다 다른 색**(원장님 2026-10-28).
 * 부마다 따로 보니 색을 돌려써도 섞이지 않는다. 범례를 반드시 같이 띄운다.
 */
type Hue = { bg: string; border: string; text: string }
const GRADE_COLOR: Record<string, Hue> = {
  초1: { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' }, // 노랑
  초2: { bg: '#FFE4E6', border: '#FDA4AF', text: '#9F1239' }, // 분홍
  초3: { bg: '#DCFCE7', border: '#86EFAC', text: '#166534' }, // 연두
  초4: { bg: '#CFFAFE', border: '#67E8F9', text: '#155E75' }, // 청록
  초5: { bg: '#DBEAFE', border: '#93C5FD', text: '#1E40AF' }, // 하늘
  초6: { bg: '#EDE9FE', border: '#C4B5FD', text: '#5B21B6' }, // 보라
  중1: { bg: '#DCFCE7', border: '#86EFAC', text: '#166534' }, // 연두
  중2: { bg: '#DBEAFE', border: '#93C5FD', text: '#1E40AF' }, // 하늘
  중3: { bg: '#FFE4E6', border: '#FDA4AF', text: '#9F1239' }, // 분홍
  고1: { bg: '#FFEDD5', border: '#FDBA74', text: '#9A3412' }, // 주황
  고2: { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' }, // 노랑
  고3: { bg: '#EDE9FE', border: '#C4B5FD', text: '#5B21B6' }, // 보라
}
const NO_GRADE: Hue = { bg: '#F3F4F6', border: '#D1D5DB', text: '#4B5563' }
const hueOf = (grade?: string | null) => GRADE_COLOR[String(grade ?? '')] ?? NO_GRADE

/** 학년을 「초1 … 고3」 차례로 세운다. */
const GRADE_ORDER = Object.keys(GRADE_COLOR)
const gradeRank = (g?: string | null) => {
  const i = GRADE_ORDER.indexOf(String(g ?? ''))
  return i < 0 ? 999 : i
}

/** 한 시간 칸의 높이(px). 2교시면 이 두 배짜리 덩어리가 된다. */
const HOUR_PX = 46
/** 학생 한 명이 차지하는 세로 칸의 너비(px). 엑셀의 1, 2, 3… 칸과 같다. */
const LANE_W = 27
/** 요일 오른쪽 끝에 그 시간 인원을 적는 자리(px). */
const COUNT_W = 20
/** 요일 이름 줄 높이 / 칸 번호(1, 2, 3 …) 줄 높이 */
const DAY_H = 22
const NUM_H = 16

/** 14 → '14시', 14.5 → '14:30' */
function hourLabel(h: number) {
  return Number.isInteger(h) ? `${h}시` : `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
}
function timeLabel(t: number) {
  const h = Math.floor(t)
  const m = Math.round((t % 1) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

type Slot = {
  key: string
  student: Student
  teacher: string
  day: string
  start: number
  end: number
  /** 그 요일 안에서 몇 번째 세로 칸에 놓을지 */
  lane: number
}

export default function ClassMapPage() {
  const { isAdmin, canViewStudent, currentUser, adminMode, supervisorMode,
          isSupervisorModeActive, supervisorLabel } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [division, setDivision] = useState<Division>('중등부')
  const [q, setQ] = useState('')
  /** 상담 중에 「목요일 5시」를 짚으면 그 자리만 또렷하게 보이게 한다. */
  const [pickDay, setPickDay] = useState<string>('')
  const [pickHour, setPickHour] = useState<number | null>(null)
  /** 휴원 학생은 자리를 비운 것뿐이라 기본으로 같이 본다(돌아오면 그 자리로 온다). */
  const [showLeave, setShowLeave] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    // 학생을 먼저 받는다. 조회 정책이 이미 **내 범위**로 걸러 준다(원장·행정은 전체).
    const { data: sData } = await supabase
      .from('students').select('id, name, grade, school, teacher_name, on_leave')
      .eq('is_active', true).order('name')
    const list = (sData ?? []) as Student[]
    setStudents(list)

    // ★ 시간표는 **그 학생들 것만** 받는다.
    //   전체를 받으면(정책상 직원에게는 다 열려 있다) 행 수와 student_id 가지 수로
    //   학원 전체 인원이 그대로 드러난다 — 선생님에게는 보이면 안 되는 숫자다.
    //   in() 은 한 번에 100개씩 끊는다. 쪽을 나눠 읽을 땐 order 를 못박아야 행을 안 놓친다.
    const ids = list.map((x) => x.id)
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
    const parts = await Promise.all(chunks.map((chunk) =>
      fetchAllRows<Schedule>(() => supabase.from('schedules')
        .select('id, student_id, day_of_week, start_time, periods')
        .eq('is_active', true).in('student_id', chunk).order('id'))))
    const scData = parts.flat()
    setSchedules(scData.map((x: any) => ({ ...x, periods: Number(x.periods) })))
    setLoading(false)
  }

  /**
   * 내가 볼 수 있는 학생. 원장·행정은 전부, 선생님은 담당 학생, 주임모드면 담당 학년.
   * ★ DB 정책이 이미 한 번 걸러 주지만, **주임모드 토글**은 화면 쪽 규칙이라 여기서 따른다
   *   (주임 선생님이 강사모드로 보실 때 본인 학생만 보이게).
   */
  const visible = useMemo(() => students.filter((s) => canViewStudent(s)),
    [students, currentUser, adminMode, supervisorMode])

  /** 시간표 한 줄 = 학생 한 명이 그 요일 그 시각에 앉아 있는 것. */
  const rawSlots = useMemo(() => {
    const byId = new Map(visible.map((s) => [s.id, s]))
    const out: Omit<Slot, 'lane'>[] = []
    for (const sc of schedules) {
      const st = byId.get(sc.student_id)
      if (!st) continue
      const start = toHours(sc.start_time)
      out.push({
        key: sc.id,
        student: st,
        teacher: mainTeacher(st.teacher_name) || '담당 없음',
        day: sc.day_of_week,
        start,
        end: start + (Number(sc.periods) || 1),
      })
    }
    return out
  }, [visible, schedules])

  const divRaw = useMemo(
    () => rawSlots.filter((s) => divisionOf(s.student.grade) === division && (showLeave || !s.student.on_leave)),
    [rawSlots, division, showLeave],
  )

  /** 맨 위 「어느 시간에 몇 명」 — 원장님은 부 전체, 선생님은 본인 범위에서 센다. */
  const days = useMemo(() => DAY_ORDER.filter((d) => divRaw.some((s) => s.day === d)), [divRaw])
  const hours = useMemo(() => {
    const set = new Set<number>()
    for (const s of divRaw) for (let h = Math.floor(s.start); h < Math.ceil(s.end); h++) set.add(h)
    return [...set].sort((a, b) => a - b)
  }, [divRaw])

  /**
   * 선생님 한 분의 시간표를 통째로 만들어 둔다.
   *
   * ★ 요일·시간을 **그 선생님 것만** 쓴다. 부 전체로 잡으면 토요일 수업이 한 명만 있어도
   *   나머지 선생님 표에 9·10·11시 빈 줄 세 개와 빈 토요일 칸이 따라붙는다
   *   (2026-10-28 미리보기에서 실제로 그랬다). 선생님끼리 견주는 일은 위 「어느 시간에
   *   몇 명」이 맡는다.
   *
   * 자리 채우기 규칙은 lib/classMap.ts 에 있다 — 먼저 시작하는 학생부터 빈 칸에.
   */
  const blocks = useMemo(() => {
    const byTeacher = new Map<string, Omit<Slot, 'lane'>[]>()
    for (const s of divRaw) {
      const arr = byTeacher.get(s.teacher)
      if (arr) arr.push(s)
      else byTeacher.set(s.teacher, [s])
    }
    return [...byTeacher.entries()].map(([name, arr]) => {
      const myDays = DAY_ORDER.filter((d) => arr.some((s) => s.day === d))
      const hourSet = new Set<number>()
      for (const s of arr) for (let h = Math.floor(s.start); h < Math.ceil(s.end); h++) hourSet.add(h)
      const myHours = [...hourSet].sort((a, b) => a - b)
      const idx = new Map(myHours.map((h, i) => [h, i]))
      const packs = new Map<string, { slots: Slot[]; lanes: number }>()
      for (const d of myDays) {
        packs.set(d, packLanes(arr.filter((s) => s.day === d), (s) => s.student.name) as { slots: Slot[]; lanes: number })
      }
      // 「그 요일 그 시간에 몇 명」 — 요일 오른쪽 끝에 적는다.
      const countAt = new Map<string, number>()
      for (const s of arr) {
        for (let h = Math.floor(s.start); h < Math.ceil(s.end); h++) {
          const k = `${s.day}|${h}`
          countAt.set(k, (countAt.get(k) ?? 0) + 1)
        }
      }
      return {
        name,
        count: new Set(arr.map((s) => s.student.id)).size,
        days: myDays,
        hours: myHours,
        idx,
        packs,
        countAt,
        /** 덩어리의 위치·길이. 안 쓰는 시간대는 접혀 있으므로 **차례(index)** 로 센다. */
        topOf: (t: number) => (idx.get(Math.floor(t)) ?? 0) * HOUR_PX + (t % 1) * HOUR_PX,
        heightOf: (start: number, end: number) => {
          const last = Math.ceil(end) - 1
          const top = (idx.get(Math.floor(start)) ?? 0) * HOUR_PX + (start % 1) * HOUR_PX
          const bottom = (idx.get(last) ?? idx.get(Math.floor(start)) ?? 0) * HOUR_PX + (end - last) * HOUR_PX
          return Math.max(HOUR_PX * 0.6, bottom - top)
        },
      }
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
  }, [divRaw])

  /** 요일×시간 전체 인원 — 어느 시간이 꽉 찼고 어디가 비는지 한눈에. */
  const totals = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of divRaw) {
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
  }, [divRaw])

  /** 그 부인데 시간표가 한 줄도 없는 학생 — 조용히 빠지면 반배정이 어긋난다. */
  const noSchedule = useMemo(() => {
    const has = new Set(rawSlots.map((s) => s.student.id))
    return visible.filter((s) => divisionOf(s.grade) === division && !has.has(s.id))
  }, [visible, rawSlots, division])

  /** 범례에 띄울 학년 — 그 부에 실제로 있는 학년만. */
  const gradesShown = useMemo(() => {
    const set = new Set(divRaw.map((s) => String(s.student.grade ?? '')))
    return [...set].sort((a, b) => gradeRank(a) - gradeRank(b))
  }, [divRaw])

  const divCount = useMemo(() => new Set(divRaw.map((s) => s.student.id)).size, [divRaw])

  const hit = (name: string) => q.trim().length > 0 && name.includes(q.trim())
  /** 짚은 자리인가 — 요일만 짚어도, 시간만 짚어도 된다. */
  const pickedCell = (d: string, h: number) =>
    (!!pickDay || pickHour !== null) && (!pickDay || pickDay === d) && (pickHour === null || pickHour === h)

  // ★ 선생님도 들어온다(원장님 2026-10-29). 역할 확인을 지운 것이 아니라,
  //   **보이는 학생 범위**로 가른다 — 위 visible 과 students 조회 정책이 그 일을 한다.
  //   직원이 아닌 사람은 app/teacher/layout.tsx 의 AccessGate 가 이미 막는다.
  const 전체보기 = isAdmin() || currentUser?.role === 'staff'

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header
        title={전체보기 ? '반배정 시간표' : '내 시간표'}
        subtitle={전체보기
          ? '상담할 때 보는 전체 시간표 · 원장님만 보입니다'
          : isSupervisorModeActive()
            ? `${supervisorLabel()} 범위 · 담당 학년 시간표`
            : '내 담당 학생 시간표'} />

      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 부 고르기 · 찾기 */}
        <div className="flex flex-wrap items-center gap-2">
          {DIVISIONS.map((d) => {
            const n = visible.filter((s) => divisionOf(s.grade) === d).length
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
        ) : divRaw.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">{division} 시간표가 아직 없어요.</p>
        ) : (
          <>
            {/* 학년 범례 — 색만 보고 외우게 하지 않는다 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-gray-400">학년</span>
              {gradesShown.map((g) => {
                const c = hueOf(g)
                const n = new Set(divRaw.filter((s) => s.student.grade === g).map((s) => s.student.id)).size
                return (
                  <span key={g} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold"
                    style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}>
                    {g || '학년 없음'} <span className="font-normal opacity-70">{n}명</span>
                  </span>
                )
              })}
            </div>

            {/* ── 어느 시간이 비나 ─────────────────────────────────────────
                상담 중에 「목요일 5시 가능하세요?」를 들으면 여기부터 본다.
                칸을 누르면 아래 시간표에서 그 자리에 줄이 그어진다. */}
            <section className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <i className="ti ti-clock-hour-4" style={{ fontSize: 16, color: '#0F6E56' }} />
                <span className="text-sm font-bold text-gray-800">어느 시간에 몇 명</span>
                <span className="text-[11px] text-gray-400">
                  {전체보기 ? `${division} 전체` : '내 담당'} {divCount}명 · 칸을 누르면 아래에서 그 자리를 짚어 줘요
                </span>
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
                          const on = pickedCell(d, h)
                          return (
                            <td key={d} className="text-center">
                              <div className="w-14 py-1 rounded-lg font-bold"
                                style={{
                                  background: n === 0 ? '#FAFAFA' : '#CFF0E4',
                                  color: n === 0 ? '#D1D5DB' : '#0B5844',
                                  // 사람이 많을수록 진하게 — 빈 시간이 바로 눈에 띈다
                                  opacity: n === 0 ? 1 : 0.4 + ratio * 0.6,
                                  ...(on ? { boxShadow: '0 0 0 2px #0F6E56' } : {}),
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

            {/* ── 선생님별 시간표 ─────────────────────────────────────────
                엑셀과 같은 꼴 — 세로가 시간, 가로가 요일, 학생 한 명이 세로 칸 하나.
                2교시 수업은 두 줄로 쪼개지 않고 한 덩어리로 이어 붙인다. */}
            {blocks.map((b) => (
              <section key={b.name} className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-bold text-gray-800">{b.name} 선생님</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
                    {division} {b.count}명
                  </span>
                  {b.days.map((d) => (
                    <span key={d} className="text-[11px] text-gray-400">
                      {d} {new Set((b.packs.get(d)?.slots ?? []).map((s) => s.student.id)).size}
                    </span>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <div className="flex" style={{ minWidth: 'max-content' }}>
                    {/* 시간 — 가로로 밀어도 늘 붙어 있게 */}
                    <div className="sticky left-0 z-10 bg-white shrink-0" style={{ width: 52 }}>
                      <div style={{ height: DAY_H + NUM_H }} className="border-b border-gray-100" />
                      {b.hours.map((h, i) => (
                        <div key={h} className="text-[11px] font-bold text-gray-400 pr-2 text-right"
                          style={{
                            height: HOUR_PX, lineHeight: `${HOUR_PX}px`,
                            // 수업이 없어 건너뛴 시간대는 **접혀 있다**. 접힌 자리를 점선으로 알려 준다.
                            borderTop: i > 0 && h - b.hours[i - 1] > 1 ? '1px dashed #D1D5DB' : undefined,
                          }}>
                          {hourLabel(h)}
                        </div>
                      ))}
                    </div>

                    {b.days.map((d) => {
                      const pack = b.packs.get(d)
                      const lanes = pack?.lanes ?? 1
                      return (
                        <div key={d} className="shrink-0 border-l border-gray-100"
                          style={{ width: lanes * LANE_W + COUNT_W }}>
                          {/* 짚은 요일은 머리를 칠해 둔다 */}
                          <div className={cx('text-[11px] font-bold text-center',
                            pickDay === d ? 'text-white' : 'text-gray-500')}
                            style={{ height: DAY_H, lineHeight: `${DAY_H}px`, background: pickDay === d ? '#0F6E56' : undefined }}>
                            {d} <span className="font-normal opacity-60">{lanes}자리</span>
                          </div>
                          {/* ★ 칸 번호 1, 2, 3 … — 엑셀과 같다. 번호 끝이 곧 그 요일 **정원**이다
                              (원장님 2026-10-28 「맨 위행에 숫자를 써줘 그래야 정원이 몇명인지를 바로 파악」). */}
                          <div className="flex border-b border-gray-200" style={{ height: NUM_H, background: '#F9FAFB' }}>
                            {Array.from({ length: lanes }, (_, i) => (
                              <div key={i} className="text-[9px] font-bold text-gray-400 text-center border-r border-gray-100"
                                style={{ width: LANE_W, lineHeight: `${NUM_H}px` }}>{i + 1}</div>
                            ))}
                            <div className="text-[9px] font-bold text-center text-gray-300"
                              style={{ width: COUNT_W, lineHeight: `${NUM_H}px` }}>명</div>
                          </div>
                          <div className="relative"
                            style={{
                              height: b.hours.length * HOUR_PX,
                              // 한 시간마다 옅은 줄 — 몇 시짜리인지 길이로 읽을 수 있게
                              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, #F3F4F6 ${HOUR_PX - 1}px, #F3F4F6 ${HOUR_PX}px)`,
                            }}>
                            {/* 짚은 시간 띠 */}
                            {pickHour !== null && b.idx.has(pickHour) && (!pickDay || pickDay === d) && (
                              <div className="absolute left-0 right-0 pointer-events-none"
                                style={{ top: (b.idx.get(pickHour) ?? 0) * HOUR_PX, height: HOUR_PX, background: '#0F6E5618' }} />
                            )}
                            {/* ★ 그 시간에 몇 명 — 요일 오른쪽 끝에 적는다.
                                칸 번호(정원)와 나란히 읽으면 「10자리 중 7명」이 바로 보인다. */}
                            {b.hours.map((h, i) => {
                              const n = b.countAt.get(`${d}|${h}`) ?? 0
                              return (
                                <div key={h} className="absolute text-[10px] font-bold text-center pointer-events-none"
                                  style={{
                                    left: lanes * LANE_W, width: COUNT_W, top: i * HOUR_PX, height: HOUR_PX,
                                    lineHeight: `${HOUR_PX}px`, color: n === 0 ? '#E5E7EB' : '#9CA3AF',
                                    borderLeft: '1px solid #F3F4F6',
                                  }}>
                                  {n === 0 ? '·' : n}
                                </div>
                              )
                            })}
                            {(pack?.slots ?? []).map((s) => {
                              const c = hueOf(s.student.grade)
                              const 휴 = !!s.student.on_leave
                              const 찾음 = hit(s.student.name)
                              const h = b.heightOf(s.start, s.end)
                              return (
                                <div key={s.key}
                                  title={`${s.student.name} · ${s.student.grade ?? ''} · ${timeLabel(s.start)}~${timeLabel(s.end)}${s.student.school ? ` · ${s.student.school}` : ''}${휴 ? ' · 휴원중' : ''}`}
                                  className="absolute flex items-center justify-center overflow-hidden"
                                  style={{
                                    left: s.lane * LANE_W + 1.5,
                                    width: LANE_W - 3,
                                    top: b.topOf(s.start) + 1.5,
                                    height: h - 3,
                                    borderRadius: 6,
                                    background: 휴 ? '#FAFAFA' : c.bg,
                                    border: `1px solid ${휴 ? '#E5E7EB' : c.border}`,
                                    color: 휴 ? '#9CA3AF' : c.text,
                                    opacity: 휴 ? 0.8 : 1,
                                    // 엑셀처럼 세워 쓴다 — 가로로 쓰면 한 요일이 화면을 다 먹는다
                                    writingMode: 'vertical-rl',
                                    textOrientation: 'upright',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    lineHeight: 1.05,
                                    letterSpacing: '-0.02em',
                                    ...(찾음 ? { boxShadow: '0 0 0 2px #F59E0B' } : {}),
                                  }}>
                                  {s.student.name}
                                  {/* ★ 시각은 **정시가 아닐 때만** 적는다. 몇 시인지는 줄 위치가 이미 말해 주고,
                                      숫자를 세로로 세우면 자리만 먹는다 (2026-10-28 미리보기에서 그랬다). */}
                                  {!Number.isInteger(s.start) && h >= HOUR_PX * 1.2 && (
                                    <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.6 }}>{timeLabel(s.start)}</span>
                                  )}
                                  {휴 && h >= HOUR_PX && (
                                    <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>휴</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
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
