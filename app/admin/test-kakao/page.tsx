'use client'

import { useState } from 'react'

export default function TestKakaoPage() {
  const [sessionId, setSessionId] = useState('992df295-59ce-48d5-8741-795f450b89e3') // 최온유, 정시 출석, 학습지100점/데일리테스트83점
  const [testPhone, setTestPhone] = useState('01097302589')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSend() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/send-kakao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, testPhone }),
      })
      const data = await res.json()
      setResult({ ok: res.ok, text: JSON.stringify(data, null, 2) })
    } catch (e: any) {
      setResult({ ok: false, text: '오류: ' + e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', maxWidth: 600 }}>
      <h2>카톡 발송 테스트</h2>
      <p style={{ color: '#666' }}>이 페이지는 관리자 테스트용입니다. 다른 곳에 링크되어 있지 않아요.</p>

      <label style={{ display: 'block', marginTop: 20 }}>
        세션 ID
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>

      <label style={{ display: 'block', marginTop: 12 }}>
        테스트 받을 번호
        <input
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
        />
      </label>

      <button
        onClick={handleSend}
        disabled={loading}
        style={{
          marginTop: 20,
          fontSize: 18,
          padding: '14px 28px',
          background: '#FEE500',
          border: 'none',
          borderRadius: 8,
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? '보내는 중...' : '💬 테스트 발송'}
      </button>

      {result && (
        <pre
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 8,
            whiteSpace: 'pre-wrap',
            fontSize: 14,
            background: result.ok ? '#e6f9e6' : '#fde6e6',
            color: result.ok ? '#1a7a1a' : '#a11',
          }}
        >
          {result.text}
        </pre>
      )}
    </div>
  )
}
