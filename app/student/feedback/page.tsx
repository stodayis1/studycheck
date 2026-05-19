'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface Feedback {
  id: string
  teacher_name: string
  content: string
  is_read: boolean
  created_at: string
}

export default function StudentFeedbackPage() {
  const router = useRouter()
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)
        setStudentId(session.id)

        const { data } = await supabase
          .from('feedbacks')
          .select('*')
          .eq('student_id', session.id)
          .order('created_at', { ascending: false })

        if (data) setFeedbacks(data)

        // 읽지 않은 피드백 읽음 처리
        await supabase.from('feedbacks')
          .update({ is_read: true })
          .eq('student_id', session.id)
          .eq('is_read', false)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()}`
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="선생님 피드백" subtitle={`총 ${feedbacks.length}개`} />
      <div className="px-4 py-4 space-y-3 pb-10">
        {feedbacks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <p className="text-4xl mb-3">💬</p>
            <p className="text-sm font-semibold text-gray-600">아직 피드백이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">선생님이 피드백을 남기면 여기에 나타나요</p>
          </div>
        ) : (
          feedbacks.map((fb) => (
            <div key={fb.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="h-1 bg-blue-500" />
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-blue-500 rounded-xl flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-black">{fb.teacher_name?.[0] ?? 'T'}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-blue-700">{fb.teacher_name} 선생님</p>
                    <p className="text-[10px] text-gray-400">{formatDate(fb.created_at)}</p>
                  </div>
                  {!fb.is_read && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-500 rounded-full">NEW</span>
                  )}
                </div>
                <div className="bg-blue-50 rounded-xl px-4 py-3">
                  <p className="text-sm text-gray-700 leading-relaxed">{fb.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
