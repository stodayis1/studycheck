'use client'
// 기출 한 벌을 「수학의지혜 시험지 양식」으로 통째 인쇄한다.  /teacher/exam-analysis/print?paper=<시험지 id>
// 문항별로 잘라 문제은행에 넣은 시험만 된다 (scripts/exam-paper). 양식은 components/exam-analysis/ExamPaperPrint.

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { ExamPaperPrint } from '@/components/exam-analysis/ExamPaperPrint'

export default function ExamPaperPrintPage() {
  const { currentUser, loading } = useAuth()
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (loading || !currentUser) return
    // useSearchParams 는 Suspense 가 필요해서 주소에서 직접 읽는다
    const paper = new URLSearchParams(window.location.search).get('paper')
    if (!paper) { setErr('시험지를 고르지 않았습니다.'); return }
    apiFetch(`/api/exam-analysis?print=${paper}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setData(j)
      })
      .catch((e) => setErr(e.message))
  }, [loading, currentUser])

  if (err) return <p className="p-10 text-center text-gray-500">{err}</p>
  if (!data) return <p className="p-10 text-center text-gray-400">불러오는 중…</p>
  return <ExamPaperPrint paper={data.paper} problems={data.problems} />
}
