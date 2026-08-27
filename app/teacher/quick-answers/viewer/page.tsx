'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

// 정답 PDF 전용 뷰어. 채점하는 선생님들이 노안이어도 잘 보이도록,
// 브라우저 기본 PDF 뷰어(전체 페이지 축소해서 보여줌)를 안 쓰고 폭에 꽉 차게 렌더링 + 확대 버튼을 직접 만듦.
// QR로 스캔해서 들어오는 경우 로그인 안 되어 있을 수 있어서, 이 화면은 별도 로그인 검사를 하지 않음
// (이미 signed_url 자체가 열쇠 역할 - 기존 "바로 열기" 링크와 동일한 보안 수준).

const ZOOM_LEVELS = [1, 1.3, 1.6, 2, 2.5]

function ViewerInner() {
  const params = useSearchParams()
  const router = useRouter()
  const url = params.get('u') || ''
  const label = params.get('l') || '빠른정답'

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pdfDocRef = useRef<any>(null)
  const renderTaskRef = useRef<any>(null)

  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [zoomIdx, setZoomIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // PDF 문서 로드
  useEffect(() => {
    if (!url) { setError('잘못된 링크예요.'); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        const doc = await pdfjsLib.getDocument({ url }).promise
        if (cancelled) return
        pdfDocRef.current = doc
        setNumPages(doc.numPages)
        setPageNum(1)
        setLoading(false)
      } catch (e: any) {
        if (!cancelled) { setError('PDF를 불러오지 못했어요. 링크가 만료되었을 수 있어요.'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [url])

  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!doc || !canvas || !container) return
    try {
      const page = await doc.getPage(pageNum)
      const containerWidth = container.clientWidth
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const base = page.getViewport({ scale: 1 })
      const fitWidthScale = containerWidth / base.width
      const zoom = ZOOM_LEVELS[zoomIdx]
      const renderScale = fitWidthScale * zoom * dpr
      const viewport = page.getViewport({ scale: renderScale })

      if (renderTaskRef.current) { try { renderTaskRef.current.cancel() } catch {} }

      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${containerWidth * zoom}px`
      canvas.style.height = `${(containerWidth * zoom) * (viewport.height / viewport.width)}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const task = page.render({ canvasContext: ctx, viewport, canvas })
      renderTaskRef.current = task
      await task.promise
    } catch {
      // 취소된 렌더링은 무시
    }
  }, [pageNum, zoomIdx])

  useEffect(() => { if (!loading && !error) renderPage() }, [loading, error, renderPage])

  useEffect(() => {
    function onResize() { if (!loading && !error) renderPage() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [loading, error, renderPage])

  return (
    <div style={{ background: '#111827', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 상단바 */}
      <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{ background: '#1f2937' }}>
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg shrink-0" style={{ background: '#374151', color: '#fff' }}>
          <i className="ti ti-arrow-left text-sm" />
        </button>
        <p className="text-xs font-bold text-white truncate flex-1">{decodeURIComponent(label)}</p>
        {numPages > 0 && <span className="text-[10px] text-gray-300 shrink-0">{pageNum} / {numPages}</span>}
      </div>

      {/* 본문 */}
      <div ref={containerRef} className="flex-1 overflow-auto flex items-start justify-center px-2 py-3">
        {loading && <p className="text-xs text-gray-300 mt-10">불러오는 중...</p>}
        {error && <p className="text-xs text-red-300 mt-10 text-center px-6">{error}</p>}
        {!loading && !error && <canvas ref={canvasRef} style={{ background: '#fff', borderRadius: 8 }} />}
      </div>

      {/* 하단 컨트롤 */}
      {!loading && !error && (
        <div className="shrink-0 px-3 py-3 flex items-center justify-between gap-2" style={{ background: '#1f2937' }}>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPageNum((p) => Math.max(1, p - 1))} disabled={pageNum <= 1}
              className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: pageNum <= 1 ? '#374151' : '#4B5563', color: pageNum <= 1 ? '#6b7280' : '#fff' }}>◀ 이전</button>
            <button onClick={() => setPageNum((p) => Math.min(numPages, p + 1))} disabled={pageNum >= numPages}
              className="px-3 py-2 rounded-lg text-xs font-bold" style={{ background: pageNum >= numPages ? '#374151' : '#4B5563', color: pageNum >= numPages ? '#6b7280' : '#fff' }}>다음 ▶</button>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setZoomIdx((i) => Math.max(0, i - 1))} disabled={zoomIdx === 0}
              className="w-9 h-9 rounded-lg text-sm font-bold" style={{ background: zoomIdx === 0 ? '#374151' : '#4B5563', color: zoomIdx === 0 ? '#6b7280' : '#fff' }}>−</button>
            <span className="text-[10px] text-gray-300 w-9 text-center">{Math.round(ZOOM_LEVELS[zoomIdx] * 100)}%</span>
            <button onClick={() => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={zoomIdx === ZOOM_LEVELS.length - 1}
              className="w-9 h-9 rounded-lg text-sm font-bold" style={{ background: zoomIdx === ZOOM_LEVELS.length - 1 ? '#374151' : '#4B5563', color: zoomIdx === ZOOM_LEVELS.length - 1 ? '#6b7280' : '#fff' }}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function QuickAnswerViewerPage() {
  return (
    <Suspense fallback={<div style={{ background: '#111827', minHeight: '100vh' }} />}>
      <ViewerInner />
    </Suspense>
  )
}
