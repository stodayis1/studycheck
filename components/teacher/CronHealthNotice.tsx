'use client'
// 원장 대시보드 맨 위 **자동 발송 점검** 띠. 문제가 없으면 아무것도 안 그린다.
//
// 카톡 브리핑·강사 미작성 알림이 안 돌거나 늦거나 실패하면 여기 뜬다(lib/cronHealth).
// 12:30 · 21:30 감시가 문자도 보내지만, 감시 예약까지 죽으면 문자가 안 온다 —
// 그때도 대시보드를 여는 순간 보이게 하려고 여기서 한 번 더 본다.
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface Problem { key: string; label: string; kind: string; detail: string }

export function CronHealthNotice() {
  const [problems, setProblems] = useState<Problem[]>([])

  useEffect(() => {
    apiFetch('/api/cron-health')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setProblems(d.problems ?? []) })
      .catch(() => {})
  }, [])

  if (!problems.length) return null

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #FCA5A5', background: '#FEF2F2' }}>
      <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ background: '#FECACA' }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 14, color: '#991B1B' }} />
        <span className="text-xs font-bold" style={{ color: '#991B1B' }}>자동 발송 점검 — 확인이 필요해요</span>
      </div>
      <ul className="px-4 py-2.5 space-y-1">
        {problems.map((p) => (
          <li key={p.key} className="text-xs" style={{ color: '#7F1D1D' }}>
            <span className="font-bold">{p.label} · {p.kind}</span>
            <span className="ml-1">{p.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
