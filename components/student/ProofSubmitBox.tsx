'use client'

// 증명 영상 시청 화면 아래: 「백지에 증명 써서 올리기」. 영상을 다 본 뒤에만 열린다. 채점 없음 — 제출만.
// 사진은 1600px JPEG 로 줄여서 /api/proof-submit 로 보낸다 (최대 3장).

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/apiFetch'

async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const s = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85))
}

// formula: 「곱셈 공식 한 번씩 써 보기」처럼 증명이 아니라 공식을 외워 쓰는 영상 (원장님 2026-10-26) — 같은 제출 칸, 문구만 다르다
export function ProofSubmitBox({ studentId, sessionId, videoUrl, watched, formula = false }: {
  studentId: string; sessionId: string; videoUrl: string; watched: boolean; formula?: boolean
}) {
  const [sub, setSub] = useState<{ submitted_at: string; photo_paths: string[] } | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('proof_submissions').select('submitted_at, photo_paths')
      .eq('student_id', studentId).eq('session_id', sessionId).eq('video_url', videoUrl).maybeSingle()
      .then(({ data }) => setSub(data as any))
  }, [studentId, sessionId, videoUrl])

  async function send() {
    if (!files.length) return
    setBusy(true); setMsg('')
    try {
      const fd = new FormData()
      fd.append('sessionId', sessionId); fd.append('videoUrl', videoUrl)
      for (const f of files) fd.append('photos', new File([await shrink(f)], 'proof.jpg', { type: 'image/jpeg' }))
      const r = await apiFetch('/api/proof-submit', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error || '제출하지 못했어요.'); return }
      setSub({ submitted_at: new Date().toISOString(), photo_paths: Array(j.count).fill('') })
      setFiles([]); setMsg('제출했어요!')
    } catch { setMsg('제출하지 못했어요. 다시 해 주세요.') } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-[#9FE1CB] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">📝 {formula ? '공식 쓰기 제출' : '백지 증명 제출'}</p>
        {sub && <span className="text-xs font-bold text-green-600">제출 완료 ✓</span>}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        {formula
          ? <>영상을 끄고, <b>백지에 공식을 전부 한 번씩</b> 안 보고 써 보세요. 다 쓰면 사진을 찍어 올리면 끝이에요. (최대 3장)</>
          : <>영상을 끄고, <b>백지에 처음부터 혼자</b> 증명을 써 보세요. 다 쓰면 사진을 찍어 올리면 끝이에요. (최대 3장)</>}
      </p>
      {!watched ? (
        <p className="text-xs font-bold text-[#993C1D]">영상을 끝까지 보면 제출할 수 있어요.</p>
      ) : (
        <>
          {sub && (
            <p className="text-[11px] text-gray-400">
              {new Date(sub.submitted_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}에 {sub.photo_paths.length}장 냈어요. 다시 내면 새 사진으로 바뀌어요.
            </p>
          )}
          <label className="block">
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { const fs = Array.from(e.target.files || []).slice(0, 3); setFiles(fs); setMsg(fs.length ? '' : '') }} />
            <span className="block text-center text-sm font-bold py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-600 cursor-pointer">
              {files.length ? `사진 ${files.length}장 골랐어요 (다시 고르기)` : sub ? '사진 다시 고르기' : '사진 찍기 / 고르기'}
            </span>
          </label>
          {files.length > 0 && (
            <div className="flex gap-2">
              {files.map((f, i) => <img key={i} src={URL.createObjectURL(f)} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-100" />)}
            </div>
          )}
          <button onClick={send} disabled={!files.length || busy}
            className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: '#E2703A', color: '#fff' }}>
            {busy ? '올리는 중…' : sub ? '다시 내기' : '제출하기'}
          </button>
          {msg && <p className="text-xs text-center font-bold text-gray-700">{msg}</p>}
        </>
      )}
    </div>
  )
}
