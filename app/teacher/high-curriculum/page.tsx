'use client'

// 고등 커리큘럼 (원장님 2026-11-16)
// 반편성(W·I·S·E) 뒤 반마다 다른 교재로 가는 흐름, 내신 대비 계획, 반별 단원 차시표를
// 원장님과 고등 담당 강사가 같이 보고 고친다. 저장소: curriculum_plan_docs (docs/sql/고등커리큘럼_표_추가.sql)
// 칸을 벗어나면 그 문서 한 줄만 저장한다 — 단원 한 줄을 고쳐도 다른 줄은 건드리지 않는다.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fetchAllRows } from '@/lib/utils'
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
  const queues = useRef<Record<string, Promise<unknown>>>({})
  const pending = useRef(0)

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
  useEffect(() => { load(grade) }, [grade])
  // 다른 선생님이 고친 것을 보려고, 창으로 돌아올 때 다시 읽는다 (저장 중이면 건너뜀)
  useEffect(() => {
    const onFocus = () => { if (!pending.current) load(grade) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [grade])

  const cfg = GRADES[grade]
  const tables: Record<TableKey, PlanRow[]> = {
    books: Array.isArray(docs.books?.rows) ? docs.books.rows : cfg.books,
    exam: Array.isArray(docs.exam?.rows) ? docs.exam.rows : EXAM_ROWS,
  }

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
  const saveTable = (t: TableKey, rows: PlanRow[]) => saveDoc(t, { rows })

  function setCell(t: TableKey, rowId: string, key: string, value: string) {
    const rows = clone(tables[t]); const r = rows.find((x) => x.id === rowId); if (!r) return
    ;(r as any)[key] = value
    saveTable(t, rows)
  }
  function act(t: TableKey, rowId: string | null, what: string, extra?: string) {
    const rows = clone(tables[t]); const i = rows.findIndex((x) => x.id === rowId)
    if (what === 'up' && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]
    else if (what === 'down' && i >= 0 && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]
    else if (what === 'merge') {
      const r = rows[i]
      if (r.merged) { for (const c of CLASSES) r[c.k] = r[c.k] || r.all || ''; r.merged = false }
      else { r.all = r.all || CLASSES.map((c) => r[c.k]).find(Boolean) || ''; r.merged = true }
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
          글자를 눌러서 고치면 칸을 벗어날 때 저장됩니다. 단계를 더하거나 빼려면 「구성 고치기」를 누르세요.
          다른 선생님이 고친 내용은 이 창으로 돌아올 때 새로 불러옵니다.
        </p>

        <PlanTable title="반별 교재 흐름" t="books" rows={tables.books} editing={edit.books} disabled={busy}
          onToggle={() => setEdit((e) => ({ ...e, books: !e.books }))} onCell={setCell} onAct={act} armed={armed} />

        <PlanTable title="내신 대비 기간" lead="학교 시험 전에는 정규 진도 대신 무엇을 할지 반별로 정해 주세요."
          t="exam" rows={tables.exam} editing={edit.exam} disabled={busy}
          onToggle={() => setEdit((e) => ({ ...e, exam: !e.exam }))} onCell={setCell} onAct={act} armed={armed} />

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">단원별 차시 계획</h2>
          <p className="text-sm text-gray-500 max-w-2xl">
            탭을 골라 반마다 따로 적어 주세요. 「공통」은 반편성 전 전원이 같이 나가는 진도, W·I·S·E 탭은 반편성 뒤 그 반만의 진도입니다.
            교재 흐름에서 「차시표에 넣기」를 켠 단계마다 차시 칸이 생깁니다.
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
                  {t.label}<span className="block text-xs font-normal text-gray-500 mt-0.5">{sub || ' '}</span>
                </button>
              )
            })}
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 900 }}>
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
                              <td key={f} className={`px-1.5 py-1.5 border-r last:border-r-0 border-gray-100 ${f === 'memo' ? 'w-48' : 'w-24'}`}>
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
      </div>
    </div>
  )
}

