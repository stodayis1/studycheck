'use client'

// 차시별 계획표 — 반마다 1차시, 2차시 … 한 줄씩 미리 짠다 (원장님 2026-11-17).
// 2단계에서 학습일지(class_sessions)를 미리 채울 때 이 줄을 그대로 옮긴다. 칸 이름을 학습일지 칸에 맞춰 두었다:
//   kiumBook → today_textbook_name, unitName → today_chapter, kiumRange → progress_content,
//   hwBook → hw_textbook_name, hwPages → hw_textbook_page, hwWorksheet → hw_worksheet_range, daily → daily_test_unit
// 저장: curriculum_plan_docs 의 'lessons-<탭>' 문서 하나 ({ rows: Lesson[] }).

import { useState } from 'react'
import type { Course, PlanRow } from '@/lib/highCurriculum'
import { unitDocId } from '@/lib/highCurriculum'
import { Field } from './Field'

export interface Lesson {
  id: string
  stage?: string        // 교재 단계(PlanRow.id)
  unit?: string         // 소단원 열쇠 'c1-1.1'
  unitName?: string     // '1.1 다항식의 연산'
  kiumBook?: string
  kiumRange?: string
  chaeum?: string
  hwBook?: string
  hwPages?: string
  hwWorksheet?: string
  daily?: string
  saturday?: string
  memo?: string
}

const newId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const COLS: [keyof Lesson, string, string, string][] = [
  ['kiumBook', '키움 교재', '교재', 'w-32'],
  ['unitName', '소단원', '예: 1.1 다항식의 연산', 'w-44'],
  ['kiumRange', '키움 진도 (2시간)', '예: 개념 1~3, 유형 01~05', 'w-52'],
  ['chaeum', '채움 (1시간 · 지난 차시 복습)', '지난 차시 복습', 'w-52'],
  ['hwBook', '숙제 교재', '교재', 'w-32'],
  ['hwPages', '숙제 범위', '예: p.12~15', 'w-28'],
  ['hwWorksheet', '숙제 학습지', '예: 1.1 유형 학습지', 'w-36'],
  ['daily', '데일리 범위', '예: 1.1 10문항', 'w-36'],
  ['saturday', '토요 테스트', '예: 1주차', 'w-24'],
  ['memo', '메모', '', 'w-40'],
]

