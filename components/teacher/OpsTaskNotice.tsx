'use client'
// 대시보드 맨 위에 뜨는 **수학OPS 업무메모·전달사항**.
//
// 업무지시와 전달사항은 OPS 에 쌓이는데, 선생님들은 하루 대부분을 스터디체크에서 보낸다.
// OPS 화면 구석의 작은 표시로는 못 보고 지나간다(원장님 2026-10-21). 그래서 여기에도 띄운다.
// 읽기 전용이다 — 체크·완료 처리는 OPS 에서 한다(기록이 한 곳에만 남아야 한다).
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'

// 가는 곳이 **둘**이다. 하나로 묶으면 안 된다 (원장님 2026-10-29):
//   전달사항(staff_notes) → OPS **첫 화면**의 「오늘 할 일」. 여기서만 「확인」을 누를 수 있다.
//                           첫 화면은 역할에 따라 갈린다(원장·행정 /dashboard, 강사 /teacher) —
//                           그래서 뿌리(/)로 보내 OPS 가 알아서 고르게 한다.
//   업무메모(work_instructions) → /instructions
// 예전엔 둘 다 /instructions 로 보냈는데, 그 화면엔 전달사항이 **아예 없어서**
// 출결 알림을 보고 눌러 들어간 원장님께 「표시할 업무메모가 없습니다」만 떴다.
const OPS_HOME = 'https://sumath-admin.vercel.app/'
const OPS_TASKS = 'https://sumath-admin.vercel.app/instructions'

interface Instruction {
  id: string
  title: string
  category?: string | null
  content?: string | null
  due_date?: string | null
  checklist: { done: number; total: number; items?: { title: string; completed: boolean }[] }
}
interface Note { id: string; content: string; note_date: string }

const dday = (due?: string | null) => {
  if (!due) return null
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const diff = Math.round((new Date(due + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000)
  return diff === 0 ? '오늘까지' : diff > 0 ? `D-${diff}` : `${-diff}일 지남`
}

export function OpsTaskNotice() {
  const [data, setData] = useState<{ instructions: Instruction[]; notes: Note[] } | null>(null)

  useEffect(() => {
    apiFetch('/api/ops-tasks')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setData({ instructions: d.instructions ?? [], notes: d.notes ?? [] }) })
      .catch(() => {})
  }, [])

  if (!data || (!data.instructions.length && !data.notes.length)) return null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #BFDBFE', background: '#F8FBFF' }}>
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#BFDBFE' }}>
        <div className="flex items-center gap-1.5">
          <i className="ti ti-clipboard-check" style={{ fontSize: 14, color: '#1E3A8A' }} />
          <span className="text-xs font-bold" style={{ color: '#1E3A8A' }}>업무메모 · 전달사항</span>
        </div>
        <a href={data.notes.length ? OPS_HOME : OPS_TASKS} target="_blank" rel="noreferrer"
          className="text-[10px] font-semibold" style={{ color: '#1E3A8A' }}>
          수학OPS에서 처리 ›
        </a>
      </div>

      <div className="divide-y" style={{ borderColor: '#BFDBFE60' }}>
        {/* 전달사항 — 누르면 OPS 첫 화면. 「확인」은 거기에만 있다(기록이 한 곳에만 남아야 한다) */}
        {data.notes.map((n) => (
          <a key={n.id} href={OPS_HOME} target="_blank" rel="noreferrer" className="block px-4 py-2.5 hover:bg-[#EFF6FF]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold" style={{ color: '#1D4ED8' }}>전달사항</p>
              <span className="text-[10px] font-semibold shrink-0" style={{ color: '#6B8FD6' }}>수학OPS 「오늘 할 일」에서 확인 ›</span>
            </div>
            <p className="text-xs mt-0.5 whitespace-pre-wrap" style={{ color: '#1E3A8A' }}>{n.content}</p>
          </a>
        ))}

        {/* 업무메모 — 누르면 OPS 업무메모 화면 */}
        {data.instructions.map((it) => (
          <a key={it.id} href={OPS_TASKS} target="_blank" rel="noreferrer" className="block px-4 py-2.5 hover:bg-[#EFF6FF]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-bold" style={{ color: '#1E3A8A' }}>{it.title}</p>
              {it.due_date && (
                <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                  style={{ background: '#DBEAFE', color: '#1D4ED8' }}>{dday(it.due_date)}</span>
              )}
              {it.checklist.total > 0 && (
                <span className="text-[10px] font-semibold" style={{ color: '#2563EB' }}>
                  {it.checklist.done}/{it.checklist.total} 완료
                </span>
              )}
            </div>
            {it.content && (
              <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: '#3B5BA5' }}>{it.content}</p>
            )}
            {/* 적어 둔 순서 그대로 — 아직 안 한 것부터 위에서 다섯 개까지만 */}
            {!!it.checklist.items?.length && (
              <ul className="mt-1.5 space-y-0.5">
                {it.checklist.items.filter(c => !c.completed).slice(0, 5).map((c, i) => (
                  <li key={i} className="text-[11px] flex items-start gap-1" style={{ color: '#1E3A8A' }}>
                    <i className="ti ti-square" style={{ fontSize: 11, marginTop: 1, color: '#93B4F5' }} />
                    <span>{c.title}</span>
                  </li>
                ))}
                {it.checklist.items.filter(c => !c.completed).length > 5 && (
                  <li className="text-[10px]" style={{ color: '#6B8FD6' }}>
                    외 {it.checklist.items.filter(c => !c.completed).length - 5}개
                  </li>
                )}
              </ul>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}
