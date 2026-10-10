'use client'
// 「블로그」 탭 — 시험분석 카드뉴스를 화면에서 만든다.
//   글(analysis): 원장이 「카드뉴스 요청」을 남기면 원장님 컴퓨터의 Claude 가 써서 올린다 (scripts/exam-blog/README.md).
//                 서버가 AI 로 쓰는 길(/api/exam-analysis/blog generate)은 사용료 때문에 화면에서 뺐다 (코드는 남아 있다)
//   그림(PNG)   : 이 화면이 굽는다       (lib/examBlogRender.ts ← lib/examBlogCards.mjs)
// 글을 고치고 「다시 그리기」 하면 카드가 바뀌고, 고친 글은 보관된다. 네이버에 올리는 것은 여기서 하지 않는다.
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { renderBlogCards, type RenderedCard } from '@/lib/examBlogRender'
import ClaudeRequest from './ClaudeRequest'
import { GREEN, INPUT } from './ui'

async function call(body: any) {
  const r = await apiFetch('/api/exam-analysis/blog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? `서버 오류 (${r.status})`)
  return j
}
const CARD_LABEL: Record<string, string> = { '00_thumb': '대표 썸네일', '01_summary': '시험분석 요약', '02_killers': '변별력 문항', '04_hit': '이너프원 적중 (매칭표)', '06_review': '이번 시험 총평', '04_review': '이번 시험 총평' }
const labelOf = (name: string) => CARD_LABEL[name] ?? (name.startsWith('03_deep_') ? `${Number(name.slice(8))}번 심층분석` : name.startsWith('05_pairs_') ? `적중 문항 비교 ${name.slice(9)}` : name)
const lines = (v: any) => (Array.isArray(v) ? v.join('\n') : '')
const toLines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const pairs = (v: any) => (Array.isArray(v) ? v.map((x: any) => `${x.t ?? ''} | ${x.d ?? ''}`).join('\n') : '')
const toPairs = (s: string) => toLines(s).map((l) => { const [t, ...d] = l.split('|'); return { t: t.trim(), d: d.join('|').trim() } })
const steps = (v: any) => (Array.isArray(v) ? v.map((x: any) => `${x.t ?? ''} | ${x.d ?? ''} | ${x.point ?? ''}`).join('\n') : '')
const toSteps = (s: string) => toLines(s).slice(0, 4).map((l) => { const p = l.split('|').map((x) => x.trim()); return { t: p[0] ?? '', d: p[1] ?? '', point: p.slice(2).join(' | ') } })

// 글 고치는 칸 (화면 바깥에 둬야 글자를 칠 때마다 칸이 새로 만들어지지 않는다)
function F({ label, value, onChange, rows = 1 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block text-xs text-gray-600">{label}
      {rows > 1
        ? <textarea className={`${INPUT} mt-1`} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input className={`${INPUT} mt-1`} value={value} onChange={(e) => onChange(e.target.value)} />}
    </label>
  )
}

export default function BlogCards({ paperId, paperName, isAdmin, tasks, onSaved }: { paperId: string; paperName: string; isAdmin: boolean; tasks: any; onSaved: () => void }) {
  const [analysis, setAnalysis] = useState<any>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const [missing, setMissing] = useState<string[]>([])
  const [cards, setCards] = useState<RenderedCard[]>([])
  const [busy, setBusy] = useState('불러오는 중…')
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)

  const draw = useCallback(async (a: any, im: Record<string, string>) => {
    setBusy('카드를 그리는 중…')
    try {
      const out = await renderBlogCards(a, im, (i, n) => setBusy(`카드를 그리는 중… ${i} / ${n}`))
      setCards((old) => { old.forEach((c) => URL.revokeObjectURL(c.url)); return out })
      setErr('')
    } catch (e: any) { setErr(e?.message ?? '카드를 그리지 못했습니다.') }
    setBusy('')
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const r = await call({ action: 'load', paperId })
        setMissing(r.missing ?? []); setImages(r.images ?? {}); setAnalysis(r.analysis)
        if (r.analysis) await draw(r.analysis, r.images ?? {})
      } catch (e: any) { setErr(e?.message ?? '불러오지 못했습니다.') }
      setBusy('')
    })()
  }, [paperId, draw])

  const redraw = async () => {
    await draw(analysis, images)
    if (dirty) { try { await call({ action: 'save', paperId, analysis }); setDirty(false) } catch (e: any) { setErr(`그림은 바뀌었지만 글을 보관하지 못했습니다: ${e?.message}`) } }
  }
  const set = (patch: any) => { setAnalysis((a: any) => ({ ...a, ...patch })); setDirty(true) }
  const setKiller = (i: number, patch: any) => set({ killers: analysis.killers.map((k: any, j: number) => (j === i ? { ...k, ...patch } : k)) })
  const save = (c: RenderedCard) => { const a = document.createElement('a'); a.href = c.url; a.download = `${paperName}_${c.name}.png`; a.click() }
  const saveAll = async () => { for (const c of cards) { save(c); await new Promise((r) => setTimeout(r, 350)) } }

  return (
    <div className="mb-5 rounded-xl border p-4" style={{ borderColor: '#9FE1CB' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold" style={{ color: GREEN }}><i className="ti ti-cards mr-1" />시험분석 카드뉴스</span>
        {analysis && isAdmin && <button onClick={() => setEditing((v) => !v)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: GREEN, color: GREEN }}><i className="ti ti-pencil mr-1" />글 고치기</button>}
        {cards.length > 0 && <button onClick={saveAll} disabled={!!busy} className="rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40" style={{ borderColor: GREEN, color: GREEN }}><i className="ti ti-download mr-1" />{cards.length}장 모두 내려받기</button>}
        {busy && <span className="text-xs text-gray-500"><i className="ti ti-loader-2 mr-1 animate-spin" />{busy}</span>}
      </div>
      {isAdmin && (
        <div className="mt-3">
          <ClaudeRequest paperId={paperId} tasks={tasks} kind="cards" label={analysis ? '카드뉴스 다시 요청' : '카드뉴스 요청'} onSaved={onSaved}
            blocked={missing.length ? `아직 채워지지 않은 것이 있습니다: ${missing.join(' · ')}` : undefined}
            hint="요청을 남기고 Claude 에게 「요청 처리해줘」라고 하면 대표 썸네일 · 요약 · 변별문항 · 심층분석 · 총평 카드가 여기에 나타납니다." />
        </div>
      )}
      {err && <p className="mt-2 whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{err}</p>}
      {!analysis && !busy && !err && !isAdmin && <p className="mt-2 text-xs text-gray-600">아직 만든 카드뉴스가 없습니다.</p>}

      {editing && analysis && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <p className="mb-2 text-xs text-gray-500">글을 고친 뒤 <b>「다시 그리기」</b>를 누르면 카드가 바뀌고 고친 글이 보관됩니다. 숫자(문항 수 · 배점 · 적중률)는 자료에서 오므로 여기서 고치지 않습니다.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <F label="썸네일 큰 제목 (한 줄에 하나, 3줄)" rows={3} value={lines(analysis.thumb?.headline)} onChange={(v) => set({ thumb: { ...analysis.thumb, headline: toLines(v) } })} />
            <div className="space-y-3">
              <F label="썸네일 부제" value={analysis.thumb?.sub ?? ''} onChange={(v) => set({ thumb: { ...analysis.thumb, sub: v } })} />
              <F label="시험 범위" value={analysis.scope ?? ''} onChange={(v) => set({ scope: v })} />
            </div>
            <F label="전체 경향 한 문장" rows={2} value={analysis.one_line ?? ''} onChange={(v) => set({ one_line: v })} />
            <div className="space-y-3">
              <F label="한 줄 표어" value={analysis.tagline ?? ''} onChange={(v) => set({ tagline: v })} />
              <F label="이 시험이 주는 메시지" value={analysis.message ?? ''} onChange={(v) => set({ message: v })} />
            </div>
            <F label="출제 경향 (한 줄에 하나)" rows={4} value={lines(analysis.trends)} onChange={(v) => set({ trends: toLines(v) })} />
            <F label="다음 시험 전략 (한 줄에 하나)" rows={4} value={lines(analysis.strategy)} onChange={(v) => set({ strategy: toLines(v) })} />
            <F label="이번 시험의 특징 (이름 | 설명)" rows={3} value={pairs(analysis.features)} onChange={(v) => set({ features: toPairs(v) })} />
            <F label="어려웠던 이유 (이름 | 설명)" rows={3} value={pairs(analysis.hard_reasons)} onChange={(v) => set({ hard_reasons: toPairs(v) })} />
            <F label="학습 방향 (이름 | 설명)" rows={5} value={pairs(analysis.study_steps)} onChange={(v) => set({ study_steps: toPairs(v) })} />
          </div>
          {(analysis.killers ?? []).map((k: any, i: number) => (
            <div key={k.no} className="mt-3 rounded-lg border bg-white p-3">
              <div className="mb-2 text-xs font-bold" style={{ color: GREEN }}>{k.no}번 심층분석</div>
              <div className="grid gap-3 md:grid-cols-2">
                <F label="제목" value={k.title ?? ''} onChange={(v) => setKiller(i, { title: v })} />
                <F label="단원 · 유형" value={k.tag ?? ''} onChange={(v) => setKiller(i, { tag: v })} />
                <F label="어떤 문제인지" rows={2} value={k.summary ?? ''} onChange={(v) => setKiller(i, { summary: v })} />
                <F label="풀이 핵심 (한 줄에 하나, 4줄)" rows={4} value={lines(k.checks)} onChange={(v) => setKiller(i, { checks: toLines(v).slice(0, 4) })} />
                <div className="md:col-span-2"><F label="풀이 4단계 (단계 이름 | 풀이 | POINT — 한 줄에 한 단계)" rows={4} value={steps(k.steps)} onChange={(v) => setKiller(i, { steps: toSteps(v) })} /></div>
                <F label="어려웠던 이유" rows={3} value={k.why ?? ''} onChange={(v) => setKiller(i, { why: v })} />
                <F label="선생님 한마디" rows={3} value={k.comment ?? ''} onChange={(v) => setKiller(i, { comment: v })} />
              </div>
            </div>
          ))}
          <div className="mt-3 text-right">
            <button onClick={redraw} disabled={!!busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
              <i className="ti ti-refresh mr-1.5" />다시 그리기{dirty ? ' · 보관' : ''}
            </button>
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          {cards.map((c) => (
            <div key={c.name} className="rounded-lg border bg-gray-50 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={c.url} target="_blank" rel="noreferrer"><img src={c.url} alt={labelOf(c.name)} className="w-full rounded" /></a>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-700">{labelOf(c.name)}</span>
                <button onClick={() => save(c)} className="font-semibold" style={{ color: GREEN }}><i className="ti ti-download mr-0.5" />PNG</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
