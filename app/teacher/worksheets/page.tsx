'use client'

// 학습지 출제 첫 화면 — 교재연계 / 문제은행 / 목적별 (관리자 전용)

import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'

const NAVY = '#0f3460'
const GOLD = '#c8992e'

type Card = {
  title: string
  desc: string
  icon: string
  preset?: Record<string, any>
  href?: string
  soon?: boolean
}

const SECTIONS: { name: string; note: string; cards: Card[] }[] = [
  {
    name: '교재 연계',
    note: '풀던 교재에서 쌍둥이·유사 문제를 뽑습니다.',
    cards: [
      { title: '쎈', desc: 'B단계·C단계 유형 문제', icon: 'ti-book', preset: { books: ['쎈'], title: '쎈 연계' } },
      { title: '쎈B', desc: '쎈과 1:1로 짝지어진 쌍둥이 문제', icon: 'ti-books', preset: { books: ['쎈B'], title: '쎈B 연계' } },
      { title: '베이직쎈', desc: '기본·핵심유형 / 학교시험 기출', icon: 'ti-book-2', preset: { books: ['베이직쎈'], title: '베이직쎈 연계' } },
    ],
  },
  {
    name: '문제은행',
    note: '쎈 유형표를 기준으로 교재를 가리지 않고 뽑습니다.',
    cards: [
      { title: '유형별', desc: '유형을 직접 골라 출제', icon: 'ti-category', preset: { byType: true } },
      { title: '단원별', desc: '대단원·소단원으로 출제', icon: 'ti-list-tree', preset: { byType: false } },
    ],
  },
  {
    name: '목적별',
    note: '',
    cards: [
      { title: '오답 · 오답유사', desc: '학생별 틀린 문제와 같은 유형 출제', icon: 'ti-alert-triangle', href: '/teacher/gradings' },
      { title: '고난도', desc: '난이도 상 · 쎈 C단계 중심', icon: 'ti-flame', preset: { diffs: ['상', '심화'], mode: 'hard', title: '고난도' } },
      { title: '서술형', desc: '주관식 문항만 모아서', icon: 'ti-pencil', preset: { answerType: 'written', title: '서술형' } },
      { title: '모의고사 기출', desc: '아직 문제가 없습니다', icon: 'ti-file-certificate', soon: true },
    ],
  },
]

export default function WorksheetsPage() {
  const { isAdmin, loading } = useAuth()
  const router = useRouter()

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
        {SECTIONS.map((s) => (
          <section key={s.name} className="mb-8">
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-base font-bold" style={{ color: NAVY }}>{s.name}</h2>
              {s.note && <span className="text-xs text-gray-400">{s.note}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {s.cards.map((c) => (
                <button key={c.title} onClick={() => go(c)} disabled={c.soon}
                  className={`text-left bg-white border rounded-2xl p-4 transition ${
                    c.soon ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:-translate-y-0.5'
                  }`}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: '#eef2f8' }}>
                    <i className={`ti ${c.icon} text-lg`} style={{ color: NAVY }} />
                  </div>
                  <div className="font-semibold text-gray-900 mb-0.5">{c.title}</div>
                  <div className="text-xs text-gray-500 leading-relaxed">{c.desc}</div>
                  {!c.soon && (
                    <div className="mt-3 text-xs font-medium" style={{ color: GOLD }}>출제하기 →</div>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Shell>
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