export function LessonPlan({ tab, tabLabel, stages, bookName, courses, docs, saveDoc, disabled, studentCount }: {
  tab: string; tabLabel: string
  stages: PlanRow[]                       // 이 탭에서 차시표에 넣은 교재 단계
  bookName: (r: PlanRow, tab: string) => string
  courses: Course[]
  docs: Record<string, any>
  saveDoc: (docId: string, data: any) => void
  disabled: boolean
  studentCount?: number
}) {
  const docId = `lessons-${tab}`
  const rows: Lesson[] = Array.isArray(docs[docId]?.rows) ? docs[docId].rows : []
  const [armed, setArmed] = useState<string | null>(null)
  const arm = (k: string) => { setArmed(k); setTimeout(() => setArmed((a) => (a === k ? null : a)), 3000) }
  const save = (next: Lesson[]) => saveDoc(docId, { rows: next })

  // 위 「단원별 차시 계획」에 적은 소단원별 차시 수로 초안을 만든다
  function draft(): Lesson[] {
    const out: Lesson[] = []
    for (const st of stages) {
      const book = bookName(st, tab)
      for (const c of courses) for (const [, smalls] of c.units) for (const s of smalls) {
        const k = s.indexOf(' '); const num = s.slice(0, k); const name = s.slice(k + 1)
        const d = docs[unitDocId(tab, c.key, num)] || {}
        const n = Math.max(0, Math.round(parseFloat(d['l_' + st.id]) || 0))
        for (let i = 1; i <= n; i++) {
          out.push({
            id: newId(), stage: st.id, unit: `${c.key}-${num}`, unitName: `${num} ${name}`,
            kiumBook: book, kiumRange: [n > 1 ? `${name} (${i}/${n})` : name, d.kium].filter(Boolean).join(' · '),
            chaeum: out.length === 0 ? '첫 차시 — 진단·오리엔테이션' : (d.chaeum || '지난 차시 복습 (대표문제 · 데일리 · 오답)'),
            hwBook: book, hwPages: d.homework || '', daily: [name, d.daily].filter(Boolean).join(' '),
            saturday: '', memo: '',
          })
        }
      }
    }
    return out
  }
  const draftCount = draft().length

  function makeDraft() {
    if (rows.length && armed !== 'draft') { arm('draft'); return }
    setArmed(null); save(draft())
  }
  function setCell(i: number, f: keyof Lesson, v: string) {
    const next = rows.map((r, j) => (j === i ? { ...r, [f]: v } : r)); save(next)
  }
  function insertAfter(i: number) {
    const base: Partial<Lesson> = rows[i] || {}
    const next = [...rows]; next.splice(i + 1, 0, { id: newId(), stage: base.stage, kiumBook: base.kiumBook, hwBook: base.hwBook, chaeum: '지난 차시 복습' })
    save(next)
  }
  function remove(i: number) {
    const k = 'del-' + rows[i].id
    if (armed !== k) { arm(k); return }
    setArmed(null); save(rows.filter((_, j) => j !== i))
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">
          차시별 계획 <span className="text-sm font-normal text-gray-500">· {tabLabel}{typeof studentCount === 'number' ? ` · 학생 ${studentCount}명` : ''} · {rows.length}차시</span>
        </h2>
        <button type="button" onClick={makeDraft} disabled={disabled || draftCount === 0}
          className={`px-3 py-1.5 text-sm rounded-lg border ${armed === 'draft' ? 'bg-[#b4480c] text-white border-[#b4480c]' : 'border-[#2f4bb5] text-[#2f4bb5] bg-white'} disabled:opacity-40`}>
          {armed === 'draft' ? `한 번 더 누르면 지금 ${rows.length}차시를 지우고 새 초안으로` : rows.length ? '차시표로 초안 다시 만들기' : `차시표로 초안 만들기 (${draftCount}차시)`}
        </button>
      </div>
      <p className="text-sm text-gray-500 max-w-3xl">
        이 반이 1차시부터 무엇을 할지 한 줄씩 미리 짭니다. 이 줄이 앞으로 학생 학습일지(오늘 진도 · 숙제 · 데일리테스트)에 미리 채워질 내용이에요.
        위 「단원별 차시 계획」에 소단원별 차시 수를 적은 뒤 「초안 만들기」를 누르면 줄이 생기고, 그다음 칸마다 다듬으면 됩니다.
      </p>
      <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 1500 }}>
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="px-2 py-2 text-left border-b border-r border-gray-200 w-14">차시</th>
              {COLS.map(([f, label]) => <th key={f} className="px-2 py-2 text-left border-b border-r border-gray-200">{label}</th>)}
              <th className="px-2 py-2 border-b border-gray-200 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={COLS.length + 2} className="px-3 py-6 text-center text-gray-400">
                {draftCount
                  ? '아직 차시 줄이 없어요. 「차시표로 초안 만들기」를 누르거나 아래 「+ 차시 추가」로 한 줄씩 넣어 주세요.'
                  : '아직 차시 줄이 없어요. 위 「단원별 차시 계획」에 소단원별 차시 수를 먼저 적거나, 아래 「+ 차시 추가」로 한 줄씩 넣어 주세요.'}
              </td></tr>
            )}
            {rows.map((r, i) => {
              const prev = rows[i - 1]
              const newUnit = !prev || prev.unit !== r.unit
              const delArmed = armed === 'del-' + r.id
              return (
                <tr key={r.id} className={`border-b border-gray-100 ${newUnit && i > 0 ? 'border-t-2 border-t-gray-200' : ''}`}>
                  <td className="px-2 py-1.5 font-bold tabular-nums text-gray-700 border-r border-gray-100">{i + 1}</td>
                  {COLS.map(([f, , ph, w]) => (
                    <td key={f} className={`px-1.5 py-1.5 border-r border-gray-100 ${w}`}>
                      <Field value={(r[f] as string) || ''} onCommit={(v) => setCell(i, f, v)} placeholder={ph} disabled={disabled} className="text-sm" />
                    </td>
                  ))}
                  <td className="px-1.5 py-1.5 whitespace-nowrap">
                    <button type="button" onClick={() => insertAfter(i)} disabled={disabled}
                      className="px-2 py-0.5 text-xs rounded-md border border-gray-200 bg-white mr-1" title="이 줄 아래에 차시 끼우기">+ 아래</button>
                    <button type="button" onClick={() => remove(i)} disabled={disabled}
                      className={`px-2 py-0.5 text-xs rounded-md border ${delArmed ? 'bg-[#b4480c] text-white border-[#b4480c]' : 'border-gray-200 bg-white text-[#b4480c]'}`}>
                      {delArmed ? '한 번 더' : '삭제'}
                    </button>
                  </td>
                </tr>
              )
            })}
            <tr className="bg-gray-50">
              <td colSpan={COLS.length + 2} className="px-3 py-2.5 text-center">
                <button type="button" onClick={() => insertAfter(rows.length - 1)} disabled={disabled}
                  className="px-3 py-1 text-sm rounded-md border border-[#2f4bb5] text-[#2f4bb5] bg-white">+ 차시 추가</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}
