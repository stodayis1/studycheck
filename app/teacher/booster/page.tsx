'use client'

// 부스터 특강 신청 현황 — /teacher/booster (원장 전용)
//
// 원장님 2026-11-19: 「신청자 명단과 개인정보는 관리자만 열람할 수 있도록 해주세요.」
//                   「신청 취소가 발생했을 때 자리를 다시 열지, 대기자를 받을지는 관리자가 결정」
//
// ★ 여기엔 학부모 연락처가 있다. 화면도 API 도 **원장만**이다.
// ★ 취소해도 자리는 **자동으로 안 열린다.** 「자리 다시 열기」를 따로 누르셔야 한다.
// ★ 연습용 특강을 같은 화면에서 본다 — 먼저 연습으로 다 돌려 보고 실제를 여신다.

import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { BOOSTER, BOOSTER_SLUG, BOOSTER_TEST_SLUG, 번호꼴 } from '@/lib/booster'

const BASE = 'https://studycheck-five.vercel.app'
const NAVY = '#15329B'
const ORANGE = '#F26522'

type App = {
  id: string; seat_no: number; status: string
  student_name: string; grade: string; parent_name: string; parent_phone: string
  is_enrolled: boolean; created_at: string
  cancelled_at: string | null; cancel_reason: string | null
  sharedPhone: boolean
}
type Data = {
  session: {
    slug: string; title: string; capacity: number; seatsTaken: number; seatsLeft: number
    opensAt: string; isOpen: boolean; isTest: boolean
  }
  serverNow: string; confirmed: number; cancelled: number; applications: App[]
}

const 한국시각 = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

