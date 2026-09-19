'use client'

// 시중교재 고르기 — 고른 교재로 문제은행 화면에 들어간다 (관리자 전용)

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { courseLabel } from '@/lib/course'

const NAVY = '#0f3460'

type Book = { book: string; kind?: string; total: number; typed: number; courses: Record<string, number> }

// 교재 소개 문구 (없는 교재는 기본 문구)
const INFO: Record<string, { color: string; desc: string }> = {
  '쎈': { color: '#ec4899', desc: 'B단계 유형 · C단계 심화' },
  '쎈B': { color: '#8b5cf6', desc: '쎈과 1:1로 짝지어진 쌍둥이 문제' },
  '베이직쎈': { color: '#0ea5e9', desc: '기본·핵심유형 / 학교시험 기출' },
  '풍산자 필수유형': { color: '#16a34a', desc: '실력을 기르는 유형 · 내신 서술형 · 고득점 도약' },
}

export default function BooksPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/problem-bank?books=1')
      .then((r) => r.json())
      .then((d) => setBooks((d.books ?? []).filter((b: Book) => b.kind !== 'textbook')))
      .finally(() => setLoading(false))
  }, [])

  const go = (b: Book, course?: string) => {
    const preset: Record<string, any> = { books: [b.book], title: `${b.book} 연계` }
    if (course) { const [g, s] = course.split('-'); preset.grade = g; preset.semester = Number(s) }
    try { sessionStorage.setItem('pb_preset', JSON.stringify(preset)) } catch { /* 무시 */ }
    router.push('/teacher/problem-bank')
  }

  if (authLoading) return <Shell><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!isAdmin()) return <Shell><div className="p-10 text-center text-gray-500">관리자만 접근할 수 있습니다.</div></Shell>

  return (
    <Shell>
      <div className="px-5 py-6">
        {loading && <div className="text-gray-400 text-center py-10">불러오는 중…</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {books.map((b) => {
            const info = INFO[b.book] ?? { color: '#64748b', desc: '' }
            return (
              <div key={b.book} className="bg-white border rounded-xl p-5"
                style={{ borderLeft: `4px solid ${info.color}` }}>
                <div className="flex items-baseline gap-2 mb-1">
                  <button onClick={() => go(b)} className="text-lg font-bold hover:underline"
                    style={{ color: info.color }}>{b.book}</button>
                  <span className="text-xs text-gray-400">{b.total.toLocaleString()}문항</span>
                  {b.typed < b.total && (
                    <span className="text-[11px] text-gray-400">· 유형 분류 {b.typed.toLocaleString()}</span>
                  )}
                </div>
                <div className="text-xs text-gray-600 mb-3">{info.desc}</div>

                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(b.courses).sort(([a], [c]) => a.localeCompare(c)).map(([k, n]) => {
                    const [g, sem] = k.split('-')
                    return (
                      <button key={k} disabled={!n} onClick={() => go(b, k)}
                        className={`py-2 rounded-lg border text-xs ${
                          n ? 'hover:bg-gray-50 text-gray-700' : 'opacity-35 cursor-not-allowed text-gray-400'
                        }`}>
                        <div className="font-medium">{courseLabel(g, sem)}</div>
                        <div className="text-[10px] text-gray-400">{n ? `${n}문항` : '없음'}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {!loading && books.length === 0 && (
          <div className="text-center text-gray-500 py-16">등록된 교재가 없습니다.</div>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="시중교재 연계" subtitle="교재와 학기를 고르세요" showBack />
      <div className="max-w-[1100px] mx-auto">{children}</div>
    </div>
  )
}
