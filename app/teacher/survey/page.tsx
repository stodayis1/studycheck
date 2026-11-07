'use client'

// 설문 답 보기 — /teacher/survey (원장 전용)
//
// 원장님 2026-10-24 「설문조사로 앱으로 만들어서 … 링크 통해 후기 받는게」
// 원장님 2026-11-06 「스터디체크에 학부모 설문 만들어 달라니까」 (11/21 부모학교 — 행사별 설문)
//
// 링크로 들어온 답이 여기 쌓인다. 상담 신청자와 집계를 한 화면에서 본다.
// ★ 행사를 먼저 고른다. 행사마다 survey_key 가 달라 답이 섞이지 않는다 (lib/surveyEvents.ts).

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'
import { SURVEY_EVENTS, LEGACY_EVENT, findEventByKey } from '@/lib/surveyEvents'

const GREEN = '#085041'
const MINT = '#F0FBF7'
const PEACH = '#F5C4B3'
const BROWN = '#712B13'

const BASE = 'https://studycheck-five.vercel.app'
/** 고를 수 있는 행사 — 새 행사가 먼저 나온다 (방금 치른 것을 바로 본다) */
const PICKABLE = [...[...SURVEY_EVENTS].reverse(), LEGACY_EVENT]
const linkOf = (slug: string) => BASE + (slug ? `/survey/${slug}` : '/survey')
const smsOf = (e: { name: string; slug: string }) =>
  '[수학의지혜]\n'
  + `오늘 ${e.name}에 와 주셔서 고맙습니다.\n`
  + '짧은 설문 하나 부탁드립니다. 적어 주신 한 줄이 다음 시간을 바꿉니다.\n'
  + '상담 신청도 여기서 받습니다.\n'
  + linkOf(e.slug)

type Row = {
  id: string; created_at: string
  student_name: string | null; grade: string | null; school: string | null
  guardian_name: string | null; phone: string | null; study_now: string | null
  rating: string | null; helpful: string | null; want_more: string | null
  consult: boolean; consult_times: string[]; consult_how: string[]
  wish: string | null; courses: string[]; courses_etc: string | null
  agree_public: boolean; source: string
  /** 행사별 답 (별점·상담 체크·동의) — answers 칸이 없으면 비어 있다 */
  answers?: { stars?: Record<string, number>; recommend?: number
    consult_new?: string[]; consult_now?: string[]
    /** 알게 된 경로 — 고른 것 + 직접 적은 것 */
    found?: string[]; found_etc?: string | null } | null
}

