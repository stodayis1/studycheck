'use client'

/**
 * 매쓰홀릭 학습 이력을 **붙여넣어** 학습지 점수로 받아 적는 화면.
 *
 * 왜 (원장님 2026-10-29)
 *   「이걸 지금 손으로 일일이 입력하고 있는데」 — 학습지 점수는 한 달에 1,300건쯤 된다.
 *   매쓰홀릭엔 외부 연동 API 안내가 없지만 **목록을 드래그해 복사하면 글자가 그대로 나온다.**
 *
 * 원장님이 정하신 방향 (2026-10-29)
 *   「배정은 매쓰홀릭에서 하고 스터디체크는 받아적기만 하면 되지」
 *   → 붙일 학습지가 있으면 점수를 채우고, **없으면 새로 만든다.** 스터디체크가 스스로
 *     판단해서 만들지 않으므로 두 곳이 어긋날 일이 없다.
 *   실제로 주한 선생님 고1 10명은 8~9월 스터디체크 학습지가 **전원 0건**이었다.
 *   「주말복습 TEST」·「Daily Test」는 스터디체크의 단원·레벨 학습지와 이름이 아예 다르다.
 *
 * 반드시 지키는 것
 *   ① **바로 저장하지 않는다.** 읽은 것을 표로 먼저 보여 주고 원장님·선생님이 확인한 뒤에 넣는다.
 *   ② **동명이인은 자동으로 정하지 않는다** (학년으로만 갈린다).
 *      매쓰홀릭은 「정우찬2」처럼 꼬리 숫자로 가르는데 그 숫자가 누구인지는 매쓰홀릭만 안다.
 *   ③ **status 를 passed 로 만들지 않는다.** 초등 레벨학습지는 70점 미만을 passed 로 넘기면
 *      DB 트리거(worksheet_before_update)가 막는다. 점수만 적고(scored) 다음 행동은 사람이.
 *   ④ **재도전·오답유사를 자동 배정하지 않는다** (원장님 「그건 자동배정할 필요가 없어보여」).
 *      선생님들이 매쓰홀릭에서 그때그때 내시므로, 그것도 붙여넣기로 따라 들어온다.
 *   ⑤ **같은 걸 또 붙여넣어도 두 번 안 들어간다** — 지난주 것까지 통째로 복사해 오는 일이 생긴다.
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx, fetchAllRows } from '@/lib/utils'
import {
  parseMatholic, findStudents, rankWorksheets, isClearWinner, alreadyIn, isDailyTest,
  type MatholicRow, type ParseResult, type StudentLite, type WsCandidate,
} from '@/lib/matholic'

/**
 * 한 줄을 어떻게 처리할지. 사람이 바꿀 수 있다.
 *   daily — 학습일지의 데일리테스트 칸에 적는다 (학습지가 아니다)
 *   fill  — 이미 있는 학습지의 점수 칸을 채운다
 *   new   — 학습지를 새로 만들어 넣는다
 */
type Mode = 'daily' | 'fill' | 'new' | 'skip' | 'done'
interface Plan {
  row: MatholicRow
  /** 후보 학생들. 둘 이상이면 사람이 골라야 한다 */
  students: StudentLite[]
  studentId: string | null
  /** 그 학생의 학습지 중 붙일 만한 것들 (점수 높은 순) */
  candidates: WsCandidate[]
  wsId: string | null
  /** 데일리테스트일 때 적을 수업 기록 (class_sessions.id) */
  sessionId: string | null
  mode: Mode
  /** 왜 이렇게 골랐는지 — 화면에 그대로 보여 준다 */
  why: string
}

const 칩 = 'text-[10px] font-bold px-1.5 py-0.5 rounded-md'

