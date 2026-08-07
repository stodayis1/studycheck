'use client'

import { useEffect, useState } from 'react'
import { getPushSubscriptionState, subscribeToPush, unsubscribeFromPush, type PushState } from '@/lib/push'

interface Props {
  role: 'teacher' | 'staff' | 'admin' | 'student' | 'parent'
  studentId?: string
  userId?: string
}

export default function PushSubscribeButton({ role, studentId, userId }: Props) {
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    getPushSubscriptionState().then(setState)
  }, [])

  if (state === 'loading' || state === 'unsupported') return null

  async function handleClick() {
    setBusy(true)
    setMsg('')
    if (state === 'subscribed') {
      const r = await unsubscribeFromPush()
      if (r.ok) { setState('default'); setMsg('알림을 껐어요') } else setMsg(r.error || '오류가 발생했어요')
    } else {
      const r = await subscribeToPush({ role, studentId, userId })
      if (r.ok) { setState('subscribed'); setMsg('알림을 켰어요!') } else setMsg(r.error || '오류가 발생했어요')
    }
    setBusy(false)
    setTimeout(() => setMsg(''), 3000)
  }

  if (state === 'denied') {
    return (
      <div className="text-[10px] px-2.5 py-1.5 rounded-lg font-medium" style={{ background: '#fef2f2', color: '#991b1b' }}>
        알림이 차단됐어요. 브라우저 설정에서 허용해주세요.
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
        style={
          state === 'subscribed'
            ? { background: '#F0FBF7', color: '#085041', border: '1px solid #9FE1CB' }
            : { background: '#0f3460', color: 'white' }
        }
      >
        <i className={`ti ${state === 'subscribed' ? 'ti-bell-ringing' : 'ti-bell'}`} style={{ fontSize: 12 }} />
        {state === 'subscribed' ? '알림 켜짐' : '알림 받기'}
      </button>
      {msg && <span className="text-[10px]" style={{ color: '#9ca3af' }}>{msg}</span>}
    </div>
  )
}
