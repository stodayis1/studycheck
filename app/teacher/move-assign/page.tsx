'use client'

/**
 * 진급 배정판 — 학년이 올라갈 때 누가 어느 선생님·어느 타임으로 가는지 맞춰 보는 판.
 *
 * 원장님 2026-11-17 「링크 띄워주고 스터디체크 안에 넣어줘」
 *                  「초6이 중등으로 넘어오는 시간표도 같이 넣어줘, 같은 메뉴안에」
 *                  「초등학생들도 한학년 올라가면서 … 진급배정판에 초등버전 하나더 만들어줘」
 *
 * 그동안 claude.ai 아티팩트 두 장으로 쓰고 있었다. 앱으로 옮긴 까닭 세 가지
 *   ① 강사가 고치려면 claude.ai 계정과 「참여」 권한이 따로 필요했다(보기 권한으로는 저장이 막힌다).
 *   ② 학생·시간표가 **글자로 박혀** 있어서 원생이 들어오고 나가면 손으로 고쳐야 했다.
 *      이 화면은 students · schedules 를 그대로 읽으므로 저절로 맞는다.
 *   ③ 나중에 실제 시간표로 옮길 때 값을 다시 쳐야 했다.
 *
 * ★ 이 화면은 **계획**이다. 저장해도 실제 시간표(schedules)·담당(students.teacher_name)은
 *   건드리지 않는다. 진급할 때 옮기는 일은 따로 한다 — 그러니 여기서 아무리 고쳐도
 *   지금 수업·브리핑·출결에는 영향이 없다.
 *
 * 누가 보나: 고등 커리큘럼과 같은 사람 (원장님 + 고등 강사). 진짜 차단은 RLS —
 *   docs/sql/진급배정판.sql
 */

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'
import { apiFetch } from '@/lib/apiFetch'
import {
  DAYS_WD, DAYS_WE, ROWS_WD, ROWS_WE, ROWS_MID, ROWS_ELEM,
  WD, WE, EXTRA, HIGH_TEACHERS, HIGH_PICKS, MID_PICKS, DRAFT_HIGH, DRAFT_MID,
  GRADES_ELEM, ELEM_PICKS, ELEM_STARTS, ELEM_PERIODS, nextGrade, elemDraft,
  parseNewTime, newTimeText, newTimeAt, newTimeDays, sameTime, withDay, type NewTime,
  keyOf, isAt, worksOn, weekendPickable, weekendOwner, oddSaturday, clashesWithOff,
  toMin, type Track,
} from '@/lib/moveAssign'

interface Student { id: string; name: string; grade: string | null; teacher_name: string | null }
interface Sched { student_id: string; day_of_week: string; start_time: string; periods: number }
interface Row { student_id: string; track: Track; teacher_name: string | null; weekday_slot: string | null; weekend_slot: string | null; extra_slot: string | null; new_time?: any }
/** 화면에서 들고 다니는 한 학생의 배정 */
type Pick3 = { t: string; wd: string; we: string; ex: string; nt?: NewTime | null }

const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일']

