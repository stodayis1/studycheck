'use client'

// 증명 백지 제출 — 선생님·학부모 화면에 붙는 「증명 제출 1/2」 표시. 누르면 낸 사진을 보여 준다.
// 사진은 비공개 보관함(proof-photos)이라 잠깐 열리는 주소(10분)로만 연다 — 보관함 정책이 선생님과 그 학생 학부모만 허락한다.
// 학생 화면에는 쓰지 않는다 (학생은 시청 화면의 ProofSubmitBox 에서 「냈다」만 본다).

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export type ProofSubmission = { session_id: string; video_url: string; photo_paths: string[]; submitted_at: string }

export function ProofSubmissionChip({ proofUrls, subs, labelOf }: {
  proofUrls: string[]                 // 이 수업 영상 과제 중 증명 강의 링크
  subs: ProofSubmission[]             // 이 수업에 낸 것
  labelOf?: (url: string) => string   // 강의 이름 (없으면 순서 번호)
}) {
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<Record<string, string[]>>({})
  if (!proofUrls.length) return null
  const subOf = (u: string) => subs.find((s) => s.video_url === u)
  const done = proofUrls.filter((u) => subOf(u)).length
  const all = done === proofUrls.length

  async function show() {
    setOpen(true)
    const paths = subs.flatMap((s) => s.photo_paths)
    if (!paths.length) return
    const { data } = await supabase.storage.from('proof-photos').createSignedUrls(paths, 600)
    const byPath = Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]))
    setPhotos(Object.fromEntries(subs.map((s) => [s.video_url, s.photo_paths.map((p) => byPath[p]).filter(Boolean)])))
  }

  return (
    <>
      <button type="button" onClick={done ? show : undefined}
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
        style={all ? { background: '#EAF3DE', color: '#27500A' } : done ? { background: '#FAEEDA', color: '#633806' } : { background: '#fee2e2', color: '#991b1b' }}
        title={done ? '눌러서 사진 보기' : '아직 안 냈어요'}>
        <i className="ti ti-writing align-[-0.125em]" /> 증명 제출 {done}/{proofUrls.length}{done ? ' · 사진 보기' : ''}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900">백지 증명 제출</p>
              <button onClick={() => setOpen(false)} className="text-gray-400"><i className="ti ti-x" /></button>
            </div>
            {proofUrls.map((u, i) => {
              const s = subOf(u)
              return (
                <div key={u} className="space-y-2">
                  <p className="text-xs font-bold text-gray-700">
                    {labelOf ? labelOf(u) : `${i + 1}번 영상`}
                    <span className="ml-2 font-normal text-gray-400">
                      {s ? `${new Date(s.submitted_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 제출` : '안 냄'}
                    </span>
                  </p>
                  {s && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(photos[u] || []).map((src, j) => (
                        <a key={j} href={src} target="_blank" rel="noreferrer">
                          <img src={src} alt="" className="w-full rounded-lg border border-gray-100" />
                        </a>
                      ))}
                      {!photos[u] && <p className="text-xs text-gray-400">사진 여는 중…</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