export default function BoosterAdminPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [slug, setSlug] = useState(BOOSTER_SLUG)
  const [d, setD] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [일하는중, set일하는중] = useState(false)

  const 불러오기 = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const res = await apiFetch(`/api/booster/admin?slug=${encodeURIComponent(slug)}`)
      const j = await res.json()
      if (!res.ok) { setErr(j.error || '불러오지 못했어요.'); setD(null); return }
      setD(j)
    } catch { setErr('불러오지 못했어요.') } finally { setLoading(false) }
  }, [slug])

  useEffect(() => { if (isAdmin()) 불러오기() }, [불러오기, isAdmin])

  // 접수 중에는 30초마다 새로 — 켜 두고 보실 수 있게
  useEffect(() => {
    const t = setInterval(() => { if (isAdmin() && !일하는중) 불러오기() }, 30000)
    return () => clearInterval(t)
  }, [불러오기, isAdmin, 일하는중])

  async function 보내기(body: any, 물음: string) {
    if (!confirm(물음)) return
    set일하는중(true)
    try {
      const res = await apiFetch('/api/booster/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) { alert(j.error || '하지 못했어요.'); return }
      if (j.note) alert(j.note)
      await 불러오기()
    } catch { alert('하지 못했어요.') } finally { set일하는중(false) }
  }

  function 취소하기(a: App) {
    const why = prompt(`${a.student_name} 학생(접수 ${a.seat_no}번) 신청을 취소합니다.\n까닭을 적어주세요.`, '')
    if (why === null) return
    보내기({ action: 'cancel', id: a.id, reason: why },
      `${a.student_name} 학생 신청을 취소할까요?\n\n· 명단에서 「취소」로 남습니다\n· ★ 자리는 **그대로 막혀 있습니다** — 다시 받으시려면 「자리 다시 열기」를 따로 눌러주세요`)
  }

  if (authLoading) return <Shell><div style={S.빈}>불러오는 중…</div></Shell>
  if (!isAdmin()) return <Shell><div style={S.빈}>관리자만 접근할 수 있습니다.</div></Shell>

  const 링크 = BASE + '/booster' + (slug === BOOSTER_TEST_SLUG ? '?test=1' : '')
  const 확정 = (d?.applications ?? []).filter(a => a.status === 'confirmed')
  const 취소됨 = (d?.applications ?? []).filter(a => a.status === 'cancelled')

  return (
    <Shell>
      <div style={S.wrap}>
        {/* 어느 특강을 보나 */}
        <div style={S.tabs}>
          <button onClick={() => setSlug(BOOSTER_SLUG)}
            style={{ ...S.tab, ...(slug === BOOSTER_SLUG ? S.tabOn : {}) }}>실제 특강</button>
          <button onClick={() => setSlug(BOOSTER_TEST_SLUG)}
            style={{ ...S.tab, ...(slug === BOOSTER_TEST_SLUG ? S.tabOn : {}) }}>연습용</button>
        </div>

        {slug === BOOSTER_TEST_SLUG && (
          <div style={S.연습띠}>
            연습용입니다 — 여기 쌓인 신청은 실제 명단이 아닙니다. 마음껏 넣어 보고 지우셔도 됩니다.
          </div>
        )}

        {err && <div style={S.err}>{err}</div>}
        {loading && !d && <div style={S.빈}>불러오는 중…</div>}

        {d && (
          <>
            {/* 숫자 */}
            <div style={S.숫자줄}>
              <칸 이름="정원" 값={`${d.session.capacity}명`} />
              <칸 이름="나간 자리" 값={`${d.session.seatsTaken}명`} 색={ORANGE} />
              <칸 이름="남은 자리" 값={`${d.session.seatsLeft}명`} 색={d.session.seatsLeft === 0 ? '#DC2626' : '#059669'} />
              <칸 이름="취소" 값={`${d.cancelled}건`} />
            </div>

            <div style={S.card}>
              <div style={S.줄}>
                <span style={S.작은이름}>접수 시작</span>
                <b>{한국시각(d.session.opensAt)}</b>
                <span style={S.작은글}>
                  {new Date(d.serverNow) < new Date(d.session.opensAt) ? '아직 안 열렸습니다' : '열렸습니다'}
                </span>
              </div>
              <div style={S.줄}>
                <span style={S.작은이름}>접수 창구</span>
                <b style={{ color: d.session.isOpen ? '#059669' : '#DC2626' }}>
                  {d.session.isOpen ? '열려 있음' : '닫혀 있음'}
                </b>
                <button style={S.작은단추}
                  onClick={() => 보내기({ action: 'setOpen', slug, isOpen: !d.session.isOpen },
                    d.session.isOpen
                      ? '접수 창구를 닫을까요?\n\n자리가 남아 있어도 더 이상 신청을 받지 않습니다.'
                      : '접수 창구를 다시 열까요?')}>
                  {d.session.isOpen ? '지금 닫기' : '다시 열기'}
                </button>
              </div>
              <div style={S.줄}>
                <span style={S.작은이름}>신청 링크</span>
                <code style={S.링크}>{링크}</code>
                <button style={S.작은단추}
                  onClick={() => { navigator.clipboard?.writeText(링크); alert('링크를 복사했습니다.') }}>
                  복사
                </button>
              </div>
            </div>

            {/* 확정 명단 */}
            <h3 style={S.h3}>확정 명단 <span style={S.뱃지}>{확정.length}명</span></h3>
            {확정.length === 0 ? <div style={S.빈}>아직 신청이 없습니다.</div> : (
              <div style={S.표}>
                {확정.map(a => (
                  <div key={a.id} style={S.행}>
                    <div style={S.자리}>{a.seat_no}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.이름줄}>
                        <b>{a.student_name}</b>
                        <span style={S.학년}>{a.grade}</span>
                        {a.is_enrolled
                          ? <span style={S.재원}>재원생</span>
                          : <span style={S.신규}>외부</span>}
                        {a.sharedPhone && <span style={S.같은번호}>같은 번호 여럿</span>}
                      </div>
                      <div style={S.작은글}>
                        학부모 {a.parent_name} · {번호꼴(a.parent_phone)}
                      </div>
                      <div style={S.시각}>접수 {한국시각(a.created_at)}</div>
                    </div>
                    <button style={S.취소단추} onClick={() => 취소하기(a)}>취소</button>
                  </div>
                ))}
              </div>
            )}

            {/* 취소된 것 */}
            {취소됨.length > 0 && (
              <>
                <h3 style={S.h3}>취소된 신청 <span style={S.뱃지}>{취소됨.length}건</span></h3>
                <div style={S.표}>
                  {취소됨.map(a => (
                    <div key={a.id} style={{ ...S.행, opacity: .6 }}>
                      <div style={{ ...S.자리, background: '#9CA3AF' }}>{a.seat_no}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={S.이름줄}>
                          <b style={{ textDecoration: 'line-through' }}>{a.student_name}</b>
                          <span style={S.학년}>{a.grade}</span>
                        </div>
                        <div style={S.작은글}>학부모 {a.parent_name} · {번호꼴(a.parent_phone)}</div>
                        <div style={S.시각}>
                          취소 {a.cancelled_at ? 한국시각(a.cancelled_at) : ''}
                          {a.cancel_reason ? ` · ${a.cancel_reason}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 자리 다시 열기 */}
            <div style={S.재오픈}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>자리 다시 열기</div>
              <p style={S.작은글}>
                취소가 생겨도 자리는 <b>저절로 열리지 않습니다.</b> 다음 분을 받으시려면 여기서 여세요.
                지금 나간 자리 {d.session.seatsTaken}명 · 확정 {확정.length}명
                {d.session.seatsTaken > 확정.length && (
                  <> — <b style={{ color: ORANGE }}>{d.session.seatsTaken - 확정.length}자리가 비어 있는데 막혀 있습니다</b></>
                )}
              </p>
              <button style={S.열기단추} disabled={d.session.seatsTaken === 0}
                onClick={() => 보내기({ action: 'reopen', slug, howMany: 1 },
                  '자리를 한 개 다시 열까요?\n\n다음에 신청하시는 분이 그 자리를 가져갑니다.')}>
                한 자리 열기
              </button>
            </div>

            <p style={S.꼬리}>
              {BOOSTER.이름} · {BOOSTER.기간} · {BOOSTER.요일시간} · 수강료 {BOOSTER.수강료}
            </p>
          </>
        )}
      </div>
    </Shell>
  )
}

function 칸({ 이름, 값, 색 }: { 이름: string; 값: string; 색?: string }) {
  return (
    <div style={S.숫자칸}>
      <div style={S.숫자이름}>{이름}</div>
      <div style={{ ...S.숫자값, color: 색 ?? NAVY }}>{값}</div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="부스터 특강 신청" subtitle="선착순 접수 현황 · 원장 전용" showBack />
      <div className="max-w-[760px] mx-auto">{children}</div>
    </div>
  )
}

const S = {
  wrap: { padding: '16px 14px 60px' },
  빈: { padding: '40px 0', textAlign: 'center' as const, color: '#9CA3AF', fontSize: 14 },
  err: { background: '#FEF2F2', color: '#B91C1C', fontSize: 13, fontWeight: 700,
    padding: '11px 13px', borderRadius: 10, marginBottom: 12 },
  tabs: { display: 'flex', gap: 6, marginBottom: 12 },
  tab: { flex: 1, padding: '10px', fontSize: 13.5, fontWeight: 700, borderRadius: 10,
    border: '1.5px solid #CBD5E1', background: '#fff', color: '#475569', cursor: 'pointer' },
  tabOn: { background: NAVY, borderColor: NAVY, color: '#fff' },
  연습띠: { background: '#FEF3C7', color: '#92400E', fontSize: 12.5, fontWeight: 700,
    padding: '10px 12px', borderRadius: 10, marginBottom: 12 },
  숫자줄: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 },
  숫자칸: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 8px',
    textAlign: 'center' as const },
  숫자이름: { fontSize: 11, color: '#6B7280', fontWeight: 600 },
  숫자값: { fontSize: 20, fontWeight: 900, marginTop: 2 },
  card: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px',
    marginBottom: 16 },
  줄: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', fontSize: 13.5,
    flexWrap: 'wrap' as const, borderBottom: '1px solid #F1F5F9' },
  작은이름: { flex: '0 0 70px', fontSize: 12, color: '#6B7280', fontWeight: 600 },
  작은글: { fontSize: 12, color: '#6B7280', lineHeight: 1.6, margin: 0 },
  작은단추: { fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
    border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#475569', cursor: 'pointer' },
  링크: { fontSize: 11.5, background: '#F1F5F9', padding: '3px 7px', borderRadius: 6,
    wordBreak: 'break-all' as const, flex: 1, minWidth: 0 },
  h3: { fontSize: 14.5, fontWeight: 800, color: NAVY, margin: '18px 0 8px' },
  뱃지: { fontSize: 11.5, fontWeight: 700, color: '#fff', background: NAVY,
    padding: '2px 8px', borderRadius: 20, marginLeft: 6 },
  표: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' },
  행: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
    borderBottom: '1px solid #F1F5F9' },
  자리: { flex: '0 0 30px', height: 30, borderRadius: 15, background: ORANGE, color: '#fff',
    fontSize: 14, fontWeight: 900, textAlign: 'center' as const, lineHeight: '30px' },
  이름줄: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14.5, flexWrap: 'wrap' as const },
  학년: { fontSize: 11, color: '#475569', background: '#F1F5F9', padding: '1px 7px', borderRadius: 6 },
  재원: { fontSize: 11, color: '#065F46', background: '#D1FAE5', padding: '1px 7px', borderRadius: 6, fontWeight: 700 },
  신규: { fontSize: 11, color: '#92400E', background: '#FEF3C7', padding: '1px 7px', borderRadius: 6, fontWeight: 700 },
  같은번호: { fontSize: 11, color: '#1E40AF', background: '#DBEAFE', padding: '1px 7px', borderRadius: 6, fontWeight: 700 },
  시각: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  취소단추: { fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 8,
    border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' },
  재오픈: { background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12,
    padding: '14px', marginTop: 18 },
  열기단추: { marginTop: 10, padding: '10px 18px', fontSize: 13.5, fontWeight: 800, color: '#fff',
    background: '#D97706', border: 'none', borderRadius: 10, cursor: 'pointer' },
  꼬리: { fontSize: 11.5, color: '#9CA3AF', textAlign: 'center' as const, marginTop: 24 },
} as const
