'use client'

// 고등 커리큘럼 (원장님 2026-11-16)
// 반편성(W·I·S·E) 뒤 반마다 다른 교재로 가는 흐름, 내신 대비 계획, 반별 단원 차시표를
// 원장님과 고등 담당 강사가 같이 보고 고친다. 저장소: curriculum_plan_docs (docs/sql/고등커리큘럼_표_추가.sql)
// 칸을 벗어나면 그 문서 한 줄만 저장한다 — 단원 한 줄을 고쳐도 다른 줄은 건드리지 않는다.

import { useEffect, useRef, useState } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fetchAllRows } from '@/lib/utils'
import { Field } from '@/components/teacher/highCurriculum/Field'
import { ClassRoster } from '@/components/teacher/highCurriculum/ClassRoster'
import { LessonPlan } from '@/components/teacher/highCurriculum/LessonPlan'
import {
  CLASSES, EXAM_ROWS, GRADES, UNIT_COLS, unitDocId,
  type ClassKey, type GradeKey, type PlanRow,
} from '@/lib/highCurriculum'

type TableKey = 'books' | 'exam'
type Docs = Record<string, any>
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const TABS: { key: 'common' | ClassKey; label: string; sub?: string }[] = [
  { key: 'common', label: '공통', sub: '반편성 전 · 전원' },
  ...CLASSES.map((c) => ({ key: c.k, label: c.name })),
]
const ACCENT = '#2f4bb5'

