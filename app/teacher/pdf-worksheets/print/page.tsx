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
import { parseTutorTitle, tutorGradeLabel } from '@/lib/tutorWorksheet'

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

  // 제목은 「과정-단원명-종류-난이도」 (lib/tutorWorksheet.ts). 종류가 없던 때 만든 것은 세 칸이라
  // 자리를 번호로 집지 않고 parseTutorTitle 로 되읽는다.
  const title = String(data.sheet?.title ?? '학습지')
  const { course, kind, level } = parseTutorTitle(title, data.sheet?.course ?? undefined)
  const heading: PrintHeading = {
    top: title,
    doc: title,
    // 큰 글씨 칸은 「3학년」처럼 짧은 자리다 — 과정을 그대로 넣으면 머리 띠가 밀린다
    grade: tutorGradeLabel(course),
    // 오른쪽 상자 — 종류가 있으면 종류, 없으면 난이도 (상자가 좁아 둘 다는 안 들어간다)
    right: kind || (level ? `난이도 ${level}` : '수학의지혜'),
  }
  // 짧은 문항이 많은 자료(교과서 · 단계별 학습지)라 한 단을 **되는 데까지** 채운다
  // (원장님 2026-11-17 「문제가 짧으면 한단에 문제더 넣어서 최대한 효율적으로」)
  return <ExamPaperPrint problems={data.problems} initial={what} heading={heading} defaultPerCol={0} />
}
