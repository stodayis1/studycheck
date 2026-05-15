'use client'

import { useState, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { MOCK_ASSIGNMENT_SETS, MOCK_ASSIGNMENT_ITEMS, MOCK_SUBMISSIONS } from '@/data/mockData'
import { formatDateTime, formatDueDate, cx } from '@/lib/utils'
import type { SubmissionStatus } from '@/types'

const CURRENT_STUDENT_ID = 'student-001'

export default function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const aset = MOCK_ASSIGNMENT_SETS.find((a) => a.id === id)
  const items = MOCK_ASSIGNMENT_ITEMS.filter((i) => i.assignment_set_id === id)
  const initSub = MOCK_SUBMISSIONS.find((s) => s.assignment_set_id === id && s.student_id === CURRENT_STUDENT_ID)
  const videoItem = items.find((i) => i.type === 'video')
  const textbookItem = items.find((i) => i.type === 'textbook')
  const worksheetItem = items.find((i) => i.type === 'worksheet')
  const alreadySubmitted = ['submitted','checked','late'].includes(initSub?.final_status ?? '')

  const [videoDone, setVideoDone] = useState(['submitted','checked','late'].includes(initSub?.video_status??''))
  const [videoSummary, setVideoSummary] = useState(initSub?.video_summary ?? '')
  const [textbookDone, setTextbookDone] = useState(['submitted','checked','late'].includes(initSub?.textbook_status??''))
  const [difficultProblems, setDifficultProblems] = useState(initSub?.difficult_problems ?? '')
  const [worksheetDone, setWorksheetDone] = useState(['submitted','checked','late'].includes(initSub?.worksheet_status??''))
  const [uploadedName, setUploadedName] = useState(initSub?.uploaded_file_url ? '이전 업로드 파일' : '')
  const [uploadProgress, setUploadProgress] = useState(initSub?.uploaded_file_url ? 100 : 0)
  const [showSuccess, setShowSuccess] = useState(alreadySubmitted)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const due = aset ? formatDueDate(aset.due_date) : null

  const videoReady = !videoItem || (videoDone && videoSummary.trim().length > 0)
  const textbookReady = !textbookItem || textbookDone
  const worksheetReady = !worksheetItem || (worksheetDone && uploadedName !== '')
  const totalItems = [videoItem, textbookItem, worksheetItem].filter(Boolean).length
  const completedItems = [videoReady, textbookReady, worksheetReady].filter(Boolean).length
  const allReady = completedItems === totalItems

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedName(file.name)
    setUploadProgress(0)
    let p = 0
    const timer = setInterval(() => {
      p += 20; setUploadProgress(p)
      if (p >= 100) { clearInterval(timer); setWorksheetDone(true) }
    }, 120)
  }

  async function handleSubmit() {
    if (!allReady || isSubmitting || showSuccess) return
    setIsSubmitting(true)
    await new Promise((r) => setTimeout(r, 900))
    setShowSuccess(true)
    setIsSubmitting(false)
  }

  if (!aset) return (
    <div className="min-h-screen flex items-center justify-center text-center px-6">
      <div><p className="text-4xl mb-3">🔍</p><p className="text-gray-500 font-medium">과제를 찾을 수 없습니다</p>
      <button onClick={()=>router.back()} className="mt-4 text-sm text-blue-600 underline">돌아가기</button></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="과제 상세" showBack />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-32 space-y-4">

        {/* 과제 정보 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className={cx('h-1.5', due?.isOverdue?'bg-red-400':due?.isUrgent?'bg-orange-400':'bg-blue-500')} />
          <div className="p-4">
            <h2 className="text-base font-bold text-gray-900 mb-2">{aset.title}</h2>
            {aset.description && <p className="text-sm text-gray-500 mb-3">{aset.description}</p>}
            <div className={cx('flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium mb-3', due?.isOverdue?'bg-red-50 text-red-600':due?.isUrgent?'bg-orange-50 text-orange-600':'bg-gray-50 text-gray-500')}>
              <span>{due?.isOverdue?'⚠️':due?.isUrgent?'⚡':'📅'}</span>
              <span>마감</span>
              <span className="font-bold text-gray-700">{formatDateTime(aset.due_date)}</span>
              {due && <span className="ml-auto font-bold">{due.text}</span>}
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-gray-400">과제 진행도</span>
                <span className="font-bold text-gray-600">{completedItems}/{totalItems} 완료</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={cx('h-full rounded-full transition-all duration-500', completedItems===totalItems?'bg-green-500':'bg-blue-500')} style={{width:`${totalItems>0?(completedItems/totalItems)*100:0}%`}} />
              </div>
            </div>
          </div>
        </div>

        {/* 영상과제 */}
        {videoItem && (
          <div className={cx('bg-white rounded-2xl border-2 shadow-sm overflow-hidden', videoDone&&videoSummary?'border-green-200':'border-purple-100')}>
            <div className={cx('px-4 py-3 flex items-center gap-3 border-b', videoDone&&videoSummary?'bg-green-50 border-green-100':'bg-purple-50 border-purple-100')}>
              <div className={cx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', videoDone&&videoSummary?'bg-green-500':'bg-purple-500')}>1</div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700">영상 과제</span>
              <p className="text-sm font-semibold text-gray-800 truncate flex-1">{videoItem.title}</p>
              <span className={cx('text-[10px] font-bold px-2 py-1 rounded-full', videoDone&&videoSummary?'bg-green-100 text-green-700':'bg-gray-100 text-gray-400')}>{videoDone&&videoSummary?'완료':'미완료'}</span>
            </div>
            <div className="px-4 py-4 space-y-4">
              {videoItem.video_url && (
                <a href={videoItem.video_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3.5 hover:bg-purple-100 transition-all">
                  <div className="w-9 h-9 bg-purple-500 rounded-lg flex items-center justify-center shrink-0"><span className="text-white text-sm pl-0.5">▶</span></div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-purple-800 truncate">{videoItem.title}</p></div>
                  <span className="text-purple-400 text-xs shrink-0">열기 ↗</span>
                </a>
              )}
              <CheckboxRow label="영상 시청 완료" checked={videoDone} onChange={()=>{if(!showSuccess)setVideoDone(v=>!v)}} disabled={showSuccess} />
              <hr className="border-gray-100" />
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600">영상 한 줄 요약 <span className="text-red-400">*</span></label>
                  <span className={cx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', videoSummary.trim()?'bg-green-100 text-green-600':'bg-gray-100 text-gray-400')}>{videoSummary.trim()?'✓ 작성 완료':'필수 입력'}</span>
                </div>
                <textarea value={videoSummary} onChange={(e)=>setVideoSummary(e.target.value)} disabled={showSuccess} rows={3} maxLength={200} placeholder="영상의 핵심 내용을 한 문장으로 요약해주세요" className={cx('w-full px-3.5 py-3 rounded-xl border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent placeholder:text-gray-300', showSuccess?'bg-gray-50 text-gray-500 border-gray-100':videoSummary.trim()?'border-green-200 bg-green-50/40':'border-gray-200 bg-white')} />
              </div>
            </div>
          </div>
        )}

        {/* 교재과제 */}
        {textbookItem && (
          <div className={cx('bg-white rounded-2xl border-2 shadow-sm overflow-hidden', textbookDone?'border-green-200':'border-blue-100')}>
            <div className={cx('px-4 py-3 flex items-center gap-3 border-b', textbookDone?'bg-green-50 border-green-100':'bg-blue-50 border-blue-100')}>
              <div className={cx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', textbookDone?'bg-green-500':'bg-blue-500')}>2</div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700">교재 과제</span>
              <p className="text-sm font-semibold text-gray-800 truncate flex-1">{textbookItem.title}</p>
              <span className={cx('text-[10px] font-bold px-2 py-1 rounded-full', textbookDone?'bg-green-100 text-green-700':'bg-gray-100 text-gray-400')}>{textbookDone?'완료':'미완료'}</span>
            </div>
            <div className="px-4 py-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {[{icon:'📗',label:'교재',value:textbookItem.textbook_name??'-'},{icon:'📄',label:'페이지',value:textbookItem.page_range??'-'},{icon:'✏️',label:'문제',value:textbookItem.problem_range??'-'}].map(({icon,label,value})=>(
                  <div key={label} className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                    <p className="text-base mb-1">{icon}</p>
                    <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                    <p className="text-xs font-bold text-gray-700">{value}</p>
                  </div>
                ))}
              </div>
              <CheckboxRow label="교재 풀기 완료" checked={textbookDone} onChange={()=>{if(!showSuccess)setTextbookDone(v=>!v)}} disabled={showSuccess} />
              <hr className="border-gray-100" />
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">어려웠던 문제 번호 <span className="text-gray-400 font-normal">(선택)</span></label>
                <input type="text" value={difficultProblems} onChange={(e)=>setDifficultProblems(e.target.value)} disabled={showSuccess} placeholder="예: 5, 12, 18번" className={cx('w-full px-3.5 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-gray-300', showSuccess?'bg-gray-50 text-gray-500 border-gray-100':'border-gray-200 bg-white')} />
              </div>
            </div>
          </div>
        )}

        {/* 학습지과제 */}
        {worksheetItem && (
          <div className={cx('bg-white rounded-2xl border-2 shadow-sm overflow-hidden', worksheetDone&&uploadedName?'border-green-200':'border-green-100')}>
            <div className={cx('px-4 py-3 flex items-center gap-3 border-b', worksheetDone&&uploadedName?'bg-green-50 border-green-100':'bg-green-50 border-green-100')}>
              <div className={cx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', worksheetDone&&uploadedName?'bg-green-500':'bg-green-400')}>3</div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-green-100 text-green-700">학습지 과제</span>
              <p className="text-sm font-semibold text-gray-800 truncate flex-1">{worksheetItem.title}</p>
              <span className={cx('text-[10px] font-bold px-2 py-1 rounded-full', worksheetDone&&uploadedName?'bg-green-100 text-green-700':'bg-gray-100 text-gray-400')}>{worksheetDone&&uploadedName?'완료':'미완료'}</span>
            </div>
            <div className="px-4 py-4 space-y-4">
              {worksheetItem.file_url && (
                <a href={worksheetItem.file_url} download className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3.5 hover:bg-green-100 transition-all">
                  <div className="w-9 h-9 bg-green-500 rounded-lg flex items-center justify-center shrink-0"><span className="text-white font-bold">↓</span></div>
                  <div className="flex-1"><p className="text-sm font-semibold text-green-800">학습지 다운로드</p><p className="text-[11px] text-green-500 mt-0.5">풀이 후 업로드하세요</p></div>
                </a>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">풀이 파일 업로드 <span className="text-red-400">*</span></label>
                {uploadProgress===100&&uploadedName ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0 text-xl">📎</div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-green-800 truncate">{uploadedName}</p><p className="text-[11px] text-green-500 mt-0.5">업로드 완료</p></div>
                    {!showSuccess && <button onClick={()=>{setUploadedName('');setUploadProgress(0);setWorksheetDone(false)}} className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg">✕</button>}
                  </div>
                ) : uploadProgress>0&&uploadProgress<100 ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><span className="text-blue-500 animate-bounce">↑</span></div>
                      <div className="flex-1"><p className="text-sm text-blue-800 truncate">{uploadedName}</p></div>
                      <span className="text-sm font-bold text-blue-600">{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all" style={{width:`${uploadProgress}%`}} /></div>
                  </div>
                ) : (
                  <button type="button" disabled={showSuccess} onClick={()=>fileInputRef.current?.click()} className={cx('w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 transition-all', showSuccess?'border-gray-100 bg-gray-50 cursor-default':'border-gray-200 bg-white hover:border-green-400 hover:bg-green-50 cursor-pointer')}>
                    <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center"><span className="text-2xl">📤</span></div>
                    <p className={cx('text-sm font-semibold', showSuccess?'text-gray-300':'text-gray-600')}>파일을 탭하여 선택</p>
                    <p className="text-xs text-gray-400">사진(JPG, PNG) 또는 PDF · 최대 20MB</p>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileSelect} className="hidden" />
              </div>
              <CheckboxRow label="학습지 완료 및 업로드" checked={worksheetDone&&uploadProgress===100} onChange={()=>{if(!showSuccess&&uploadedName)setWorksheetDone(v=>!v)}} disabled={showSuccess||uploadProgress<100} hint={uploadProgress<100?'파일을 먼저 업로드해주세요':undefined} />
            </div>
          </div>
        )}

        {/* 피드백 */}
        {initSub?.teacher_feedback && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center"><span className="text-white text-xs">✉</span></div>
              <span className="text-sm font-bold text-blue-800">선생님 피드백</span>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{initSub.teacher_feedback}</p>
          </div>
        )}

      </div>

      {/* 하단 제출 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-gray-100 px-4 pb-8 pt-3">
        <div className="max-w-lg mx-auto">
          {showSuccess ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0 text-xl">🎉</div>
              <div><p className="text-sm font-bold text-green-700">제출 완료!</p><p className="text-xs text-green-500 mt-0.5">선생님이 확인 후 피드백을 남겨드릴게요</p></div>
            </div>
          ) : (
            <>
              {!allReady && <p className="text-xs text-center text-gray-400 mb-2">{totalItems-completedItems}개 항목을 더 완료해야 제출할 수 있어요</p>}
              <button onClick={handleSubmit} disabled={!allReady||isSubmitting} className={cx('w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-200', allReady&&!isSubmitting?'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-lg shadow-blue-200':'bg-gray-100 text-gray-400 cursor-not-allowed')}>
                {isSubmitting?<><span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />제출 중...</>:allReady?<>📬 최종 제출하기</>:<>🔒 {completedItems}/{totalItems} 완료 · 제출 불가</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CheckboxRow({ label, checked, onChange, disabled, hint }: {
  label:string; checked:boolean; onChange:()=>void; disabled?:boolean; hint?:string
}) {
  return (
    <div>
      <button type="button" onClick={onChange} disabled={disabled} className={cx('w-full flex items-center gap-3 py-3 px-3.5 rounded-xl border-2 transition-all text-left', disabled&&!checked?'cursor-not-allowed opacity-50 border-gray-100 bg-gray-50':disabled&&checked?'cursor-default border-green-200 bg-green-50':checked?'border-green-300 bg-green-50 hover:bg-green-100':'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50')}>
        <div className={cx('w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all', checked?'bg-green-500 border-green-500':'border-gray-300')}>
          {checked && <svg viewBox="0 0 12 10" className="w-3.5 h-3.5" fill="none"><path d="M1 5l3 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </div>
        <span className={cx('flex-1 text-sm font-semibold', checked?'text-green-700 line-through decoration-green-400':'text-gray-700')}>{label}</span>
        <span className={cx('text-[10px] font-bold shrink-0', checked?'text-green-600':disabled?'text-gray-300':'text-gray-400')}>{checked?'완료 ✓':disabled?'잠금':'탭하여 완료'}</span>
      </button>
      {hint&&!checked&&<p className="text-[10px] text-orange-400 mt-1 ml-1 flex items-center gap-1"><span>💡</span>{hint}</p>}
    </div>
  )
}