export default function HighCurriculumPage() {
  const { currentUser } = useAuth()
  const [grade, setGrade] = useState<GradeKey>('g1')
  const [docs, setDocs] = useState<Docs>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState<{ s: 'saved' | 'saving' | 'error'; t: string }>({ s: 'saved', t: '모두 저장됨' })
  const [edit, setEdit] = useState<Record<TableKey, boolean>>({ books: false, exam: false })
  const [tab, setTab] = useState<'common' | ClassKey>('common')
  const [armed, setArmed] = useState<string | null>(null)
  // 반마다 학생 수 (반 편성에서 받아 탭에 보여 준다)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const queues = useRef<Record<string, Promise<unknown>>>({})
  const pending = useRef(0)
  // 원장님과 고등 강사만 (원장님 2026-11-16). 진짜 차단은 RLS — docs/sql/고등커리큘럼_고등강사만.sql
  const [allowed, setAllowed] = useState<boolean | null>(null)
  useEffect(() => {
    if (!currentUser) return
    supabase.rpc('can_see_high_curriculum').then(({ data }) => setAllowed(data === true))
  }, [currentUser])

  // 고른 학년·탭 기억 (이 기기에서만)
  useEffect(() => {
    try {
      const g = localStorage.getItem('hc-grade'); if (g === 'g1' || g === 'g2') setGrade(g)
      const t = localStorage.getItem('hc-tab'); if (TABS.some((x) => x.key === t)) setTab(t as any)
    } catch { /* 저장 못 해도 화면은 된다 */ }
  }, [])

  async function load(g: GradeKey) {
    setLoading(true); setLoadError('')
    try {
      const rows = await fetchAllRows(() => supabase.from('curriculum_plan_docs')
        .select('doc_id, data').eq('grade', g).order('doc_id'))
      const next: Docs = {}
      for (const r of rows as any[]) next[r.doc_id] = r.data || {}
      setDocs(next)
    } catch (e) {
      console.error('고등 커리큘럼 불러오기 실패', e)
      setLoadError('불러오지 못했습니다. 새로고침해 주세요.')
    }
    setLoading(false)
  }
  useEffect(() => { if (allowed) load(grade) }, [grade, allowed])
  // 다른 선생님이 고친 것을 보려고, 창으로 돌아올 때 다시 읽는다 (저장 중이면 건너뜀)
  useEffect(() => {
    const onFocus = () => { if (allowed && !pending.current) load(grade) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [grade, allowed])

  const cfg = GRADES[grade]
  // 교재 흐름의 구성·교재 이름은 원장님만 고친다(원장님 2026-11-17). 강사모드로 보셔도 원장님은 원장님이라 role 로 본다.
  // 진짜 막는 곳은 RLS — docs/sql/고등커리큘럼_교재구성_원장만.sql ('books' 문서는 is_admin 만 쓰기)
  const owner = currentUser?.role === 'admin'
  // 운영 규칙 줄(데일리·숙제·토요 테스트·키움·채움)의 값은 선생님도 적는다 → 'books-values' 문서에 따로 둔다
  const opsValues: Record<string, Record<string, string>> = docs['books-values'] || {}
  const tables: Record<TableKey, PlanRow[]> = {
    books: (Array.isArray(docs.books?.rows) ? docs.books.rows : cfg.books).map((r: PlanRow) =>
      r.style === 'plain' && opsValues[r.id] ? { ...r, ...opsValues[r.id] } : r),
    exam: Array.isArray(docs.exam?.rows) ? docs.exam.rows : EXAM_ROWS,
  }
  // 저장할 때는 운영 값은 빼고 구성만 'books' 에 둔다
  const bookStructure = (rows: PlanRow[]) => rows.map((r) => {
    if (r.style !== 'plain') return r
    const { all, W, I, S, E, ...rest } = r
    void all; void W; void I; void S; void E
    return rest as PlanRow
  })
  const suggestions = Object.entries(docs)
    .filter(([id]) => id.startsWith('sugg-'))
    .map(([id, d]) => ({ id, ...(d as any) }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))

  function saveDoc(docId: string, data: any) {
    setDocs((d) => ({ ...d, [docId]: data }))
    pending.current++; setStatus({ s: 'saving', t: '저장 중…' })
    const g = grade
    const run = () => supabase.from('curriculum_plan_docs').upsert({
      grade: g, doc_id: docId, data, updated_at: new Date().toISOString(), updated_by_name: currentUser?.name ?? null,
    }, { onConflict: 'grade,doc_id' })
    queues.current[docId] = (queues.current[docId] || Promise.resolve()).then(run).then(({ error }) => {
      pending.current--
      if (error) { console.error('고등 커리큘럼 저장 실패', error); setStatus({ s: 'error', t: '저장 실패 — 칸을 다시 눌렀다 나와 주세요' }) }
      else if (!pending.current) setStatus({ s: 'saved', t: '모두 저장됨' })
    })
  }
  const saveTable = (t: TableKey, rows: PlanRow[]) => saveDoc(t, { rows: t === 'books' ? bookStructure(rows) : rows })

  function setCell(t: TableKey, rowId: string, key: string, value: string) {
    const rows = clone(tables[t]); const r = rows.find((x) => x.id === rowId); if (!r) return
    if (t === 'books' && r.style === 'plain' && ['all', 'W', 'I', 'S', 'E'].includes(key)) {
      saveDoc('books-values', { ...opsValues, [rowId]: { ...(opsValues[rowId] || {}), [key]: value } })
      return
    }
    ;(r as any)[key] = value
    saveTable(t, rows)
  }
  function addSuggestion(rowId: string, cls: string, text: string) {
    const id = 'sugg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
    saveDoc(id, { rowId, cls, text, by: currentUser?.name ?? '', at: new Date().toISOString(), status: '검토 중' })
  }
  function setSuggestionStatus(id: string, st: string) {
    saveDoc(id, { ...(docs[id] || {}), status: st, decidedAt: new Date().toISOString() })
  }
  function act(t: TableKey, rowId: string | null, what: string, extra?: string) {
    const rows = clone(tables[t]); const i = rows.findIndex((x) => x.id === rowId)
    if (what === 'up' && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]
    else if (what === 'down' && i >= 0 && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]
    else if (what === 'merge') {
      const r = rows[i]
      if (r.merged) { for (const c of CLASSES) r[c.k] = r[c.k] || r.all || ''; r.merged = false }
      else { r.all = r.all || CLASSES.map((c) => r[c.k]).find(Boolean) || ''; r.merged = true }
      // 운영 줄의 값은 'books-values' 에 있으니 거기도 옮겨 적는다 (구성 문서에는 값이 안 남는다)
      if (t === 'books' && r.style === 'plain') {
        const { all, W, I, S, E } = r
        saveDoc('books-values', { ...opsValues, [r.id]: { all, W, I, S, E } })
      }
    } else if (what === 'lessons') rows[i].lessons = !rows[i].lessons
    else if (what === 'del') {
      // 한 번 더 눌러야 지운다
      if (armed !== `${t}-${rowId}`) { setArmed(`${t}-${rowId}`); setTimeout(() => setArmed(null), 3000); return }
      setArmed(null); rows.splice(i, 1)
    } else if (what === 'add') {
      const book = extra === 'book'
      const r: PlanRow = { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: book ? '새 단계' : '새 항목', sub: '', merged: false, lessons: book, style: book ? 'book' : 'plain' }
      // 교재 단계는 운영 규칙 줄들보다 위에 넣는다
      let at = rows.length
      if (book) { let k = -1; rows.forEach((x, j) => { if (x.style !== 'plain') k = j }); at = k + 1 }
      rows.splice(at, 0, r)
    } else if (what === 'reset') {
      if (armed !== `${t}-reset`) { setArmed(`${t}-reset`); setTimeout(() => setArmed(null), 3000); return }
      setArmed(null); saveTable(t, clone(t === 'books' ? cfg.books : EXAM_ROWS)); return
    } else return
    saveTable(t, rows)
  }

  const lessonRows = (tk: string) => tables.books.filter((r) => r.lessons && (tk === 'common' ? r.merged : !r.merged))
  const bookName = (r: PlanRow, tk: string) => (tk === 'common' ? r.all : r[tk as ClassKey]) || ''
  const pickTab = (k: 'common' | ClassKey) => { setTab(k); try { localStorage.setItem('hc-tab', k) } catch { /* */ } }
  const pickGrade = (g: GradeKey) => { setGrade(g); setEdit({ books: false, exam: false }); try { localStorage.setItem('hc-grade', g) } catch { /* */ } }

  if (allowed !== true) return (
    <div className="min-h-screen bg-gray-50">
      <Header title="고등 커리큘럼" subtitle="반별 교재 흐름 · 내신 대비 · 단원별 차시" />
      <div className="p-10 text-center text-gray-500">
        {allowed === null ? '불러오는 중…' : '원장님과 고등 담당 선생님만 볼 수 있어요.'}
      </div>
    </div>
  )

  const busy = loading || !!loadError
  const lr = lessonRows(tab)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="고등 커리큘럼" subtitle="반별 교재 흐름 · 내신 대비 · 단원별 차시" />
      <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-8" style={{ wordBreak: 'keep-all' }}>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2" role="tablist" aria-label="학년">
            {(Object.keys(GRADES) as GradeKey[]).map((g) => (
              <button key={g} type="button" role="tab" aria-selected={grade === g} onClick={() => pickGrade(g)}
                className={`px-4 py-2 rounded-lg border text-sm font-bold ${grade === g ? 'bg-[#0f3460] text-white border-[#0f3460]' : 'bg-white text-gray-600 border-gray-200'}`}>
                {GRADES[g].label} <span className="font-normal opacity-80">· {GRADES[g].subjects}</span>
              </button>
            ))}
          </div>
          <span className="inline-flex items-center gap-2 text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-3 py-1.5">
            <i className="w-2 h-2 rounded-full" style={{ background: loadError || status.s === 'error' ? '#b4480c' : status.s === 'saving' || loading ? ACCENT : '#1d7a4a' }} />
            {loading ? '불러오는 중…' : loadError || status.t}
          </span>
        </div>

        <p className="text-sm text-gray-500 max-w-2xl -mt-4">
          칸을 눌러 적고 벗어나면 저장됩니다. 다른 선생님이 고친 내용은 이 창으로 돌아올 때 새로 불러옵니다.
        </p>

        <ClassRoster key={grade} grade={grade} gradeLabel={cfg.label} owner={owner} onCounts={setCounts} />

        <PlanTable title="반별 교재 흐름" t="books" rows={tables.books} editing={owner && edit.books} disabled={busy}
          lockStructure={!owner}
          lead={owner
            ? '원장님 기준안입니다. 교재·단계는 원장님만 고칠 수 있고, 선생님은 운영 칸(데일리·숙제·토요 테스트·키움·채움)을 적고 교재 의견은 아래 「선생님 제안」에 올립니다.'
            : '원장님이 정한 기준안입니다. 교재를 바꾸자는 의견은 아래 「선생님 제안」에 올려 주세요. 운영 칸(데일리·숙제·토요 테스트·키움·채움)은 직접 적을 수 있어요.'}
          onToggle={() => setEdit((e) => ({ ...e, books: !e.books }))} onCell={setCell} onAct={act} armed={armed} />

        <Suggestions rows={tables.books} items={suggestions} owner={owner}
          disabled={busy} onAdd={addSuggestion} onStatus={setSuggestionStatus} />

        <PlanTable title="내신 대비 기간" lead="학교 시험 전에는 정규 진도 대신 무엇을 할지 반별로 정해 주세요."
          t="exam" rows={tables.exam} editing={edit.exam} disabled={busy}
          onToggle={() => setEdit((e) => ({ ...e, exam: !e.exam }))} onCell={setCell} onAct={act} armed={armed} />

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">단원별 차시 계획</h2>
          <p className="text-sm text-gray-500 max-w-2xl">
            탭을 골라 반마다 따로 적어 주세요. 「공통」은 반편성 전 전원이 같이 나가는 진도, W·I·S·E 탭은 반편성 뒤 그 반만의 진도입니다.
            교재 흐름에서 「차시표에 넣기」를 켠 단계마다 차시 칸이 생깁니다.
          </p>
          <p className="text-sm text-gray-600 max-w-2xl bg-white border border-gray-200 rounded-lg px-3 py-2">
            <b>키움 2시간</b>은 새 진도, <b>채움 1시간</b>은 <b>지난 차시 복습</b>(대표문제 다시 풀기 · 데일리테스트 · 오답 · 숙제 점검)으로 짜 주세요.
            채움을 먼저 듣고 들어오는 학생도 있어서, 채움이 그날 키움 내용에 기대면 순서가 바뀐 학생은 수업이 성립하지 않아요.
          </p>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="반">
            {TABS.map((t) => {
              const c = CLASSES.find((x) => x.k === t.key)
              const sub = t.sub || lessonRows(t.key).map((r) => bookName(r, t.key)).filter(Boolean).join(' → ')
              const on = tab === t.key
              return (
                <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => pickTab(t.key)}
                  className="text-left px-3.5 py-2 rounded-lg border text-sm font-bold leading-tight"
                  style={on ? { color: c?.color ?? '#1b2230', background: c?.bg ?? '#eef1f5', borderColor: c?.color ?? '#1b2230' } : { color: '#5d6676', background: '#fff', borderColor: '#dde1e8' }}>
                  {t.label}{counts[t.key] ? <span className="font-normal text-gray-500"> · {counts[t.key]}명</span> : null}<span className="block text-xs font-normal text-gray-500 mt-0.5">{sub || ' '}</span>
                </button>
              )
            })}
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 1250 }}>
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="px-2.5 py-2 text-left border-b border-r border-gray-200 w-12">번호</th>
                  <th className="px-2.5 py-2 text-left border-b border-r border-gray-200">소단원</th>
                  {lr.map((r) => (
                    <th key={r.id} className="px-2.5 py-2 text-left border-b border-r border-gray-200">
                      {r.label} 차시<span className="block text-xs font-normal text-gray-500">{bookName(r, tab)}</span>
                    </th>
                  ))}
                  {UNIT_COLS.map(([f, label]) => <th key={f} className="px-2.5 py-2 text-left border-b border-r last:border-r-0 border-gray-200">{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {!lr.length && (
                  <tr><td colSpan={2 + UNIT_COLS.length} className="text-center text-gray-400 py-6">
                    이 탭에는 차시를 적을 교재 단계가 없습니다. 교재 흐름의 「구성 고치기」에서 「차시표에 넣기」를 켜 주세요.
                  </td></tr>
                )}
                {cfg.courses.map((c) => {
                  const span = 2 + lr.length + UNIT_COLS.length
                  let sum = 0; let filled = 0; let total = 0
                  for (const [, smalls] of c.units) for (const s of smalls) {
                    total++
                    const d = docs[unitDocId(tab, c.key, s.split(' ')[0])] || {}
                    let any = false
                    for (const r of lr) { const v = parseFloat(d['l_' + r.id]); if (!isNaN(v)) { sum += v; any = true } }
                    if (any) filled++
                  }
                  return [
                    <tr key={c.key} className="bg-gray-100">
                      <td colSpan={span} className="px-2.5 py-2 font-bold text-gray-900 border-b border-gray-200">
                        {c.name} (2022 개정)
                        {lr.length > 0 && <span className="float-right text-xs font-medium text-gray-500">차시 합계 {sum}차시 · {filled}/{total}개 소단원 입력</span>}
                      </td>
                    </tr>,
                    ...c.units.flatMap(([big, smalls]) => [
                      <tr key={c.key + big}><td colSpan={span} className="px-2.5 pt-3 pb-1 text-xs font-bold text-gray-500 border-b border-gray-100">{big}</td></tr>,
                      ...smalls.map((s) => {
                        const k = s.indexOf(' '); const num = s.slice(0, k); const name = s.slice(k + 1)
                        const id = unitDocId(tab, c.key, num); const d = docs[id] || {}
                        const commit = (f: string) => (v: string) => saveDoc(id, { ...(docs[id] || {}), [f]: v })
                        return (
                          <tr key={id} className="border-b border-gray-100">
                            <td className="px-2.5 py-1.5 text-gray-500 tabular-nums border-r border-gray-100">{num}</td>
                            <td className="px-2.5 py-1.5 border-r border-gray-100">{name}</td>
                            {lr.map((r) => (
                              <td key={r.id} className="px-1.5 py-1.5 border-r border-gray-100 w-24">
                                <Field input value={d['l_' + r.id]} onCommit={commit('l_' + r.id)} placeholder="예: 2차시" disabled={busy} />
                              </td>
                            ))}
                            {UNIT_COLS.map(([f, , ph]) => (
                              <td key={f} className={`px-1.5 py-1.5 border-r last:border-r-0 border-gray-100 ${['memo', 'kium', 'chaeum'].includes(f) ? 'w-52' : 'w-24'}`}>
                                <Field input value={d[f]} onCommit={commit(f)} placeholder={ph} disabled={busy} />
                              </td>
                            ))}
                          </tr>
                        )
                      }),
                    ]),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </section>

        <LessonPlan key={grade + tab} tab={tab} tabLabel={TABS.find((x) => x.key === tab)?.label === '공통' ? '공통 (반편성 전)' : (TABS.find((x) => x.key === tab)?.label ?? '')}
          stages={lr} bookName={bookName} courses={cfg.courses} docs={docs} saveDoc={saveDoc} disabled={busy}
          studentCount={counts[tab]} />
      </div>
    </div>
  )
}

/* ---------- 교재 흐름 · 내신 대비 표 ---------- */
function PlanTable({ title, lead, t, rows, editing, disabled, lockStructure, onToggle, onCell, onAct, armed }: {
  title: string; lead?: string; t: TableKey; rows: PlanRow[]; editing: boolean; disabled: boolean
  // true = 구성·이름·교재 칸은 잠그고 운영 칸(plain)만 적게 한다 (교재 흐름을 원장님 아닌 분이 볼 때)
  lockStructure?: boolean
  onToggle: () => void; onCell: (t: TableKey, id: string, key: string, v: string) => void
  onAct: (t: TableKey, id: string | null, what: string, extra?: string) => void; armed: string | null
}) {
  const btn = 'px-2 py-0.5 text-xs rounded-md border border-gray-200 bg-white hover:border-[#2f4bb5] disabled:opacity-40'
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {!lockStructure && <button type="button" onClick={onToggle} disabled={disabled}
          className={`px-3 py-1.5 text-sm rounded-lg border ${editing ? 'border-[#2f4bb5] text-[#2f4bb5] bg-[#e8edfb]' : 'border-gray-200 bg-white text-gray-700'}`}>
          {editing ? '다 고쳤어요' : '구성 고치기'}
        </button>}
      </div>
      {lead && <p className="text-sm text-gray-500 -mt-1">{lead}</p>}
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
        <table className="w-full border-collapse" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th className="w-44 px-3 py-2.5 text-left text-sm bg-gray-100 border-b border-r border-gray-200">단계</th>
              {CLASSES.map((c) => (
                <th key={c.k} className="px-3 py-2.5 text-left border-b border-r last:border-r-0 border-gray-200" style={{ background: c.bg, color: c.color }}>
                  <span className="block text-lg leading-tight font-bold">{c.name}</span>
                  <span className="block text-xs font-medium opacity-80">{c.sub}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const gate = r.style === 'gate'
              const cellCls = r.style === 'book' ? 'font-bold text-base' : gate ? 'font-bold text-center' : ''
              const ph = r.ph ?? (r.style === 'book' ? '교재 이름' : '')
              const delArmed = armed === `${t}-${r.id}`
              return (
                <tr key={r.id} className="border-b border-gray-200 last:border-b-0"
                  style={gate ? { background: 'repeating-linear-gradient(135deg,#eef1f5 0 8px,#fff 8px 16px)' } : undefined}>
                  <th className="px-3 py-2.5 align-top text-left bg-gray-50 border-r border-gray-200 font-normal">
                    <Field plain singleLine value={r.label} onCommit={(v) => onCell(t, r.id, 'label', v)} placeholder="이름" disabled={disabled || lockStructure} className="font-bold text-[15px] text-gray-900" />
                    <Field plain singleLine value={r.sub} onCommit={(v) => onCell(t, r.id, 'sub', v)} placeholder={editing ? '설명 (선택)' : ''} disabled={disabled || lockStructure} className="text-xs text-gray-500" />
                    {editing && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        <button type="button" className={btn} disabled={i === 0} onClick={() => onAct(t, r.id, 'up')} aria-label="위로">↑</button>
                        <button type="button" className={btn} disabled={i === rows.length - 1} onClick={() => onAct(t, r.id, 'down')} aria-label="아래로">↓</button>
                        <button type="button" className={btn} onClick={() => onAct(t, r.id, 'merge')}>{r.merged ? '반별로 나누기' : '한 칸으로 합치기'}</button>
                        <button type="button" className={`${btn} ${delArmed ? '!bg-[#b4480c] !text-white !border-[#b4480c]' : 'text-[#b4480c]'}`} onClick={() => onAct(t, r.id, 'del')}>
                          {delArmed ? '한 번 더 누르면 삭제' : '삭제'}
                        </button>
                        {t === 'books' && (
                          <label className="flex items-center gap-1 text-xs text-gray-500 w-full mt-1">
                            <input type="checkbox" checked={!!r.lessons} onChange={() => onAct(t, r.id, 'lessons')} /> 차시표에 넣기
                          </label>
                        )}
                      </div>
                    )}
                  </th>
                  {r.merged ? (
                    <td colSpan={4} className="px-3 py-2.5 align-top">
                      <Field plain={r.style !== 'plain'} singleLine={r.style !== 'plain'} value={r.all} onCommit={(v) => onCell(t, r.id, 'all', v)}
                        placeholder={ph} disabled={disabled || (lockStructure && r.style !== 'plain')} className={`${cellCls} text-center`} color={gate ? ACCENT : undefined} />
                    </td>
                  ) : CLASSES.map((c) => (
                    <td key={c.k} className="px-3 py-2.5 align-top border-r last:border-r-0 border-gray-200">
                      <Field plain={r.style !== 'plain'} singleLine={r.style !== 'plain'} value={r[c.k]} onCommit={(v) => onCell(t, r.id, c.k, v)}
                        placeholder={ph} disabled={disabled || (lockStructure && r.style !== 'plain')} className={cellCls} color={r.style === 'book' ? c.color : undefined} />
                    </td>
                  ))}
                </tr>
              )
            })}
            {editing && (
              <tr className="bg-gray-50">
                <td colSpan={5} className="px-3 py-3 text-center space-x-2">
                  {t === 'books' ? <>
                    <button type="button" className="px-3 py-1 text-sm rounded-md border border-[#2f4bb5] text-[#2f4bb5] bg-white" onClick={() => onAct(t, null, 'add', 'book')}>+ 교재 단계 추가</button>
                    <button type="button" className="px-3 py-1 text-sm rounded-md border border-gray-200 bg-white" onClick={() => onAct(t, null, 'add', 'plain')}>+ 운영 규칙 줄 추가</button>
                  </> : (
                    <button type="button" className="px-3 py-1 text-sm rounded-md border border-[#2f4bb5] text-[#2f4bb5] bg-white" onClick={() => onAct(t, null, 'add', 'plain')}>+ 항목 추가</button>
                  )}
                  <button type="button" onClick={() => onAct(t, null, 'reset')}
                    className={`px-3 py-1 text-sm rounded-md border ${armed === `${t}-reset` ? 'bg-[#b4480c] text-white border-[#b4480c]' : 'border-gray-200 bg-white text-gray-600'}`}>
                    {armed === `${t}-reset` ? '한 번 더 누르면 처음 구성으로' : '처음 구성으로 되돌리기'}
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ---------- 선생님 제안: 교재 구성은 원장님 기준안, 바꿀 점은 여기로 ---------- */
const SUGG_STATUS: Record<string, string> = { '검토 중': '#5d6676', '반영': '#1d7a4a', '보류': '#b4480c' }
function Suggestions({ rows, items, owner, disabled, onAdd, onStatus }: {
  rows: PlanRow[]; items: any[]; owner: boolean; disabled: boolean
  onAdd: (rowId: string, cls: string, text: string) => void; onStatus: (id: string, st: string) => void
}) {
  const stages = rows.filter((r) => r.style === 'book')
  const [rowId, setRowId] = useState('')
  const [cls, setCls] = useState('전체')
  const [text, setText] = useState('')
  const labelOf = (id: string) => rows.find((r) => r.id === id)?.label || (id === 'etc' ? '그 밖의 것' : '지워진 단계')
  const submit = () => {
    const tx = text.trim(); if (!tx) return
    onAdd(rowId || stages[0]?.id || 'etc', cls, tx); setText('')
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-gray-900">선생님 제안 <span className="text-sm font-normal text-gray-500">· 교재 구성에 대한 의견</span></h2>
      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <select value={rowId || stages[0]?.id || 'etc'} onChange={(e) => setRowId(e.target.value)} disabled={disabled}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white" aria-label="어느 단계">
            {stages.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            <option value="etc">그 밖의 것</option>
          </select>
          <select value={cls} onChange={(e) => setCls(e.target.value)} disabled={disabled}
            className="border border-gray-200 rounded-md px-2 py-1.5 text-sm bg-white" aria-label="어느 반">
            {['전체', ...CLASSES.map((c) => c.name)].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} rows={2}
          placeholder="예: S반 3단계는 유형만렙 라이트보다 ○○가 나을 것 같아요 — 이유: …"
          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm placeholder:text-gray-300 focus:outline-2 focus:outline-[#2f4bb5]" />
        <div className="text-right">
          <button type="button" onClick={submit} disabled={disabled || !text.trim()}
            className="px-3 py-1.5 text-sm rounded-md bg-[#0f3460] text-white disabled:opacity-40">제안 올리기</button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">아직 올라온 제안이 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="bg-white border border-gray-200 rounded-xl px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className="font-bold text-gray-700">{labelOf(it.rowId)}</span>
                <span>· {it.cls}</span>
                <span>· {it.by || '이름 없음'}</span>
                <span>· {String(it.at || '').slice(0, 10)}</span>
                <span className="ml-auto font-bold" style={{ color: SUGG_STATUS[it.status] || '#5d6676' }}>{it.status || '검토 중'}</span>
              </div>
              <p className="text-sm text-gray-900 mt-1 whitespace-pre-wrap">{it.text}</p>
              {owner && (
                <div className="flex gap-1 mt-2">
                  {['반영', '보류', '검토 중'].filter((st) => st !== (it.status || '검토 중')).map((st) => (
                    <button key={st} type="button" disabled={disabled} onClick={() => onStatus(it.id, st)}
                      className="px-2 py-0.5 text-xs rounded-md border border-gray-200 bg-white hover:border-[#2f4bb5]">{st}</button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
