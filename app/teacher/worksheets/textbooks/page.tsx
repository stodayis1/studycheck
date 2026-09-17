'use client'

// 교과서 연계 — 학년별 출판사 목록에서 골라 문제은행 화면으로 넘어갑니다 (관리자 전용)

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'

const GRADES = ['중1', '중2', '중3']
const PREFIX = '교과서-'

// book 이름 '교과서-NE능률' → 출판사 표시명 'NE능률'
const publisherOf = (book: string) => book.startsWith(PREFIX) ? book.slice(PREFIX.length) : book

type BookInfo = { book: string; total: number; typed: number; courses: Record<string, number> }

export default function TextbooksPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()

  const [grade, setGrade] = useState(GRADES[0])
  const [books, setBooks] = useState<BookInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let dead = false
    apiFetch('/api/problem-bank?books=1')
      .then((r) => r.json())
      .then((d) => { if (!dead) setBooks((d.books ?? []).filter((b: BookInfo) => b.book.startsWith(PREFIX))) })
      .finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [])

  // 고른 학년에 문항이 하나라도 있는 출판사만 추림
  const publishers = useMemo(() => {
    return books
      .map((b) => {
        const semesters = [1, 2].filter((s) => (b.courses[`${grade}-${s}`] ?? 0) > 0)
        const count = semesters.reduce((a, s) => a + (b.courses[`${grade}-${s}`] ?? 0), 0)
        return { book: b.book, name: publisherOf(b.book), semesters, count }
      })
      .filter((p) => p.semesters.length > 0)
  }, [books, grade])

  const go = (book: string, semester: number) => {
    sessionStorage.setItem('pb_preset', JSON.stringify({
      grade, semester, books: [book], title: `${grade}-${semester} ${publisherOf(book)} 교과서`,
    }))
    router.push('/teacher/problem-bank')
  }

  if (authLoading) return <Shell><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!isAdmin()) return <Shell><div className="p-10 text-center text-gray-500">관리자만 접근할 수 있습니다.</div></Shell>

  return (
    <Shell>
      <div className="px-5 pt-4">
        <div className="flex rounded-lg overflow-hidden border text-sm w-fit">
          {GRADES.map((g) => (
            <button key={g} onClick={() => setGrade(g)}
              className={`px-4 py-2 ${grade === g ? 'text-white font-semibold' : 'bg-white text-gray-600'}`}
              style={grade === g ? { background: NAVY } : {}}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[700px] mx-auto px-5 py-6">
        {loading ? (
          <div className="text-center text-gray-400 py-16">불러오는 중…</div>
        ) : publishers.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-700 font-medium mb-2">{grade}에 등록된 교과서가 없습니다.</div>
            <div className="text-sm text-gray-500 leading-relaxed">
              교과서 문제 PDF를 올려 주시면 유형별로 정리해서<br />여기에서 고를 수 있게 만들어 두겠습니다.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {publishers.map((p) => (
              <div key={p.book} className="bg-white border rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-gray-800">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.count}문항</div>
                </div>
                <div className="flex gap-2">
                  {p.semesters.map((s) => (
                    <button key={s} onClick={() => go(p.book, s)}
                      className="flex-1 py-2 rounded-lg border text-sm text-gray-700 hover:text-white transition"
                      style={{ borderColor: NAVY }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = NAVY }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}>
                      {grade}-{s}학기
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="교과서 연계" subtitle="학년과 출판사를 고르세요" showBack />
      {children}
    </div>
  )
}
