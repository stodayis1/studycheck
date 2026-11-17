'use client'

// 강사 자료 학습지를 학생에게 배정한다 (원장님 2026-11-17 「어느 학생에게 배정했는지를 기록하게.
// 그래서 그 학생의 학습지 기록에 남길수 있도록」).
//
// 배정하면 학생 앱 「할 일 > 선생님이 보낸 학습지」(app/student/assignments)에 제목 · 마감 · 점수가 뜬다.
// 종이가 필요 없다 — 인쇄해서 줘도 되고, 폰으로 답만 넣어도 된다.
//
// ★ 강사에게는 **본인 담당 학생만** 보인다. 화면이 거르는 것이 아니라 students 정책(staff_or_own)이
//   그만큼만 내려 준다 — 서버도 같은 토큰으로 다시 확인한다(app/api/pdf-worksheets, action 'assign').
// ★ 이미 푼 학생은 체크를 풀어도 빠지지 않는다. 기록이 사라진 것처럼 보이면 안 된다.

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isTestStudentId, myTestStudentId } from '@/lib/testStudents'

const GREEN = '#0f7b6c'

type Student = { id: string; name: string; grade: string | null; teacher_name: string | null; is_test: boolean | null }
type Target = { studentId: string; submittedAt: string | null; score: number | null; total: number | null }

export default function AssignModal({ code, title, onClose, onSaved }: {
  code: string
  title: string
  onClose: () => void
  onSaved: () => void
}) {
  const { currentUser } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Map<string, Target>>(new Map())
  const [due, setDue] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const testId = myTestStudentId(currentUser?.role)

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const [{ data: st, error: e1 }, r] = await Promise.all([
          // 내가 읽을 수 있는 학생만 내려온다 (강사 = 담당, 주임 = 중등, 원장 = 전체, 테스트 학생은 모두)
          supabase.from('students').select('id, name, grade, teacher_name, is_test')
            .or('is_active.eq.true,on_leave.eq.true').order('grade').order('name'),
          apiFetch(`/api/pdf-worksheets?assign=${encodeURIComponent(code)}`),
        ])
        if (e1) throw new Error(e1.message)
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error ?? '불러오지 못했습니다.')
        if (dead) return
        setStudents((st ?? []) as Student[])
        setPicked(new Set((j.targets ?? []).map((t: Target) => t.studentId)))
        setDone(new Map((j.targets ?? []).filter((t: Target) => t.submittedAt).map((t: Target) => [t.studentId, t])))
      } catch (e: any) {
        if (!dead) setErr(e?.message ?? '불러오지 못했습니다.')
      }
      if (!dead) setLoading(false)
    })()
    return () => { dead = true }
  }, [code])

  const shown = useMemo(() => {
    const k = q.trim()
    const list = k
      ? students.filter((s) => s.name.includes(k) || (s.grade ?? '').includes(k) || (s.teacher_name ?? '').includes(k))
      : students
    // 테스트 학생을 맨 위로 — 새 기능을 직접 해 보는 길 (원장님 2026-11-07)
    return [...list].sort((a, b) => Number(isTestStudentId(b.id)) - Number(isTestStudentId(a.id)))
  }, [students, q])

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const save = async () => {
    setSaving(true); setErr(''); setMsg('')
    try {
      const r = await apiFetch('/api/pdf-worksheets', {
        method: 'POST',
        body: JSON.stringify({ action: 'assign', code, studentIds: [...picked], dueDate: due || null }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? '배정하지 못했습니다.')
      setMsg([
        j.added ? `${j.added}명에게 보냈습니다.` : '',
        j.removed ? `${j.removed}명을 뺐습니다.` : '',
        j.kept ? `이미 푼 ${j.kept}명은 그대로 두었습니다.` : '',
        j.refused ? `담당이 아닌 ${j.refused}명은 배정하지 않았습니다.` : '',
      ].filter(Boolean).join(' ') || '바뀐 것이 없습니다.')
      onSaved()
    } catch (e: any) {
      setErr(e?.message ?? '배정하지 못했습니다.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <div className="text-base font-bold" style={{ color: GREEN }}>학생에게 배정</div>
            <div className="text-xs text-gray-500">{title} · 코드 {code}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="닫기"><i className="ti ti-x text-xl" /></button>
        </div>

        {err && <div className="border-b bg-red-50 px-5 py-2 text-sm text-red-700"><i className="ti ti-alert-triangle mr-1" />{err}</div>}
        {msg && <div className="border-b bg-emerald-50 px-5 py-2 text-sm" style={{ color: GREEN }}><i className="ti ti-circle-check mr-1" />{msg}</div>}

        <div className="border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 학년 · 담당으로 찾기"
              className="min-w-40 flex-1 rounded border px-2 py-1.5 text-sm" />
            <label className="flex items-center gap-1 text-xs text-gray-600">마감
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded border px-2 py-1.5 text-sm" />
            </label>
            <button onClick={() => setPicked((p) => new Set([...p, testId]))}
              className="rounded-lg border px-3 py-1.5 text-xs" title="새 기능을 직접 해 보는 학생">
              <i className="ti ti-flask mr-1" />테스트 학생으로 해 보기
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            배정하면 그 학생 앱 「할 일」에 <b>{title}</b> 이 뜨고, 학생의 <b>학습지 기록</b>에 남습니다.
            담당 학생만 보입니다.
          </p>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          {loading ? <p className="py-10 text-center text-sm text-gray-400"><i className="ti ti-loader-2 mr-1 animate-spin" />불러오는 중…</p>
            : !shown.length ? <p className="py-10 text-center text-sm text-gray-400">보이는 학생이 없습니다.</p>
            : (
              <div className="grid gap-1 sm:grid-cols-2">
                {shown.map((s) => {
                  const g = done.get(s.id)
                  return (
                    <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50">
                      <input type="checkbox" checked={picked.has(s.id)} disabled={!!g} onChange={() => toggle(s.id)} />
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-gray-500">{s.grade ?? ''}</span>
                      {isTestStudentId(s.id) && <span className="rounded bg-amber-100 px-1 text-[11px] text-amber-800">테스트</span>}
                      {g && <span className="ml-auto text-xs" style={{ color: GREEN }}>푼 뒤 {g.score ?? '-'}/{g.total ?? '-'}</span>}
                    </label>
                  )
                })}
              </div>
            )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          <span className="text-sm text-gray-600"><b>{picked.size}</b>명 고름</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">닫기</button>
            <button onClick={save} disabled={saving || loading}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
              {saving ? '보내는 중…' : <><i className="ti ti-send mr-1.5" />배정 저장</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
