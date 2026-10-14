'use client'

// 학생 출결관리 — 한 달치를 한 화면에서 본다 (원장님 2026-10-14).
//
// 왜 만들었나
//   「언제 결석한 것을 언제 보강했나」가 수학OPS 에만 있어서, 담당 선생님이 보려면
//   건너가야 했다. 수업 횟수·대체수업·추가수업도 흩어져 있었다. 한자리에 모은다.
//
// 보강·대체·추가는 OPS 가 들고 있어 서버(/api/attendance-overview)를 거쳐 읽는다.

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { mainTeacherOf } from '@/lib/teachers'

interface Makeup { absentDate: string | null; makeupDate: string | null; makeupTime: string | null; state: string }
interface Extra { date: string; time: string | null; state: string; classType: string; originalDate: string | null; targetMonth: string | null }
interface Row {
  id: string; name: string; grade: string; teacherName: string | null; linked: boolean
  regular: { done: number; absent: number; examAbsent: number; blank: number; total: number }
  makeups: Makeup[]; substitutes: Extra[]; extras: Extra[]
}

const MK_STATE: Record<string, { text: string; color: string; bg: string }> = {
  done: { text: '보강 완료', color: '#27500A', bg: '#EAF3DE' },
  planned: { text: '보강 예정', color: '#0f3460', bg: '#F2F8FD' },
  waiting: { text: '날짜 미정', color: '#633806', bg: '#FAEEDA' },
  noshow: { text: '보강도 결석', color: '#991b1b', bg: '#FAECE7' },
  cancelled: { text: '취소', color: '#6b7280', bg: '#f3f4f6' },
}

const md = (d?: string | null) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '미정')
const hm = (t?: string | null) => (t ? String(t).slice(0, 5) : '')

