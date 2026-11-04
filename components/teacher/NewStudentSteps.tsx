'use client'

// 새로 온 학생 — **무엇을 어디서** 해야 하는지 순서대로 보여 준다.
// 자세한 까닭은 lib/newStudentSteps.ts 에 적어 두었다.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buildSteps, allDone, stepLabel, type StepCounts, type Step } from '@/lib/newStudentSteps'

export interface NewStudent { id: string; name: string; grade: string | null; first_class_date: string | null }

/** 그 학생의 단계별 상태를 센다. 세는 것뿐이라 화면을 바꾸지 않는다. */
async function countFor(id: string): Promise<StepCounts> {
  const n = async (table: string, col = 'student_id') => {
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq(col, id)
    return count ?? 0
  }
  // 학습일지는 수업 기록을 거쳐야 센다 (session_id 로 이어져 있다).
  const { data: ses } = await supabase.from('class_sessions').select('id').eq('student_id', id)
  const sesIds = (ses ?? []).map((x: any) => x.id)
  let notes = 0
  if (sesIds.length) {
    const { count } = await supabase.from('learning_notes')
      .select('id', { count: 'exact', head: true }).in('session_id', sesIds.slice(0, 100))
    notes = count ?? 0
  }
  const [schedules, textbooks, worksheets, briefings] = await Promise.all([
    n('schedules'), n('student_textbooks'), n('student_worksheets'), n('briefing_sends'),
  ])
  return { schedules, textbooks, notes, worksheets, briefings }
}

function StepRow({ s }: { s: Step }) {
  const 색 = s.done ? '#27500A' : s.next ? '#B45309' : '#9ca3af'
  const 바탕 = s.done ? '#EAF3DE' : s.next ? '#FEF3C7' : '#f3f4f6'
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
        style={{ background: 바탕, color: 색 }}>
        {s.done ? <i className="ti ti-check" style={{ fontSize: 12 }} /> : s.no}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] font-bold" style={{ color: s.done ? '#6b7280' : '#1f2937' }}>{s.title}</span>
          {s.href ? (
            <Link href={s.href} className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: '#F2F8FD', color: '#0f3460' }}>{s.where} ↗</Link>
          ) : (
            <span className="text-[11px] text-gray-400">{s.where}</span>
          )}
          {s.next && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
              style={{ background: '#FEF3C7', color: '#92400E' }}>지금 할 차례</span>
          )}
        </div>
        {!s.done && <p className="text-[11px] text-gray-500 mt-0.5">{s.hint}</p>}
      </div>
    </div>
  )
}

export function NewStudentSteps({ students }: { students: NewStudent[] }) {
  const [counts, setCounts] = useState<Record<string, StepCounts>>({})
  const [open, setOpen] = useState<string | null>(students[0]?.id ?? null)

  useEffect(() => {
    let 살아있나 = true
    ;(async () => {
      const got: Record<string, StepCounts> = {}
      for (const s of students.slice(0, 10)) got[s.id] = await countFor(s.id)
      if (살아있나) setCounts(got)
    })()
    return () => { 살아있나 = false }
  }, [students.map((s) => s.id).join(',')])   // eslint-disable-line react-hooks/exhaustive-deps

  // 다 끝난 학생은 **안 보여 준다** — 할 일이 없는데 띄우면 그냥 소음이다.
  const 남은학생 = students.filter((s) => {
    const c = counts[s.id]
    return !c || !allDone(buildSteps(c))
  })
  if (!남은학생.length) return null

  return (
    <div className="rounded-2xl p-4" style={{ background: 'white', border: '1.5px solid #FDE68A' }}>
      <div className="flex items-center gap-2 mb-1">
        <i className="ti ti-user-plus" style={{ color: '#B45309' }} />
        <p className="text-sm font-bold" style={{ color: '#92400E' }}>새로 온 학생 — 이 순서로 해 주세요</p>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        반·시간표까지는 행정(수학OPS)에서 들어와요. 그다음부터가 선생님 몫이에요.
      </p>
      <div className="space-y-1.5">
        {남은학생.map((st) => {
          const c = counts[st.id]
          const steps = c ? buildSteps(c) : null
          const 펼침 = open === st.id
          return (
            <div key={st.id} className="rounded-xl" style={{ background: '#FFFBEB' }}>
              <button onClick={() => setOpen(펼침 ? null : st.id)}
                className="w-full px-3 py-2 flex items-center gap-2 text-left">
                <span className="text-[13px] font-bold text-gray-800">{st.name}</span>
                <span className="text-[11px] text-gray-500">{st.grade}</span>
                {st.first_class_date && (
                  <span className="text-[11px] text-gray-400">
                    첫 수업 {Number(st.first_class_date.slice(5, 7))}/{Number(st.first_class_date.slice(8, 10))}
                  </span>
                )}
                <span className="ml-auto text-[11px] font-bold" style={{ color: '#B45309' }}>
                  {steps ? `${stepLabel(steps)} 단계` : '읽는 중…'}
                </span>
                <i className={`ti ti-chevron-${펼침 ? 'up' : 'down'} text-gray-400`} style={{ fontSize: 14 }} />
              </button>
              {펼침 && steps && (
                <div className="px-3 pb-2.5">
                  {steps.map((s) => <StepRow key={s.no} s={s} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