const when = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function SurveyPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  // 어느 행사의 답을 보는가 — 기본은 가장 최근 행사
  const [evKey, setEvKey] = useState(PICKABLE[0].key)
  const ev = PICKABLE.find((e) => e.key === evKey) ?? PICKABLE[0]
  const topics = findEventByKey(evKey)?.topics ?? []
  const [rows, setRows] = useState<Row[]>([])
  const [courses, setCourses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'all' | 'consult' | 'wish'>('all')
  const [open, setOpen] = useState<string | null>(null)

  // ── 문자로 보내기 ────────────────────────────────────────────────
  // ★ 설명회에 오신 분만 보낸다. 학년으로 한꺼번에 보내지 않는다
  //   (원장님 2026-10-24 「그냥 나갈 번호를 내가 누르면 안돼? 재원생 전체한테 보내는 게 아니라」).
  const [smsOpen, setSmsOpen] = useState(false)
  const [students, setStudents] = useState<{ id: string; name: string; grade: string | null; parent_phone: string | null; teacher_name: string | null }[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [gradeF, setGradeF] = useState('')
  const [extra, setExtra] = useState('')
  const [smsText, setSmsText] = useState(smsOf(PICKABLE[0]))
  const [pre, setPre] = useState<any>(null)
  const [smsBusy, setSmsBusy] = useState(false)
  const [smsErr, setSmsErr] = useState('')
  const [smsDone, setSmsDone] = useState<any>(null)
  const resetPre = () => { setPre(null); setSmsDone(null) }
  // 붙여넣은 글에서 번호가 몇 개로 읽혔는지 — 17개 넣고 17개인지 바로 보이게 (서버와 같은 규칙)
  const extraCount = useMemo(() => {
    const seen = new Set(
      extra.split(/[\s,;]+/).map((x) => x.replace(/\D/g, '')).filter((d) => d.length >= 10))
    return seen.size
  }, [extra])

  // 명단은 창을 열 때 한 번만 읽는다
  useEffect(() => {
    if (!smsOpen || students.length) return
    supabase.from('students')
      .select('id, name, grade, parent_phone, teacher_name')
      .eq('is_active', true).order('grade').order('name')
      .then(({ data }) => setStudents((data ?? []) as any))
  }, [smsOpen, students.length])

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.grade).filter(Boolean))] as string[], [students])
  const shownStudents = useMemo(() => {
    const k = q.trim().toLowerCase()
    return students.filter((s) =>
      (!gradeF || s.grade === gradeF) &&
      (!k || s.name.toLowerCase().includes(k) || String(s.teacher_name ?? '').toLowerCase().includes(k)))
  }, [students, q, gradeF])

  const toggleOne = (id: string) => {
    setPicked((p) => { const nx = new Set(p); nx.has(id) ? nx.delete(id) : nx.add(id); return nx })
    resetPre()
  }
  const pickShown = (on: boolean) => {
    setPicked((p) => {
      const nx = new Set(p)
      for (const s of shownStudents) on ? nx.add(s.id) : nx.delete(s.id)
      return nx
    })
    resetPre()
  }

  async function ask(send: boolean) {
    setSmsBusy(true); setSmsErr('')
    try {
      const r = await apiFetch('/api/survey/sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: smsText, studentIds: [...picked], extraPhones: extra, send }),
      })
      const j = await r.json()
      if (!r.ok) { setSmsErr(j.error ?? '실패했어요.'); return null }
      return j
    } catch {
      setSmsErr('연결에 실패했어요.'); return null
    } finally { setSmsBusy(false) }
  }
  async function preview() { setSmsDone(null); const j = await ask(false); if (j) setPre(j) }
  async function reallySend() {
    if (!pre) return
    if (!confirm(pre.총번호 + '개 번호로 문자를 보냅니다.\n한 번 나가면 되돌릴 수 없어요.\n\n보낼까요?')) return
    const j = await ask(true)
    if (j) { setSmsDone(j); setPre(null) }
  }

  // 행사를 바꾸면 그 행사 답을 다시 읽고, 보낼 문자 글도 그 행사 것으로 바꾼다
  useEffect(() => {
    setLoading(true); setErr(''); setRows([]); setOpen(null); setTab('all')
    setSmsText(smsOf(ev)); setPre(null); setSmsDone(null)
    apiFetch(`/api/survey?key=${encodeURIComponent(evKey)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setErr(j.error); return }
        setRows(j.rows ?? []); setCourses(j.courses ?? [])
      })
      .catch(() => setErr('불러오지 못했어요.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evKey])

  // 개설 희망 강좌 집계 — 많이 고른 것부터
  const tally = useMemo(() => {
    const n = new Map<string, number>()
    for (const r of rows) for (const c of r.courses ?? []) n.set(c, (n.get(c) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  // 알게 된 경로 집계 — 어느 홍보가 닿았는지. 많이 고른 것부터.
  // ★ 직접 적어 주신 것도 같은 표에 넣는다 (한 건이라도 그대로 보여야 다음 홍보를 정할 수 있다).
  const foundTally = useMemo(() => {
    const n = new Map<string, number>()
    let 적음 = 0
    for (const r of rows) {
      const got = [...(r.answers?.found ?? []), r.answers?.found_etc].filter(Boolean) as string[]
      if (!got.length) { 적음++; continue }
      for (const g of got) n.set(g, (n.get(g) ?? 0) + 1)
    }
    return { list: [...n.entries()].sort((a, b) => b[1] - a[1]), 없음: 적음 }
  }, [rows])

  // 꼭지별 별점 평균 — answers 가 있는 답만 센다.
  // ★ docs/sql/설문_행사별답_칸추가.sql 을 실행하기 전에 들어온 답은 별점이 「바라는 점」 글 안에
  //   글자로 남는다. 그 답은 여기서 세지 않으므로 「몇 건으로 낸 평균인지」를 함께 적는다.
  const starAvg = useMemo(() => {
    if (!topics.length) return null
    const per = topics.map(() => ({ n: 0, sum: 0 }))
    const rec = { n: 0, sum: 0 }
    for (const r of rows) {
      const a = r.answers
      if (!a) continue
      topics.forEach((_, i) => {
        const v = Number(a.stars?.[String(i)])
        if (Number.isFinite(v) && v > 0) { per[i].n++; per[i].sum += v }
      })
      const v = Number(a.recommend)
      if (Number.isFinite(v) && v > 0) { rec.n++; rec.sum += v }
    }
    return {
      per: per.map((s) => (s.n ? s.sum / s.n : null)),
      counts: per.map((s) => s.n),
      rec: rec.n ? rec.sum / rec.n : null,
      recN: rec.n,
    }
  }, [rows, topics])

  const 상담 = rows.filter((r) => r.consult)
  const shown = tab === 'consult' ? 상담
    : tab === 'wish' ? rows.filter((r) => (r.wish ?? '').trim() || (r.helpful ?? '').trim() || (r.want_more ?? '').trim())
      : rows

  if (authLoading) return <Wrap><P>불러오는 중…</P></Wrap>
  if (!isAdmin()) return <Wrap><P>원장님만 볼 수 있는 화면입니다.</P></Wrap>

  const LINK = linkOf(ev.slug)

  return (
    <Wrap>
      {/* 행사 고르기 — 행사마다 답이 따로 쌓인다 */}
      <div className="mb-3 flex gap-1.5 flex-wrap">
        {PICKABLE.map((e) => (
          <button key={e.key} onClick={() => setEvKey(e.key)}
            className="rounded-full px-3.5 py-1.5 text-xs font-bold border"
            style={evKey === e.key ? { background: GREEN, color: '#fff', borderColor: GREEN }
              : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }}>
            {e.tab}
          </button>
        ))}
      </div>

      {/* 보낼 링크 */}
      <div className="rounded-2xl px-4 py-3.5 mb-4" style={{ background: MINT, border: '1px solid #C7DED6' }}>
        <p className="text-xs font-bold mb-1.5" style={{ color: GREEN }}>학부모님께 보낼 링크</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="flex-1 min-w-[220px] rounded-lg bg-white px-3 py-2 text-[12.5px] border">{LINK}</code>
          <button onClick={() => navigator.clipboard?.writeText(LINK).catch(() => {})}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: GREEN }}>
            주소 복사
          </button>
          <a href={LINK} target="_blank" rel="noreferrer"
            className="rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: GREEN, color: GREEN }}>
            직접 열어 보기
          </a>
          <button onClick={() => setSmsOpen((v) => !v)}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: BROWN }}>
            문자로 보내기
          </button>
        </div>

        {smsOpen && (
          <div className="mt-3 rounded-xl border bg-white p-3.5 space-y-3">
            {/* ★ 설명회에는 재원생이 아닌 분도 오신다 (원장님 2026-10-24 「외부 학부모님도 … 17명 정도」).
                학생 명단 아래에 두었더니 스크롤에 밀려 안 보였다 — 맨 위로 올렸다. */}
            <div className="rounded-xl p-3" style={{ background: MINT, border: '1px solid #C7DED6' }}>
              <div className="mb-1.5 flex items-baseline gap-2 flex-wrap">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: GREEN }}>1</span>
                <p className="text-[12.5px] font-bold">외부 학부모님 번호</p>
                <span className="text-[11.5px] text-gray-500">재원생이 아닌 분 — 쉼표·줄바꿈 아무렇게나 붙여넣으세요</span>
                {extraCount > 0 && (
                  <span className="ml-auto text-[11.5px] font-bold" style={{ color: GREEN }}>
                    번호 {extraCount}개
                  </span>
                )}
              </div>
              <textarea value={extra} onChange={(e) => { setExtra(e.target.value); resetPre() }} rows={4}
                placeholder={'010-1234-5678, 010-2345-6789\n010-3456-7890 …'}
                className="w-full rounded-lg border bg-white px-3 py-2 text-[13px]" />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline gap-2 flex-wrap">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: GREEN }}>2</span>
                <p className="text-[12.5px] font-bold">재원생 중에서 고르기</p>
                <span className="text-[11.5px] font-bold" style={{ color: GREEN }}>{picked.size}명 고름</span>
                {picked.size > 0 && (
                  <button onClick={() => { setPicked(new Set()); resetPre() }}
                    className="text-[11px] text-gray-400 underline">모두 지우기</button>
                )}
              </div>

              <div className="mb-1.5 flex gap-1.5 flex-wrap">
                <input value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="학생 이름이나 담당 선생님으로 찾기"
                  className="flex-1 min-w-[150px] rounded-lg border px-3 py-1.5 text-[13px]" />
                <select value={gradeF} onChange={(e) => setGradeF(e.target.value)}
                  className="rounded-lg border px-2.5 py-1.5 text-[13px]">
                  <option value="">학년 전체</option>
                  {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button onClick={() => pickShown(true)}
                  className="rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold"
                  style={{ borderColor: GREEN, color: GREEN }}>보이는 것 모두</button>
                <button onClick={() => pickShown(false)}
                  className="rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold text-gray-500">해제</button>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                {!students.length && <p className="px-3 py-4 text-center text-xs text-gray-400">명단 불러오는 중…</p>}
                {!!students.length && !shownStudents.length && (
                  <p className="px-3 py-4 text-center text-xs text-gray-400">찾는 학생이 없어요.</p>
                )}
                {shownStudents.map((st) => {
                  const on = picked.has(st.id)
                  const noPhone = !String(st.parent_phone ?? '').replace(/\D/g, '')
                  return (
                    <button key={st.id} onClick={() => !noPhone && toggleOne(st.id)} disabled={noPhone}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left disabled:opacity-40"
                      style={on ? { background: MINT } : undefined}>
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded border"
                        style={on ? { background: GREEN, borderColor: GREEN, color: '#fff' } : { borderColor: '#d1d5db' }}>
                        {on ? '✓' : ''}
                      </span>
                      <span className="text-[13px] font-semibold">{st.name}</span>
                      <span className="text-[11.5px] text-gray-400">{st.grade}</span>
                      <span className="ml-auto text-[11.5px] text-gray-400">
                        {noPhone ? '번호 없음' : st.teacher_name ?? ''}
                      </span>
                    </button>
                  )
                })}
              </div>

            </div>

            <div>
              <p className="mb-1 text-[11.5px] font-bold text-gray-500">보낼 글</p>
              <textarea value={smsText} onChange={(e) => { setSmsText(e.target.value); resetPre() }} rows={6}
                className="w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed" />
              <p className="mt-1 text-[11px] text-gray-400">
                {smsText.length}자 · 주소만 41바이트라 어떻게 써도 장문(LMS)으로 나갑니다
              </p>
            </div>

            {smsErr && (
              <p className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: '#FEE2E2', color: '#991B1B' }}>{smsErr}</p>
            )}

            {pre && (
              <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: MINT }}>
                <p className="font-bold" style={{ color: GREEN }}>
                  {pre.총번호}개 번호로 나갑니다
                  <span className="font-normal text-gray-500">
                    {' '}(재원생 {pre.학생수}명 · 외부 {pre.외부}명
                    {pre.한번호에여럿 ? ' · 같은 번호 쓰는 ' + pre.한번호에여럿 + '집은 한 통만' : ''})
                  </span>
                </p>
                {!!pre.받는분?.length && (
                  <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-[11.5px] text-gray-600">
                    {pre.받는분.map((x: string, i: number) => <li key={i}>· {x}</li>)}
                  </ul>
                )}
              </div>
            )}

            {smsDone && (
              <div className="rounded-lg px-3 py-2.5 text-[12.5px]"
                style={{ background: smsDone.테스트모드 ? '#FEF3C7' : MINT }}>
                <p className="font-bold" style={{ color: smsDone.테스트모드 ? BROWN : GREEN }}>
                  {smsDone.테스트모드
                    ? '테스트 모드라 실제로는 안 나갔습니다 (' + smsDone.보냄 + '건 처리). 수학OPS 에서 테스트 모드를 꺼야 진짜로 나갑니다.'
                    : smsDone.보냄 + '개 번호로 보냈습니다.'}
                </p>
                {smsDone.실패?.length > 0 && (
                  <p className="mt-1 text-[11.5px]" style={{ color: '#991B1B' }}>
                    실패 {smsDone.실패.length}건 — {smsDone.실패.slice(0, 3).map((x: any) => x.phone + '(' + x.error + ')').join(', ')}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={preview} disabled={smsBusy}
                className="flex-1 rounded-lg border py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ borderColor: GREEN, color: GREEN }}>
                {smsBusy && !pre ? '세는 중…' : '몇 명에게 가는지 보기'}
              </button>
              <button onClick={reallySend} disabled={smsBusy || !pre}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: BROWN }}>
                {smsBusy && pre ? '보내는 중…' : '진짜로 보내기'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              먼저 「몇 명에게 가는지 보기」를 눌러야 보내기 단추가 열립니다. 한 번 나가면 되돌릴 수 없어요.
            </p>
          </div>
        )}
      </div>

      {err && <P>{err}</P>}
      {loading && <P>불러오는 중…</P>}

      {!loading && !err && (
        <>
          {/* 한눈에 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat n={rows.length} label="받은 답" />
            <Stat n={상담.length} label="상담 신청" warm />
            {starAvg
              ? <Stat text={starAvg.rec ? starAvg.rec.toFixed(1) : '-'} label="추천 별점 평균" />
              : <Stat n={rows.filter((r) => r.agree_public).length} label="후기 공개 동의" />}
          </div>

          {/* 꼭지별 만족도 — 그날 말씀하신 차례대로 */}
          {!!starAvg && rows.length > 0 && (
            <div className="rounded-2xl border p-4 mb-4">
              <p className="text-sm font-bold mb-2.5" style={{ color: GREEN }}>꼭지별 만족도</p>
              <div className="space-y-1.5">
                {topics.map((t, i) => {
                  const avg = starAvg.per[i]
                  return (
                    <div key={t.title} className="flex items-center gap-2.5">
                      <span className="w-44 shrink-0 text-[12.5px] truncate" title={t.title}>{t.title}</span>
                      <div className="flex-1 h-2.5 rounded-full bg-gray-100 min-w-0">
                        <div className="h-full rounded-full"
                          style={{ background: GREEN, width: `${Math.round(((avg ?? 0) / 5) * 100)}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-[12.5px] font-bold tabular-nums">
                        {avg ? `${avg.toFixed(1)}점` : '-'}
                        <span className="ml-1 font-normal text-gray-400">({starAvg.counts[i]})</span>
                      </span>
                    </div>
                  )
                })}
              </div>
              {starAvg.counts.some((n) => n < rows.length) && (
                <p className="mt-2 text-[11px] text-gray-400">
                  괄호는 별점이 숫자로 들어온 답 수입니다. 받은 답({rows.length}건)보다 적으면 그 답은
                  별점이 「바라는 점」 글 안에 글자로 들어 있습니다 — docs/sql/설문_행사별답_칸추가.sql 을
                  아직 실행하지 않은 동안 들어온 답입니다.
                </p>
              )}
            </div>
          )}

          {/* 알게 된 경로 — 어느 홍보가 실제로 닿았는지 */}
          {foundTally.list.length > 0 && (
            <div className="rounded-2xl border p-4 mb-4">
              <p className="text-sm font-bold mb-2.5" style={{ color: GREEN }}>알게 된 경로</p>
              <div className="space-y-1.5">
                {foundTally.list.map(([c, cnt]) => (
                  <div key={c} className="flex items-center gap-2.5">
                    <span className="w-36 shrink-0 text-[12.5px] truncate" title={c}>{c}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 min-w-0">
                      <div className="h-full rounded-full"
                        style={{ background: BROWN, width: `${Math.round((cnt / (foundTally.list[0][1] || 1)) * 100)}%` }} />
                    </div>
                    <span className="w-7 shrink-0 text-right text-[12.5px] font-bold tabular-nums">{cnt}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                여러 개 고르신 분이 있어 합이 받은 답({rows.length}건)보다 클 수 있습니다.
                {foundTally.없음 > 0 && ` 안 적힌 답 ${foundTally.없음}건 (이 질문을 넣기 전에 들어온 답).`}
              </p>
            </div>
          )}

          {/* 개설 희망 강좌 */}
          {tally.length > 0 && (
            <div className="rounded-2xl border p-4 mb-4">
              <p className="text-sm font-bold mb-2.5" style={{ color: GREEN }}>개설 희망 강좌</p>
              <div className="space-y-1.5">
                {tally.map(([c, n]) => (
                  <div key={c} className="flex items-center gap-2.5">
                    <span className="w-36 shrink-0 text-[12.5px] truncate">{c}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 min-w-0">
                      <div className="h-full rounded-full"
                        style={{ background: GREEN, width: `${Math.round((n / (tally[0][1] || 1)) * 100)}%` }} />
                    </div>
                    <span className="w-7 shrink-0 text-right text-[12.5px] font-bold tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 답 목록 */}
          <div className="flex gap-1.5 mb-2.5">
            {([['all', `전체 ${rows.length}`], ['consult', `상담 신청 ${상담.length}`], ['wish', '글 남기신 분']] as const)
              .map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  className="rounded-full px-3.5 py-1.5 text-xs font-bold border"
                  style={tab === k ? { background: GREEN, color: '#fff', borderColor: GREEN }
                    : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }}>
                  {l}
                </button>
              ))}
          </div>

          {!shown.length && <P>{rows.length ? '해당하는 답이 없어요.' : '아직 받은 답이 없습니다.'}</P>}

          <div className="space-y-2">
            {shown.map((r) => (
              <div key={r.id} className="rounded-xl border bg-white">
                <button onClick={() => setOpen(open === r.id ? null : r.id)}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left flex-wrap">
                  <span className="font-bold text-[13.5px]">{r.student_name ?? '(이름 없음)'}</span>
                  {r.grade && <span className="text-[11.5px] text-gray-400">{r.grade}</span>}
                  {r.rating && (
                    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ background: MINT, color: GREEN }}>{r.rating}</span>
                  )}
                  {!!r.answers?.recommend && (
                    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ background: MINT, color: GREEN }}>추천 ★{r.answers.recommend}</span>
                  )}
                  {r.consult && (
                    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ background: PEACH, color: BROWN }}>상담 신청</span>
                  )}
                  <span className="ml-auto text-[11.5px] text-gray-400 tabular-nums">{when(r.created_at)}</span>
                </button>
                {open === r.id && (
                  <div className="border-t bg-gray-50/70 px-3.5 py-3 text-[12.5px] space-y-2">
                    <L k="보호자">{[r.guardian_name, r.phone].filter(Boolean).join(' · ') || '-'}</L>
                    <L k="학교 · 지금 공부">{[r.school, r.study_now].filter(Boolean).join(' · ') || '-'}</L>
                    {r.consult && !!(r.consult_times?.length || r.consult_how?.length) && (
                      <L k="상담 희망">{[...(r.consult_times ?? []), ...(r.consult_how ?? [])].join(' · ')}</L>
                    )}
                    {!!(r.answers?.found?.length || r.answers?.found_etc) && (
                      <L k="알게 된 경로">
                        {[...(r.answers.found ?? []), r.answers.found_etc].filter(Boolean).join(' · ')}
                      </L>
                    )}
                    {!!r.answers?.consult_new?.length && (
                      <L k="상담 (처음)">{r.answers.consult_new.join(' · ')}</L>
                    )}
                    {!!r.answers?.consult_now?.length && (
                      <L k="상담 (재원생)">{r.answers.consult_now.join(' · ')}</L>
                    )}
                    {!!r.answers?.stars && topics.length > 0 && (
                      <L k="꼭지별 별점">
                        {topics.map((t, i) => `${t.title} ★${r.answers!.stars?.[String(i)] ?? '-'}`).join('\n')}
                      </L>
                    )}
                    {r.helpful && <L k="도움이 된 내용">{r.helpful}</L>}
                    {r.want_more && <L k="더 듣고 싶은 것">{r.want_more}</L>}
                    {r.wish && <L k="바라는 점">{r.wish}</L>}
                    {(r.courses?.length || r.courses_etc) && (
                      <L k="희망 강좌">{[...(r.courses ?? []), r.courses_etc].filter(Boolean).join(' · ')}</L>
                    )}
                    {/* 후기 공개 동의는 설명회 설문에만 있던 항목이다 — 행사 설문에는 묻지 않는다 */}
                    {!starAvg && <L k="후기 공개">{r.agree_public ? '동의하셨습니다' : '동의 안 하심'}</L>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Wrap>
  )
}

function L({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="w-24 shrink-0 font-semibold text-gray-500">{k}</span>
      <span className="flex-1 min-w-0 whitespace-pre-wrap">{children}</span>
    </div>
  )
}

function Stat({ n, text, label, warm }: { n?: number; text?: string; label: string; warm?: boolean }) {
  return (
    <div className="rounded-xl border px-3 py-3 text-center"
      style={warm ? { background: PEACH, borderColor: PEACH } : { background: '#fff' }}>
      <p className="text-2xl font-bold tabular-nums" style={{ color: warm ? BROWN : GREEN }}>{text ?? n}</p>
      <p className="mt-0.5 text-[11.5px]" style={{ color: warm ? BROWN : '#6b7280' }}>{label}</p>
    </div>
  )
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="py-10 text-center text-sm text-gray-400">{children}</p>
)

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="학부모 설문" subtitle="행사별 후기 · 만족도 · 상담 신청" />
      <div className="mx-auto max-w-3xl px-4 py-5">{children}</div>
    </div>
  )
}
