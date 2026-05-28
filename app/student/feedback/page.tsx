'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'

interface Feedback {
  id: string
  student_id: string
  teacher_name: string
  content: string
  ai_message: string | null
  is_read: boolean
  created_at: string
}

export default function StudentFeedbackPage() {
  const router = useRouter()
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const s = JSON.parse(stored)
        setStudentId(s.id)
        const { data } = await supabase
          .from('feedbacks')
          .select('*')
          .eq('student_id', s.id)
          .order('created_at', { ascending: false })
        if (data) setFeedbacks(data)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  // 읽음 처리
  async function markAsRead(id: string) {
    await supabase.from('feedbacks').update({ is_read: true }).eq('id', id)
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, is_read: true } : f))
  }

  function handleExpand(fb: Feedback) {
    const newId = expandedId === fb.id ? null : fb.id
    setExpandedId(newId)
    if (newId && !fb.is_read) markAsRead(fb.id)
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
  }

  const unreadCount = feedbacks.filter(f => !f.is_read).length

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="선생님 피드백"
        subtitle={unreadCount > 0 ? `읽지 않은 메시지 ${unreadCount}개` : `총 ${feedbacks.length}개`}
      />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-3">

        {feedbacks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <i className="ti ti-message-circle" style={{ fontSize: 40, color: '#F5C4B3', display: 'block', marginBottom: 10 }} />
            <p className="text-sm font-bold text-gray-600">아직 피드백이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">선생님이 알림장을 남기면 여기에 나타나요</p>
          </div>
        ) : (
          feedbacks.map(fb => {
            const isExpanded = expandedId === fb.id
            const isUnread = !fb.is_read

            return (
              <div key={fb.id}
                className="bg-white rounded-2xl border shadow-sm overflow-hidden transition-all"
                style={{ borderColor: isUnread ? '#F5C4B3' : '#f0f0f0' }}>

                {/* 카드 헤더 — 클릭으로 열기/닫기 */}
                <button className="w-full px-4 py-4 flex items-center gap-3 text-left"
                  onClick={() => handleExpand(fb)}>

                  {/* 선생님 아이콘 */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: isUnread ? '#F5C4B3' : '#f3f4f6' }}>
                    <i className="ti ti-user" style={{ fontSize: 18, color: isUnread ? '#712B13' : '#9ca3af' }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-gray-800">{fb.teacher_name} 선생님</p>
                      {isUnread && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: '#F5C4B3', color: '#712B13' }}>새 메시지</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{formatDate(fb.created_at)}</p>
                    {!isExpanded && (
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {fb.ai_message ?? fb.content}
                      </p>
                    )}
                  </div>

                  <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                    style={{ fontSize: 16, color: '#9ca3af', flexShrink: 0 }} />
                </button>

                {/* 펼쳐진 내용 */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f5f5f5' }}>

                    {/* AI 알림장 (메인) */}
                    {fb.ai_message && (
                      <div className="px-4 py-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <i className="ti ti-sparkles" style={{ fontSize: 13, color: '#993C1D' }} />
                          <span className="text-[10px] font-semibold" style={{ color: '#993C1D' }}>선생님 알림장</span>
                        </div>
                        <div className="rounded-xl px-4 py-3 text-sm leading-relaxed text-gray-700"
                          style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
                          {fb.ai_message.split('\n').map((line, i) => (
                            <p key={i} className={i > 0 ? 'mt-1.5' : ''}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 선생님 메모 (부가) */}
                    {fb.content && (
                      <div className="px-4 pb-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <i className="ti ti-pencil" style={{ fontSize: 13, color: '#9ca3af' }} />
                          <span className="text-[10px] font-semibold text-gray-400">선생님 메모</span>
                        </div>
                        <div className="rounded-xl px-4 py-3 text-xs leading-relaxed text-gray-500"
                          style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                          {fb.content.split('\n').map((line, i) => (
                            <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
