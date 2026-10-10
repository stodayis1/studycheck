'use client'
// 원장: 「AI 적중 대조」 버튼. 서버(/api/exam-analysis/match)를 세 단계로 나눠 부른다 — 한 번에 하면 서버 시간 제한에 걸린다.
//   plan(묶음 나누기) → scan(묶음마다 후보 찾기, 3개씩 동시에) → verify(문항 그림을 한 장씩 놓고 확정 · 저장)
// 화면을 닫으면 거기서 멈춘다. 다시 눌러도 이미 들어간 매칭은 겹치지 않는다.
import { useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { MATCH_LEVELS } from '@/lib/examAnalysis'
import { GREEN } from './ui'

async function call(body: any) {
  const r = await apiFetch('/api/exam-analysis/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `서버 오류 (${r.status})`)
  return j
}

// 일을 n개씩 동시에
async function pool<T>(jobs: T[], n: number, run: (job: T, i: number) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    for (;;) { const i = next++; if (i >= jobs.length) return; await run(jobs[i], i) }
  }))
}

export default function AutoMatch({ paperId, hasQuestions, existing, onDone }: { paperId: string; hasQuestions: boolean; existing: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const start = async () => {
    if (!confirm(`AI 가 기출 문항과 이너프원 문항을 하나씩 대조합니다.\n5~10분쯤 걸리고 AI 사용료가 듭니다 (시험 1건에 몇 천 원쯤).\n끝날 때까지 이 화면을 닫지 말아 주세요.${existing ? `\n\n이미 있는 매칭 ${existing}건은 그대로 두고, 새로 찾은 것만 더합니다.` : ''}\n\n시작할까요?`)) return
    setBusy(true); setErr('')
    try {
      setMsg('1/3 문항을 단원별로 나누는 중…')
      const plan = await call({ action: 'plan', paperId })
      const jobs: any[] = plan.jobs ?? []
      if (!jobs.length) throw new Error('대조할 교재 단원을 찾지 못했습니다.')

      const cands: any[] = []
      let done = 0
      const failed: string[] = []
      setMsg(`2/3 교재에서 비슷한 문항을 찾는 중… 0 / ${jobs.length}`)
      await pool(jobs, 3, async (job) => {
        try {
          const r = await call({ action: 'scan', paperId, nos: job.nos, book: job.book, sheets: job.sheets })
          cands.push(...(r.matches ?? []))
        } catch (e: any) { failed.push(`${job.label} · ${job.book}`) }
        setMsg(`2/3 교재에서 비슷한 문항을 찾는 중… ${++done} / ${jobs.length}`)
      })
      if (!cands.length) throw new Error(failed.length ? `교재를 읽지 못했습니다: ${failed[0]}` : '비슷한 문항을 찾지 못했습니다.')

      // 문항마다 정도가 높은 후보 4개까지 → 4문항씩 묶어 확정
      const byNo: Record<string, any[]> = {}
      for (const c of cands) (byNo[c.no] ??= []).push(c)
      const items = Object.entries(byNo).map(([no, list]) => {
        const uniq = list.filter((c, i) => list.findIndex((o) => o.book === c.book && o.set === c.set && o.pno === c.pno) === i)
        return { no, cands: uniq.sort((a, c) => MATCH_LEVELS.indexOf(a.level) - MATCH_LEVELS.indexOf(c.level)).slice(0, 4) }
      }).sort((a, c) => Number(a.no) - Number(c.no))
      const batches: any[][] = []
      for (let i = 0; i < items.length; i += 4) batches.push(items.slice(i, i + 4))
      let added = 0, vdone = 0
      setMsg(`3/3 그림을 한 장씩 놓고 확정하는 중… 0 / ${batches.length}`)
      await pool(batches, 3, async (batch) => {
        try { added += (await call({ action: 'verify', paperId, items: batch })).added ?? 0 }
        catch (e: any) { failed.push(`확정 ${batch.map((x) => x.no).join(',')}번`) }
        setMsg(`3/3 그림을 한 장씩 놓고 확정하는 중… ${++vdone} / ${batches.length}`)
      })
      setMsg(`끝났습니다. 매칭 ${added}건을 넣었습니다.${plan.missing?.length ? ` (묶음에 못 들어간 문항: ${plan.missing.join(', ')}번)` : ''}${failed.length ? ` 일부는 실패했습니다 — 다시 누르면 빠진 것만 채웁니다: ${failed.slice(0, 3).join(' / ')}` : ''} 아래 목록에서 이상한 것만 고쳐 주세요.`)
      onDone()
    } catch (e: any) {
      setErr(e?.message ?? '적중 대조를 하지 못했습니다.')
      setMsg('')
    }
    setBusy(false)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: '#9FE1CB', background: '#F0FBF7' }}>
      <button onClick={start} disabled={busy || !hasQuestions}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
        <i className={`ti ${busy ? 'ti-loader-2 animate-spin' : 'ti-sparkles'} mr-1.5`} />AI 적중 대조 {existing ? '다시 하기' : '시작'}
      </button>
      <span className="min-w-0 flex-1 text-xs text-gray-600">
        {err ? <span className="font-semibold text-red-600"><i className="ti ti-alert-triangle mr-1" />{err}</span>
          : msg ? <span className={busy ? '' : 'font-semibold'} style={busy ? undefined : { color: GREEN }}>{msg}</span>
          : !hasQuestions ? '먼저 「기본 · 파일」에서 PDF 의 「문항 넣기」를 해 주세요.'
          : '기출 문항을 이너프원 교재와 대조해 적중률을 채웁니다. 결과에서 이상한 것만 고치면 됩니다.'}
      </span>
    </div>
  )
}
