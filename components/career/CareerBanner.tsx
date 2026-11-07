'use client'

// 대시보드 위 「진로 설문」 안내 띠 — 학생·학부모 화면 (원장님 2026-11-07 「게시는 각 학생·학부모 화면에」)
//   · 설문 대상(중3 = 예비고1 · 고1 = 예비고2)이고 아직 안 냈으면 → 「진로 설문 해 주세요」
//   · 냈으면 → 「보낸 진로 설문 보기 · 고치기」 (작게)
//   · 테스트 학생(윤수지·테스트)은 학년과 상관없이 늘 보인다 (lib/testStudents.ts)
// 대상 학년도 테스트 학생도 아니면 서버를 부르지 않는다.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiFetch'
import { formForGrade, FORMS, type FormId } from '@/lib/careerSurvey'
import { isTestStudentId } from '@/lib/testStudents'

export default function CareerBanner({ studentId, grade, href }: { studentId: string; grade: string | null | undefined; href: string }) {
  const may = !!formForGrade(grade) || isTestStudentId(studentId)
  const [st, setSt] = useState<{ forms: FormId[]; answers: Record<string, any>; isTest: boolean } | null>(null)

  useEffect(() => {
    if (!may) return
    apiFetch('/api/career').then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) setSt(j) })
      .catch(() => { /* 띠 하나 — 못 불러오면 안 보인다 */ })
  }, [may])

  if (!may || !st || !st.forms.length) return null
  const form = st.forms[0]
  const answered = st.forms.every((f) => st.answers?.[f])

  if (answered) return (
    <Link href={href} className="block rounded-2xl px-4 py-2.5 text-xs" style={{ background: '#F0FBF7', color: '#0F6E56', border: '1px solid #C7DED6' }}>
      🧭 학생부 로드맵 질문지를 보냈어요 · 보낸 답 보기 · 고치기 →
    </Link>
  )
  return (
    <Link href={href} className="block rounded-2xl px-4 py-3.5" style={{ background: '#085041', color: '#fff' }}>
      <div className="text-[11px] font-bold tracking-widest opacity-80">
        수학의지혜 {st.isTest ? '' : FORMS[form].label + ' '}학생부 로드맵{st.isTest ? ' · 🧪 테스트 학생' : ''}
      </div>
      <div className="text-[15px] font-bold mt-0.5">학생부 로드맵 질문지에 답해 주세요 (약 3분)</div>
      <div className="text-xs mt-1 opacity-90">적어 준 진로에 맞춰 선택과목·탐구 주제를 챙겨 드려요 →</div>
    </Link>
  )
}
