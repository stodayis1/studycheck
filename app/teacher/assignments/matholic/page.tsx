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
import { unitNameBeside } from '@/lib/worksheetTitle'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx, fetchAllRows } from '@/lib/utils'
import {
  parseMatholic, findStudents, rankWorksheets, isClearWinner, alreadyIn, isDailyTest, coreTestRound, isEnoughOne, needsLevel, worksheetTypeOf, parseWorksheetTitle, pickByRule, pickSessionForDaily, DAILY_MAX_GAP_DAYS, resolveUnit, gradeFromCourse,
  isWrongNote, wrongNoteFix, prevLevelOf, matchTextbook, nameDiffers, isTextbookLinked, levelForInsert, DEFAULT_LEVEL,
  isDiagnostic, parseDiagnosticTitle,
  type NameRules, type SessionLite, type ConceptRow, type ResolvedUnit, type MatholicRow, type ParseResult, type StudentLite, type WsCandidate, type DiagnosticParts,
} from '@/lib/matholic'
import { planRow, type MatholicPlan as Plan, type Mode, type PlanContext } from '@/lib/matholicPlan'

// 한 줄을 어디에 넣을지 정하는 **판단**은 lib/matholicPlan.ts 에 있다 — 화면과 스크립트가
// 같은 함수를 쓰기 위해서다 (원장님 2026-11-07 「붙여넣기 하는 그 과정자체도 불필요하지 않겠니」).
// 여기서는 읽어 오기와 저장만 한다.

const 칩 = 'text-[10px] font-bold px-1.5 py-0.5 rounded-md'

