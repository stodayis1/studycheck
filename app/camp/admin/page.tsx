'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'
import { SESSIONS } from '../page'

const PIN = '0801'

interface CampStudent {
  id: string
  name: string
  school: string | null
  is_active: boolean
  sort_order: number
}

interface CampProgress {
  id: string
  student_id: string
  session_no: number
  watched: boolean
  retried: boolean
  worksheet: boolean
}

export default function CampAdminPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  const [students, setStudents] = useState<CampStudent[]>([])
  const [progress, setProgress] = useState<CampProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [adding, setAdding] = useState(false)

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: pData }] = await Promise.all([
      supabase.from('camp_students').select('*').eq('is_active', true).order('sort_order').order('created_at'),
      supabase.from('camp_progress').select('*'),
    ])
    if (sData) setStudents(sData)
    if (pData) setProgress(pData)
    setLoading(false)
  }

  useEffect(() => {
    if (unlocked) fetchData()
  }, [unlocked])

  function checkPin() {
    if (pinInput === PIN) {
      setUnlocked(true)
      setPinError(false)
    } else {
      setPinError(true)
    }
  }

  async function addStudent() {
    if (!newName.trim()) return
    setAdding(true)
    const { error } = await supabase.from('camp_students').insert({
      name: newName.trim(),
      school: newSchool.trim() || null,
      sort_order: students.length,
    })
    if (!error) {
      setNewName('')
      setNewSchool('')
      await fetchData()
    } else {
      alert('학생 추가 실패: ' + error.message)
    }
    setAdding(false)
  }

  async function removeStudent(id: string) {
    if (!confirm('이 학생을 명단에서 제외할까요? (기록은 남아있어요)')) return
    const { error } = await supabase.from('camp_students').update({ is_active: false }).eq('id', id)
    if (error) alert('제외 처리 실패: ' + error.message)
    await fetchData()
  }

  async function toggleCheck(studentId: string, sessionNo: number, field: 'watched' | 'retried' | 'worksheet') {
    const existing = progress.find((p) => p.student_id === studentId && p.session_no === sessionNo)
    const nextVal = existing ? !existing[field] : true
    // 낙관적 업데이트
    setProgress((prev) => {
      const idx = prev.findIndex((p) => p.student_id === studentId && p.session_no === sessionNo)
      if (idx === -1) {
        return [...prev, { id: 'temp', student_id: studentId, session_no: sessionNo, watched: false, retried: false, worksheet: false, [field]: nextVal } as CampProgress]
      }
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: nextVal }
      return copy
    })
    const { error } = await supabase.from('camp_progress').upsert(
      {
        student_id: studentId,
        session_no: sessionNo,
        [field]: nextVal,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'student_id,session_no' }
    )
    // 저장이 실패했는데도 화면엔 체크된 것처럼 보이던 문제(RLS 등) - 실패 시 원래대로 되돌리고 알림
    if (error) {
      setProgress((prev) => {
        const idx = prev.findIndex((p) => p.student_id === studentId && p.session_no === sessionNo)
        if (idx === -1) return prev
        const copy = [...prev]
        copy[idx] = { ...copy[idx], [field]: existing ? existing[field] : false }
        return copy
      })
      alert('저장에 실패했어요: ' + error.message)
    }
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 w-full max-w-xs shadow-sm">
          <p className="text-sm font-bold text-gray-800 mb-1">방학특강 관리자</p>
          <p className="text-xs text-gray-400 mb-4">PIN을 입력하세요</p>
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(false) }}
            onKeyDown={(e) => e.key === 'Enter' && checkPin()}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-center text-lg tracking-widest font-bold mb-2"
            placeholder="••••"
            autoFocus
          />
          {pinError && <p className="text-xs text-red-500 mb-2">PIN이 틀렸어요</p>}
          <button onClick={checkPin} className="w-full bg-purple-600 text-white rounded-xl py-2.5 text-sm font-bold">
            확인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        <div>
          <p className="text-xs text-gray-400">공통수학1 · 짤강 방학특강</p>
          <h1 className="text-lg font-black text-gray-900">진도 체크 관리</h1>
        </div>

        {/* 학생 추가 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3.5 space-y-2">
          <p className="text-xs font-bold text-gray-500">수강생 추가</p>
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <input value={newSchool} onChange={(e) => setNewSchool(e.target.value)} placeholder="학교(선택)"
              className="w-28 border border-gray-200 rounded-xl px-3 py-2 text-sm" />
            <button onClick={addStudent} disabled={adding || !newName.trim()}
              className="bg-purple-600 text-white rounded-xl px-4 text-sm font-bold disabled:opacity-40">추가</button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <span className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : students.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            수강생을 추가해주세요
          </div>
        ) : (
          <div className="space-y-2">
            {students.map((student) => {
              const rows = progress.filter((p) => p.student_id === student.id)
              const cleared = SESSIONS.filter((s) => {
                const r = rows.find((x) => x.session_no === s.no)
                return r?.watched && r?.retried && r?.worksheet
              }).length
              const isOpen = openId === student.id
              return (
                <div key={student.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <button onClick={() => setOpenId(isOpen ? null : student.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left">
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-black shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{student.name}</p>
                      <p className="text-[11px] text-gray-400">{student.school || '-'} · {cleared}/{SESSIONS.length}회차 클리어</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeStudent(student.id) }}
                      className="text-[11px] text-gray-300 px-2">삭제</button>
                    <i className={cx('ti', isOpen ? 'ti-chevron-up' : 'ti-chevron-down')} style={{ color: '#d1d5db' }} />
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {SESSIONS.map((s) => {
                        const r = rows.find((x) => x.session_no === s.no)
                        return (
                          <div key={s.no} className="px-4 py-2.5 flex items-center gap-2">
                            <div className="w-14 shrink-0">
                              <p className="text-[11px] font-bold text-gray-700">{s.no}회</p>
                              <p className="text-[9px] text-gray-400">{s.date}</p>
                            </div>
                            <p className="flex-1 min-w-0 text-[11px] text-gray-500 truncate">{s.title}</p>
                            <div className="flex gap-1.5 shrink-0">
                              {(['watched', 'retried', 'worksheet'] as const).map((field) => {
                                const label = field === 'watched' ? '짤강' : field === 'retried' ? '오답' : '학습지'
                                const on = !!r?.[field]
                                return (
                                  <button key={field} onClick={() => toggleCheck(student.id, s.no, field)}
                                    className={cx('text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors',
                                      on ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-400 border-gray-200')}>
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-300 pt-2">학생용 보드: /camp</p>
      </div>
    </div>
  )
}
