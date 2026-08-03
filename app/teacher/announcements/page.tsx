'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'

interface Announcement {
  id: string
  title: string
  content: string
  is_active: boolean
  ends_at: string | null
  created_by: string | null
  created_at: string
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function TeacherAnnouncementsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
    if (data) setItems(data)
    setLoading(false)
  }

  function resetForm() {
    setTitle(''); setContent(''); setEndsAt(''); setEditingId(null); setShowForm(false)
  }

  function startEdit(a: Announcement) {
    setEditingId(a.id)
    setTitle(a.title)
    setContent(a.content)
    setEndsAt(a.ends_at ? a.ends_at.slice(0, 10) : '')
    setShowForm(true)
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    const payload = {
      title: title.trim(),
      content: content.trim(),
      ends_at: endsAt ? new Date(endsAt + 'T23:59:59').toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    if (editingId) {
      await supabase.from('announcements').update(payload).eq('id', editingId)
    } else {
      await supabase.from('announcements').insert({ ...payload, created_by: currentUser?.name ?? '원장' })
    }
    setSaving(false)
    resetForm()
    fetchData()
  }

  async function handleToggleActive(a: Announcement) {
    await supabase.from('announcements').update({ is_active: !a.is_active, updated_at: new Date().toISOString() }).eq('id', a.id)
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 공지사항을 완전히 삭제할까요? 되돌릴 수 없어요.')) return
    await supabase.from('announcements').delete().eq('id', id)
    fetchData()
  }

  if (!isAdmin()) {
    // 강사는 관리 권한이 없어서 읽기 전용 목록만 보여준다 (작성/수정/삭제 버튼 자체를 노출하지 않음)
    return (
      <div style={{ background: '#ffffff', minHeight: '100vh' }}>
        <Header title="공지사항" subtitle="학부모/교사 대시보드에 표시되는 공지" />
        <div className="px-4 py-4 space-y-3 md:px-6 max-w-2xl">
          <p className="text-xs text-gray-400 px-1">공지사항 작성·수정은 원장님만 가능해요</p>
          {loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : items.filter((a) => a.is_active).length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <p className="text-3xl mb-3">📢</p>
              <p className="text-sm text-gray-500">등록된 공지사항이 없어요</p>
            </div>
          ) : (
            items.filter((a) => a.is_active).map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="text-sm font-bold text-gray-900">{a.title}</p>
                <p className="text-xs text-gray-600 mt-1.5 whitespace-pre-wrap">{a.content}</p>
                <p className="text-[10px] text-gray-400 mt-2">{fmtDate(a.created_at)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header
        title="공지사항 관리"
        subtitle="학부모/교사 대시보드에 표시돼요"
        action={
          <button onClick={() => { resetForm(); setShowForm(true) }}
            className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg">
            + 공지 작성
          </button>
        }
      />

      <div className="px-4 py-4 space-y-3 md:px-6 max-w-2xl">
        {showForm && (
          <div className="bg-white rounded-2xl border-2 border-green-200 p-4 space-y-3">
            <p className="text-sm font-bold text-gray-800">{editingId ? '공지 수정' : '새 공지 작성'}</p>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="제목 (예: 8월 정기고사 대비 특강 안내)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="내용을 입력하세요"
              rows={5}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                노출 종료일 <span className="font-normal text-gray-400">(선택 - 비워두면 직접 종료할 때까지 계속 보여요)</span>
              </label>
              <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={!title.trim() || !content.trim() || saving}
                className="flex-1 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                {saving ? '저장 중...' : editingId ? '수정 완료' : '공지 등록'}
              </button>
              <button onClick={resetForm} className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl">
                취소
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <span className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-3xl mb-3">📢</p>
            <p className="text-sm text-gray-500">등록된 공지사항이 없어요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((a) => {
              const expired = a.ends_at ? new Date(a.ends_at) < new Date() : false
              const showsNow = a.is_active && !expired
              return (
                <div key={a.id} className={cx('rounded-2xl border p-4', showsNow ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-200')}>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cx('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
                        showsNow ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500')}>
                        {showsNow ? '표시중' : a.is_active ? '기간만료' : '종료됨'}
                      </span>
                      <p className="text-sm font-bold text-gray-900">{a.title}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">{a.content}</p>
                  <p className="text-[10px] text-gray-400 mt-2">
                    {fmtDate(a.created_at)}{a.created_by ? ` · ${a.created_by}` : ''}{a.ends_at ? ` · ~${fmtDate(a.ends_at)}까지` : ''}
                  </p>
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={() => startEdit(a)}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600">
                      수정
                    </button>
                    <button onClick={() => handleToggleActive(a)}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600">
                      {a.is_active ? '종료하기' : '다시 표시'}
                    </button>
                    <button onClick={() => handleDelete(a.id)}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-red-50 text-red-500">
                      삭제
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
