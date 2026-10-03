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
