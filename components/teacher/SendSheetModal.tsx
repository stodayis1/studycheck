'use client'

// 학습지를 학생 앱에 띄운다 (교재로 풀고 폰으로 답만 넣는 학습지 — 종이가 필요 없다)
//
// 이미 푼 학생은 체크를 풀어도 빠지지 않는다. 기록이 사라진 것처럼 보이면 안 되기 때문이다.

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'

const NAVY = '#0f3460'

type Student = { id: string; name: string; grade: string | null; class_time: string | null; teacher_name: string | null }
type Target = { studentId: string; submittedAt: string | null; score: number | null; total: number | null }

export function SendSheetModal({ code, onClose }: { code: string; onClose: () => void }) {
  const [students, setStudents] = useState<Student[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Map<string, Target>>(new Map())
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [{ data: st }, r] = await Promise.all([
          supabase.from('students')
            .select('id, name, grade, class_time, teacher_name')
            .eq('is_active', true).order('grade').order('name'),
          apiFetch(`/api/sheet-assign?code=${encodeURIComponent(code)}`),
        ])
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        if (dead) return
        setStudents((st ?? []) as Student[])
        setTitle(j.sheet?.title ?? '')
        setPicked(new Set((j.targets ?? []).map((t: Target) => t.studentId)))
        setDone(new Map((j.targets ?? []).filter((t: Target) => t.submittedAt).map((t: Target) => [t.studentId, t])))
      } catch (e: any) {
        if (!dead) setErr(e.message)
      }
      if (!dead) setLoading(false)
    })()
    return () => { dead = true }
  }, [code])

  const shown = useMemo(() => {
    const k = q.trim()
    if (!k) return students
    return students.filter((s) =>
      s.name.includes(k) || (s.grade ?? '').includes(k) ||
      (s.teacher_name ?? '').includes(k) || (s.class_time ?? '').includes(k))
  }, [students, q])

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const r = await apiFetch('/api/sheet-assign', {
        method: 'POST',
        body: JSON.stringify({ code, studentIds: [...picked], dueDate: due || null }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? '보내지 못했습니다.')
      onClose()
    } catch (e: any) {
      setErr(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white"
        onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-5 py-4">
          <h3 className="font-bold" style={{ color: NAVY }}>학생에게 보내기</h3>
          <p className="mt-0.5 text-xs text-gray-500">{title || code}</p>
          <p className="mt-1 text-[11px] text-gray-400">
            보낸 학생의 할일목록에 뜹니다. 교재로 풀고 폰에서 답만 넣으면 바로 채점돼요.
          </p>
        </div>

        <div className="flex items-center gap-2 border-b px-5 py-2.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 학년 · 담당 · 시간"
            className="flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none" />
          <label className="text-xs text-gray-500">기한</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm outline-none" />
        </div>

        <div className="flex items-center justify-between px-5 py-2 text-xs text-gray-500">
          <span>고른 학생 <b style={{ color: NAVY }}>{picked.size}</b>명</span>
          <span className="flex gap-2">
            <button className="underline" onClick={() => setPicked(new Set(shown.map((s) => s.id)))}>보이는 전체</button>
            <button className="underline" onClick={() => setPicked(new Set())}>모두 해제</button>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-400">불러오는 중…</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {shown.map((s) => {
                const on = picked.has(s.id)
                const solved = done.get(s.id)
                return (
                  <button key={s.id} onClick={() => toggle(s.id)}
                    className="rounded-lg border px-2.5 py-2 text-left text-sm"
                    style={on ? { background: NAVY, color: '#fff', borderColor: NAVY } : undefined}>
                    <div className="font-medium">{s.name}</div>
                    <div className={`text-[10px] ${on ? 'opacity-80' : 'text-gray-400'}`}>
                      {solved
                        ? `다 풀었어요 ${solved.score}/${solved.total}`
                        : [s.grade, s.class_time].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {err && <p className="px-5 pb-1 text-xs text-red-600">{err}</p>}
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">닫기</button>
          <button onClick={save} disabled={saving || loading}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: NAVY }}>
            {saving ? '보내는 중…' : `${picked.size}명에게 보내기`}
          </button>
        </div>
      </div>
    </div>
  )
}
