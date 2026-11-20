'use client'

/**
 * S코어반 학습 기록 — 보고서 화면의 한 탭 (원장님 2026-11-20).
 *
 * 「s코어반만 별도로 관리하는 이 메뉴를 스터디체크 보고서에서 탭을 하나 더 만들어서
 *   관리할 수 있도록 해줘」 — 따로 있던 `/teacher/reports/s-core` 메뉴를 없애고 여기로 들였다.
 *   (월간 보고서도 같은 길을 걸었다 — app/teacher/reports/page.tsx 머리말 참고)
 *
 * 2026-11-20 — 보고서에 **보완해야 할 점**이 들어간다. 기록에서 기계로 뽑고, 원장님이 적어 넣으신
 * 한 줄을 그 아래에 그대로 싣는다 (원장님 「보완해야 할점 이런거 써주면 좋을듯」).
 *
 * 여기서는 **링크만 만든다.** 문자·카톡 발송은 하지 않는다 — 주소를 복사해 원장님이 보내신다
 * (원장님 2026-11-19 「보내는건 내가 보낼거야」).
 *
 * ★ 반을 가르는 칸이 DB 에 없다. 그래서 **학생을 직접 고르게** 한다 —
 *   「S코어반」을 코드에 박아 두면 내년에 반이 바뀔 때 조용히 틀어진다.
 * ★ 원장 전용이다. 서버도 adminOnly 로 막는다(화면만 가리면 주소로 부를 수 있다).
 */

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { cx } from '@/lib/utils'

interface Student { id: string; name: string; grade: string | null; teacher_name: string | null; hasPhone: boolean }
interface Made { studentId: string; name: string; url: string | null; error?: string }
interface Past { student_id: string; token: string; period_label: string; created_at: string; url: string }

const 기억키 = 'score-class-picked'

