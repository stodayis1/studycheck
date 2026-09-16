'use client'

// 학습지 출제 첫 화면 — 교재연계 / 문제은행 / 목적별 (관리자 전용)

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'

type Card = {
  title: string
  badge?: string
  desc: string
  color: string
  preset?: Record<string, any>
  href?: string
  soon?: boolean
}

export default function WorksheetsPage() {
  const { isAdmin, loading } = useAuth()
  const router = useRouter()
  const [bookCount, setBookCount] = useState<number | null>(null)

  useEffect(() => {
    apiFetch('/api/problem-bank?books=1')
      .then((r) => r.json())
      .then((d) => setBookCount((d.books ?? []).length))
      .catch(() => setBookCount(null))
  }, [])

  const sections: { name: string; note: string; cards: Card[] }[] = [
    {
      name: '교재 연계',
      note: '',
      cards: [
        {
          title: '시중교재',
          badge: bookCount ? `+${bookCount}종` : undefined,
          desc: '시중교재 쌍둥이·유사 문제 출제',
          color: '#ec4899',
          href: '/teacher/worksheets/books',
        },
        {
          title: '교과서',
          desc: '교과서 쌍둥이·유사 문제 출제',
          color: '#8b5cf6',
          href: '/teacher/worksheets/textbooks',
        },
      ],
    },
    {
      name: '문제은행',
      note: '쎈 유형표를 기준으로 교재를 가리지 않고 뽑습니다.',
      cards: [
        { title: '유형별', desc: '유형을 직접 골라 출제', color: '#0ea5e9', preset: { byType: true } },
        { title: '단원별', desc: '대단원·소단원으로 출제', color: '#0ea5e9', preset: { byType: false } },
      ],
    },
    {
      name: '목적별',
      note: '',
      cards: [
        { title: '오답 · 오답유사', desc: '학생별 틀린 문제와 같은 유형 출제', color: '#f97316', href: '/teacher/gradings' },
        { title: '고난도', desc: '난이도 상 · 쎈 C단계 중심', color: '#ef4444', preset: { diffs: ['상', '심화'], mode: 'hard', title: '고난도' } },
        { title: '서술형', desc: '주관식 문항만 모아서', color: '#10b981', preset: { answerType: 'written', title: '서술형' } },
        { title: '모의고사 기출', desc: '아직 문제가 없습니다', color: '#94a3b8', soon: true },
      ],
    },
  ]

  const go = (c: Card) => {
    if (c.soon) return
    if (c.href) { router.push(c.href); return }
    try { sessionStorage.setItem('pb_preset', JSON.stringify(c.preset ?? {})) } catch { /* 무시 */ }
    router.push('/teacher/problem-bank')
  }

  if (loading) return <Shell><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!isAdmin()) return <Shell><div className="p-10 text-center text-gray-500">관리자만 접근할 수 있습니다.</div></Shell>

  return (
    <Shell>
      <div className="px-5 py-6">
        {sections.map((s) => (
          <section key={s.name} className="mb-8">
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-base font-bold" style={{ color: NAVY }}>{s.name}</h2>
              {s.note && <span className="text-xs text-gray-400">{s.note}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {s.cards.map((c) => <BigCard key={c.title} c={c} onClick={() => go(c)} />)}
            </div>
          </section>
        ))}
      </div>
    </Shell>
  )
}

function BigCard({ c, onClick }: { c: Card; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={c.soon}
      className={`text-left bg-white border rounded-xl px-5 py-4 transition ${
        c.soon ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:-translate-y-0.5'
      }`}
      style={{ borderLeft: `4px solid ${c.color}` }}>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-lg font-bold" style={{ color: c.color }}>{c.title}</span>
        {c.badge && <span className="text-xs text-gray-400">{c.badge}</span>}
      </div>
      <div className="text-xs text-gray-600 leading-relaxed">{c.desc}</div>
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="학습지 출제" subtitle="만들 학습지 종류를 고르세요" />
      <div className="max-w-[1400px] mx-auto">{children}</div>
    </div>
  )
}