export default function MatholicImportPage() {
  const { currentUser, canViewStudent } = useAuth()
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  /**
   * 시중교재·교과서 이름 목록. 제목에 이 이름이 있으면 **쌍둥이 학습지**다
   * (원장님 2026-11-02 「레벨이 없어도 시중교재나 교과서가 붙어있으면 쌍둥이 학습지로」).
   * ★ 코드에 박지 않고 `textbook_catalog` 를 읽는다 — 선생님이 교재를 새로 등록하면
   *   그 이름도 저절로 걸려야 한다.
   */
  const [books, setBooks] = useState<string[]>([])
  const [done, setDone] = useState<{ daily: number; core: number; exam: number; filled: number; created: number; skipped: number; failed: string[] } | null>(null)

  /** 붙여넣은 글자를 읽고, 학생과 학습지를 찾아 둔다. 저장은 하지 않는다. */
  async function handleRead() {
    setReading(true); setDone(null)
    try {
      // 동명이인 규칙은 코드가 아니라 설정에 둔다 (원장님이 직접 고치실 수 있게).
      //   app_settings.key = 'matholic_name_rules', value = { "이름2": "강사이름" }
      const { data: setting } = await supabase.from('app_settings')
        .select('value').eq('key', 'matholic_name_rules').maybeSingle()
      const rules: NameRules = (setting?.value as any) ?? {}

      // 개념 사전 — 선생님이 소개념·중단원·대단원 어느 이름으로 쓰셔도 여기서 찾아 올린다
      // (원장님 2026-10-29 「그 제목을 쓰면 너가 알아서 매칭해서 붙여줘야지」).
      const concepts = await fetchAllRows<ConceptRow>(() =>
        supabase.from('concepts').select('grade, semester, chapter, sub_chapter, concept_name').order('id'))

      const res = parseMatholic(text)
      setParsed(res)
      if (res.rows.length === 0) { setPlans([]); return }

      // ① 내가 볼 수 있는 학생만 — 서버 정책과 같은 기준(hooks/useAuth.canViewStudent)
      const all = await fetchAllRows<StudentLite & { is_active: boolean; on_leave: boolean }>(() =>
        supabase.from('students').select('id, name, grade, teacher_name, is_active, on_leave, is_test')
          .or('is_active.eq.true,on_leave.eq.true').order('id'))
      const mine = all.filter((s) => canViewStudent(s))

      // 교재 이름 목록. 안 쓰는 교재(is_active=false)도 읽는다 — 옛 제목에 적힌 이름도
      // 쌍둥이로 알아봐야 한다. 이름만 읽으므로 가볍다(2026-11-02 기준 98건).
      const catalog = await fetchAllRows<{ textbook_name: string | null }>(() =>
        supabase.from('textbook_catalog').select('textbook_name').order('textbook_name'))
      const bookNames = [...new Set(catalog.map((b) => String(b.textbook_name ?? '').trim()).filter(Boolean))]
      setBooks(bookNames)

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

      // 데일리테스트는 그 학생의 수업 기록에 적는다. 그날 수업이 없으면 **그 뒤** 가장
      // 가까운 수업에 붙이므로(집에서 풀고 다음 수업에 가져오는 경우), 날짜 하나가 아니라
      // 그 뒤 2주까지를 같이 읽어 온다.
      const dates = [...new Set(res.rows.filter(isDailyTest).map((r) => r.date))].sort()
      const until = dates.length
        ? new Date(Date.parse(dates[dates.length - 1]) + DAILY_MAX_GAP_DAYS * 86400_000).toISOString().slice(0, 10)
        : ''
      const sessions = dates.length === 0 || ids.length === 0 ? [] : (await Promise.all(
        chunks.map((chunk) => fetchAllRows<SessionLite>(
          () => supabase.from('class_sessions').select('id, student_id, session_date, daily_test_score')
            .in('student_id', chunk).gte('session_date', dates[0]).lte('session_date', until).order('id'))))).flat()
      const sessionsOf = new Map<string, SessionLite[]>()
      for (const c of sessions) {
        const arr = sessionsOf.get(c.student_id) ?? []
        arr.push(c); sessionsOf.set(c.student_id, arr)
      }

      // 코어테스트도 이미 들어간 것을 먼저 읽는다 — 같은 날 같은 회차를 두 번 넣지 않는다.
      const coreDates = [...new Set(res.rows.filter((r) => coreTestRound(r)).map((r) => r.date))]
      const cores = coreDates.length === 0 || ids.length === 0 ? [] : (await Promise.all(
        chunks.map((chunk) => fetchAllRows<{ student_id: string; exam_date: string; title: string | null; score: number | null }>(
          () => supabase.from('exams').select('id, student_id, exam_date, title, score')
            .eq('exam_type', '코어테스트').in('student_id', chunk).in('exam_date', coreDates).order('id'))))).flat()
      const coreByKey = new Map(cores.map((e) => [`${e.student_id}|${e.exam_date}|${e.title ?? ''}`, e.score]))

      // 진단평가도 같은 날 같은 단원을 두 번 넣지 않는다 — 하루에 두 번 돌릴 수 있어서다
      // (원장님 2026-11-06, 초등 저녁 7시 30분 · 중등 밤 10시).
      const examDates = [...new Set(res.rows.filter((r) => isDiagnostic(r)).map((r) => r.date))]
      const exams = examDates.length === 0 || ids.length === 0 ? [] : (await Promise.all(
        chunks.map((chunk) => fetchAllRows<{ student_id: string; exam_date: string; unit_name: string | null; score: number | null }>(
          () => supabase.from('exams').select('id, student_id, exam_date, unit_name, score')
            .eq('exam_type', '진단평가').in('student_id', chunk).in('exam_date', examDates).order('id'))))).flat()
      const examByKey = new Map(exams.map((e) => [`${e.student_id}|${e.exam_date}|${e.unit_name ?? ''}`, e.score]))

      // 판단은 lib/matholicPlan.ts 한 곳에서 한다. 여기서 읽어 온 것들을 그대로 넘긴다.
      const ctx: PlanContext = { mine, rules, books: bookNames, concepts,
        wsByStudent: byStudent, sessionsOf, coreByKey, examByKey }
      setPlans(res.rows.map((row) => planRow(row, ctx)))
    } finally { setReading(false) }
  }

  const count = useMemo(() => ({
    daily: plans.filter((p) => p.mode === 'daily').length,
    core: plans.filter((p) => p.mode === 'core').length,
    exam: plans.filter((p) => p.mode === 'exam').length,
    excluded: plans.filter((p) => p.mode === 'excluded').length,
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
    if (!confirm(`학습일지 데일리테스트 ${count.daily}건, 코어테스트 ${count.core}건, 진단평가 ${count.exam}건, 학습지 점수 채우기 ${count.fill}건, 학습지 새로 만들기 ${count.neo}건을 넣습니다. 계속할까요?`)) return
    setSaving(true)
    let daily = 0, core = 0, exam = 0, filled = 0, created = 0
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
        } else if (p.mode === 'core' && p.studentId && p.coreRound) {
          // 평가관리의 코어테스트. 점수는 백분율로 적는다 (화면이 그렇게 쓰고 있다 — 만점 100).
          const { error } = await supabase.from('exams').insert({
            student_id: p.studentId, exam_type: '코어테스트', exam_date: p.row.date,
            title: p.coreRound, score: p.row.score, total_score: 100,
            teacher_name: currentUser?.name ?? null,
          })
          if (error) throw new Error(error.message)
          core++
        } else if (p.mode === 'exam' && p.studentId) {
          // 평가관리의 진단평가. 선생님들이 손으로 넣는 꼴과 **똑같이** 넣는다 —
          //   unit_name = 단원 이름 · level = 단계 · total_score = 100 (점수는 백분율).
          // ★ 제목을 그대로 memo 에 남긴다 — 단원을 못 읽은 줄도 어디서 온 것인지 보여야 한다.
          const { error } = await supabase.from('exams').insert({
            student_id: p.studentId, exam_type: '진단평가', exam_date: p.row.date,
            unit_name: p.exam?.unitName ?? null, level: p.exam?.level ?? null,
            score: p.row.score, total_score: 100,
            teacher_name: currentUser?.name ?? null,
            memo: ['매쓰홀릭', p.row.right != null ? `${p.row.right}/${p.row.total}` : '', p.row.title]
              .filter(Boolean).join(' · '),
          })
          if (error) throw new Error(error.message)
          exam++
        } else if (p.mode === 'fill' && p.wsId) {
          // ★ status 는 scored 까지만. passed 로 올리면 초등 70점 미만이 트리거에 막힌다.
          const { error } = await supabase.from('student_worksheets')
            .update({ score: p.row.score, status: 'scored', submitted_at: `${p.row.date}T12:00:00+09:00` })
            .eq('id', p.wsId)
          if (error) throw new Error(error.message)
          filled++
        } else if (p.mode === 'new' && p.studentId) {
          // ★ 단원과 레벨을 **칸에 제대로** 넣는다. 제목을 통째로 unit_name 에 넣으면
          //   레벨 현황판(학년 × 단원 표)과 초등 70점 규칙이 조용히 멈춘다.
          const t = parseWorksheetTitle(p.row.title)
          // 개념 사전에서 찾아낸 단원이 있으면 **그 이름으로** 넣는다 — 그래야 레벨 현황판에서
          // 같은 단원끼리 모인다. 선생님이 소개념 이름으로 쓰셔도 대단원까지 함께 들어간다.
          const u = p.unit
          // ★ 두 칸에 **같은 값**을 넣지 않는다 (원장님 2026-10-31 「전범위 전범위로 나온다」).
          //   전범위·복합처럼 쪼갤 것이 없는 제목은 대단원·소단원이 같은 글자가 되고,
          //   그러면 그 뒤로 모든 화면이 「전범위 전범위」로 찍는다. 읽는 쪽도 막아 두었지만
          //   (lib/worksheetTitle.ts) 들어가는 쪽에서 막는 것이 먼저다.
          const unitCell = u?.chapter ?? t.unit ?? p.row.course ?? '매쓰홀릭'
          let unitNameCell = unitNameBeside(unitCell, u?.subChapter ?? t.unitName ?? p.row.title) || null
          let levelCell = p.row.level
          // ★ 오답 학습지 — 제목에 「오답학습지」를 넣고 레벨은 직전 레벨학습지와 같게
          //   (원장님 2026-11-02). 학부모 브리핑과 레벨 현황판이 이 두 칸만 읽는다.
          if (isWrongNote(p.row)) {
            const fixed = wrongNoteFix(unitNameCell ?? unitCell, p.row.level, p.prevLevel ?? null)
            unitNameCell = fixed.unitName
            levelCell = fixed.level
          }
          // ★ 레벨 칸은 비울 수 없다 (NOT NULL). 못 찾으면 Lv1 — 읽어 보기 화면에도
          //   그렇게 적어 두었다. 비워 보내면 그 줄이 통째로 안 들어간다.
          const 레벨 = levelForInsert(levelCell)
          const { error } = await supabase.from('student_worksheets').insert({
            student_id: p.studentId, subject: '수학',
            // 제목에 학년이 적혀 있으면 그걸 쓰고, 없으면 학생의 학년으로 메운다.
            // ★ 학년 칸도 **비울 수 없다**(NOT NULL, 기본값 없음). 재원생 194명 모두
            //   학년이 있어 지금은 빌 일이 없지만, 비면 그 줄이 통째로 안 들어간다.
            grade_level: t.gradeLevel ?? gradeFromCourse(p.row.course)?.grade ?? who?.grade ?? '미정',
            semester: t.semester ?? gradeFromCourse(p.row.course)?.semester ?? null,
            unit: unitCell,
            unit_name: unitNameCell,
            current_level: 레벨,
            // 레벨학습지(main) · 오답유사(similar) · 쌍둥이(twin).
            // 교재연계로 낸 것은 쌍둥이다 (원장님 2026-10-30).
            worksheet_type: worksheetTypeOf(p.row, books),
            status: 'scored', score: p.row.score,
            assigned_at: `${p.row.date}T12:00:00+09:00`,
            submitted_at: `${p.row.date}T12:00:00+09:00`,
            // 어디서 온 것인지 남긴다 — 되돌릴 때 이 글자로 찾는다.
            memo: [`매쓰홀릭`,
              parseWorksheetTitle(p.row.title).round ? `${parseWorksheetTitle(p.row.title).round}차` : '',
              p.row.right != null ? `${p.row.right}/${p.row.total}` : ''].filter(Boolean).join(' '),
          })
          if (error) throw new Error(error.message)
          created++
        }
      } catch (e: any) { failed.push(`${label} — ${e?.message ?? '실패'}`) }
    }
    setSaving(false)
    setDone({ daily, core, exam, filled, created, skipped: count.skip, failed })
    setPlans((prev) => prev.map((p) =>
      (p.mode === 'daily' || p.mode === 'core' || p.mode === 'exam' || p.mode === 'fill' || p.mode === 'new'
        ? { ...p, mode: 'done' as Mode, why: '넣었어요' } : p)))
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
              <span className={cx(칩, 'bg-purple-50 text-purple-700')}>코어테스트 {count.core}</span>
              <span className={cx(칩, 'bg-orange-50 text-orange-700')}>진단평가 {count.exam}</span>
              <span className={cx(칩, 'bg-green-50 text-green-700')}>학습지 점수 채우기 {count.fill}</span>
              <span className={cx(칩, 'bg-blue-50 text-blue-700')}>새로 만들기 {count.neo}</span>
              <span className={cx(칩, 'bg-gray-100 text-gray-600')}>이미 들어감 {count.done}</span>
              <span className={cx(칩, 'bg-red-50 text-red-600')}>안 넣음 {count.skip}</span>
              <span className={cx(칩, 'bg-gray-100 text-gray-600')}>제외(이너프원) {count.excluded}</span>
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
                    : p.mode === 'excluded' ? 'bg-gray-50 border-gray-200'
                    : p.mode === 'done' ? 'bg-gray-50 border-gray-200'
                      : p.mode === 'daily' ? 'bg-amber-50 border-amber-200'
                        : p.mode === 'core' ? 'bg-purple-50 border-purple-200'
                        : p.mode === 'exam' ? 'bg-orange-50 border-orange-200'
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
                    {p.mode === 'core' && (
                      <span className={cx(칩, 'bg-purple-100 text-purple-800')}>평가관리 · 코어테스트 {p.coreRound}</span>
                    )}
                    {p.mode === 'exam' && (
                      <span className={cx(칩, 'bg-orange-100 text-orange-800')}>
                        평가관리 · 진단평가 {p.exam?.unitName ?? '단원 없음'}{p.exam?.level != null ? ` ${p.exam.level}단계` : ''}
                      </span>
                    )}
                    {p.mode === 'excluded' && (
                      <span className={cx(칩, 'bg-gray-200 text-gray-700')}>이너프원 · 넣지 않음</span>
                    )}
                    {/* ★ 어느 갈래로 들어가는지 — 레벨학습지·오답학습지·쌍둥이.
                        이게 없으면 「비상교과서」가 쌍둥이로 걸렸는지 **화면만 보고는 알 수 없다.** */}
                    {p.mode !== 'daily' && p.mode !== 'core' && p.mode !== 'exam' && p.mode !== 'excluded' && p.studentId && (() => {
                      const 갈래 = worksheetTypeOf(p.row, books)
                      const [말, 색] = 갈래 === 'twin' ? ['쌍둥이 학습지', 'bg-indigo-100 text-indigo-800']
                        : 갈래 === 'similar' ? ['오답학습지', 'bg-rose-100 text-rose-800']
                        : ['레벨학습지', 'bg-emerald-100 text-emerald-800']
                      return <span className={cx(칩, 색)}>{말}</span>
                    })()}
                    {p.mode !== 'done' && p.mode !== 'daily' && p.mode !== 'core' && p.mode !== 'exam' && p.mode !== 'excluded' && p.studentId && (
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

            {(count.daily > 0 || count.core > 0 || count.exam > 0 || count.fill > 0 || count.neo > 0) && (
              <button onClick={handleSave} disabled={saving}
                className="w-full text-sm font-bold py-2.5 rounded-xl disabled:opacity-40"
                style={{ background: '#9FE1CB', color: '#0f3d2e' }}>
                {saving ? '넣는 중…' : `③ ${count.daily + count.core + count.exam + count.fill + count.neo}건 넣기`}
              </button>
            )}
          </div>
        )}

        {done && (
          <div className="rounded-2xl p-4" style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC' }}>
            <p className="text-xs font-bold" style={{ color: '#166534' }}>
              끝났어요 — 학습일지 데일리테스트 {done.daily}건 · 코어테스트 {done.core}건 · 진단평가 {done.exam}건 · 학습지 점수 채움 {done.filled}건 ·
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