export default function MatholicImportPage() {
  const { currentUser, canViewStudent } = useAuth()
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ daily: number; filled: number; created: number; skipped: number; failed: string[] } | null>(null)

  /** 붙여넣은 글자를 읽고, 학생과 학습지를 찾아 둔다. 저장은 하지 않는다. */
  async function handleRead() {
    setReading(true); setDone(null)
    try {
      const res = parseMatholic(text)
      setParsed(res)
      if (res.rows.length === 0) { setPlans([]); return }

      // ① 내가 볼 수 있는 학생만 — 서버 정책과 같은 기준(hooks/useAuth.canViewStudent)
      const all = await fetchAllRows<StudentLite & { is_active: boolean; on_leave: boolean }>(() =>
        supabase.from('students').select('id, name, grade, teacher_name, is_active, on_leave')
          .or('is_active.eq.true,on_leave.eq.true').order('id'))
      const mine = all.filter((s) => canViewStudent(s))

      // ② 후보 학생을 먼저 정하고, 그 학생들 학습지만 읽는다 (전체를 끌어오지 않는다)
      const found = res.rows.map((r) => findStudents(r.student, mine))
      const ids = [...new Set(found.flat().map((s) => s.id))]
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
      const parts = await Promise.all(chunks.map((chunk) =>
        fetchAllRows<WsCandidate>(() => supabase.from('student_worksheets')
          .select('id, student_id, grade_level, unit, unit_name, current_level, worksheet_type, status, score, assigned_at, submitted_at')
          .in('student_id', chunk).order('id'))))
      const byStudent = new Map<string, WsCandidate[]>()
      for (const w of parts.flat()) {
        const arr = byStudent.get(w.student_id) ?? []
        arr.push(w); byStudent.set(w.student_id, arr)
      }

      // 데일리테스트는 **그 날짜 그 학생의 수업 기록**에 적는다. 날짜만 읽어 온다.
      const dates = [...new Set(res.rows.filter(isDailyTest).map((r) => r.date))]
      const sessions = dates.length === 0 || ids.length === 0 ? [] : (await Promise.all(
        chunks.map((chunk) => fetchAllRows<{ id: string; student_id: string; session_date: string; daily_test_score: number | null }>(
          () => supabase.from('class_sessions').select('id, student_id, session_date, daily_test_score')
            .in('student_id', chunk).in('session_date', dates).order('id'))))).flat()
      const bySession = new Map(sessions.map((c) => [`${c.student_id}|${c.session_date}`, c]))

      setPlans(res.rows.map((row, i): Plan => {
        const students = found[i]
        if (students.length === 0) {
          return { row, students, studentId: null, candidates: [], wsId: null, sessionId: null, mode: 'skip',
            why: '스터디체크에 그 이름의 학생이 없어요 (또는 제 담당이 아니에요)' }
        }
        if (students.length > 1) {
          return { row, students, studentId: null, candidates: [], wsId: null, sessionId: null, mode: 'skip',
            why: `같은 이름이 ${students.length}명이에요 — 누구인지 골라 주세요` }
        }
        const sid = students[0].id

        // ★ 데일리테스트는 학습지로 넣지 않는다 (원장님 2026-10-29 「학습일지에 따로 있잖아」).
        //    학습지로도 넣으면 같은 점수가 두 군데 생겨 성취도·브리핑이 이중으로 센다.
        if (isDailyTest(row)) {
          const ses = bySession.get(`${sid}|${row.date}`)
          if (!ses) {
            return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: null, mode: 'skip',
              why: `${row.date} 수업 기록이 없어요 — 학습일지를 먼저 쓴 뒤에 넣어 주세요` }
          }
          if (ses.daily_test_score === row.score) {
            return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: ses.id, mode: 'done',
              why: '학습일지에 이미 같은 점수가 있어요' }
          }
          return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: ses.id, mode: 'daily',
            why: ses.daily_test_score == null ? '학습일지 데일리테스트 칸에 적습니다'
              : `학습일지에 ${ses.daily_test_score}점이 적혀 있어요 — ${row.score}점으로 바꿉니다` }
        }

        const list = byStudent.get(sid) ?? []
        // 이미 넣은 것인가 — 같은 점수·같은 날짜면 다시 넣지 않는다
        const dup = list.find((w) => alreadyIn(row, w))
        if (dup) return { row, students, studentId: sid, candidates: [dup], wsId: dup.id, sessionId: null, mode: 'done', why: '이미 들어가 있어요' }

        const ranked = rankWorksheets(row, list)
        if (isClearWinner(ranked)) {
          return { row, students, studentId: sid, candidates: ranked.map((r) => r.ws), wsId: ranked[0].ws.id,
            sessionId: null, mode: 'fill', why: ranked[0].why.join(' · ') }
        }
        return { row, students, studentId: sid, candidates: ranked.map((r) => r.ws), wsId: null, sessionId: null,
          mode: 'new', why: ranked.length ? '비슷한 것이 여럿이라 새로 만듭니다 (바꿀 수 있어요)' : '붙일 학습지가 없어 새로 만듭니다' }
      }))
    } finally { setReading(false) }
  }

  const count = useMemo(() => ({
    daily: plans.filter((p) => p.mode === 'daily').length,
    fill: plans.filter((p) => p.mode === 'fill').length,
    neo: plans.filter((p) => p.mode === 'new').length,
    skip: plans.filter((p) => p.mode === 'skip').length,
    done: plans.filter((p) => p.mode === 'done').length,
  }), [plans])

  function setPlan(i: number, patch: Partial<Plan>) {
    setPlans((prev) => prev.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  }

  /** 고른 대로 저장한다. 한 건이 실패해도 나머지는 계속 간다 — 실패한 것은 이름을 남긴다. */
  async function handleSave() {
    if (!confirm(`학습일지 데일리테스트 ${count.daily}건, 학습지 점수 채우기 ${count.fill}건, 학습지 새로 만들기 ${count.neo}건을 넣습니다. 계속할까요?`)) return
    setSaving(true)
    let daily = 0, filled = 0, created = 0
    const failed: string[] = []
    for (const p of plans) {
      const who = p.students.find((s) => s.id === p.studentId)
      const label = `${p.row.student} ${p.row.date} ${p.row.score}점`
      try {
        if (p.mode === 'daily' && p.sessionId) {
          // 학습일지의 데일리테스트 점수. 수업 기록은 **만들지 않는다** — 없으면 건너뛴다.
          // (출결·학부모 브리핑이 수업 기록을 보고 돌기 때문에 함부로 만들면 안 된다.)
          const { error } = await supabase.from('class_sessions')
            .update({ daily_test_score: p.row.score }).eq('id', p.sessionId)
          if (error) throw new Error(error.message)
          daily++
        } else if (p.mode === 'fill' && p.wsId) {
          // ★ status 는 scored 까지만. passed 로 올리면 초등 70점 미만이 트리거에 막힌다.
          const { error } = await supabase.from('student_worksheets')
            .update({ score: p.row.score, status: 'scored', submitted_at: `${p.row.date}T12:00:00+09:00` })
            .eq('id', p.wsId)
          if (error) throw new Error(error.message)
          filled++
        } else if (p.mode === 'new' && p.studentId) {
          const { error } = await supabase.from('student_worksheets').insert({
            student_id: p.studentId, subject: '수학',
            // 과정(공통수학2 …)은 스터디체크의 학년 표기와 달라서, 학생의 학년을 쓴다.
            grade_level: who?.grade ?? null,
            unit: p.row.course || p.row.kind || '매쓰홀릭',
            unit_name: p.row.title,
            current_level: p.row.level,
            worksheet_type: /오답유사/.test(p.row.title) || p.row.kind === '오답유사' ? 'similar' : 'main',
            status: 'scored', score: p.row.score,
            assigned_at: `${p.row.date}T12:00:00+09:00`,
            submitted_at: `${p.row.date}T12:00:00+09:00`,
            // 어디서 온 것인지 남긴다 — 되돌릴 때 이 글자로 찾는다.
            memo: `매쓰홀릭${p.row.right != null ? ` ${p.row.right}/${p.row.total}` : ''}`,
          })
          if (error) throw new Error(error.message)
          created++
        }
      } catch (e: any) { failed.push(`${label} — ${e?.message ?? '실패'}`) }
    }
    setSaving(false)
    setDone({ daily, filled, created, skipped: count.skip, failed })
    setPlans((prev) => prev.map((p) =>
      (p.mode === 'daily' || p.mode === 'fill' || p.mode === 'new' ? { ...p, mode: 'done' as Mode, why: '넣었어요' } : p)))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="매쓰홀릭 붙여넣기" subtitle="학습 이력을 복사해 학습지 점수로 받아 적어요" showBack
        action={<Link href="/teacher/assignments" className="text-xs font-semibold text-gray-500">학습지관리</Link>} />

      <div className="p-4 space-y-4 max-w-5xl mx-auto">
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-700 mb-1.5">① 매쓰홀릭 학습 이력 목록을 드래그해서 복사한 뒤 여기에 붙여넣어요</p>
          <p className="text-[11px] text-gray-400 mb-2">
            학생 이름 · 날짜 · 학습지 이름 · 맞은 개수 · 점수가 같이 복사돼야 해요. 여러 학생을 한꺼번에 넣어도 됩니다.
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8}
            placeholder={'강보라\n(2/2)\n\n09/03 20:44\n학습지\n공통수학2 (2022 개정)\n고1A Daily Test 0903 (lv2.5)\n12/20\n60점'}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={handleRead} disabled={!text.trim() || reading}
              className="text-xs font-bold px-3.5 py-2 rounded-xl disabled:opacity-40"
              style={{ background: '#EAF3DE', color: '#3B6D11', border: '1px solid #9FE1CB' }}>
              {reading ? '읽는 중…' : '읽어 보기'}
            </button>
            {text.trim() && (
              <button onClick={() => { setText(''); setParsed(null); setPlans([]); setDone(null) }}
                className="text-xs font-semibold px-3 py-2 rounded-xl text-gray-500 border border-gray-200">지우기</button>
            )}
          </div>
        </div>

        {parsed && (
          <div className="rounded-2xl bg-white border border-gray-200 p-4 space-y-2">
            <p className="text-xs font-bold text-gray-700">② 읽은 것 — 확인하고 고쳐 주세요</p>
            <div className="flex flex-wrap gap-1.5">
              <span className={cx(칩, 'bg-amber-50 text-amber-700')}>학습일지 데일리테스트 {count.daily}</span>
              <span className={cx(칩, 'bg-green-50 text-green-700')}>학습지 점수 채우기 {count.fill}</span>
              <span className={cx(칩, 'bg-blue-50 text-blue-700')}>새로 만들기 {count.neo}</span>
              <span className={cx(칩, 'bg-gray-100 text-gray-600')}>이미 들어감 {count.done}</span>
              <span className={cx(칩, 'bg-red-50 text-red-600')}>안 넣음 {count.skip}</span>
              {parsed.empty.length > 0 && (
                <span className={cx(칩, 'bg-gray-100 text-gray-500')}>이력 없음 {parsed.empty.join(', ')}</span>
              )}
            </div>

            {parsed.skipped.length > 0 && (
              <div className="rounded-xl p-2.5" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                <p className="text-[11px] font-bold mb-1" style={{ color: '#991B1B' }}>못 읽은 줄 {parsed.skipped.length}개 — 그냥 버리지 않고 보여 드려요</p>
                {parsed.skipped.map((s, i) => (
                  <p key={i} className="text-[11px]" style={{ color: '#7F1D1D' }}>{s.line}번째 줄: {s.text} <span className="opacity-70">({s.why})</span></p>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              {plans.map((p, i) => (
                <div key={i} className={cx('rounded-xl border p-2.5',
                  p.mode === 'skip' ? 'bg-red-50 border-red-200'
                    : p.mode === 'done' ? 'bg-gray-50 border-gray-200'
                      : p.mode === 'daily' ? 'bg-amber-50 border-amber-200'
                        : p.mode === 'new' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200')}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-900">{p.row.student}</span>
                    <span className="text-[11px] text-gray-500">{p.row.date}</span>
                    <span className="text-[11px] text-gray-700 flex-1 min-w-0 truncate">{p.row.title}</span>
                    <span className="text-xs font-black" style={{ color: p.row.score >= 85 ? '#16a34a' : p.row.score >= 70 ? '#712B13' : '#dc2626' }}>
                      {p.row.score}점
                    </span>
                    {p.row.right != null && <span className="text-[10px] text-gray-400">{p.row.right}/{p.row.total}</span>}
                  </div>

                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {/* 동명이인이면 여기서 고른다 — 혼자 정하지 않는다 */}
                    {p.students.length > 1 && (
                      <select value={p.studentId ?? ''} onChange={(e) => {
                        const sid = e.target.value || null
                        setPlan(i, { studentId: sid, mode: sid ? 'new' : 'skip', wsId: null,
                          why: sid ? '고르셨어요 — 새로 만듭니다' : '누구인지 골라 주세요' })
                      }} className="text-[11px] px-2 py-1 rounded-lg border border-gray-300 bg-white">
                        <option value="">누구인가요?</option>
                        {p.students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.grade} · {s.teacher_name})</option>)}
                      </select>
                    )}

                    {p.mode === 'daily' && (
                      <span className={cx(칩, 'bg-amber-100 text-amber-800')}>학습일지 · 데일리테스트</span>
                    )}
                    {p.mode !== 'done' && p.mode !== 'daily' && p.studentId && (
                      <>
                        <select value={p.wsId ?? ''} onChange={(e) => {
                          const id = e.target.value || null
                          setPlan(i, { wsId: id, mode: id ? 'fill' : 'new', why: id ? '고르셨어요' : '새로 만듭니다' })
                        }} className="text-[11px] px-2 py-1 rounded-lg border border-gray-300 bg-white max-w-[22rem]">
                          <option value="">➕ 새로 만들기</option>
                          {p.candidates.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.unit_name || w.unit}{w.current_level != null ? ` Lv${w.current_level}` : ''}
                              {w.score != null ? ` (지금 ${w.score}점)` : ' (점수 없음)'}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => setPlan(i, { mode: p.mode === 'skip' ? 'new' : 'skip', why: p.mode === 'skip' ? '다시 넣습니다' : '빼기로 하셨어요' })}
                          className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-300 bg-white text-gray-600">
                          {p.mode === 'skip' ? '다시 넣기' : '빼기'}
                        </button>
                      </>
                    )}
                    <span className="text-[11px] text-gray-500">{p.why}</span>
                  </div>
                </div>
              ))}
            </div>

            {(count.daily > 0 || count.fill > 0 || count.neo > 0) && (
              <button onClick={handleSave} disabled={saving}
                className="w-full text-sm font-bold py-2.5 rounded-xl disabled:opacity-40"
                style={{ background: '#9FE1CB', color: '#0f3d2e' }}>
                {saving ? '넣는 중…' : `③ ${count.daily + count.fill + count.neo}건 넣기`}
              </button>
            )}
          </div>
        )}

        {done && (
          <div className="rounded-2xl p-4" style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC' }}>
            <p className="text-xs font-bold" style={{ color: '#166534' }}>
              끝났어요 — 학습일지 데일리테스트 {done.daily}건 · 학습지 점수 채움 {done.filled}건 ·
              학습지 새로 만듦 {done.created}건 · 안 넣음 {done.skipped}건
            </p>
            {done.failed.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] font-bold" style={{ color: '#991B1B' }}>실패 {done.failed.length}건</p>
                {done.failed.map((f, i) => <p key={i} className="text-[11px]" style={{ color: '#7F1D1D' }}>{f}</p>)}
              </div>
            )}
            <p className="text-[11px] mt-2" style={{ color: '#3F6212' }}>
              넣은 것은 학습지관리에서 바로 보여요. 점수만 적어 둔 상태(「채점됨」)라, 레벨업·완료 같은 다음 행동은 선생님이 고르시면 돼요.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
