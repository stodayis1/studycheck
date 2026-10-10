'use client'
// 원장: Claude 에게 맡길 일을 「요청」으로 남기는 버튼 (적중 대조 · 카드뉴스).
// 누르면 exam_papers.tasks 에 <kind>_requested_at 이 남는다. 원장님 컴퓨터의 Claude 가 요청 목록
// (scripts/exam-blog/queue.mjs list)을 읽어 처리하고 <kind>_done_at / <kind>_failed_at + <kind>_note 를 남긴다.
// 서버가 AI 를 부르지 않으므로 사용료가 따로 들지 않는다.
import { useState } from 'react'
import { GREEN, post } from './ui'

const at = (ts: string) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ClaudeRequest({ paperId, tasks, kind, label, hint, blocked, onSaved }: {
  paperId: string
  tasks: any
  kind: 'match' | 'cards'
  label: string                 // 버튼 글자 (예: 적중 대조 요청)
  hint: string                  // 아직 요청하지 않았을 때 안내
  blocked?: string              // 지금 요청할 수 없는 이유 (있으면 버튼이 꺼진다)
  onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const req = tasks?.[`${kind}_requested_at`], ok = tasks?.[`${kind}_done_at`], ng = tasks?.[`${kind}_failed_at`], note = tasks?.[`${kind}_note`]
  const waiting = req && !(ok && ok > req) && !(ng && ng > req)

  const ask = async () => {
    if (!confirm(`「${label}」을 남길까요?\n남긴 뒤 Claude 에게 「요청 처리해줘」라고 하면 처리됩니다. (AI 사용료가 따로 들지 않습니다)`)) return
    setBusy(true)
    const r = await post({ action: 'savePaper', id: paperId, patch: { tasks: { ...(tasks ?? {}), [`${kind}_requested_at`]: new Date().toISOString() } } })
    setBusy(false)
    if (!r.ok) alert(r.error ?? '요청을 남기지 못했습니다.')
    onSaved()
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: '#9FE1CB', background: '#F0FBF7' }}>
      <button onClick={ask} disabled={busy || !!blocked || !!waiting}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
        <i className="ti ti-send mr-1.5" />{label}
      </button>
      <span className="min-w-0 flex-1 text-xs text-gray-600">
        {blocked ? blocked
          : !req ? hint
          : ok && ok > req ? <span className="font-semibold" style={{ color: GREEN }}><i className="ti ti-circle-check mr-1" />{at(ok)} · {note || '끝났습니다.'}</span>
          : ng && ng > req ? <span className="font-semibold text-red-600"><i className="ti ti-alert-triangle mr-1" />{at(ng)} 못 했습니다 — {note} (채운 뒤 다시 눌러 주세요)</span>
          : <>요청함: {at(req)} · Claude 에게 <b>「요청 처리해줘」</b>라고 하면 처리됩니다</>}
      </span>
    </div>
  )
}
