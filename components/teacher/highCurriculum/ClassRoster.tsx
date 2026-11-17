'use client'

// 고등 반 편성 — 학생을 고1·고2의 공통·W·I·S·E 반에 넣는다 (원장님 2026-11-17).
// 반 = class_groups(curriculum_grade, class_key), 학생 = students.class_group_id (docs/sql/고등반_만들기.sql).
// 보이는 학생은 students 의 기존 RLS 를 따른다 — 원장·직원은 전체, 강사는 본인 담당 학생만.
// 이 반 정보가 2단계에서 학습일지를 미리 채울 때 「이 학생은 어느 반 계획을 따르나」의 열쇠가 된다.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CLASSES, type GradeKey } from '@/lib/highCurriculum'

type Group = { id: string; name: string; class_key: string; sort_order: number }
type Student = { id: string; name: string; school: string | null; teacher_name: string | null; class_group_id: string | null; is_test: boolean | null; on_leave: boolean | null }

const KEY_COLOR: Record<string, string> = Object.fromEntries(CLASSES.map((c) => [c.k, c.color]))

export function ClassRoster({ grade, gradeLabel, owner, onCounts }: {
  grade: GradeKey; gradeLabel: string; owner: boolean
  onCounts?: (counts: Record<string, number>) => void
}) {
  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setError('')
      const [g, s] = await Promise.all([
        supabase.from('class_groups').select('id, name, class_key, sort_order').eq('curriculum_grade', grade).order('sort_order'),
        supabase.from('students').select('id, name, school, teacher_name, class_group_id, is_test, on_leave')
          .eq('grade', gradeLabel).eq('is_active', true).order('name').order('id'),
      ])
      if (!alive) return
      if (g.error || s.error) { console.error('반 편성 불러오기 실패', g.error || s.error); setError('반 편성을 불러오지 못했어요.') }
      setGroups((g.data as Group[]) || [])
      setStudents((s.data as Student[]) || [])
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [grade, gradeLabel])

  // 반마다 몇 명인지 (위쪽 탭에 보여 준다)
  useEffect(() => {
    if (!onCounts) return
    const counts: Record<string, number> = {}
    for (const st of students) {
      const g = groups.find((x) => x.id === st.class_group_id)
      if (g) counts[g.class_key] = (counts[g.class_key] || 0) + 1
    }
    onCounts(counts)
  }, [students, groups])

  async function assign(st: Student, groupId: string) {
    const next = groupId || null
    if (next === st.class_group_id) return
    setSaving(st.id)
    const { data, error: e } = await supabase.from('students').update({ class_group_id: next }).eq('id', st.id).select('id')
    setSaving(null)
    if (e) { console.error('반 편성 저장 실패', e); setError(`${st.name} 학생 반을 저장하지 못했어요.`); return }
    // RLS 에 막히면 에러 없이 0행이 바뀐다 — 그것도 실패로 본다
    if (!data?.length) { setError(`${st.name} 학생 반을 바꿀 권한이 없어요. 원장님께 말씀해 주세요.`); return }
    setStudents((list) => list.map((x) => (x.id === st.id ? { ...x, class_group_id: next } : x)))
  }

  const unassigned = students.filter((s) => !groups.some((g) => g.id === s.class_group_id)).length

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">반 편성 <span className="text-sm font-normal text-gray-500">· {gradeLabel} 재원생</span></h2>
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-700">
          {open ? '접기' : '학생 반 보기 · 바꾸기'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {groups.map((g) => {
          const n = students.filter((s) => s.class_group_id === g.id).length
          return (
            <span key={g.id} className="px-2.5 py-1 rounded-full border border-gray-200 bg-white">
              <b style={{ color: KEY_COLOR[g.class_key] || '#1b2230' }}>{g.name.replace(/^고\d /, '')}</b> {n}명
            </span>
          )
        })}
        <span className={`px-2.5 py-1 rounded-full border ${unassigned ? 'border-[#b4480c] text-[#b4480c]' : 'border-gray-200 text-gray-500'} bg-white`}>
          반 미정 {unassigned}명
        </span>
      </div>
      {!owner && (
        <p className="text-xs text-gray-500">선생님 담당 학생만 보여요. 다른 학생의 반은 원장님이 정해요.</p>
      )}
      {error && <p className="text-sm text-[#b4480c]">{error}</p>}
      {open && (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-xl">
          <table className="w-full border-collapse text-sm" style={{ minWidth: 560 }}>
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="px-3 py-2 text-left border-b border-gray-200">이름</th>
                <th className="px-3 py-2 text-left border-b border-gray-200">학교</th>
                <th className="px-3 py-2 text-left border-b border-gray-200">담임</th>
                <th className="px-3 py-2 text-left border-b border-gray-200 w-44">반</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">불러오는 중…</td></tr>}
              {!loading && students.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">보이는 {gradeLabel} 재원생이 없어요.</td></tr>
              )}
              {students.map((st) => (
                <tr key={st.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-3 py-1.5">
                    {st.name}
                    {st.is_test && <span className="ml-1 text-xs text-gray-400">(테스트)</span>}
                    {st.on_leave && <span className="ml-1 text-xs text-[#b4480c]">휴원</span>}
                  </td>
                  <td className="px-3 py-1.5 text-gray-600">{st.school}</td>
                  <td className="px-3 py-1.5 text-gray-600">{st.teacher_name}</td>
                  <td className="px-3 py-1.5">
                    <select value={groups.some((g) => g.id === st.class_group_id) ? st.class_group_id : ''} disabled={saving === st.id}
                      onChange={(e) => assign(st, e.target.value)} aria-label={`${st.name} 반`}
                      className="w-full border border-gray-200 rounded-md px-2 py-1 bg-white">
                      <option value="">반 미정</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
