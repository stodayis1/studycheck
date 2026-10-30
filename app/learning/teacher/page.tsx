'use client'

/**
 * 강사 요약 화면 — GPT-EXEC-041
 *
 * 학생 세션으로는 열리지 않는다. 시험 강사 코드로 들어간다.
 * 계획은 **draft** 로만 보인다. 승인 버튼을 두지 않는다 — 이번 범위가 아니다.
 * 강사에게 학생별 새 입력을 요구하지 않는다 (040 §4-6).
 */
import { useCallback, useEffect, useState } from 'react'

import { MathText } from '@/components/MathText'

type Row = {
  studentId: string
  displayName: string
  attemptId: string
  taskLabel: string
  typeCode: string
  typeTitle: string
  problemId: string
  summary: {
    firstResult: string | null
    lastResult: string | null
    resultAfterHelp: string | null
    answerCount: number
    repeatedWrong: boolean
    stuckAxis: string | null
    helpOpenCount: number
    anyConfirmCorrect: boolean
  }
  confirmSubmissions: Array<{ itemRef: string; answer: string; graded: string | null; origin: string }>
  observed: string[]
  unknownScope: string[]
  notClaimed: string[]
  outcomes: {
      confirmPassed: boolean | null
      sourceSolvedAfterHelp: boolean | null
      delayedRecheckPassed: boolean | null
      mastery: null
      notes: string[]
    }
  summaryLine: string
  planDraft: { approvalState: string; items: string[]; recheckMethod: string } | null
}

