'use client'

// 모의고사 기출 — 회차 목록 (선생님 전용)
// 학습지 출제 → 「목적별」의 「모의고사 기출」 카드로 들어온다 (사이드바 메뉴는 늘리지 않는다, 원장님 2026-10-22).
// 회차를 누르면 한 장 요약 · 문항별 해설 · 인쇄 화면(/teacher/mock-exams/view?slug=…)으로 간다.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { WorksheetTabs } from '@/components/teacher/WorksheetTabs'
import { apiFetch } from '@/lib/apiFetch'
import type { MockExam } from '@/lib/mockExams'

const NAVY = '#0f3460'
type Row = MockExam & { ready: boolean; count: number }

export default function MockExamsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [year, setYear] = useState<number | null>(null)   // 학년도 탭 (원장님 2026-11-19: 년도별로 탭으로)

  useEffect(() => {
    apiFetch('/api/mock-exams')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setRows(j.exams)
        let saved: number | null = null
        try { saved = Number(localStorage.getItem('mockExamYear')) || null } catch { /* 무시 */ }
        const ys = [...new Set((j.exams as Row[]).map((r) => r.year))]
        setYear(saved && ys.includes(saved) ? saved : Math.max(...ys))
      })
      .catch((e) => setErr(e.message))
  }, [])

  const years = [...new Set((rows ?? []).map((r) => r.year))].sort((a, b) => b - a)
  const grades = (y: number) => [...new Set(rows!.filter((r) => r.year === y).map((r) => r.grade))].sort().reverse()

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="모의고사 기출" subtitle="회차를 고르면 한 장 요약 · 문항별 해설 · 인쇄를 할 수 있습니다" />
      <WorksheetTabs />
      <div className="max-w-[1100px] mx-auto px-5 py-6">
        <Link href="/teacher/worksheets/new" className="text-xs text-gray-500 hover:underline">← 학습지 만들기</Link>
        {err && <p className="mt-6 text-center text-gray-500">{err}</p>}
        {!rows && !err && <p className="mt-6 text-center text-gray-400">불러오는 중…</p>}
        {years.length > 0 && (
          <div className="mt-5 flex gap-1 border-b">
            {years.map((y) => (
              <button key={y}
                onClick={() => { setYear(y); try { localStorage.setItem('mockExamYear', String(y)) } catch { /* 무시 */ } }}
                className="-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold"
                style={year === y
                  ? { background: '#fff', color: NAVY, borderColor: '#e5e7eb', borderBottomColor: '#fff' }
                  : { background: 'transparent', color: '#9ca3af', borderColor: 'transparent' }}>
                {y}학년도
              </button>
            ))}
          </div>
        )}
        {years.filter((y) => y === year).map((y) => (
          <section key={y} className="mt-5">
            {grades(y).map((g) => (
            <div key={g} className="mb-4">
            <div className="mb-2 text-xs font-semibold text-gray-500">{g}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows!.filter((r) => r.year === y && r.grade === g).map((r) => (
                <Link key={r.slug} href={r.ready ? `/teacher/mock-exams/view?slug=${r.slug}` : '#'}
                  className={`block rounded-xl border bg-white px-5 py-4 transition ${r.ready ? 'hover:-translate-y-0.5 hover:shadow-md' : 'pointer-events-none opacity-50'}`}
                  style={{ borderLeft: '4px solid #64748b' }}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold" style={{ color: NAVY }}>{r.short}</span>
                    <span className="text-xs text-gray-400">{r.grade} · {r.kind}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    {r.ready ? `해설 ${r.count}문항${r.tracks.length ? ' · ' + r.tracks.join(' · ') : ''}` : '해설 준비 중'}
                  </div>
                  {r.note && <div className="mt-1 text-[11px] text-gray-400">{r.note}</div>}
                </Link>
              ))}
            </div>
            </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
