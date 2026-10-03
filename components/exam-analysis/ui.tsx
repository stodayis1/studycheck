'use client'
// 시험지 분석 화면들이 같이 쓰는 작은 부품
import { apiFetch } from '@/lib/apiFetch'

export const GREEN = '#085041'
export const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm'

export async function post(body: any) {
  const r = await apiFetch('/api/exam-analysis', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, ...j }
}

// 시험지를 통째로 인쇄한다 — 작업한 「문제」 PDF 를 새 창으로 연다 (거기서 Ctrl+P).
// 주소를 받아 온 뒤에 창을 열면 팝업 차단에 걸리므로, 빈 창을 먼저 열고 주소를 넣는다
export async function openPrint(paperId: string) {
  const w = window.open('', '_blank')
  const r = await post({ action: 'printUrl', paperId })
  if (!r.ok || !r.url) {
    w?.close()
    alert(r.error ?? '인쇄할 파일을 찾지 못했습니다.')
    return
  }
  if (w) w.location.href = r.url
  else window.location.href = r.url
}

export function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center">
        <h2 className="text-sm font-bold" style={{ color: GREEN }}>{title}</h2>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'col-span-full' : ''}`}>
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  )
}
