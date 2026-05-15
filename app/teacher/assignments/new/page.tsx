'use client'

import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useState } from 'react'
import { MOCK_CLASSES } from '@/data/mockData'

export default function NewAssignmentPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [classId, setClassId] = useState(MOCK_CLASSES[0]?.id ?? '')
  const [dueDate, setDueDate] = useState('')
  const [videoOn, setVideoOn] = useState(true)
  const [textbookOn, setTextbookOn] = useState(true)
  const [worksheetOn, setWorksheetOn] = useState(false)
  const [videoTitle, setVideoTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [textbookName, setTextbookName] = useState('')
  const [pageRange, setPageRange] = useState('')
  const [problemRange, setProblemRange] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!title || !dueDate) { alert('과제 제목과 마감일을 입력해주세요.'); return }
    if (!videoOn && !textbookOn && !worksheetOn) { alert('과제 항목을 하나 이상 선택해주세요.'); return }
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 1000))
    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none">
          <circle cx="20" cy="20" r="19" fill="#22c55e"/>
          <path d="M10 20l7 7 13-14" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <h2 className="text-xl font-black text-gray-900 mb-1">과제 등록 완료!</h2>
      <p className="text-sm text-gray-500 mb-8">학생들에게 과제가 배정되었습니다.</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={()=>setSubmitted(false)} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl">새 과제 등록하기</button>
        <button onClick={()=>router.push('/teacher/assignments')} className="w-full py-3.5 bg-gray-100 text-gray-700 font-bold rounded-2xl">과제 목록으로</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="새 과제 등록" showBack />
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-20">

        {/* 기본 정보 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white text-xs font-black">A</span></div>
            <h3 className="text-sm font-bold text-gray-800">기본 정보</h3>
          </div>
          <div className="px-4 py-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">과제 제목 <span className="text-red-400">*</span></label>
              <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="예: 5월 14일 지수법칙 과제" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">대상 반 <span className="text-red-400">*</span></label>
              <select value={classId} onChange={(e)=>setClassId(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {MOCK_CLASSES.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">마감일시 <span className="text-red-400">*</span></label>
              <input type="datetime-local" value={dueDate} onChange={(e)=>setDueDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* 영상과제 */}
        <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${videoOn?'border-purple-200':'border-gray-100'}`}>
          <label className={`flex items-center gap-3.5 px-4 py-3.5 cursor-pointer ${videoOn?'bg-purple-50':'bg-gray-50'}`}>
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl shrink-0">▶</div>
            <div className="flex-1"><p className="text-sm font-bold text-gray-700">영상과제</p><p className="text-[11px] text-gray-400">유튜브 등 영상 링크</p></div>
            <div className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${videoOn?'bg-purple-500':'bg-gray-300'}`}>
              <input type="checkbox" checked={videoOn} onChange={()=>setVideoOn(v=>!v)} className="sr-only" />
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${videoOn?'translate-x-7':'translate-x-1'}`} />
            </div>
          </label>
          {videoOn && (
            <div className="px-4 py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">영상 제목 <span className="text-red-400">*</span></label>
                <input value={videoTitle} onChange={(e)=>setVideoTitle(e.target.value)} placeholder="예: 지수법칙 개념 강의" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">영상 링크 <span className="text-red-400">*</span></label>
                <input value={videoUrl} onChange={(e)=>setVideoUrl(e.target.value)} placeholder="https://youtu.be/..." className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
            </div>
          )}
        </div>

        {/* 교재과제 */}
        <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${textbookOn?'border-blue-200':'border-gray-100'}`}>
          <label className={`flex items-center gap-3.5 px-4 py-3.5 cursor-pointer ${textbookOn?'bg-blue-50':'bg-gray-50'}`}>
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-xl shrink-0">📖</div>
            <div className="flex-1"><p className="text-sm font-bold text-gray-700">교재과제</p><p className="text-[11px] text-gray-400">교재명·페이지·문제 번호</p></div>
            <div className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${textbookOn?'bg-blue-500':'bg-gray-300'}`}>
              <input type="checkbox" checked={textbookOn} onChange={()=>setTextbookOn(v=>!v)} className="sr-only" />
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${textbookOn?'translate-x-7':'translate-x-1'}`} />
            </div>
          </label>
          {textbookOn && (
            <div className="px-4 py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">교재명 <span className="text-red-400">*</span></label>
                <input value={textbookName} onChange={(e)=>setTextbookName(e.target.value)} placeholder="예: RPM 수학Ⅰ" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">페이지 범위 <span className="text-red-400">*</span></label>
                  <input value={pageRange} onChange={(e)=>setPageRange(e.target.value)} placeholder="예: p.32~35" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">문제 번호 <span className="text-red-400">*</span></label>
                  <input value={problemRange} onChange={(e)=>setProblemRange(e.target.value)} placeholder="예: 1~18번" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 학습지과제 */}
        <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${worksheetOn?'border-green-200':'border-gray-100'}`}>
          <label className={`flex items-center gap-3.5 px-4 py-3.5 cursor-pointer ${worksheetOn?'bg-green-50':'bg-gray-50'}`}>
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-xl shrink-0">📝</div>
            <div className="flex-1"><p className="text-sm font-bold text-gray-700">학습지과제</p><p className="text-[11px] text-gray-400">학습지 파일 배부</p></div>
            <div className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${worksheetOn?'bg-green-500':'bg-gray-300'}`}>
              <input type="checkbox" checked={worksheetOn} onChange={()=>setWorksheetOn(v=>!v)} className="sr-only" />
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${worksheetOn?'translate-x-7':'translate-x-1'}`} />
            </div>
          </label>
          {worksheetOn && (
            <div className="px-4 py-4">
              <label className="block text-xs font-bold text-gray-700 mb-2">학습지 파일 업로드</label>
              <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 bg-gray-50">
                <span className="text-3xl">📤</span>
                <p className="text-sm text-gray-500 font-medium">클릭하여 파일 선택</p>
                <p className="text-xs text-gray-400">PDF, HWP · 최대 20MB</p>
              </div>
            </div>
          )}
        </div>

        {/* 제출 버튼 */}
        <button onClick={handleSubmit} disabled={submitting} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-xl shadow-blue-200 disabled:opacity-50">
          {submitting?<><span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />등록 중...</>:<>📬 과제 배정하기</>}
        </button>

      </div>
    </div>
  )
}