export default function AttendancePage() {
  const { currentUser, canViewStudent, isAdmin } = useAuth()
  const [month, setMonth] = useState(() => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7))
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [only, setOnly] = useState<'' | 'absent' | 'extra' | 'sub'>('')

  useEffect(() => {
    setLoading(true); setErr(null)
    apiFetch(`/api/attendance-overview?month=${month}`)
      .then((r) => r.json())
      .then((d) => { if (d?.rows) setRows(d.rows); else setErr(d?.error ?? '읽지 못했어요') })
      .catch(() => setErr('읽지 못했어요'))
      .finally(() => setLoading(false))
  }, [month])

  // 일반 강사는 본인 학생만. 주임·관리자는 useAuth 규칙을 그대로 따른다.
  const mine = useMemo(() => rows.filter((r) =>
    canViewStudent({ grade: r.grade, teacher_name: r.teacherName })), [rows, currentUser])

  const shown = mine.filter((r) =>
    only === 'absent' ? r.regular.absent > 0
      : only === 'extra' ? r.extras.length > 0
        : only === 'sub' ? r.substitutes.length > 0
          : true)

  const byTeacher = useMemo(() => {
    const g = new Map<string, Row[]>()
    for (const r of shown) {
      const t = mainTeacherOf(r.teacherName) || '담당 없음'
      g.set(t, [...(g.get(t) ?? []), r])
    }
    return [...g].sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  }, [shown])

  const sum = shown.reduce((a, r) => ({
    done: a.done + r.regular.done, absent: a.absent + r.regular.absent,
    mk: a.mk + r.makeups.filter((m) => m.state === 'done').length,
    wait: a.wait + r.makeups.filter((m) => m.state === 'waiting' || m.state === 'planned').length,
    extra: a.extra + r.extras.length, sub: a.sub + r.substitutes.length,
  }), { done: 0, absent: 0, mk: 0, wait: 0, extra: 0, sub: 0 })

  const noMakeup = (r: Row) => r.regular.absent - r.makeups.filter((m) => m.state !== 'cancelled').length

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <Header title="학생 출결관리" subtitle="수업 횟수 · 결석과 보강 · 대체수업 · 추가수업" />
      <div className="p-4 max-w-5xl mx-auto">

        <div className="flex gap-2 flex-wrap items-center mb-3">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg" />
          {([['', '전체'], ['absent', '결석 있는 학생'], ['sub', '대체수업'], ['extra', '추가수업']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setOnly(k as any)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border"
              style={only === k
                ? { background: '#993C1D', color: '#fff', borderColor: '#993C1D' }
                : { background: '#fff', color: '#4b5563', borderColor: '#e5e7eb' }}>
              {label}
            </button>
          ))}
        </div>

        {!loading && !err && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            {[
              ['수업함', sum.done, '#27500A', '#EAF3DE'],
              ['결석', sum.absent, '#991b1b', '#FAECE7'],
              ['보강 완료', sum.mk, '#0f3460', '#F2F8FD'],
              ['보강 대기', sum.wait, '#633806', '#FAEEDA'],
              ['대체수업', sum.sub, '#085041', '#F0FBF7'],
              ['추가수업', sum.extra, '#4c1d95', '#F5F3FF'],
            ].map(([label, n, color, bg]) => (
              <div key={label as string} className="rounded-xl px-3 py-2.5 text-center" style={{ background: bg as string }}>
                <p className="text-[11px]" style={{ color: color as string }}>{label as string}</p>
                <p className="text-lg font-bold" style={{ color: color as string }}>{n as number}</p>
              </div>
            ))}
          </div>
        )}

        {loading ? <p className="text-sm text-gray-400 py-10 text-center">불러오는 중...</p>
          : err ? <p className="text-sm text-red-600 py-10 text-center">{err}</p>
            : shown.length === 0 ? <p className="text-sm text-gray-400 py-10 text-center">해당하는 학생이 없어요</p>
              : (
                <div className="space-y-4">
                  {byTeacher.map(([teacher, list]) => (
                    <div key={teacher}>
                      <p className="text-xs font-bold text-gray-500 mb-1.5">{teacher} <span className="font-normal text-gray-400">{list.length}명</span></p>
                      <div className="space-y-1">
                        {list.map((r) => {
                          const gap = noMakeup(r)
                          const isOpen = open === r.id
                          return (
                            <div key={r.id} className="rounded-xl border border-gray-100">
                              <button onClick={() => setOpen(isOpen ? null : r.id)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left flex-wrap">
                                <span className="text-sm font-bold text-gray-800">{r.name}</span>
                                <span className="text-[11px] text-gray-400">{r.grade}</span>
                                <span className="text-[11px] text-gray-600 ml-auto">수업 {r.regular.done}회</span>
                                {r.regular.absent > 0 && (
                                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                                    style={{ background: '#FAECE7', color: '#991b1b' }}>결석 {r.regular.absent}</span>
                                )}
                                {gap > 0 && (
                                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                                    style={{ background: '#FAEEDA', color: '#633806' }}>보강 안 잡힘 {gap}</span>
                                )}
                                {r.substitutes.length > 0 && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded-md"
                                    style={{ background: '#F0FBF7', color: '#085041' }}>대체 {r.substitutes.length}</span>
                                )}
                                {r.extras.length > 0 && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded-md"
                                    style={{ background: '#F5F3FF', color: '#4c1d95' }}>추가 {r.extras.length}</span>
                                )}
                                {!r.linked && <span className="text-[11px] text-gray-400">OPS 연결 없음</span>}
                                <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'} text-gray-300`} />
                              </button>

                              {isOpen && (
                                <div className="px-3 pb-3 text-[11px] space-y-2.5">
                                  <div className="text-gray-500">
                                    정규 {r.regular.total}회 — 수업 {r.regular.done} · 결석 {r.regular.absent}
                                    {r.regular.examAbsent > 0 && ` · 시험기간 결석 ${r.regular.examAbsent}`}
                                    {r.regular.blank > 0 && ` · 출결 미입력 ${r.regular.blank}`}
                                  </div>

                                  {r.makeups.length > 0 && (
                                    <div>
                                      <p className="font-bold text-gray-700 mb-1">결석 → 보강</p>
                                      {r.makeups.map((m, i) => {
                                        const st = MK_STATE[m.state] ?? { text: m.state, color: '#444', bg: '#eee' }
                                        return (
                                          <div key={i} className="flex gap-2 items-center py-0.5">
                                            <span className="text-gray-600 w-12">{md(m.absentDate)} 결석</span>
                                            <span className="text-gray-300">→</span>
                                            <span className="font-semibold text-gray-800">{md(m.makeupDate)} {hm(m.makeupTime)}</span>
                                            <span className="px-1.5 py-0.5 rounded-md font-bold"
                                              style={{ background: st.bg, color: st.color }}>{st.text}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}

                                  {r.regular.absent > 0 && r.makeups.length === 0 && (
                                    <p style={{ color: '#633806' }}>
                                      결석 {r.regular.absent}건의 보강이 아직 안 잡혔어요. 보강 예약 안내는 매주 금요일에 나갑니다.
                                    </p>
                                  )}

                                  {r.substitutes.length > 0 && (
                                    <div>
                                      <p className="font-bold text-gray-700 mb-1">대체수업 — 수업을 다른 날로 옮긴 것</p>
                                      {r.substitutes.map((x, i) => (
                                        <div key={i} className="flex gap-2 items-center py-0.5">
                                          <span className="text-gray-600 w-12">{md(x.originalDate)} 수업</span>
                                          <span className="text-gray-300">→</span>
                                          <span className="font-semibold text-gray-800">{md(x.date)} {hm(x.time)}</span>
                                          <span className="text-gray-400">{x.state === 'done' ? '완료' : '예정'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {r.extras.length > 0 && (
                                    <div>
                                      <p className="font-bold text-gray-700 mb-1">추가수업 — 그 달 횟수를 채우려고 더 한 수업</p>
                                      {r.extras.map((x, i) => (
                                        <div key={i} className="flex gap-2 items-center py-0.5">
                                          <span className="font-semibold text-gray-800 w-16">{md(x.date)} {hm(x.time)}</span>
                                          {x.targetMonth && <span className="text-gray-500">{Number(x.targetMonth.slice(5, 7))}월분</span>}
                                          <span className="text-gray-400">{x.state === 'done' ? '완료' : '예정'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

        <p className="text-[11px] text-gray-400 mt-6 leading-relaxed">
          보강·대체수업·추가수업은 수학OPS 에 기록된 것을 그대로 읽어 옵니다.
          결석과 보강은 <b>결석한 날짜</b>로 짝지어집니다.
          {isAdmin() ? '' : ' 담당하시는 학생만 보입니다.'}
        </p>
      </div>
    </div>
  )
}