export function ScoreClassLinks({ ready }: { ready: boolean }) {
  const [students, setStudents] = useState<Student[]>([])
  const [past, setPast] = useState<Past[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<Made[]>([])
  const [hint, setHint] = useState('')
  // 학생마다 원장님이 적어 넣는 한 줄. 적지 않으면 보고서에 그 칸이 안 나온다.
  const [notes, setNotes] = useState<Record<string, string>>({})
  // 반 진도 — 원장님이 직접 적으신다. 수업에서 지금 나가는 곳은 진도표보다 앞서 있을 수 있고
  // 그건 기계가 알 수 없다 (2026-11-20 학습지로 추정했다가 틀렸다).
  const [classProgress, setClassProgress] = useState('')
  // 지난 링크 중 **지우려고 고른 것** (token 으로 센다). 학생 고르기와 섞지 않는다 —
  // 섞으면 보고서를 만들려다 지우게 된다.
  const [지울것, set지울것] = useState<string[]>([])

  useEffect(() => { if (ready) load() }, [ready])

  async function load() {
    try {
      const res = await apiFetch('/api/score-class-report')
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error ?? '읽지 못했어요')
      setStudents(j.students ?? [])
      setPast(j.links ?? [])
      setFrom((f) => f || j.from)
      setTo((t) => t || j.to)
      // 지난번에 고른 학생을 기억해 둔다 — 같은 반에 매번 다시 보내게 된다
      try {
        const saved = JSON.parse(localStorage.getItem(기억키) ?? '[]')
        if (Array.isArray(saved)) setPicked(saved.map(String))
      } catch { /* 기억 못 해도 화면은 된다 */ }
    } catch (e: any) {
      setHint('읽지 못했어요 — ' + (e?.message ?? '연결 실패'))
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      try { localStorage.setItem(기억키, JSON.stringify(next)) } catch { /* 무시 */ }
      return next
    })
  }

  const 보이는학생 = useMemo(() => {
    const k = q.trim()
    if (!k) return students
    return students.filter((s) => s.name.includes(k) || (s.grade ?? '').includes(k) || (s.teacher_name ?? '').includes(k))
  }, [students, q])

  const 고른학생 = students.filter((s) => picked.includes(s.id))

  async function make() {
    if (!picked.length) { setHint('학생을 한 명 이상 골라 주세요.'); return }
    if (!confirm(`${고른학생.map((s) => s.name).join(', ')}\n\n${from} ~ ${to} 기록으로 보고서 링크를 만듭니다.\n`
      + '만들어도 아무에게도 가지 않습니다 — 주소를 복사해 직접 보내시면 돼요.')) return
    setBusy(true); setMade([]); setHint('만드는 중…')
    try {
      const res = await apiFetch('/api/score-class-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: picked, from, to, notes, classProgress }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error ?? '만들지 못했어요')
      setMade(j.results ?? [])
      const 됨 = (j.results ?? []).filter((r: Made) => r.url).length
      setHint(`${됨}명 링크를 만들었어요. 아래에서 복사해 보내시면 됩니다.`)
      load()
    } catch (e: any) {
      setHint('만들지 못했어요 — ' + (e?.message ?? '연결 실패'))
    }
    setBusy(false)
  }

  /**
   * 고른 링크를 지운다.
   *
   * ★ **지우면 그 주소는 그 자리에서 죽는다** — 이미 보내 드린 링크면 학부모님께 「없는 주소」가 된다.
   *   되돌릴 수 없으므로 이름·개수를 보여 드리고 한 번 더 여쭌다.
   * ★ 서버가 돌려준 **지운 줄 수**로 확인한다. 「성공」만 보고 지워졌다고 하지 않는다.
   */
  async function 지우기() {
    if (!지울것.length) { setHint('지울 것을 골라 주세요.'); return }
    const 줄 = past.filter((p) => 지울것.includes(p.token))
    const 누구 = 줄.map((p) => students.find((x) => x.id === p.student_id)?.name ?? '—')
    const 보기 = 누구.slice(0, 8).join(', ') + (누구.length > 8 ? ` 외 ${누구.length - 8}명` : '')
    if (!confirm(`${보기}\n\n링크 ${줄.length}개를 지웁니다.\n\n`
      + '★ 지우면 그 주소는 바로 안 열립니다. 이미 보내 드린 주소라면 학부모님께 「없는 주소」가 돼요.\n'
      + '되돌릴 수 없습니다.')) return
    setBusy(true); setHint('지우는 중…')
    try {
      const res = await apiFetch('/api/score-class-report', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: 지울것 }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error ?? '지우지 못했어요')
      setHint(j.deleted === j.asked
        ? `${j.deleted}개를 지웠어요.`
        : `${j.asked}개 중 ${j.deleted}개를 지웠어요 — 나머지는 이미 없던 것이에요.`)
      set지울것([])
      load()
    } catch (e: any) {
      setHint('지우지 못했어요 — ' + (e?.message ?? '연결 실패'))
    }
    setBusy(false)
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setHint(what + ' 복사했어요.')
    } catch {
      setHint('복사가 안 됐어요 — 주소를 길게 눌러 직접 복사해 주세요.')
    }
  }

  const 전부복사 = () => copy(
    made.filter((m) => m.url).map((m) => `${m.name} ${m.url}`).join('\n'), '전체 목록을')

  /**
   * 학생마다 **가장 최근 것 하나만 남기고** 나머지를 고른다.
   *
   * 같은 학생에게 여러 번 만들면 줄이 그만큼 쌓인다(2026-11-20 에 여섯 명에게 하루 다섯 번
   * 만들어 스무 줄이 됐다). 가장 흔한 정리라서 단추로 둔다 — 고르기만 하고 **지우지는 않는다.**
   * `past` 는 서버가 최신 순으로 내려주므로 학생마다 **처음 나오는 줄**이 가장 최근 것이다.
   */
  function 묵은것고르기() {
    const 본것 = new Set<string>()
    const 고를것: string[] = []
    for (const p of past) {
      if (본것.has(p.student_id)) 고를것.push(p.token)
      else 본것.add(p.student_id)
    }
    set지울것(고를것)
    setHint(고를것.length
      ? `학생마다 가장 최근 것만 남기고 ${고를것.length}개를 골랐어요. 확인하시고 「지우기」를 누르세요.`
      : '묵은 것이 없어요 — 학생마다 한 개씩만 있습니다.')
  }

  return (
    <div className="space-y-4">

      <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 text-xs text-gray-600 leading-relaxed">
        <b className="text-gray-800">여기서는 링크만 만듭니다.</b> 만들어도 아무에게도 가지 않아요 —
        주소를 복사해 원장님이 직접 보내시면 됩니다.
        <span className="block mt-1">
          보고서에는 <b>기록</b>과 <b>보완해야 할 점</b>이 들어갑니다 — 달마다 학습지 성적,
          선행 과정 진도, 다시 푼 학습지, 더 봐야 할 단원, 수업·숙제, 교재, 평가 기록.
        </span>
        <span className="block mt-1">
          보완해야 할 점은 <b>기록에서 기준을 넘지 못한 것만</b> 뽑아 적습니다(줄마다 그 숫자가 함께 나갑니다).
          진도는 <b>이번에 고른 학생들이 지금 나가는 단원</b>을 기준으로 봅니다 — 다른 학생 이름·순위·반 평균은
          넣지 않습니다. <b>어느 반으로 갈지 정하는 말은 넣지 않습니다.</b>
        </span>
        <span className="block mt-1 text-gray-400">{hint}</span>
      </div>

      {/* 기간 */}
      <section className="bg-white border border-gray-100 rounded-2xl p-4">
        <h3 className="font-bold text-gray-800 text-sm mb-2">언제부터 언제까지</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl" />
          <span className="text-gray-400">~</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl" />
          <span className="text-[11px] text-gray-400">기본은 올해 1월 1일부터 오늘까지예요.</span>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100">
          <label className="block text-xs font-bold text-gray-700 mb-1">
            반 진도 <span className="font-normal text-gray-400">— 수업에서 지금 나가고 있는 곳</span>
          </label>
          <input value={classProgress} onChange={(e) => setClassProgress(e.target.value)} maxLength={60}
            placeholder="예) 중1-2 개념서 1회 끝, 중1-2 유형서 2회독 중"
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
          <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
            적으신 글이 보고서의 「진도」 칸과 「보완해야 할 점」에 그대로 나갑니다.
            비워 두면 <b>진도표에서 과반이 닿은 과정</b>을 적습니다 — 수업 진도가 진도표보다 앞서 있으면
            여기 적어 주세요.
          </p>
        </div>
      </section>

      {/* 학생 고르기 */}
      <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-gray-800 text-sm">학생 고르기</h3>
          <span className="text-[11px] text-gray-500">{picked.length}명 고름</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 학년 · 선생님"
            className="ml-auto px-3 py-1.5 border border-gray-200 rounded-xl text-xs w-44" />
          {picked.length > 0 && (
            <button onClick={() => { setPicked([]); try { localStorage.removeItem(기억키) } catch { /* 무시 */ } }}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-[11px] text-gray-500">모두 지우기</button>
          )}
        </div>
        <div className="max-h-[320px] overflow-auto divide-y divide-gray-50">
          {보이는학생.map((s) => (
            <label key={s.id} className={cx('flex items-center gap-3 px-4 py-2.5 cursor-pointer text-sm',
              picked.includes(s.id) && 'bg-emerald-50/60')}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
              <b className="text-gray-800">{s.name}</b>
              <span className="text-[11px] text-gray-400">{s.grade ?? ''} · {s.teacher_name ?? '담당 없음'}</span>
              {!s.hasPhone && <span className="ml-auto text-[11px] text-rose-600">보호자 번호 없음</span>}
            </label>
          ))}
          {보이는학생.length === 0 && <div className="px-4 py-6 text-center text-xs text-gray-400">찾는 학생이 없어요.</div>}
        </div>
        {고른학생.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100">
            <h4 className="font-bold text-gray-800 text-sm">보완해야 할 점에 한 줄 더하기 <span className="text-gray-400 font-normal text-[11px]">(안 적으셔도 됩니다)</span></h4>
            <p className="text-[11px] text-gray-500 mb-2">
              기록에서 뽑은 보완점은 자동으로 들어갑니다. 수업에서 보신 것을 더하고 싶으실 때만 적어 주세요 —
              적으신 글은 <b>「담당 선생님 말씀」</b>으로 그대로 나갑니다.
            </p>
            <div className="space-y-2">
              {고른학생.map((s) => (
                <div key={s.id} className="flex items-start gap-2">
                  <b className="text-gray-700 text-xs w-14 pt-2 shrink-0">{s.name}</b>
                  <textarea
                    value={notes[s.id] ?? ''} rows={2} maxLength={400}
                    onChange={(e) => setNotes((p) => ({ ...p, [s.id]: e.target.value }))}
                    placeholder="예) 도형 단원은 그림을 직접 그려 풀면 훨씬 정확해집니다."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs leading-relaxed" />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
          <button onClick={make} disabled={busy || !picked.length}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40">
            {busy ? '만드는 중…' : `${picked.length}명 보고서 링크 만들기`}
          </button>
          {고른학생.length > 0 && (
            <span className="text-[11px] text-gray-500">{고른학생.map((s) => s.name).join(' · ')}</span>
          )}
        </div>
      </section>

      {/* 방금 만든 링크 */}
      {made.length > 0 && (
        <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-emerald-50 border-b border-gray-100 flex items-center gap-2">
            <h3 className="font-bold text-gray-800 text-sm">
              <i className="ti ti-link align-[-0.125em]" /> 방금 만든 링크
            </h3>
            <button onClick={전부복사} className="ml-auto px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold">
              전체 복사
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {made.map((m) => (
              <div key={m.studentId} className="px-4 py-2.5 flex flex-wrap items-center gap-2 text-sm">
                <b className="text-gray-800 w-16">{m.name || '?'}</b>
                {m.url
                  ? <>
                      <span className="text-[11px] text-gray-400 flex-1 min-w-0 truncate">{m.url}</span>
                      <button onClick={() => copy(m.url!, m.name + ' 주소를')}
                        className="px-2.5 py-1 rounded-lg border border-gray-200 text-[11px] font-bold">복사</button>
                      <a href={m.url} target="_blank" rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg border border-gray-200 text-[11px]">열기</a>
                    </>
                  : <span className="text-[11px] text-rose-600">{m.error}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 지난 링크 */}
      {past.length > 0 && (
        <section className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 text-sm">지난번에 만든 것</h3>
            <p className="text-[11px] text-gray-500">만든 그때의 기록이 그대로 들어 있어요. 보내 드린 링크는 그대로 살아 있습니다.</p>
            {/* 고르기·지우기 — 같은 학생에게 여러 번 만들면 줄이 그만큼 쌓인다 */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={묵은것고르기} disabled={busy}
                className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px] text-gray-600 disabled:opacity-40">
                묵은 것 고르기
              </button>
              <button onClick={() => set지울것(past.map((p) => p.token))} disabled={busy}
                className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px] text-gray-600 disabled:opacity-40">
                모두 고르기
              </button>
              {지울것.length > 0 && (
                <button onClick={() => set지울것([])} disabled={busy}
                  className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px] text-gray-500 disabled:opacity-40">
                  고르기 풀기
                </button>
              )}
              <button onClick={지우기} disabled={busy || !지울것.length}
                className={cx('ml-auto px-3 py-1 rounded-lg text-[11px] font-bold',
                  지울것.length && !busy
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
                {지울것.length ? `${지울것.length}개 지우기` : '지우기'}
              </button>
            </div>
            {지울것.length > 0 && (
              <p className="mt-1 text-[11px] text-red-600">
                지우면 그 주소는 바로 안 열립니다. 이미 보내 드린 주소면 학부모님께 「없는 주소」가 돼요.
              </p>
            )}
          </div>
          <div className="max-h-[260px] overflow-auto divide-y divide-gray-50">
            {past.map((p) => {
              const s = students.find((x) => x.id === p.student_id)
              const 골랐나 = 지울것.includes(p.token)
              // 같은 날 여러 번 만들면 날짜만으로는 못 가린다 → 시각까지 적는다.
              const 만든때 = String(p.created_at ?? '')
              const 날 = 만든때.slice(0, 10)
              const 시각 = new Date(만든때).toLocaleTimeString('ko-KR',
                { hour: '2-digit', minute: '2-digit', hour12: false })
              return (
                <label key={p.token}
                  className={cx('px-4 py-2 flex flex-wrap items-center gap-2 text-xs cursor-pointer',
                    골랐나 ? 'bg-red-50' : 'hover:bg-gray-50')}>
                  <input type="checkbox" checked={골랐나}
                    onChange={() => set지울것((prev) => 골랐나
                      ? prev.filter((t) => t !== p.token)
                      : [...prev, p.token])}
                    className="w-4 h-4 accent-red-600" />
                  <b className="text-gray-700 w-16">{s?.name ?? '—'}</b>
                  <span className="text-gray-400">{p.period_label}</span>
                  <span className="text-gray-300">{날} {시각}</span>
                  <button type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); copy(p.url, (s?.name ?? '') + ' 주소를') }}
                    className="ml-auto px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px]">복사</button>
                  <a href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11px]">열기</a>
                </label>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
