'use client'

// 교과서 연계 — 아직 교과서 문항이 등록되지 않았습니다 (관리자 전용)

import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'

export default function TextbooksPage() {
  const { isAdmin, loading } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="교과서 연계" subtitle="교과서를 고르세요" showBack />
      <div className="max-w-[1100px] mx-auto px-5 py-16 text-center">
        {loading ? (
          <div className="text-gray-400">불러오는 중…</div>
        ) : !isAdmin() ? (
          <div className="text-gray-500">관리자만 접근할 수 있습니다.</div>
        ) : (
          <>
            <div className="text-gray-700 font-medium mb-2">아직 등록된 교과서가 없습니다.</div>
            <div className="text-sm text-gray-500 leading-relaxed">
              교과서 문제 PDF를 올려 주시면 유형별로 정리해서<br />여기에서 고를 수 있게 만들어 두겠습니다.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
