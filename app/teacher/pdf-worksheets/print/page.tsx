'use client'
// 강사가 올린 PDF 학습지 한 벌을 「수학의지혜 시험지 양식」으로 인쇄한다.
//   /teacher/pdf-worksheets/print?code=<학습지 코드>
//
// 양식은 기출 인쇄와 **같은 코드**(components/exam-analysis/ExamPaperPrint)를 쓴다.
// 다른 것은 머리 글자뿐이다 — 학교 시험지가 아니므로
//   맨 윗줄 = 제목(공통수학2-삼각함수-중), 큰 글씨 = 과정, 오른쪽 상자 = 난이도.
//
// 누가 보나: 원장님 + 고등 담당 선생님. 진짜 차단은 서버(app/api/pdf-worksheets)가 한다.

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { ExamPaperPrint, type PrintHeading } from '@/components/exam-analysis/ExamPaperPrint'
import { tutorGradeLabel } from '@/lib/tutorWorksheet'

export default function PdfWorksheetPrintPage() {
  const { currentUser, loading } = useAuth()
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  // ?what=answers 로 들어오면 「빠른 정답」부터 보여 준다
  const [what, setWhat] = useState<'paper' | 'answers'>('paper')

  useEffect(() => {
    if (loading || !currentUser) return
    // useSearchParams 는 Suspense 가 필요해서 주소에서 직접 읽는다
    const sp = new URLSearchParams(window.location.search)
    const code = sp.get('code')
    if (sp.get('what') === 'answers') setWhat('answers')
    if (!code) { setErr('학습지를 고르지 않았습니다.'); return }
    apiFetch(`/api/pdf-worksheets?print=${encodeURIComponent(code)}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error ?? '불러오지 못했습니다.')
        setData(j)
      })
      .catch((e) => setErr(e.message))
  }, [loading, currentUser])

  if (err) return <p className="p-10 text-center text-gray-500">{err}</p>
  if (!data) return <p className="p-10 text-center text-gray-400">불러오는 중…</p>

  // 제목은 「과정-단원명-난이도」 (lib/tutorWorksheet.ts 의 tutorTitle). 칸이 모자라면 있는 것만 쓴다.
  const title = String(data.sheet?.title ?? '학습지')
  const [course, , level] = title.split('-')
  const heading: PrintHeading = {
    top: title,
    doc: title,
    // 큰 글씨 칸은 「3학년」처럼 짧은 자리다 — 과정을 그대로 넣으면 머리 띠가 밀린다
    grade: tutorGradeLabel(data.sheet?.course ?? course ?? ''),
    right: level ? `난이도 ${level}` : '수학의지혜',
  }
  return <ExamPaperPrint problems={data.problems} initial={what} heading={heading} />
}