export default function MoveAssignPage() {
  const { currentUser } = useAuth()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  // 세 탭을 다 볼 사람인가. false 면 「초6 → 중등」·「초등 진급」만 — 초등 담당 선생님
  // (조윤희·윤주희)이다 (원장님 2026-11-17 「전체 인원을 볼 필요가 없어」).
  // 서버도 그분들께는 고등부를 안 내려 준다.
  const [full, setFull] = useState(false)
  const [tab, setTab] = useState<Track>('고등')
  const [students, setStudents] = useState<Student[]>([])
  const [scheds, setScheds] = useState<Sched[]>([])
  const [assign, setAssign] = useState<Record<string, Pick3>>({})
  const [loading, setLoading] = useState(true)
  const [hint, setHint] = useState('')

  useEffect(() => {
    if (!currentUser) return
    let alive = true
    supabase.rpc('can_see_move_assign').then(({ data }) => { if (alive) setAllowed(data === true) })
    supabase.rpc('can_see_high_curriculum').then(({ data }) => { if (alive) setFull(data === true) })
    return () => { alive = false }
  }, [currentUser])

  useEffect(() => {
    try {
      const t = localStorage.getItem('ma-tab')
      if (t === '고등' || t === '중등' || t === '초등') setTab(t)
    } catch { /* 저장 못 해도 화면은 된다 */ }
  }, [])
  // 고등 권한이 없는 분께는 고등 탭이 아예 없다 — 기억된 탭이 고등이면 중등으로 옮긴다
  useEffect(() => { if (!full) setTab((t) => (t === '고등' ? '중등' : t)) }, [full])
  function pickTab(t: Track) {
    setTab(t)
    try { localStorage.setItem('ma-tab', t) } catch { /* 무시 */ }
  }

  useEffect(() => { if (allowed) load() }, [allowed])

  /**
   * ★ 학생·시간표를 **서버 API 로** 읽는다 (app/api/move-assign).
   *   학생 조회 정책은 담당 학생 + 주임 학년만 읽히므로, 중등 선생님이 브라우저에서 직접 읽으면
   *   초6 이 **조용히 0명**이 된다(에러도 안 난다 — 2026-11-17 신애진 선생님 화면에서 그랬다).
   *   students 정책을 넓히면 앱 전체에서 초등이 열리므로, 이 화면이 쓰는 것만 서버가 내려 준다.
   */
  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch('/api/move-assign')
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error ?? '읽지 못했어요')
      const real: Student[] = j.students ?? []
      setStudents(real)
      setScheds(j.schedules ?? [])
      const rows: Row[] = j.rows ?? []

      // 저장된 것이 있으면 그쪽이 이기고, 없으면 처음 제안(DRAFT_*)을 보여 준다.
      const next: Record<string, Pick3> = {}
      for (const st of real) {
        const k = keyOf(st.name, st.grade)
        // 초1~초5 는 **지금 담당 그대로**가 첫 제안이다 (같은 초등부 안에서 다시 나누는 것이라
        // 「바꿀 학생만 고치는」 편이 맞다 — 원장님 2026-11-17).
        const d = (GRADES_ELEM as readonly string[]).includes(st.grade ?? '')
          ? [elemDraft(st.teacher_name), '', '']
          : st.grade === '초6' ? (DRAFT_MID[k] ? [DRAFT_MID[k], '', ''] : null) : DRAFT_HIGH[k]
        if (d && d[0]) next[st.id] = { t: d[0], wd: d[1], we: d[2], ex: '' }
      }
      for (const r of rows) next[r.student_id] = {
        t: r.teacher_name ?? '', wd: r.weekday_slot ?? '', we: r.weekend_slot ?? '', ex: r.extra_slot ?? '',
        nt: parseNewTime(r.new_time),
      }
      setAssign(next)
      setHint(rows.length ? `저장된 배정 ${rows.length}건을 읽었어요. 고르면 바로 저장됩니다.` : '고르면 바로 저장됩니다.')
    } catch (e: any) {
      setHint('읽지 못했어요 — ' + (e?.message ?? '연결 실패'))
    }
    setLoading(false)
  }

  /** 학생 한 명의 배정을 저장한다 (고르는 즉시). 저장도 서버를 거친다 — 읽기와 같은 길이다. */
  async function save(st: Student, p: Pick3, track: Track) {
    setAssign((prev) => ({ ...prev, [st.id]: p }))
    try {
      const res = await apiFetch('/api/move-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: st.id, track, teacher: p.t, weekday: p.wd, weekend: p.we, extra: p.ex, newTime: p.nt ?? null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error ?? '저장하지 못했어요')
      setHint('저장했어요 · ' + st.name)
    } catch (e: any) {
      setHint('저장하지 못했어요 — ' + (e?.message ?? '연결 실패'))
    }
  }

  function setOne(st: Student, track: Track, part: 't' | 'wd' | 'we' | 'ex', value: string) {
    const cur = assign[st.id] ?? { t: '', wd: '', we: '', ex: '' }
    const p: Pick3 = { ...cur, [part]: value }
    // 선생님을 바꾸면 반과 토·일을 비운다 — 다른 선생님 타임이 남으면 엉뚱한 칸에 그려진다.
    // ★ 바뀔 시간(nt)은 **그대로 둔다.** 선생님과 시간은 따로 정하는 것이고,
    //   선생님만 바꿨다고 애써 맞춰 둔 시간이 사라지면 안 된다.
    if (part === 't') { p.wd = ''; p.we = ''; p.ex = '' }
    save(st, p, track)
  }

  /** 초등 판 — 바뀔 시간만 따로 저장한다 (비우면 지금 시간표 그대로). */
  function setTime(st: Student, nt: NewTime | null) {
    const cur = assign[st.id] ?? { t: '', wd: '', we: '', ex: '' }
    save(st, { ...cur, nt }, '초등')
  }

  // ── 학생 묶음
  const byGrade = useMemo(() => {
    const m: Record<string, Student[]> = {}
    for (const s of students) (m[s.grade ?? ''] ??= []).push(s)
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return m
  }, [students])

  /** 초등 판에 오르는 학생 — 초1~초5 (학년 → 이름 차례) */
  const elem = useMemo(() => {
    const order = (g: string | null) => GRADES_ELEM.indexOf((g ?? '') as any)
    return students.filter((s) => (GRADES_ELEM as readonly string[]).includes(s.grade ?? ''))
      .sort((a, b) => order(a.grade) - order(b.grade) || a.name.localeCompare(b.name, 'ko'))
  }, [students])

  /** 그 학생이 지금 다니는 시간 — '월·수·금 16:00(2교시)' 꼴로 */
  const nowText = useMemo(() => {
    const byStudent: Record<string, Sched[]> = {}
    for (const s of scheds) (byStudent[s.student_id] ??= []).push(s)
    const out: Record<string, string> = {}
    for (const [id, list] of Object.entries(byStudent)) {
      const byTime: Record<string, string[]> = {}
      for (const s of list) {
        const key = String(s.start_time).slice(0, 5) + '|' + s.periods
        ;(byTime[key] ??= []).push(s.day_of_week)
      }
      out[id] = Object.entries(byTime)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, days]) => {
          const [time, periods] = key.split('|')
          const ds = [...new Set(days)].sort((x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y))
          return `${ds.join('·')} ${time}(${periods}교시)`
        }).join(' · ')
    }
    return out
  }, [scheds])

  /** 그 학생이 수업하는 요일 */
  const daysOf = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const s of scheds) (out[s.student_id] ??= []).push(s.day_of_week)
    return out
  }, [scheds])

  if (allowed !== true) return (
    <div className="min-h-screen bg-gray-50">
      <Header title="진급 배정판" subtitle="중3 → 고등 · 초6 → 중등" />
      <div className="p-10 text-center text-gray-500">
        {allowed === null ? '불러오는 중…' : '이 화면을 볼 수 있는 선생님만 들어올 수 있어요. 원장님께 말씀해 주세요.'}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="진급 배정판" subtitle="중3 → 고등 · 초6 → 중등 · 초등 진급" />
      <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">

        <div className="flex gap-2">
          {(full ? (['고등', '중등', '초등'] as Track[]) : (['중등', '초등'] as Track[])).map((t) => (
            <button key={t} onClick={() => pickTab(t)}
              className={cx('px-4 py-2 rounded-xl text-sm font-bold border transition-all',
                tab === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200')}>
              {t === '고등' ? '중3 → 고등' : t === '중등' ? '초6 → 중등' : '초등 진급'}
              <span className="ml-1.5 font-normal opacity-70">
                {t === '고등' ? `${(byGrade['중3'] ?? []).length}명`
                  : t === '중등' ? `${(byGrade['초6'] ?? []).length}명`
                  : `${elem.length}명`}
              </span>
            </button>
          ))}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 text-xs text-gray-600 leading-relaxed">
          <b className="text-gray-800">여기서 고른 것은 계획입니다.</b> 저장해도 지금 시간표·담당·브리핑은
          그대로예요 — 진급할 때 옮기는 일은 따로 합니다. 학생과 시간표는 스터디체크에서 그대로 읽어 오니
          원생이 들어오고 나가면 저절로 맞습니다.
          {!full && (
            <span className="block mt-1">초등 담당 선생님께는 <b>「초6 → 중등」</b>과 <b>「초등 진급」</b>만 보여요 — 고등부 명단은 내려받지도 않습니다.</span>
          )}
          <span className="block mt-1 text-gray-400">{loading ? '불러오는 중…' : hint}</span>
        </div>

        {tab === '초등'
          ? <ElemBoard
              elem={elem} e6={byGrade['초6'] ?? []}
              assign={assign} nowText={nowText} daysOf={daysOf} scheds={scheds}
              onPick={(st, v) => setOne(st, '초등', 't', v)}
              onTime={setTime} />
          : tab === '고등'
          ? <HighBoard
              m3={byGrade['중3'] ?? []}
              others={students.filter((s) => s.grade !== '중3' && DRAFT_HIGH[keyOf(s.name, s.grade)])}
              assign={assign} nowText={nowText}
              onPick={(st, part, v) => setOne(st, '고등', part, v)} />
          : <MidBoard
              e6={byGrade['초6'] ?? []}
              mid={students.filter((s) => s.grade === '중1' || s.grade === '중2')}
              leaving={byGrade['중3'] ?? []}
              assign={assign} nowText={nowText} daysOf={daysOf} scheds={scheds}
              onPick={(st, v) => setOne(st, '중등', 't', v)} />}
      </div>
    </div>
  )
}

/* ────────────────────────── 중3 → 고등 ────────────────────────── */

function HighBoard({ m3, others, assign, nowText, onPick }: {
  m3: Student[]; others: Student[]
  assign: Record<string, Pick3>; nowText: Record<string, string>
  onPick: (st: Student, part: 't' | 'wd' | 'we' | 'ex', v: string) => void
}) {
  const all = [...m3, ...others]
  const got = (s: Student) => assign[s.id] ?? { t: '', wd: '', we: '', ex: '' }
  /** 그 묶음 인원 — 새 중3 + 지금 다니는 학생 */
  const cnt = (key: string, 평일: boolean) => {
    const f = (s: Student) => (평일 ? got(s).wd : got(s).we) === key
    return { m3: m3.filter(f).length, old: others.filter(f).length }
  }
  const odd = m3.concat(others).map((s) => {
    const p = got(s); const why = oddSaturday(p.t, p.wd, p.we)
    return why ? { s, why } : null
  }).filter((x): x is { s: Student; why: string } => !!x)

  return (
    <div className="space-y-5">
      {/* 지금 짜여 있는 모양 — 고를 때마다 다시 센다 */}
      <div className="bg-indigo-50 border-2 border-indigo-100 rounded-2xl px-4 py-3">
        <p className="text-xs font-bold text-indigo-900 mb-2"><i className="ti ti-sum align-[-0.125em]" /> 지금 짜여 있는 모양</p>
        <ul className="text-xs text-indigo-900 space-y-1">
          {HIGH_TEACHERS.map(({ name }) => {
            const keys = Object.keys(WD).filter((k) => WD[k].t === name && !WD[k].solo)
            if (keys.length === 0) return null
            const n3 = m3.filter((s) => got(s).t === name).length
            const nOld = others.filter((s) => got(s).t === name).length
            return (
              <li key={name}>
                <b>{name} 선생님 {n3 + nOld}명</b> — 지금 {nOld}명 + 새 중3 {n3}명
                {keys.filter((k) => cnt(k, true).m3 + cnt(k, true).old > 0).map((k) =>
                  ` · ${WD[k].label} ${cnt(k, true).m3 + cnt(k, true).old}명`).join('')}
              </li>
            )
          })}
          <li>
            <b>토 · 일</b> — {Object.keys(WE).filter((k) => cnt(k, false).m3 + cnt(k, false).old > 0)
              .map((k) => `${WE[k].label} ${cnt(k, false).m3 + cnt(k, false).old}명`).join(' · ') || '아직 없음'}
          </li>
          {(() => {
            const 부름 = Object.entries(EXTRA)
              .map(([k, g]) => [g.label, all.filter((s) => got(s).ex === k)] as [string, Student[]])
              .filter(([, v]) => v.length > 0)
            return 부름.length > 0
              ? <li key="extra"><b>추가 클리닉</b> — {부름.map(([label, v]) => `${label} ${v.length}명 (${v.map((s) => s.name).join(' · ')})`).join(' / ')}</li>
              : null
          })()}
          {(() => {
            const stay = m3.filter((s) => got(s).t === '김은수')
            return stay.length > 0 ? <li key="stay"><b>올라가지 않는 학생 {stay.length}명</b> — {stay.map((s) => s.name).join(' · ')}</li> : null
          })()}
          {(() => {
            const undone = m3.filter((s) => { const p = got(s); return p.t !== '김은수' && (!p.t || !p.wd || !p.we) })
            return undone.length > 0 ? <li key="undone" className="text-orange-700"><b>아직 안 정한 학생 {undone.length}명</b> — {undone.map((s) => s.name).join(' · ')}</li> : null
          })()}
          {odd.length > 0 && (
            <li className="text-orange-700">
              <b>살펴보실 줄 {odd.length}명</b> — {odd.map(({ s, why }) => `${s.name}(${why})`).join(' · ')}
            </li>
          )}
        </ul>
      </div>

      {/* 반 카드 */}
      {HIGH_TEACHERS.map(({ name, role }) => {
        const 평일키 = Object.keys(WD).filter((k) => WD[k].t === name)
        const 주말키 = Object.keys(WE).filter((k) => weekendOwner(k) === name)
        if (평일키.length === 0 && 주말키.length === 0) return null   // 채움쌤은 반을 맡지 않고 클리닉만
        return (
          <section key={name} className="bg-white border border-gray-100 rounded-2xl p-4">
            <div className="flex flex-wrap items-baseline gap-2 border-b-2 border-indigo-500 pb-1.5 mb-3">
              <h3 className="font-bold text-gray-800">{name} 선생님</h3>
              <span className="text-xs text-indigo-600 font-semibold">{role}</span>
            </div>
            {[{ keys: 평일키, 평일: true, cap: '평일 반' }, { keys: 주말키, 평일: false, cap: '토 · 일' }].map(({ keys, 평일, cap }) =>
              keys.length === 0 ? null : (
                <div key={cap} className="mb-3">
                  <p className="text-[11px] font-bold tracking-wider text-gray-400 mb-1.5">{cap}</p>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                    {keys.map((k) => {
                      const g = 평일 ? WD[k] : WE[k]
                      const n = cnt(k, 평일)
                      return (
                        <div key={k} className={cx('border rounded-xl p-3 min-w-0',
                          g.locked ? 'border-l-4 border-l-amber-500 border-gray-100' : 'border-gray-100')}>
                          <p className="text-sm font-bold text-gray-800">{g.label}</p>
                          <p className="text-[11px] text-gray-500">{g.det}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {n.m3 + n.old}명{n.m3 > 0 && ` · 새 중3 ${n.m3}명`}{g.locked && ` · ${g.locked}`}
                          </p>
                          <ul className="mt-1.5 pl-4 list-disc text-xs space-y-0.5">
                            {others.filter((s) => (평일 ? assign[s.id]?.wd : assign[s.id]?.we) === k)
                              .map((s) => <li key={s.id} className="text-gray-600">{s.grade} {s.name}</li>)}
                            {m3.filter((s) => (평일 ? assign[s.id]?.wd : assign[s.id]?.we) === k)
                              .map((s) => <li key={s.id} className="text-emerald-700 font-semibold">중3 {s.name}</li>)}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
          </section>
        )
      })}

      {/* 명단 */}
      <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-sm">중3 {m3.length}명 — 선생님 · 반 · 토·일</h3>
          <p className="text-[11px] text-gray-500">선생님을 고르면 그 선생님 타임만 아래 두 칸에 나와요.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-3 py-2 font-medium">학생</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">지금 다니는 시간</th>
                <th className="text-left px-3 py-2 font-medium">선생님</th>
                <th className="text-left px-3 py-2 font-medium">반</th>
                <th className="text-left px-3 py-2 font-medium">토 · 일</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">추가 클리닉</th>
              </tr>
            </thead>
            <tbody>
              {m3.map((s) => {
                const p = assign[s.id] ?? { t: '', wd: '', we: '', ex: '' }
                const stay = p.t === '김은수'
                const 반후보 = Object.entries(WD).filter(([, g]) => g.t === p.t && !g.solo)
                const 주말후보 = Object.entries(WE).filter(([k]) => weekendPickable(k, p.t))
                const 빈칸말 = stay ? '— 고등 반 없음' : p.t ? '— 안 정함' : '— 선생님 먼저'
                return (
                  <tr key={s.id} className={cx('border-b border-gray-50', stay && 'bg-gray-50')}>
                    <td className="px-3 py-2">
                      <b className={cx('text-[13px]', stay ? 'text-gray-400' : 'text-gray-800')}>{s.name}</b>
                      <span className="block text-[11px] text-gray-400">지금 {s.teacher_name ?? '—'} 선생님</span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{nowText[s.id] ?? '시간표 없음'}</td>
                    <td className="px-3 py-2">
                      <Sel value={p.t} unset={!p.t} onChange={(v) => onPick(s, 't', v)}
                        options={[['', '— 안 정함'], ...HIGH_PICKS.map((t) => [t, t === '김은수' ? '김은수 (중등 그대로)' : t] as [string, string])]} />
                    </td>
                    <td className="px-3 py-2">
                      <Sel value={p.wd} unset={!p.wd} disabled={!p.t || stay} onChange={(v) => onPick(s, 'wd', v)}
                        options={[['', 빈칸말], ...반후보.map(([k, g]) => [k, g.label + (g.locked ? ' (찬 자리)' : '')] as [string, string])]} />
                    </td>
                    <td className="px-3 py-2">
                      <Sel value={p.we} unset={!p.we} disabled={!p.t || stay} onChange={(v) => onPick(s, 'we', v)}
                        options={[['', 빈칸말], ...주말후보.map(([k, g]) => [k, g.label] as [string, string])]} />
                    </td>
                    <td className="px-3 py-2">
                      {/* 따로 부르는 자리 — 비워 두면 안 부른다 (원장님 2026-11-17) */}
                      <Sel value={p.ex} unset={!p.ex} disabled={stay} onChange={(v) => onPick(s, 'ex', v)}
                        options={[['', '— 안 부름'], ...Object.entries(EXTRA).map(([k, g]) => [k, g.label] as [string, string])]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 선생님별 시간표 */}
      <section className="space-y-3">
        <div>
          <h3 className="font-bold text-gray-800 text-sm">선생님별 시간표</h3>
          <p className="text-[11px] text-gray-500">흐린 글씨는 지금 다니는 고등학생, 초록은 새로 오는 중3이에요.
            같은 학생이 키움쌤 표와 채움쌤 표에 각각 나와요 — 수업과 클리닉이라서요.</p>
        </div>
        {HIGH_TEACHERS.map(({ name, role }) => (
          <div key={name} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-indigo-50 border-b border-gray-100 flex flex-wrap items-baseline gap-2">
              <h4 className="font-bold text-gray-800 text-sm">{name} 선생님</h4>
              <span className="text-[11px] text-indigo-600 font-semibold">{role}</span>
            </div>
            <div className="flex flex-wrap gap-4 p-3 items-start">
              {[{ days: DAYS_WD.filter((d) => worksOn(name, d)), rows: ROWS_WD, span: 30, cap: '평일 · 30분 칸' },
                { days: DAYS_WE.filter((d) => worksOn(name, d)), rows: ROWS_WE, span: 60, cap: '토 · 일' }]
                .map(({ days, rows, span, cap }) => days.length === 0 ? null : (
                  <div key={cap} className="min-w-0">
                    <p className="text-[10px] font-bold tracking-wider text-indigo-600 mb-1">{cap}</p>
                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                      <Grid who={name} days={days as unknown as string[]} rows={rows} span={span}
                        cell={(day, row) => ({
                          old: others.filter((s) => isAt(name, day, row, span, assign[s.id]?.wd, assign[s.id]?.we, assign[s.id]?.ex)),
                          m3: m3.filter((s) => isAt(name, day, row, span, assign[s.id]?.wd, assign[s.id]?.we, assign[s.id]?.ex)),
                        })} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

/** 요일 × 시각 격자 한 장 */
function Grid({ who, days, rows, span, cell }: {
  who: string; days: string[]; rows: string[]; span: number
  cell: (day: string, row: string) => { old: Student[]; m3: Student[] }
}) {
  return (
    <table className="text-[11px] border-collapse">
      <thead>
        <tr>
          <th className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-gray-400 font-medium">시각</th>
          {days.map((d) => <th key={d} className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-center text-gray-500 font-medium min-w-[92px]">{d}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row}>
            <th className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-right text-gray-400 font-normal whitespace-nowrap">{row}</th>
            {days.map((d) => {
              const { old, m3 } = cell(d, row)
              const n = old.length + m3.length
              return (
                <td key={d} className={cx('border border-gray-100 px-1.5 py-1 align-top',
                  n === 0 ? 'bg-white' : m3.length && old.length ? 'bg-orange-50' : m3.length ? 'bg-emerald-50' : 'bg-amber-50')}>
                  {n === 0 ? <span className="text-gray-300">빔</span> : (
                    <>
                      <span className="block font-bold text-gray-500">{n}명</span>
                      {old.length > 0 && <span className="block text-gray-500">{old.map((s) => s.name).join('·')}</span>}
                      {m3.length > 0 && <span className="block text-emerald-700 font-semibold">{m3.map((s) => s.name).join('·')}</span>}
                    </>
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ────────────────────────── 초6 → 중등 ────────────────────────── */

function MidBoard({ e6, mid, leaving, assign, nowText, daysOf, scheds, onPick }: {
  e6: Student[]; mid: Student[]; leaving: Student[]
  assign: Record<string, Pick3>; nowText: Record<string, string>
  daysOf: Record<string, string[]>; scheds: Sched[]
  onPick: (st: Student, v: string) => void
}) {
  /** 그 학생이 그 칸(요일·시각 30분)에 수업이 있나 — 지금 시간표 그대로 */
  const busy = useMemo(() => {
    const m = new Map<string, Set<string>>()   // studentId → '요일|분'
    for (const s of scheds) {
      const start = toMin(String(s.start_time).slice(0, 5))
      const end = start + Math.round(Number(s.periods || 0) * 60)
      const set = m.get(s.student_id) ?? new Set<string>()
      for (let t = start; t < end; t += 30) set.add(s.day_of_week + '|' + t)
      m.set(s.student_id, set)
    }
    return m
  }, [scheds])
  const at = (s: Student, day: string, row: string) => busy.get(s.id)?.has(day + '|' + toMin(row)) ?? false

  const 넘길이 = (s: Student) => assign[s.id]?.t ?? ''

  return (
    <div className="space-y-5">
      <div className="bg-indigo-50 border-2 border-indigo-100 rounded-2xl px-4 py-3">
        <p className="text-xs font-bold text-indigo-900 mb-2"><i className="ti ti-sum align-[-0.125em]" /> 지금 짜여 있는 모양</p>
        <ul className="text-xs text-indigo-900 space-y-1">
          {MID_PICKS.map((t) => {
            const 새로 = e6.filter((s) => 넘길이(s) === t)
            const 남는 = mid.filter((s) => s.teacher_name === t)
            const 빠지는 = leaving.filter((s) => s.teacher_name === t)
            if (새로.length === 0 && 남는.length === 0 && 빠지는.length === 0) return null
            return (
              <li key={t}>
                <b>{t} 선생님</b> — 새 초6 {새로.length}명 · 남는 중1·중2 {남는.length}명 · 빠지는 중3 {빠지는.length}명
                {새로.length > 0 && <span className="text-emerald-700"> ({새로.map((s) => s.name).join(' · ')})</span>}
              </li>
            )
          })}
          {(() => {
            const 안정함 = e6.filter((s) => !넘길이(s))
            return 안정함.length > 0 ? <li className="text-orange-700"><b>아직 안 정한 학생 {안정함.length}명</b> — {안정함.map((s) => s.name).join(' · ')}</li> : null
          })()}
          {(() => {
            const 걸림 = e6.map((s) => {
              const bad = clashesWithOff(넘길이(s), daysOf[s.id] ?? [])
              return bad.length > 0 ? `${s.name}(${넘길이(s)} 선생님 ${bad.join('·')}요일)` : null
            }).filter(Boolean)
            return 걸림.length > 0
              ? <li className="text-rose-700"><b>못 오시는 요일에 걸린 학생 {걸림.length}명</b> — {걸림.join(' · ')}</li>
              : null
          })()}
        </ul>
      </div>

      <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-sm">초6 {e6.length}명 — 넘길 선생님</h3>
          <p className="text-[11px] text-gray-500">초6은 <b>지금 쓰는 시간표를 그대로</b> 가져옵니다. 선생님만 고르면 돼요.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-3 py-2 font-medium">학생</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">지금 다니는 시간</th>
                <th className="text-left px-3 py-2 font-medium">넘길 선생님</th>
              </tr>
            </thead>
            <tbody>
              {e6.map((s) => {
                const t = 넘길이(s)
                const bad = clashesWithOff(t, daysOf[s.id] ?? [])
                return (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="px-3 py-2">
                      <b className="text-[13px] text-gray-800">{s.name}</b>
                      <span className="block text-[11px] text-gray-400">지금 {s.teacher_name ?? '—'} 선생님</span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{nowText[s.id] ?? '시간표 없음'}</td>
                    <td className="px-3 py-2">
                      <Sel value={t} unset={!t} onChange={(v) => onPick(s, v)}
                        options={[['', '— 안 정함'], ...MID_PICKS.map((x) => [x, x === '윤지혜' ? '윤지혜 (원장님 반 그대로)' : x] as [string, string])]} />
                      {bad.length > 0 && (
                        <span className="block text-[11px] text-rose-600 font-semibold mt-0.5">
                          {t} 선생님은 {bad.join('·')}요일에 안 계세요
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-bold text-gray-800 text-sm">선생님별 중등 시간표</h3>
          <p className="text-[11px] text-gray-500">
            흐린 글씨는 그대로 남는 중1·중2, <span className="line-through">가운뎃줄</span>은 빠지는 중3,
            초록은 새로 오는 초6이에요. 중3이 빠지는 자리에 초6이 들어갈 수 있는지 보세요.
          </p>
        </div>
        {MID_PICKS.map((t) => {
          const 남는 = mid.filter((s) => s.teacher_name === t)
          const 빠지는 = leaving.filter((s) => s.teacher_name === t)
          const 새로 = e6.filter((s) => 넘길이(s) === t)
          if (남는.length === 0 && 빠지는.length === 0 && 새로.length === 0) return null
          return (
            <div key={t} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-indigo-50 border-b border-gray-100 flex flex-wrap items-baseline gap-2">
                <h4 className="font-bold text-gray-800 text-sm">{t} 선생님</h4>
                <span className="text-[11px] text-gray-500">
                  남는 {남는.length}명 · 빠지는 중3 {빠지는.length}명 · 새 초6 {새로.length}명
                </span>
              </div>
              <div className="overflow-x-auto p-3">
                <table className="text-[11px] border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-gray-400 font-medium">시각</th>
                      {DAYS_WD.map((d) => (
                        <th key={d} className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-center text-gray-500 font-medium min-w-[100px]">
                          {d}{(clashesWithOff(t, [d]).length > 0) && <span className="block text-[10px] text-rose-500 font-normal">안 계심</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS_MID.map((row) => (
                      <tr key={row}>
                        <th className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-right text-gray-400 font-normal whitespace-nowrap">{row}</th>
                        {DAYS_WD.map((d) => {
                          const a = 남는.filter((s) => at(s, d, row))
                          const b = 빠지는.filter((s) => at(s, d, row))
                          const c = 새로.filter((s) => at(s, d, row))
                          const n = a.length + c.length
                          return (
                            <td key={d} className={cx('border border-gray-100 px-1.5 py-1 align-top',
                              n === 0 && b.length === 0 ? 'bg-white' : c.length ? 'bg-emerald-50' : 'bg-amber-50')}>
                              {n === 0 && b.length === 0 ? <span className="text-gray-300">빔</span> : (
                                <>
                                  <span className="block font-bold text-gray-500">{n}명{b.length > 0 && ` (중3 ${b.length}명 빠짐)`}</span>
                                  {a.length > 0 && <span className="block text-gray-500">{a.map((s) => s.name).join('·')}</span>}
                                  {b.length > 0 && <span className="block text-gray-300 line-through">{b.map((s) => s.name).join('·')}</span>}
                                  {c.length > 0 && <span className="block text-emerald-700 font-semibold">{c.map((s) => s.name).join('·')}</span>}
                                </>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

/* ────────────────────────── 초등 진급 (초1~초5 → 한 학년 위) ──────────────────────────
 * 원장님 2026-11-17 「초등학생들도 한학년 올라가면서 윤주희, 조윤희 강사 담당 학생들을
 *   다시 배정할거거든. 현재 담당 학생들 학년 올라가면서 배정할수 있도록 … 초등버전 하나더」
 *
 * 중등 판과 같은 꼴이다 — **선생님만** 고른다. 다른 점 둘:
 *   ① 부(部)를 옮기는 것이 아니라서 첫 제안이 **지금 담당 그대로**다. 바꿀 학생만 고치면 된다.
 *   ② 빠지는 자리는 중3 이 아니라 **중등으로 올라가는 초6** 이다.
 */

function ElemBoard({ elem, e6, assign, nowText, daysOf, scheds, onPick, onTime }: {
  elem: Student[]; e6: Student[]
  assign: Record<string, Pick3>; nowText: Record<string, string>
  daysOf: Record<string, string[]>; scheds: Sched[]
  onPick: (st: Student, v: string) => void
  onTime: (st: Student, nt: NewTime | null) => void
}) {
  /** 그 학생이 그 칸(요일·시각)에 수업이 있나 — 지금 시간표 그대로 */
  const busy = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of scheds) {
      const start = toMin(String(s.start_time).slice(0, 5))
      const end = start + Math.round(Number(s.periods || 0) * 60)
      const set = m.get(s.student_id) ?? new Set<string>()
      for (let t = start; t < end; t += 30) set.add(s.day_of_week + '|' + t)
      m.set(s.student_id, set)
    }
    return m
  }, [scheds])
  /**
   * 지금 시간표를 **요일+시작+교시 한 벌**로. 시간 칸의 기본값으로 쓴다.
   * ★ 한 학생이 서로 다른 시간대를 둘 이상 쓰면 한 벌로 못 줄이므로 null 이다
   *   (그런 학생은 「지금 그대로」만 두고, 바꾸시려면 직접 고르신다).
   */
  const nowTime = useMemo(() => {
    const byStudent = new Map<string, any[]>()
    for (const s of scheds) {
      byStudent.set(s.student_id, [...(byStudent.get(s.student_id) ?? []),
        { day: s.day_of_week, start: String(s.start_time).slice(0, 5), periods: Number(s.periods) }])
    }
    const out = new Map<string, NewTime | null>()
    for (const [id, list] of byStudent) out.set(id, parseNewTime(list))
    return out
  }, [scheds])

  const 바뀔시간 = (s: Student) => assign[s.id]?.nt ?? null
  /** 격자에 그릴 자리 — 바꾼 시간이 있으면 **그쪽**, 없으면 지금 시간표. */
  const at = (s: Student, day: string, row: string) => {
    const nt = 바뀔시간(s)
    if (nt) return newTimeAt(nt, day, row)
    return busy.get(s.id)?.has(day + '|' + toMin(row)) ?? false
  }
  /** 바꾼 시간이 걸리는 요일 — 「못 오시는 요일」을 그 시간으로 본다. */
  const 요일들 = (s: Student) => (바뀔시간(s) ? newTimeDays(바뀔시간(s)) : (daysOf[s.id] ?? []))

  const 맡을이 = (s: Student) => assign[s.id]?.t ?? ''
  /** 지금 담당과 달라졌나 — 눈에 띄게 해 둔다(바꾼 것만 보시면 된다) */
  const 바뀜 = (s: Student) => !!맡을이(s) && 맡을이(s) !== (s.teacher_name ?? '')
  /** 시간이 지금과 달라졌나 */
  const 시간바뀜 = (s: Student) => {
    const nt = 바뀔시간(s)
    return !!nt && !sameTime(nt, nowTime.get(s.id) ?? null)
  }

  return (
    <div className="space-y-5">
      <div className="bg-indigo-50 border-2 border-indigo-100 rounded-2xl px-4 py-3">
        <p className="text-xs font-bold text-indigo-900 mb-2"><i className="ti ti-sum align-[-0.125em]" /> 지금 짜여 있는 모양</p>
        <ul className="text-xs text-indigo-900 space-y-1">
          {ELEM_PICKS.map((t) => {
            const 맡는 = elem.filter((s) => 맡을이(s) === t)
            const 지금 = elem.filter((s) => (s.teacher_name ?? '') === t)
            const 올라감 = e6.filter((s) => (s.teacher_name ?? '') === t)
            if (맡는.length === 0 && 지금.length === 0 && 올라감.length === 0) return null
            const 들어옴 = 맡는.filter((s) => (s.teacher_name ?? '') !== t)
            const 나감 = 지금.filter((s) => 맡을이(s) !== t)
            return (
              <li key={t}>
                <b>{t} 선생님</b> — 맡을 학생 <b>{맡는.length}명</b>
                <span className="text-indigo-500"> (지금 {지금.length}명</span>
                {올라감.length > 0 && <span className="text-indigo-500"> · 중등으로 올라가는 초6 {올라감.length}명</span>}
                <span className="text-indigo-500">)</span>
                {들어옴.length > 0 && <span className="text-emerald-700"> · 새로 {들어옴.map((s) => s.name).join('·')}</span>}
                {나감.length > 0 && <span className="text-amber-700"> · 보냄 {나감.map((s) => s.name).join('·')}</span>}
              </li>
            )
          })}
          {(() => {
            const 안정함 = elem.filter((s) => !맡을이(s))
            return 안정함.length > 0
              ? <li className="text-orange-700"><b>아직 안 정한 학생 {안정함.length}명</b> — {안정함.map((s) => `${s.name}(지금 ${s.teacher_name ?? '—'})`).join(' · ')}</li>
              : null
          })()}
          {(() => {
            const 걸림 = elem.map((s) => {
              const bad = clashesWithOff(맡을이(s), 요일들(s))
              return bad.length > 0 ? `${s.name}(${맡을이(s)} 선생님 ${bad.join('·')}요일)` : null
            }).filter(Boolean)
            return 걸림.length > 0
              ? <li className="text-rose-700"><b>못 오시는 요일에 걸린 학생 {걸림.length}명</b> — {걸림.join(' · ')}</li>
              : null
          })()}
        </ul>
      </div>

      <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-sm">초1~초5 {elem.length}명 — 한 학년 올라간 뒤 맡을 선생님</h3>
          <p className="text-[11px] text-gray-500">
            처음에는 <b>지금 담당 그대로</b> 채워져 있어요 — <b>바꿀 학생만</b> 고치시면 됩니다.
            <b>시간</b>도 바꿀 수 있어요. 비워 두면 지금 쓰는 시간표를 그대로 가져옵니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-3 py-2 font-medium">학생</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">학년</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">지금 다니는 시간</th>
                <th className="text-left px-3 py-2 font-medium">맡을 선생님</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">바뀔 시간</th>
              </tr>
            </thead>
            <tbody>
              {elem.map((s) => {
                const t = 맡을이(s)
                const bad = clashesWithOff(t, 요일들(s))
                return (
                  <tr key={s.id} className={cx('border-b border-gray-50', (바뀜(s) || 시간바뀜(s)) && 'bg-emerald-50/50')}>
                    <td className="px-3 py-2">
                      <b className="text-[13px] text-gray-800">{s.name}</b>
                      <span className="block text-[11px] text-gray-400">지금 {s.teacher_name ?? '—'} 선생님</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                      {s.grade} <span className="text-gray-300">→</span> <b className="text-gray-800">{nextGrade(s.grade) ?? '—'}</b>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{nowText[s.id] ?? '시간표 없음'}</td>
                    <td className="px-3 py-2">
                      <Sel value={t} unset={!t} onChange={(v) => onPick(s, v)}
                        options={[['', '— 안 정함'], ...ELEM_PICKS.map((x) => [x, x] as [string, string])]} />
                      {바뀜(s) && <span className="block text-[11px] text-emerald-700 font-semibold mt-0.5">바뀜 · {s.teacher_name} → {t}</span>}
                      {bad.length > 0 && (
                        <span className="block text-[11px] text-rose-600 font-semibold mt-0.5">
                          {t} 선생님은 {bad.join('·')}요일에 안 계세요
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <TimePick now={nowTime.get(s.id) ?? null} value={바뀔시간(s)}
                        onChange={(nt) => onTime(s, nt)} />
                      {시간바뀜(s) && (
                        <span className="block text-[11px] text-emerald-700 font-semibold mt-0.5">
                          바뀜 · {newTimeText(nowTime.get(s.id) ?? null) || '지금 시간표'} → {newTimeText(바뀔시간(s))}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-bold text-gray-800 text-sm">선생님별 초등 시간표</h3>
          <p className="text-[11px] text-gray-500">
            흐린 글씨는 그대로 맡는 학생, 초록은 <span className="text-emerald-700 font-semibold">새로 오는 학생</span>,
            <span className="line-through"> 가운뎃줄</span>은 중등으로 올라가는 초6이에요.
            초6이 빠지는 자리에 누가 들어갈 수 있는지 보세요.
          </p>
        </div>
        {ELEM_PICKS.map((t) => {
          const 그대로 = elem.filter((s) => 맡을이(s) === t && (s.teacher_name ?? '') === t)
          const 새로 = elem.filter((s) => 맡을이(s) === t && (s.teacher_name ?? '') !== t)
          const 올라감 = e6.filter((s) => (s.teacher_name ?? '') === t)
          if (그대로.length === 0 && 새로.length === 0 && 올라감.length === 0) return null
          return (
            <div key={t} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-indigo-50 border-b border-gray-100 flex flex-wrap items-baseline gap-2">
                <h4 className="font-bold text-gray-800 text-sm">{t} 선생님</h4>
                <span className="text-[11px] text-gray-500">
                  그대로 {그대로.length}명 · 새로 {새로.length}명 · 올라가는 초6 {올라감.length}명
                </span>
              </div>
              <div className="overflow-x-auto p-3">
                <table className="text-[11px] border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-gray-400 font-medium">시각</th>
                      {DAYS_WD.map((d) => (
                        <th key={d} className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-center text-gray-500 font-medium min-w-[100px]">
                          {d}{(clashesWithOff(t, [d]).length > 0) && <span className="block text-[10px] text-rose-500 font-normal">안 계심</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS_ELEM.map((row) => (
                      <tr key={row}>
                        <th className="border border-gray-100 bg-gray-50 px-1.5 py-1 text-right text-gray-400 font-normal whitespace-nowrap">{row}</th>
                        {DAYS_WD.map((d) => {
                          const a = 그대로.filter((s) => at(s, d, row))
                          const b = 올라감.filter((s) => at(s, d, row))
                          const c = 새로.filter((s) => at(s, d, row))
                          const n = a.length + c.length
                          return (
                            <td key={d} className={cx('border border-gray-100 px-1.5 py-1 align-top',
                              n === 0 && b.length === 0 ? 'bg-white' : c.length ? 'bg-emerald-50' : 'bg-amber-50')}>
                              {n === 0 && b.length === 0 ? <span className="text-gray-300">빔</span> : (
                                <>
                                  <span className="block font-bold text-gray-500">{n}명{b.length > 0 && ` (초6 ${b.length}명 올라감)`}</span>
                                  {a.length > 0 && <span className="block text-gray-500">{a.map((s) => s.name).join('·')}</span>}
                                  {b.length > 0 && <span className="block text-gray-300 line-through">{b.map((s) => s.name).join('·')}</span>}
                                  {c.length > 0 && <span className="block text-emerald-700 font-semibold">{c.map((s) => s.name).join('·')}</span>}
                                </>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

/* ────────────────── 바뀔 시간 고르기 (초등 진급 · 원장님 2026-11-18) ──────────────────
 * **요일마다** 시작 시각과 교시를 고른다.
 *
 * ★ 처음엔 한 벌(요일 묶음 + 시각 하나)로 만들었다가 바로 고쳤다 — 원장님
 *   「시간표가 화2 목2 금5 이렇게 시간이 다르거든」. 재어 보니 초1~초5 50명 중
 *   **23명**이 요일마다 시각이 다르다. 한 벌로는 그 절반을 아예 못 적는다.
 *
 * ★ 비워 두면 **지금 시간표 그대로**다. 요일을 다 끄면 도로 비워진다.
 *   처음에는 지금 시간표가 흐리게 들어가 있고, 하나라도 건드리면 그때 「바꾼 것」이 된다.
 */

function TimePick({ now, value, onChange }: {
  now: NewTime | null
  value: NewTime | null
  onChange: (nt: NewTime | null) => void
}) {
  const 바꿈 = !!value && value.length > 0
  const 쓰는값: NewTime = value ?? now ?? []
  const 하루 = (d: string) => 쓰는값.find((x) => x.day === d) ?? null

  /** 그 요일을 켜고 끈다. 다 끄면 「지금 그대로」로 돌아간다. */
  const 요일누름 = (d: string) => {
    if (하루(d)) { onChange(withDay(쓰는값, d, null)); return }
    // 켤 때의 기본값 — 지금 시간표의 그 요일, 없으면 같은 학생의 다른 요일, 그것도 없으면 15:00 2교시
    const 본 = (now ?? []).find((x) => x.day === d) ?? 쓰는값[0] ?? (now ?? [])[0]
    onChange(withDay(쓰는값, d, { start: 본?.start ?? '15:00', periods: 본?.periods ?? 2 }))
  }
  const 고침 = (d: string, part: 'start' | 'periods', v: string) => {
    const 본 = 하루(d); if (!본) return
    onChange(withDay(쓰는값, d, { ...본, [part]: part === 'periods' ? Number(v) : v }))
  }

  return (
    <div className="space-y-1 min-w-[230px]">
      <div className="flex flex-wrap gap-0.5">
        {DAYS_WD.map((d) => {
          const on = !!하루(d)
          return (
            <button key={d} type="button" onClick={() => 요일누름(d)}
              className={cx('w-6 h-6 rounded-md text-[11px] font-bold border',
                on ? (바꿈 ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-100 text-gray-500 border-gray-200')
                   : 'bg-white text-gray-300 border-gray-200')}>
              {d}
            </button>
          )
        })}
        {바꿈 && (
          <button type="button" onClick={() => onChange(null)}
            className="text-[11px] text-gray-400 underline px-1">지금 그대로</button>
        )}
      </div>
      {쓰는값.length === 0
        ? <span className="block text-[11px] text-gray-400">요일을 눌러 고르세요</span>
        : 쓰는값.map((x) => (
          <div key={x.day} className="flex items-center gap-1">
            <span className={cx('text-[11px] w-4 text-center font-bold', 바꿈 ? 'text-emerald-700' : 'text-gray-400')}>{x.day}</span>
            <Sel value={x.start} unset={!바꿈}
              onChange={(v) => 고침(x.day, 'start', v)}
              options={ELEM_STARTS.map((t) => [t, t] as [string, string])} />
            <Sel value={String(x.periods)} unset={!바꿈}
              onChange={(v) => 고침(x.day, 'periods', v)}
              options={ELEM_PERIODS.map((t) => [String(t), t + '교시'] as [string, string])} />
          </div>
        ))}
    </div>
  )
}

/* ────────────────────────── 고르는 칸 ────────────────────────── */

function Sel({ value, options, onChange, unset, disabled }: {
  value: string; options: [string, string][]; onChange: (v: string) => void
  unset?: boolean; disabled?: boolean
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      className={cx('text-xs px-2 py-1 rounded-lg border max-w-full',
        disabled ? 'bg-gray-50 text-gray-300 border-gray-100'
          : unset ? 'bg-gray-50 text-gray-400 border-gray-200' : 'bg-white text-gray-800 border-gray-200')}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  )
}
