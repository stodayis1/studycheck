'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { renderRichContent } from '@/lib/richContent'

interface Announcement {
  id: string
  title: string
  content: string
  created_at: string
  is_important?: boolean
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function StudentAnnouncementsPage() {
  const router = useRouter()
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const stored = sessionStorage.getItem('studycheck_student')
      if (!stored) { router.push('/auth/login'); return }
      // 지금 표시 대상인 공지만 (종료일 지났거나 원장님이 종료 처리한 건 자동 제외)
      const nowIso = new Date().toISOString()
      const { data } = await supabase.from('announcements')
        .select('id, title, content, created_at, is_important')
        .eq('is_active', true)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
        .order('created_at', { ascending: false })
      if (data) setItems(data)
      setLoading(false)
    }
    init()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="공지사항" subtitle="학원에서 보내는 안내" />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-3">
        {loading ? (
          <div className="text-center py-12">
            <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <p className="text-3xl mb-3">📢</p>
            <p className="text-sm text-gray-500">등록된 공지사항이 없어요</p>
          </div>
        ) : (
          items.map((a) => (
            <div key={a.id} className="rounded-2xl p-4" style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
              <p className="text-sm font-bold" style={{ color: '#712B13' }}>{a.is_important && '⭐ '}{a.title}</p>
              <div className="text-xs mt-2" style={{ color: '#712B13', whiteSpace: 'pre-wrap' }}>{renderRichContent(a.content)}</div>
              <p className="text-[10px] mt-2.5" style={{ color: '#993C1D' }}>{fmtDate(a.created_at)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