/* ---------- 교재 흐름 · 내신 대비 표 ---------- */
function PlanTable({ title, lead, t, rows, editing, disabled, onToggle, onCell, onAct, armed }: {
  title: string; lead?: string; t: TableKey; rows: PlanRow[]; editing: boolean; disabled: boolean
  onToggle: () => void; onCell: (t: TableKey, id: string, key: string, v: string) => void
  onAct: (t: TableKey, id: string | null, what: string, extra?: string) => void; armed: string | null
}) {
  const btn = 'px-2 py-0.5 text-xs rounded-md border border-gray-200 bg-white hover:border-[#2f4bb5] disabled:opacity-40'
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <button type="button" onClick={onToggle} disabled={disabled}
          className={`px-3 py-1.5 text-sm rounded-lg border ${editing ? 'border-[#2f4bb5] text-[#2f4bb5] bg-[#e8edfb]' : 'border-gray-200 bg-white text-gray-700'}`}>
          {editing ? '다 고쳤어요' : '구성 고치기'}
        </button>
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
                    <Field plain singleLine value={r.label} onCommit={(v) => onCell(t, r.id, 'label', v)} placeholder="이름" disabled={disabled} className="font-bold text-[15px] text-gray-900" />
                    <Field plain singleLine value={r.sub} onCommit={(v) => onCell(t, r.id, 'sub', v)} placeholder={editing ? '설명 (선택)' : ''} disabled={disabled} className="text-xs text-gray-500" />
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
                        placeholder={ph} disabled={disabled} className={`${cellCls} text-center`} color={gate ? ACCENT : undefined} />
                    </td>
                  ) : CLASSES.map((c) => (
                    <td key={c.k} className="px-3 py-2.5 align-top border-r last:border-r-0 border-gray-200">
                      <Field plain={r.style !== 'plain'} singleLine={r.style !== 'plain'} value={r[c.k]} onCommit={(v) => onCell(t, r.id, c.k, v)}
                        placeholder={ph} disabled={disabled} className={cellCls} color={r.style === 'book' ? c.color : undefined} />
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

/* ---------- 칸 하나: 적는 동안은 내 글자를 지키고, 벗어날 때만 저장 ---------- */
function Field({ value, onCommit, placeholder, disabled, className = '', color, plain, singleLine, input }: {
  value?: string; onCommit: (v: string) => void; placeholder?: string; disabled?: boolean
  className?: string; color?: string; plain?: boolean; singleLine?: boolean; input?: boolean
}) {
  const [v, setV] = useState(value ?? '')
  const focused = useRef(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (!focused.current) setV(value ?? '') }, [value])
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }, [v])
  const commit = () => {
    focused.current = false
    const out = singleLine || input ? v.replace(/\s*\n\s*/g, ' ').trim() : v.trim()
    if (out !== v) setV(out)
    if (out !== (value ?? '')) onCommit(out)
  }
  const base = plain
    ? 'w-full bg-transparent border border-dashed border-transparent hover:border-gray-300 focus:bg-white focus:outline-2 focus:outline-[#2f4bb5] rounded px-1.5 py-0.5 -mx-1.5'
    : 'w-full bg-white border border-gray-200 focus:outline-2 focus:outline-[#2f4bb5] rounded-md px-2 py-1.5 text-sm disabled:bg-transparent disabled:border-dashed'
  if (input) return (
    <input value={v} placeholder={placeholder} disabled={disabled} className={`${base} ${className} placeholder:text-gray-300`}
      onFocus={() => { focused.current = true }} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur() }} />
  )
  return (
    <textarea ref={ref} rows={1} value={v} placeholder={placeholder} disabled={disabled}
      className={`${base} ${className} block resize-none overflow-hidden leading-snug placeholder:text-gray-300 placeholder:font-normal`}
      style={color ? { color } : undefined}
      onFocus={() => { focused.current = true }} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (singleLine && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } }} />
  )
}
