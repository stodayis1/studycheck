'use client'

// 교과서 연계 — 교과서는 레벨을 매기지 않고 여기서 따로 뽑는다 (관리자 전용)

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { courseLabel } from '@/lib/course'

const NAVY = '#0f3460'

type Book = { book: string; kind?: string; total: number; typed: number; courses: Record<string, number> }

export default function TextbooksPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/problem-bank?books=1')
      .then((r) => r.json())
      .then((d) => setBooks((d.books ?? []).filter((b: Book) => b.kind === 'textbook')))
      .finally(() => setLoading(false))
  }, [])

  const go = (b: Book, course?: string) => {
    // 교과서는 레벨이 없으므로 레벨 조건을 걸지 않는다
    const preset: Record<string, any> = { books: [b.book], levels: [], title: `${b.book} 연계` }
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

        {!loading && books.length === 0 && (
          <div className="text-center py-16">
            <div className="text-gray-700 font-medium mb-2">아직 등록된 교과서가 없습니다.</div>
            <div className="text-sm text-gray-500 leading-relaxed">
              교과서 문제 PDF를 올려 주시면 유형별로 정리해서<br />여기에서 고를 수 있게 만들어 두겠습니다.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {books.map((b) => (
            <div key={b.book} className="bg-white border rounded-xl p-5" style={{ borderLeft: '4px solid #8b5cf6' }}>
              <div className="flex items-baseline gap-2 mb-1">
                <button onClick={() => go(b)} className="text-lg font-bold hover:underline" style={{ color: '#8b5cf6' }}>
                  {b.book}
                </button>
                <span className="text-xs text-gray-400">{b.total.toLocaleString()}문항</span>
              </div>
              <div className="text-xs text-gray-600 mb-3">
                유형 분류 {b.typed.toLocaleString()}문항 · 레벨 구분 없음
              </div>

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
          ))}
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="교과서 연계" subtitle="교과서와 학기를 고르세요" showBack />
      <div className="max-w-[1100px] mx-auto">{children}</div>
    </div>
  )
}
