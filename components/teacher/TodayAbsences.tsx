'use client'

// 오늘 결석 — 대시보드 전달사항 자리에 같이 띄운다.
// 까닭은 lib/opsAbsences.ts 에 적어 두었다 (「당일 되면 까먹기 마련」).

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface Item {
  studentId: string; name: string; grade: string | null; teacherName: string | null
  reason: string | null; personalLeave: boolean; makeupRequired: boolean; line: string
}

export function TodayAbsences() {
  const [items, setItems] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let 살아있나 = true
    apiFetch('/api/absences-today')
      .then((r) => r.json())
      .then((d) => { if (살아있나) { setItems(d?.items ?? []); setLoaded(true) } })
      .catch(() => { if (살아있나) setLoaded(true) })
    return () => { 살아있나 = false }
  }, [])

  // 결석이 없으면 **아무것도 안 띄운다.** 「오늘 결석 없음」을 날마다 보여 줄 이유가 없다.
  if (!loaded || !items.length) return null

  return (
    <div className="rounded-2xl p-4" style={{ background: 'white', border: '1.5px solid #F5C4B3' }}>
      <div className="flex items-center gap-2 mb-1">
        <i className="ti ti-user-off" style={{ color: '#991b1b' }} />
        <p className="text-sm font-bold" style={{ color: '#991b1b' }}>오늘 결석 {items.length}명</p>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        미리 알려 주신 결석이에요. <b>학부모님께 따로 연락하지 않으셔도 됩니다.</b>
      </p>
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.studentId} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: '#FAECE7' }}>
            <span className="text-[13px] font-bold text-gray-800">{it.name}</span>
            <span className="text-[11px] text-gray-500">{it.grade}</span>
            {it.reason && <span className="text-[11px] text-gray-600">· {it.reason}</span>}
            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md"
              style={it.makeupRequired
                ? { background: '#FAEEDA', color: '#633806' }
                : { background: '#f3f4f6', color: '#6b7280' }}>
              {it.makeupRequired ? '보강 대상' : '보강 안 함'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
