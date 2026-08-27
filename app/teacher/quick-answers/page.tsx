'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import QRCode from 'qrcode'
import { QUICK_ANSWER_CATALOG, QuickAnswerCatalogItem } from './catalog'

// concepts.grade / textbook_catalog와 동일한 학년 순서 (curriculum/page.tsx GRADE_ORDER와 맞춤)
const GRADE_ORDER = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중2모의고사', '중3', '공통수학1', '공통수학2', '대수', '미적분1', '확률과통계', '기하']

const TYPE_ORDER = ['연산서', '개념서', '유형서', '심화서']
const TYPE_COLOR: Record<string, string> = { '연산서': '#0F6E56', '개념서': '#1D4ED8', '유형서': '#C2680A', '심화서': '#9B1C1C' }
const TYPE_BG: Record<string, string> = { '연산서': '#E8F3EC', '개념서': '#E9F0FB', '유형서': '#FFF3E6', '심화서': '#FBEAEA' }

// 10년 (초 단위) - 인쇄해둔 QR이 만료로 죽지 않도록 최대한 길게
const SIGNED_URL_EXPIRES_IN = 315360000

interface QuickAnswerRow {
  id: string
  textbook_type: string
  textbook_name: string
  grade: string
  semester: number
  storage_path: string
  signed_url: string | null
  file_name: string | null
  created_at: string
}

function keyOf(type: string, name: string, grade: string, semester: number) {
  return `${type}__${name}__${grade}__${semester}`
}

