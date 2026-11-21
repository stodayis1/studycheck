'use client'

/**
 * 부스터 특강 선착순 신청 — 학부모님이 **링크만 받고** 들어오는 화면. /booster
 *
 * 원장님 2026-11-19: 「부스터는 특강비가 없어 무료야. 그래서 선착순인거야」
 *
 * ★ 카카오톡 인앱 브라우저에서 열린다. 그래서
 *     · useSearchParams 를 쓰지 않는다 (Suspense 경계가 필요하고 인앱에서 말썽이 잦다).
 *       연습용 주소는 window.location.search 를 **마운트 뒤에** 읽는다.
 *     · 보내기는 fetch 한 번뿐이고, 실패하면 **적은 내용을 그대로 둔다** — 선착순인데
 *       다시 처음부터 적게 하면 그 사이에 자리가 나간다.
 * ★ 시계는 **서버 것**을 쓴다. 들어올 때 서버 시각을 받아 폰 시계와의 차이를 재 두고,
 *   카운트다운은 그 차이를 더해 센다. 폰 시계가 3분 빨라도 10시에 열린다.
 *   (진짜 빗장은 DB 함수다 — 이 화면은 보여 주기만 한다.)
 * ★ 남은 자리는 **서버가 준 숫자**다. 화면에서 세지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  BOOSTER, BOOSTER_SLUG, BOOSTER_TEST_SLUG, 개인정보안내, 동의항목, 학년보기, 재원생안내,
  남은시간, 신청서검사, 완료문구, 마감문구, 접수상태보기, 번호꼴,
} from '@/lib/booster'

const NAVY = '#15329B'
const ORANGE = '#F26522'
const CREAM = '#FAF7EC'

type 현황 = {
  title: string; capacity: number; seatsTaken: number; seatsLeft: number
  opensAt: string; isOpen: boolean; serverNow: string
}

export default function BoosterPage() {
  const [slug, setSlug] = useState<string>(BOOSTER_SLUG)
  const [연습, set연습] = useState(false)
  const [현황, set현황] = useState<현황 | null>(null)
  const [못불러옴, set못불러옴] = useState(false)
  /** 서버시각 − 폰시각 (ms). 폰 시계가 틀려도 이 값을 더해 맞춘다. */
  const 시차 = useRef(0)
  /**
   * ★ 서버에서 그릴 때와 브라우저에서 그릴 때 **시각이 달라** 하이드레이션이 깨진다.
   *   (2026-11-19 실제로 났다: 서버 「6일 00:55:08」 / 브라우저 「6일 00:55:01」)
   *   깨지면 React 가 그 부분을 통째로 다시 그린다 — 21:59:59 에 화면이 깜빡이면 안 된다.
   *   그래서 **브라우저에 올라온 뒤에만** 시계를 켠다. 그 전에는 시계 자리를 비워 둔다.
   */
  const [지금, set지금] = useState<Date | null>(null)

  const [f, setF] = useState({
    student_name: '', grade: '', parent_name: '', parent_phone: '',
  })
  const [동의, set동의] = useState<boolean[]>(동의항목.map(() => false))
  const [보내는중, set보내는중] = useState(false)
  const [틀림, set틀림] = useState('')
  const [결과, set결과] = useState<null | { kind: '완료'; seatNo: number } | { kind: '마감' } | { kind: '중복' }>(null)

  /* ── 연습용 주소인지 (마운트 뒤에 읽는다 — useSearchParams 안 씀) ─────── */
  useEffect(() => {
    set지금(new Date())            // ★ 여기서 처음 켠다 (서버에서는 안 돈다)
    try {
      const t = new URLSearchParams(window.location.search).get('test')
      if (t === '1') { setSlug(BOOSTER_TEST_SLUG); set연습(true) }
    } catch { /* 인앱 브라우저가 막아도 그냥 실제 특강으로 간다 */ }
  }, [])

  /* ── 현황 받아오기 ───────────────────────────────────────────────────── */
  const 현황받기 = useCallback(async () => {
    try {
      const res = await fetch(`/api/booster?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      if (!res.ok) { set못불러옴(true); return }
      const j: 현황 = await res.json()
      시차.current = new Date(j.serverNow).getTime() - Date.now()
      set현황(j); set못불러옴(false)
    } catch { set못불러옴(true) }
  }, [slug])

  useEffect(() => { 현황받기() }, [현황받기])

  /* ── 1초마다 시계, 10초마다 남은 자리 ────────────────────────────────── */
  useEffect(() => {
    const t1 = setInterval(() => set지금(new Date(Date.now() + 시차.current)), 1000)
    const t2 = setInterval(() => { if (!결과) 현황받기() }, 10000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [현황받기, 결과])

  const 정원 = 현황?.capacity ?? BOOSTER.정원
  const 나간자리 = 현황?.seatsTaken ?? 0
  const 남음 = 현황?.seatsLeft ?? 정원
  const 접수시작 = 현황 ? new Date(현황.opensAt) : new Date(BOOSTER.접수시작ISO)
  // ★ 지금(시계)이 없으면 아직 브라우저에 안 올라온 것이다 — 아무 말도 하지 않는다
  const 상태 = !지금 ? null
    : 현황?.isOpen === false ? '마감'
    : 접수상태보기({ now: 지금, 나간자리, 정원, 접수시작 })
  const 카운트 = 지금 ? 남은시간(지금, 접수시작) : null

  const 다적음 = 신청서검사({ ...f, agreements: 동의 }).length === 0
  const 누를수있나 = 상태 === '접수중' && 다적음 && !보내는중

  /* ── 보내기 ──────────────────────────────────────────────────────────── */
  async function 신청하기() {
    const 틀린것 = 신청서검사({ ...f, agreements: 동의 })
    if (틀린것.length) { set틀림(틀린것[0]); return }
    set틀림(''); set보내는중(true)
    try {
      const res = await fetch('/api/booster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...f, agreements: 동의 }),
      })
      const j: any = await res.json().catch((): any => null)
      if (!res.ok || !j) { set틀림('신청을 보내지 못했어요. 다시 눌러 주세요.'); return }

      if (j.ok) { set결과({ kind: '완료', seatNo: j.seatNo }); return }
      if (j.reason === 'full' || j.reason === 'race') { set결과({ kind: '마감' }); return }
      if (j.reason === 'duplicate') { set결과({ kind: '중복' }); return }

      // 아직 안 열렸거나 창구가 닫힌 경우 — 적은 내용은 그대로 두고 다시 누르게
      set틀림(j.error || '신청을 받지 못했습니다.')
      현황받기()
    } catch {
      set틀림('연결이 끊겼어요. 다시 눌러 주세요.')
    } finally {
      set보내는중(false)
    }
  }

  /* ── 화면 ────────────────────────────────────────────────────────────── */
  return (
    <main style={S.wrap}>
      <div style={S.inner}>
        {연습 && (
          <div style={S.연습띠}>
            연습용 화면입니다 — 여기서 넣은 신청은 실제 명단에 들어가지 않습니다
          </div>
        )}

        {/* 포스터 */}
        <div style={S.poster}>
          <Image src="/booster/poster.webp" alt="예비중1 중1-1 부스터 특강" width={1240} height={1240}
            style={{ width: '100%', height: 'auto', display: 'block' }} priority />
        </div>

        {결과 ? <결과화면 결과={결과} /> : (
          <>
            {/* 상태 띠 */}
            <상태띠 상태={상태} 카운트={카운트} 남음={남음} 정원={정원} 못불러옴={못불러옴} />

            {/* 특강 정보 */}
            <section style={S.card}>
              <h2 style={S.h2}>{BOOSTER.이름}</h2>
              <dl style={S.dl}>
                <적는줄 이름="수업 기간" 값={BOOSTER.기간} />
                <적는줄 이름="수업 시간" 값={BOOSTER.요일시간} />
                <적는줄 이름="총 수업" 값={`${BOOSTER.총회차}회 (${BOOSTER.수업일.join(' · ')})`} />
                <적는줄 이름="모집 인원" 값={`선착순 ${정원}명`} />
                <적는줄 이름="접수 시작" 값={BOOSTER.접수시작표시} />
                <적는줄 이름="수강료" 값={BOOSTER.수강료} 강조 />
              </dl>
            </section>

            {/* 신청서 */}
            <section style={S.card}>
              <h2 style={S.h2}>신청하기</h2>
              <p style={S.재원안내}>{재원생안내}</p>

              <글칸 이름="학생 이름" 값={f.student_name}
                바꿈={v => setF(p => ({ ...p, student_name: v }))} 예시="홍길동" />

              <div style={S.field}>
                <label style={S.label}>학생 학년</label>
                <div style={S.chips}>
                  {학년보기.map(g => (
                    <button key={g} type="button" onClick={() => setF(p => ({ ...p, grade: g }))}
                      style={{ ...S.chip, ...(f.grade === g ? S.chipOn : {}) }}>{g}</button>
                  ))}
                </div>
              </div>

              <글칸 이름="학부모님 이름" 값={f.parent_name}
                바꿈={v => setF(p => ({ ...p, parent_name: v }))} 예시="홍길동" />

              <글칸 이름="학부모님 연락처" 값={f.parent_phone}
                바꿈={v => setF(p => ({ ...p, parent_phone: v }))} 예시="010-1234-5678"
                타입="tel" 도움="학원에 등록된 번호로 적어 주세요 · 재원생 확인과 접수 확정 안내에 씁니다" />
            </section>

            {/* 개인정보 */}
            <section style={S.card}>
              <h2 style={S.h2}>개인정보 수집·이용 안내</h2>
              <dl style={S.dl}>
                <적는줄 이름="수집 목적" 값={개인정보안내.목적} />
                <적는줄 이름="수집 항목" 값={개인정보안내.항목} />
                <적는줄 이름="보유 기간" 값={개인정보안내.보관} />
              </dl>
              <p style={S.작은글}>{개인정보안내.거부}</p>
            </section>

            {/* 동의 — 단추 바로 위 */}
            <section style={S.card}>
              <h2 style={S.h2}>신청 전 확인 <span style={S.필수}>세 가지 모두 필수</span></h2>
              {동의항목.map((t, i) => (
                <button key={i} type="button" onClick={() => set동의(p => p.map((v, j) => j === i ? !v : v))}
                  style={{ ...S.agree, ...(동의[i] ? S.agreeOn : {}) }}>
                  <span style={{ ...S.box, ...(동의[i] ? S.boxOn : {}) }}>{동의[i] ? '✓' : ''}</span>
                  <span style={S.agreeText}>{t}</span>
                </button>
              ))}
              <button type="button"
                onClick={() => set동의(동의항목.map(() => !동의.every(Boolean)))}
                style={S.모두}>
                {동의.every(Boolean) ? '모두 해제' : '모두 동의'}
              </button>
            </section>

            {틀림 && <div style={S.err}>{틀림}</div>}

            <button type="button" onClick={신청하기} disabled={!누를수있나}
              style={{ ...S.submit, ...(누를수있나 ? {} : S.submitOff) }}>
              {!상태 ? '불러오는 중…'
                : 보내는중 ? '신청하는 중…'
                : 상태 === '접수전' ? `${BOOSTER.접수시작표시}부터 신청할 수 있어요`
                : 상태 === '마감' ? '선착순 마감되었습니다'
                : 다적음 ? '신청하기'
                : '위 내용을 모두 채워 주세요'}
            </button>

            <p style={S.문의}>문의 {BOOSTER.문의} · 수학의지혜 수학학원</p>
          </>
        )}
      </div>
    </main>
  )
}

/* ── 조각들 ──────────────────────────────────────────────────────────── */

function 상태띠({ 상태, 카운트, 남음, 정원, 못불러옴 }: {
  상태: ReturnType<typeof 접수상태보기> | null; 카운트: ReturnType<typeof 남은시간>
  남음: number; 정원: number; 못불러옴: boolean
}) {
  // 아직 브라우저에 안 올라왔다 — 자리만 잡아 둔다 (숫자를 먼저 적으면 하이드레이션이 깨진다)
  if (!상태) return (
    <div style={{ ...S.band, background: NAVY }}>
      <div style={S.bandSub}>선착순 {정원}명</div>
      <div style={S.bandBig}>불러오는 중…</div>
    </div>
  )
  if (못불러옴) return (
    <div style={{ ...S.band, background: '#4B5563' }}>
      <div style={S.bandBig}>현황을 불러오지 못했어요</div>
      <div style={S.bandSub}>잠시 뒤 다시 열어 주세요</div>
    </div>
  )
  if (상태 === '접수전') return (
    <div style={{ ...S.band, background: NAVY }}>
      <div style={S.bandSub}>접수 시작까지</div>
      <div style={S.bandBig}>
        {카운트
          ? (카운트.일 > 0 ? `${카운트.일}일 ` : '') +
            `${String(카운트.시).padStart(2, '0')}:${String(카운트.분).padStart(2, '0')}:${String(카운트.초).padStart(2, '0')}`
          : '곧 시작합니다'}
      </div>
      <div style={S.bandSub}>{BOOSTER.접수시작표시} 정각 · 선착순 {정원}명</div>
    </div>
  )
  if (상태 === '마감') return (
    <div style={{ ...S.band, background: '#6B7280' }}>
      <div style={S.bandBig}>선착순 마감</div>
      <div style={S.bandSub}>{정원}명 모집이 완료되었습니다</div>
    </div>
  )
  return (
    <div style={{ ...S.band, background: ORANGE }}>
      <div style={S.bandSub}>지금 신청할 수 있어요</div>
      <div style={S.bandBig}>남은 자리 {남음}명</div>
      <div style={S.bandSub}>전체 {정원}명 · 선착순</div>
    </div>
  )
}

function 결과화면({ 결과 }: { 결과: { kind: '완료'; seatNo: number } | { kind: '마감' } | { kind: '중복' } }) {
  if (결과.kind === '완료') return (
    <div style={{ ...S.card, textAlign: 'center' as const, borderColor: ORANGE, borderWidth: 2 }}>
      <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
      <div style={{ ...S.접수번호 }}>접수 {결과.seatNo}번</div>
      <pre style={S.완료}>{완료문구}</pre>
      <p style={S.작은글}>이 화면을 닫으셔도 접수는 그대로 남아 있습니다.</p>
    </div>
  )
  if (결과.kind === '중복') return (
    <div style={{ ...S.card, textAlign: 'center' as const }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
      <pre style={S.완료}>{'이미 신청하신 학생입니다.\n접수는 정상적으로 되어 있으니\n다시 신청하지 않으셔도 됩니다.'}</pre>
      <p style={S.작은글}>궁금한 점은 {BOOSTER.문의} 로 연락 주세요.</p>
    </div>
  )
  return (
    <div style={{ ...S.card, textAlign: 'center' as const }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🙏</div>
      <pre style={S.완료}>{마감문구}</pre>
      <p style={S.작은글}>다음 특강 때 다시 안내드리겠습니다.</p>
    </div>
  )
}

function 적는줄({ 이름, 값, 강조 }: { 이름: string; 값: string; 강조?: boolean }) {
  return (
    <div style={S.dlRow}>
      <dt style={S.dt}>{이름}</dt>
      <dd style={{ ...S.dd, ...(강조 ? { color: ORANGE, fontWeight: 800, fontSize: 16 } : {}) }}>{값}</dd>
    </div>
  )
}

function 글칸({ 이름, 값, 바꿈, 예시, 타입, 도움 }: {
  이름: string; 값: string; 바꿈: (v: string) => void; 예시?: string; 타입?: string; 도움?: string
}) {
  return (
    <div style={S.field}>
      <label style={S.label}>{이름}</label>
      <input value={값} onChange={e => 바꿈(e.target.value)} placeholder={예시}
        type={타입 ?? 'text'} inputMode={타입 === 'tel' ? 'tel' : undefined}
        onBlur={타입 === 'tel' ? e => 바꿈(번호꼴(e.target.value)) : undefined}
        style={S.input} />
      {도움 && <p style={S.도움}>{도움}</p>}
    </div>
  )
}

/* ── 모양 ────────────────────────────────────────────────────────────── */
const S = {
  wrap: { minHeight: '100vh', background: '#EEF2FF', padding: '0 0 40px',
    fontFamily: "'Apple SD Gothic Neo','Noto Sans KR',-apple-system,sans-serif", color: '#111827' },
  inner: { maxWidth: 520, margin: '0 auto', padding: '0 14px' },
  연습띠: { background: '#92400E', color: '#fff', fontSize: 12, fontWeight: 700,
    padding: '8px 12px', borderRadius: 10, margin: '12px 0', textAlign: 'center' as const },
  poster: { borderRadius: 16, overflow: 'hidden', marginTop: 14,
    boxShadow: '0 6px 20px rgba(21,50,155,.18)' },
  band: { color: '#fff', borderRadius: 16, padding: '16px 14px', margin: '12px 0',
    textAlign: 'center' as const },
  bandBig: { fontSize: 28, fontWeight: 900, letterSpacing: '-.02em',
    fontVariantNumeric: 'tabular-nums' as const, lineHeight: 1.2 },
  bandSub: { fontSize: 12.5, fontWeight: 600, opacity: .92, marginTop: 2 },
  card: { background: '#fff', borderRadius: 16, padding: '16px 16px 18px', marginBottom: 12,
    border: '1px solid #DBEAFE' },
  h2: { fontSize: 16, fontWeight: 800, color: NAVY, margin: '0 0 12px' },
  필수: { fontSize: 11, fontWeight: 700, color: ORANGE, background: '#FFF1E8',
    padding: '2px 8px', borderRadius: 20, marginLeft: 6, verticalAlign: 'middle' },
  dl: { margin: 0 },
  dlRow: { display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #F1F5F9' },
  dt: { flex: '0 0 74px', fontSize: 12.5, color: '#6B7280', fontWeight: 600, margin: 0 },
  dd: { flex: 1, fontSize: 13.5, fontWeight: 600, margin: 0, lineHeight: 1.5 },
  작은글: { fontSize: 11.5, color: '#6B7280', margin: '10px 0 0', lineHeight: 1.6 },
  도움: { fontSize: 11.5, color: '#6B7280', margin: '5px 0 0' },
  field: { marginBottom: 14 },
  재원안내: { margin: '0 0 14px', padding: '10px 12px', background: '#EEF2FF', color: '#1E2A78', borderRadius: 10, fontSize: 13.5, lineHeight: 1.55, fontWeight: 600 },
  label: { display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#374151' },
  input: { width: '100%', boxSizing: 'border-box' as const, padding: '12px 13px', fontSize: 16,
    border: '1.5px solid #CBD5E1', borderRadius: 10, outline: 'none', background: '#fff' },
  chips: { display: 'flex', flexWrap: 'wrap' as const, gap: 7 },
  chip: { padding: '9px 14px', fontSize: 13.5, fontWeight: 700, borderRadius: 10,
    border: '1.5px solid #CBD5E1', background: '#fff', color: '#475569', cursor: 'pointer' },
  chipOn: { background: NAVY, borderColor: NAVY, color: '#fff' },
  agree: { display: 'flex', gap: 10, width: '100%', textAlign: 'left' as const, alignItems: 'flex-start',
    padding: '12px 12px', marginBottom: 8, borderRadius: 12, cursor: 'pointer',
    border: '1.5px solid #E2E8F0', background: '#F8FAFC' },
  agreeOn: { borderColor: ORANGE, background: '#FFF7F2' },
  box: { flex: '0 0 22px', height: 22, borderRadius: 6, border: '1.5px solid #CBD5E1',
    background: '#fff', color: '#fff', fontSize: 14, fontWeight: 900, lineHeight: '20px',
    textAlign: 'center' as const },
  boxOn: { background: ORANGE, borderColor: ORANGE },
  agreeText: { fontSize: 13, lineHeight: 1.55, color: '#1F2937', fontWeight: 600 },
  모두: { width: '100%', padding: '9px', fontSize: 12.5, fontWeight: 700, color: NAVY,
    background: '#EEF2FF', border: 'none', borderRadius: 10, cursor: 'pointer', marginTop: 2 },
  err: { background: '#FEF2F2', color: '#B91C1C', fontSize: 13, fontWeight: 700,
    padding: '11px 13px', borderRadius: 10, marginBottom: 10 },
  submit: { width: '100%', padding: '17px', fontSize: 17, fontWeight: 900, color: '#fff',
    background: ORANGE, border: 'none', borderRadius: 14, cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(242,101,34,.35)' },
  submitOff: { background: '#CBD5E1', color: '#fff', cursor: 'not-allowed', boxShadow: 'none' },
  문의: { textAlign: 'center' as const, fontSize: 12, color: '#6B7280', marginTop: 16 },
  접수번호: { display: 'inline-block', background: NAVY, color: '#fff', fontSize: 14, fontWeight: 800,
    padding: '6px 16px', borderRadius: 20, marginBottom: 12 },
  완료: { fontSize: 14, lineHeight: 1.85, fontWeight: 700, color: '#1F2937', margin: 0,
    whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit', background: CREAM,
    padding: '16px 14px', borderRadius: 12 },
} as const
