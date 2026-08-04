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

interface Reply {
  id: string
  feedback_id: string
  sender_type: string
  sender_name: string | null
  content: string
  images: string[] | null
  created_at: string
}

export default function StudentFeedbackPage() {
  const router = useRouter()
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 답장 입력 상태 (알림장 id별)
  const [replyContent, setReplyContent] = useState<Record<string, string>>({})
  const [replyImages, setReplyImages] = useState<Record<string, File[]>>({})
  const [replyImagePreviews, setReplyImagePreviews] = useState<Record<string, string[]>>({})
  const [savingReply, setSavingReply] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const s = JSON.parse(stored)
        setStudentId(s.id)
        setStudentName(s.name ?? '')
        await fetchData(s.id)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  async function fetchData(sid: string) {
    const { data } = await supabase
      .from('feedbacks')
      .select('*')
      .eq('student_id', sid)
      .order('created_at', { ascending: false })
    if (data) {
      setFeedbacks(data)
      const fbIds = data.map((f) => f.id)
      if (fbIds.length > 0) {
        const { data: rpData } = await supabase
          .from('feedback_replies')
          .select('*')
          .in('feedback_id', fbIds)
          .order('created_at', { ascending: true })
        if (rpData) setReplies(rpData)
      }
    }
  }

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

  async function handleSendReply(feedbackId: string) {
    const content = (replyContent[feedbackId] || '').trim()
    const images = replyImages[feedbackId] || []
    if (!content && images.length === 0) return
    if (!studentId) return

    setSavingReply(feedbackId)

    const imageUrls: string[] = []
    for (const file of images) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const fileName = `${studentId}/reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('feedback-images').upload(fileName, file)
      if (!upErr) {
        const { data: pub } = supabase.storage.from('feedback-images').getPublicUrl(fileName)
        if (pub?.publicUrl) imageUrls.push(pub.publicUrl)
      }
    }

    const { data: newReply } = await supabase.from('feedback_replies').insert({
      feedback_id: feedbackId,
      sender_type: 'student',
      sender_name: studentName,
      content: content || '(사진)',
      images: imageUrls.length > 0 ? imageUrls : null,
      is_read: false,
    }).select().single()

    if (newReply) {
      setReplies((prev) => [...prev, newReply])
      setReplyContent((prev) => ({ ...prev, [feedbackId]: '' }))
      setReplyImages((prev) => ({ ...prev, [feedbackId]: [] }))
      setReplyImagePreviews((prev) => ({ ...prev, [feedbackId]: [] }))
    }
    setSavingReply(null)
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
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
        title="선생님 알림장"
        subtitle={unreadCount > 0 ? `읽지 않은 메시지 ${unreadCount}개` : `총 ${feedbacks.length}개`}
      />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-3">

        <div className="rounded-2xl px-4 py-3" style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
          <p className="text-[11px] leading-relaxed" style={{ color: '#993C1D' }}>
            💬 선생님 알림장은 특이사항이 있을 때만 남겨요. 매 수업마다 작성하는 건 아니에요.
          </p>
        </div>

        {feedbacks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <i className="ti ti-message-circle" style={{ fontSize: 40, color: '#F5C4B3', display: 'block', marginBottom: 10 }} />
            <p className="text-sm font-bold text-gray-600">아직 알림장이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">선생님이 특이사항을 남기면 여기에 나타나요</p>
          </div>
        ) : (
          feedbacks.map(fb => {
            const isExpanded = expandedId === fb.id
            const isUnread = !fb.is_read

            // ai_message 필드는 메시지 텍스트가 아니라 이미지 URL을 담은 JSON({ images: [...] })
            let fbImages: string[] = []
            if (fb.ai_message) {
              try {
                const parsed = JSON.parse(fb.ai_message)
                if (parsed && Array.isArray(parsed.images)) fbImages = parsed.images
              } catch {}
            }

            const myReplies = replies.filter((r) => r.feedback_id === fb.id)
            const curContent = replyContent[fb.id] || ''
            const curImages = replyImages[fb.id] || []
            const curPreviews = replyImagePreviews[fb.id] || []

            return (
              <div key={fb.id}
                className="bg-white rounded-2xl border shadow-sm overflow-hidden transition-all"
                style={{ borderColor: isUnread ? '#F5C4B3' : '#f0f0f0' }}>

                {/* 카드 헤더 — 클릭으로 열기/닫기 */}
                <button className="w-full px-4 py-4 flex items-center gap-3 text-left"
                  onClick={() => handleExpand(fb)}>

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
                      <p className="text-xs text-gray-500 mt-1 truncate">{fb.content}</p>
                    )}
                  </div>

                  <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                    style={{ fontSize: 16, color: '#9ca3af', flexShrink: 0 }} />
                </button>

                {/* 펼쳐진 내용 */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f5f5f5' }}>
                    <div className="px-4 py-4">
                      <div className="rounded-xl px-4 py-3 text-sm leading-relaxed text-gray-700"
                        style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
                        {fb.content.split('\n').map((line, i) => (
                          <p key={i} className={i > 0 ? 'mt-1.5' : ''}>{line}</p>
                        ))}
                      </div>
                      {fbImages.length > 0 && (
                        <div className="flex gap-2 flex-wrap mt-2.5">
                          {fbImages.map((url, idx) => (
                            <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                              className="block w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                              <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 답장 스레드 */}
                    {myReplies.length > 0 && (
                      <div className="px-4 pb-2 space-y-2">
                        {myReplies.map((rp) => {
                          const isMine = rp.sender_type === 'student'
                          const rpImages: string[] = Array.isArray(rp.images) ? rp.images : []
                          const rpDate = new Date(rp.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          return (
                            <div key={rp.id} className={isMine ? 'flex justify-end' : 'flex justify-start'}>
                              <div className="max-w-[85%]">
                                <p className={`text-[10px] mb-1 ${isMine ? 'text-right' : 'text-left'} text-gray-400`}>
                                  {isMine ? '나' : (rp.sender_name ?? '선생님')} · {rpDate}
                                </p>
                                <div className="rounded-2xl px-3 py-2"
                                  style={isMine
                                    ? { background: '#9FE1CB', color: '#085041' }
                                    : { background: '#f3f4f6', color: '#374151' }}>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{rp.content}</p>
                                  {rpImages.length > 0 && (
                                    <div className="flex gap-1.5 flex-wrap mt-2">
                                      {rpImages.map((url, i) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                          className="block w-16 h-16 rounded-lg overflow-hidden border border-white/50">
                                          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* 답장 입력 */}
                    <div className="px-4 pb-4">
                      <div className="rounded-2xl p-2.5" style={{ background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                        <textarea value={curContent}
                          onChange={(e) => setReplyContent((p) => ({ ...p, [fb.id]: e.target.value }))}
                          placeholder="선생님께 답장 쓰기..."
                          rows={2}
                          className="w-full px-2 py-1.5 rounded-lg text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#9FE1CB] resize-none" />

                        {curPreviews.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap mt-2">
                            {curPreviews.map((url, idx) => (
                              <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                                <img src={url} alt="" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => {
                                  setReplyImages((p) => ({ ...p, [fb.id]: (p[fb.id] || []).filter((_, i) => i !== idx) }))
                                  setReplyImagePreviews((p) => ({ ...p, [fb.id]: (p[fb.id] || []).filter((_, i) => i !== idx) }))
                                }}
                                  className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          {curImages.length < 3 ? (
                            <label className="text-[11px] font-semibold cursor-pointer px-2 py-1 rounded-lg flex items-center gap-1"
                              style={{ background: 'white', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                              <i className="ti ti-camera" style={{ fontSize: 13 }} /> 사진
                              <input type="file" accept="image/*" multiple className="hidden"
                                onChange={(e) => {
                                  const files = Array.from(e.target.files ?? [])
                                  const remaining = 3 - curImages.length
                                  const toAdd = files.slice(0, remaining)
                                  setReplyImages((p) => ({ ...p, [fb.id]: [...(p[fb.id] || []), ...toAdd] }))
                                  toAdd.forEach((file) => {
                                    const reader = new FileReader()
                                    reader.onload = () => setReplyImagePreviews((p) => ({ ...p, [fb.id]: [...(p[fb.id] || []), reader.result as string] }))
                                    reader.readAsDataURL(file)
                                  })
                                  e.target.value = ''
                                }} />
                            </label>
                          ) : <span className="text-[10px] text-gray-400">사진 최대 3장</span>}

                          <button onClick={() => handleSendReply(fb.id)}
                            disabled={(!curContent.trim() && curImages.length === 0) || savingReply === fb.id}
                            className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1"
                            style={{ background: '#9FE1CB', color: '#085041' }}>
                            {savingReply === fb.id ? '전송 중...' : '✉️ 답장 보내기'}
                          </button>
                        </div>
                      </div>
                    </div>
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