export default function QuickAnswersPage() {
  const { currentUser, isAdmin } = useAuth()
  const [rows, setRows] = useState<QuickAnswerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGrade, setActiveGrade] = useState('중1')
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [qrModal, setQrModal] = useState<{ url: string; label: string; dataUrl: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingItemRef = useRef<QuickAnswerCatalogItem | null>(null)

  useEffect(() => { fetchRows() }, [])

  async function fetchRows() {
    setLoading(true)
    const { data } = await supabase.from('quick_answers').select('*')
    if (data) setRows(data)
    setLoading(false)
  }

  const rowMap = useMemo(() => {
    const m = new Map<string, QuickAnswerRow>()
    rows.forEach((r) => m.set(keyOf(r.textbook_type, r.textbook_name, r.grade, r.semester), r))
    return m
  }, [rows])

  const gradeItems = useMemo(() => {
    return QUICK_ANSWER_CATALOG
      .filter((it) => it.grade === activeGrade)
      .sort((a, b) => (a.semester - b.semester) || (TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type)) || a.name.localeCompare(b.name, 'ko'))
  }, [activeGrade])

  const gradeCounts = useMemo(() => {
    const counts: Record<string, { total: number; done: number }> = {}
    GRADE_ORDER.forEach((g) => { counts[g] = { total: 0, done: 0 } })
    QUICK_ANSWER_CATALOG.forEach((it) => {
      if (!counts[it.grade]) return
      counts[it.grade].total += 1
      if (rowMap.has(keyOf(it.type, it.name, it.grade, it.semester))) counts[it.grade].done += 1
    })
    return counts
  }, [rowMap])

  function triggerUpload(item: QuickAnswerCatalogItem) {
    pendingItemRef.current = item
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const item = pendingItemRef.current
    e.target.value = ''
    if (!file || !item) return
    if (file.type !== 'application/pdf') { alert('PDF 파일만 업로드할 수 있어요.'); return }

    const k = keyOf(item.type, item.name, item.grade, item.semester)
    setUploadingKey(k)
    try {
      const path = `${item.grade}/${item.semester}학기/${item.type}_${item.name}.pdf`
      const { error: upErr } = await supabase.storage
        .from('quick-answers')
        .upload(path, file, { upsert: true, contentType: 'application/pdf' })
      if (upErr) { alert('업로드 실패: ' + upErr.message); return }

      const { data: signed, error: signErr } = await supabase.storage
        .from('quick-answers')
        .createSignedUrl(path, SIGNED_URL_EXPIRES_IN)
      if (signErr || !signed) { alert('링크 생성 실패: ' + (signErr?.message ?? '')); return }

      const { error: dbErr } = await supabase.from('quick_answers').upsert({
        textbook_type: item.type,
        textbook_name: item.name,
        grade: item.grade,
        semester: item.semester,
        storage_path: path,
        signed_url: signed.signedUrl,
        file_name: file.name,
        file_size: file.size,
        uploaded_by: currentUser?.name ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'textbook_type,textbook_name,grade,semester' })
      if (dbErr) { alert('저장 실패: ' + dbErr.message); return }

      await fetchRows()
    } finally {
      setUploadingKey(null)
    }
  }

  async function openQr(row: QuickAnswerRow) {
    if (!row.signed_url) return
    const dataUrl = await QRCode.toDataURL(row.signed_url, { width: 480, margin: 1, color: { dark: '#712B13', light: '#FFFFFF' } })
    setQrModal({ url: row.signed_url, label: `${row.grade} ${row.semester}학기 · ${row.textbook_type} · ${row.textbook_name}`, dataUrl })
  }

  if (!isAdmin()) {
    return (
      <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
        <Header title="빠른정답 QR 관리" subtitle="관리자 전용" />
        <div className="px-4 py-10 text-center text-sm text-gray-400">원장님만 접근할 수 있는 화면이에요.</div>
      </div>
    )
  }

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <Header title="빠른정답 QR 관리" subtitle="교재별 빠른정답 PDF 업로드 · QR 생성" />
      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileSelected} />

      <div className="px-4 py-4 max-w-3xl mx-auto space-y-4">
        {/* 학년 탭 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {GRADE_ORDER.map((g) => {
            const c = gradeCounts[g]
            if (!c || c.total === 0) return null
            const active = g === activeGrade
            return (
              <button key={g} onClick={() => setActiveGrade(g)}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: active ? '#712B13' : '#fff',
                  color: active ? '#fff' : '#374151',
                  border: `1.5px solid ${active ? '#712B13' : '#e5e7eb'}`,
                }}>
                {g}
                <span className="ml-1 font-normal" style={{ opacity: 0.75 }}>{c.done}/{c.total}</span>
              </button>
            )
          })}
        </div>

        {/* 목록 */}
        <div className="rounded-2xl overflow-hidden bg-white border border-gray-100">
          {loading ? (
            <div className="p-8 text-center text-xs text-gray-400">불러오는 중...</div>
          ) : gradeItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">이 학년에 등록된 교재가 없어요.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {gradeItems.map((item) => {
                const k = keyOf(item.type, item.name, item.grade, item.semester)
                const row = rowMap.get(k)
                const isUploading = uploadingKey === k
                return (
                  <div key={k} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: TYPE_BG[item.type], color: TYPE_COLOR[item.type] }}>{item.type}</span>
                        <span className="text-xs font-semibold text-gray-800">{item.name}</span>
                        <span className="text-[10px] text-gray-400">{item.semester}학기</span>
                      </div>
                      {item.note && <p className="text-[10px] mt-0.5" style={{ color: '#9B1C1C' }}>{item.note}</p>}
                      {row?.file_name && <p className="text-[10px] mt-0.5 text-gray-400 truncate">{row.file_name}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row ? (
                        <>
                          <button onClick={() => openQr(row)}
                            className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap"
                            style={{ background: '#EAF3DE', color: '#27500A', border: '1px solid #639922' }}>QR 보기</button>
                          <button onClick={() => triggerUpload(item)} disabled={isUploading}
                            className="px-2.5 py-1.5 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                            style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                            {isUploading ? '업로드중...' : '재업로드'}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => triggerUpload(item)} disabled={isUploading}
                          className="px-3 py-1.5 text-[10px] font-bold rounded-lg whitespace-nowrap"
                          style={{ background: '#FFF5F2', color: '#712B13', border: '1px solid #F5C4B3' }}>
                          {isUploading ? '업로드중...' : 'PDF 업로드'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* QR 모달 */}
      {qrModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setQrModal(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-bold text-gray-700 mb-3">{qrModal.label}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrModal.dataUrl} alt="QR 코드" className="w-full rounded-xl border border-gray-100" />
            <p className="text-[10px] text-gray-400 mt-3">휴대폰 카메라로 스캔하면 빠른정답 PDF가 바로 열려요.</p>
            <div className="flex gap-2 mt-4">
              <a href={qrModal.dataUrl} download={`${qrModal.label}_QR.png`}
                className="flex-1 py-2 text-xs font-bold rounded-xl"
                style={{ background: '#712B13', color: '#fff' }}>QR 이미지 저장</a>
              <button onClick={() => setQrModal(null)}
                className="flex-1 py-2 text-xs font-bold rounded-xl"
                style={{ background: '#f3f4f6', color: '#374151' }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
