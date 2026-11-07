'use client'

// 대시보드 위 「진로 설문」 안내 띠 — 설문 대상 학년(중3·고1)이고 아직 안 냈을 때만 보인다.
// 대상이 아닌 학년이면 서버를 부르지 않는다.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiFetch'
import { formForGrade, FORMS } from '@/lib/careerSurvey'

export default function CareerBanner({ grade, href }: { grade: string | null | undefined; href: string }) {
  const form = formForGrade(grade)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!form) return
    apiFetch('/api/career').then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j && j.form && !j.answers) setShow(true)
    }).catch(() => { /* 띠 하나 — 못 불러오면 안 보인다 */ })
  }, [form])

  if (!form || !show) return null
  return (
    <Link href={href} className="block rounded-2xl px-4 py-3" style={{ background: '#F0FBF7', border: '1px solid #9FE1CB' }}>
      <div className="text-sm font-bold" style={{ color: '#085041' }}>🧭 {FORMS[form].label} 진로 설문</div>
      <div className="text-xs mt-0.5" style={{ color: '#0F6E56' }}>{FORMS[form].desc} 3분이면 끝나요 →</div>
    </Link>
  )
}