export default function TeacherSummaryPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [code, setCode] = useState('')
  const [storage, setStorage] = useState<{ backend: string; location: string } | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/learning/teacher', { cache: 'no-store' })
    const j = await r.json()
    if (!j.ok) { setErr(String(j.error ?? '열 수 없습니다')); setRows(null); return }
    setErr(''); setRows(j.rows as Row[]); setStorage(j.storage)
  }, [])

  useEffect(() => { void load() }, [load])

  async function staffLogin() {
    const r = await fetch('/api/learning/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'staff_login', code }),
    })
    const j = await r.json()
    if (!j.ok) { setErr(String(j.error ?? '입장 실패')); return }
    await load()
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff8e1', border: '1px solid #e8d9a0', borderRadius: 8,
                    padding: '10px 12px', marginBottom: 16, fontSize: 12, lineHeight: 1.6 }}>
        <b>시험 저장소입니다 — 운영 DB 가 아닙니다.</b>
        {storage !== null && <><br />저장 위치: {storage.backend} · {storage.location}</>}
        <br />계획은 draft 이며 승인 전에는 학생에게 적용되지 않습니다. 자동 과제 배정을 하지 않습니다.
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 20 }}>강사 요약</h1>
        <a href="/learning" style={{ fontSize: 13 }}>학생 화면</a>
      </div>

      {rows === null && (
        <div style={box}>
          <p style={{ marginTop: 0, color: '#a33' }}>{err || '강사 세션이 필요합니다.'}</p>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="강사 입장 코드"
            style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6, marginRight: 8 }} />
          <button onClick={() => void staffLogin()} style={btn}>들어가기</button>
        </div>
      )}

      {rows !== null && rows.length === 0 && <div style={box}>아직 기록된 시도가 없습니다.</div>}

      {(rows ?? []).map((r) => (
        <div key={r.attemptId} style={box}>
          <div style={{ fontWeight: 600 }}>
            {r.displayName} · {r.taskLabel}
            <span style={{ fontSize: 12, color: '#666' }}> ({r.typeCode} {r.typeTitle})</span>
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            시도 {r.attemptId} · 문항 {r.problemId}
          </div>
          <table style={{ fontSize: 13, marginTop: 8, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><th style={th}>막힌 지점</th><td style={td}>{r.summary.stuckAxis ?? '미관측'}</td></tr>
              <tr><th style={th}>제출</th><td style={td}>
                {r.summary.answerCount}회 · 첫 {r.summary.firstResult ?? '—'} → 마지막 {r.summary.lastResult ?? '—'}
                {r.summary.repeatedWrong && <span style={{ color: '#a33' }}> · 오답 반복 (같은 오개념인지는 미확인)</span>}
              </td></tr>
              <tr><th style={th}>도움 뒤 원문 결과</th><td style={td}>
                {r.summary.resultAfterHelp ?? '도움 뒤 제출 없음'}
              </td></tr>
              <tr><th style={th}>열어 본 도움</th><td style={td}>{r.summary.helpOpenCount}건</td></tr>
              <tr><th style={th}>확인 행동</th><td style={td}>
                {r.confirmSubmissions.length === 0 ? '없음' : r.confirmSubmissions.map((c) => (
                  <div key={c.itemRef}>
                    {c.itemRef} · 제출 「<MathText text={c.answer} />」 · {c.graded ?? '판정 없음'}
                    <span style={{ fontSize: 11, color: '#777' }}> ({c.origin === 'demo' ? '시연' : '운영'})</span>
                  </div>
                ))}
              </td></tr>
              <tr><th style={th}>확인 행동</th><td style={td}>
                {label3(r.outcomes.confirmPassed, '맞음', '아직 못 맞힘', '아직 안 냄')}
              </td></tr>
              <tr><th style={th}>도움 뒤 원문</th><td style={td}>
                {label3(r.outcomes.sourceSolvedAfterHelp, '정답', '오답', '해당 제출 없음')}
              </td></tr>
              <tr><th style={th}>시간차 재확인</th><td style={td}>
                {label3(r.outcomes.delayedRecheckPassed, '통과', '실패', '아직 안 함')}
              </td></tr>
              <tr><th style={th}>숙달</th><td style={td}>판정하지 않음</td></tr>
              <tr><th style={th}>읽을 때 주의</th><td style={td}>
                <ul style={{ margin: 0, paddingLeft: 16, color: '#666' }}>
                  {r.outcomes.notes.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </td></tr>
            </tbody>
          </table>
          <p style={{ fontSize: 13, background: '#f3f6fb', padding: 8, borderRadius: 6 }}>{r.summaryLine}</p>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>관측 / 미측정 / 확정하지 않음</summary>
            <div style={{ fontSize: 13 }}>
              <p><b>관측됨</b></p><ul>{r.observed.map((x) => <li key={x}>{x}</li>)}</ul>
              <p><b>미측정·미확인</b></p><ul>{r.unknownScope.map((x) => <li key={x}>{x}</li>)}</ul>
              <p><b>확정하지 않음</b> — {r.notClaimed.join(' · ')}</p>
            </div>
          </details>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <b>다음 과제 초안</b>
            {r.planDraft === null ? <span> — 아직 없음</span> : (
              <>
                <span style={{ marginLeft: 6, fontSize: 11, background: '#fde8e8', border: '1px solid #f0c2c2',
                               borderRadius: 4, padding: '1px 5px' }}>
                  {r.planDraft.approvalState}
                </span>
                <ul>{r.planDraft.items.map((i) => <li key={i}>{i}</li>)}</ul>
                <div style={{ color: '#666' }}>재확인 방법: {r.planDraft.recheckMethod}</div>
              </>
            )}
          </div>
        </div>
      ))}
    </main>
  )
}

/** 셋으로 갈라 적는다. `null` 을 「아니오」로 바꾸지 않는다 */
function label3(v: boolean | null, yes: string, no: string, none: string): string {
  return v === null ? none : (v ? yes : no)
}

const box: React.CSSProperties = {
  border: '1px solid #d7dbe0', borderRadius: 10, padding: 14, marginBottom: 14, background: '#fff',
}
const btn: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #c8ccd2', borderRadius: 6,
  background: '#f6f7f9', cursor: 'pointer', fontSize: 13, color: '#222',
}
const th: React.CSSProperties = { textAlign: 'left', padding: '3px 10px 3px 0', color: '#555', whiteSpace: 'nowrap', verticalAlign: 'top' }
const td: React.CSSProperties = { padding: '3px 0' }
