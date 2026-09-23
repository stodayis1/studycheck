'use client'

// 선생님이 시험지 QR을 찍어 채점 화면으로 들어가는 곳 (교사·직원·원장)
//   · 카메라로 QR을 읽거나
//   · 시험지 코드(6자리)를 직접 적어도 된다
// 찍으면 /teacher/grade/<코드> 로 넘어간다.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'

const NAVY = '#0f3460'

// QR 안에는 '.../grade/ABC123' 같은 주소가 들어 있다 → 코드만 뽑는다
function codeOf(text: string): string | null {
  const t = (text || '').trim()
  const m = t.match(/\/grade\/([A-Z0-9]{4,10})/i) || t.match(/^([A-Z0-9]{6})$/i)
  return m ? m[1].toUpperCase() : null
}

export default function ScanPage() {
  const { currentUser, loading } = useAuth()
  // 교사·직원·원장이면 쓸 수 있다
  const staff = ['admin', 'teacher', 'staff'].includes(currentUser?.role ?? '')
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const [on, setOn] = useState(false)
  const [msg, setMsg] = useState('')
  const [manual, setManual] = useState('')

  const stop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setOn(false)
  }
  useEffect(() => stop, [])

  const start = async () => {
    setMsg('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setOn(true)
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        v.setAttribute('playsinline', 'true')   // 아이폰에서 전체화면으로 안 튀게
        await v.play()
      }
      const jsQR = (await import('jsqr')).default
      timerRef.current = window.setInterval(() => {
        const v2 = videoRef.current, c = canvasRef.current
        if (!v2 || !c || !v2.videoWidth) return
        const w = 480
        const h = Math.round((v2.videoHeight / v2.videoWidth) * w)
        c.width = w; c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.drawImage(v2, 0, 0, w, h)
        const img = ctx.getImageData(0, 0, w, h)
        const hit = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
        const code = hit?.data ? codeOf(hit.data) : null
        if (code) { stop(); router.push(`/teacher/grade/${code}`) }
      }, 300)
    } catch {
      setMsg('카메라를 열지 못했습니다. 아래에 시험지 코드를 직접 적어 주세요.')
    }
  }

  const goManual = () => {
    const c = codeOf(manual)
    if (!c) { setMsg('시험지 코드 6자리를 적어 주세요.'); return }
    router.push(`/teacher/grade/${c}`)
  }

  if (loading) return <Shell><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!staff) return <Shell><div className="p-10 text-center text-gray-500">선생님만 쓸 수 있습니다.</div></Shell>

  return (
    <Shell>
      <div className="px-5 py-6 max-w-[520px] mx-auto">
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="relative bg-black aspect-[3/4] grid place-items-center">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
            {!on && (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div>
                  <i className="ti ti-qrcode text-white/70" style={{ fontSize: 56 }} />
                  <p className="text-white/70 text-sm mt-3">시험지 오른쪽 위의 QR을 비춰 주세요</p>
                  <button onClick={start}
                    className="mt-4 px-5 py-2.5 rounded-xl text-white font-bold"
                    style={{ background: NAVY }}>
                    카메라 켜기
                  </button>
                </div>
              </div>
            )}
            {on && (
              <div className="absolute inset-0 pointer-events-none grid place-items-center">
                <div className="w-52 h-52 border-4 border-white/80 rounded-2xl" />
              </div>
            )}
          </div>
          {on && (
            <button onClick={stop} className="w-full py-3 text-sm text-gray-500 border-t">
              카메라 끄기
            </button>
          )}
        </div>

        {msg && <p className="text-sm text-red-600 mt-3">{msg}</p>}

        <div className="mt-5 rounded-2xl border bg-white p-4">
          <p className="text-sm text-gray-500 mb-2">
            카메라가 안 되면 시험지에 적힌 <b>코드 6자리</b>를 적어 주세요.
          </p>
          <div className="flex gap-2">
            <input value={manual} onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && goManual()}
              placeholder="예) DTAKRT"
              className="flex-1 border rounded-lg px-3 py-2 uppercase tracking-widest" />
            <button onClick={goManual} className="px-4 rounded-lg text-white font-bold"
              style={{ background: NAVY }}>
              열기
            </button>
          </div>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="QR 채점" subtitle="시험지 QR을 찍어 정답을 보고 채점해요" showBack />
      <div className="max-w-[900px] mx-auto">{children}</div>
    </div>
  )
}
