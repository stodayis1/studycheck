// 채점결과 — QR로 학생이 스스로 채점한 결과를 모아 보는 화면.
// 시험지별 응시 현황 → 학생별 점수 → 문항별 정답률 → 유형별 오답 집계.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { sourceLabel } from '@/lib/problemSource'

type Sheet = {
  id: string
  code: string
  title: string
  grade: string | null
  semester: number | null
  created_at: string
}

type Grading = {
  id: string
  student_id: string | null
  student_name: string | null
  score: number | null
  total: number | null
  submitted_at: string | null
}

type Answer = {
  grading_id: string
  no: number
  type_code: string | null
  student_answer: string | null
  is_correct: boolean | null
  graded_by?: string | null
  photo_path?: string | null
}

type SheetProblem = {
  no: number
  problem_id: number
  problems: {
    difficulty: string | null
    type_code: string | null
    answer_kind: string | null
    answer_text: string | null
    book: string | null
    local_no: string | null
  } | null
}

const NAVY = '#0f3460'
const ORANGE = '#D85A30'
const RED = '#dc2626'

function rateColor(r: number) {
  if (r >= 0.8) return NAVY
  if (r >= 0.5) return ORANGE
  return RED
}

export default function TeacherGradingsPage() {
  const { isAdmin, loading: authLoading } = useAuth()

  const [sheets, setSheets] = useState<Sheet[]>([])
  const [counts, setCounts] = useState<Record<string, { n: number; avg: number }>>({})
  const [sel, setSel] = useState<Sheet | null>(null)

  const [gradings, setGradings] = useState<Grading[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [problems, setProblems] = useState<SheetProblem[]>([])
  const [typeTitles, setTypeTitles] = useState<Record<string, string>>({})
  const [openStudent, setOpenStudent] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'students' | 'problems' | 'types'>('students')
  const [busy, setBusy] = useState<string | null>(null)

  // 틀린 문제를 다시 뽑아 새 시험지를 만들고 인쇄 화면을 새 탭으로 연다
  async function reprint(gradingId: string, mode: 'wrong' | 'twin' | 'similar' | 'wrong+similar') {
    setBusy(`${gradingId}:${mode}`)
    try {
      const res = await apiFetch('/api/reprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradingId, mode }),
      })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error ?? '만들지 못했습니다.')
        return
      }
      window.open(`/teacher/gradings/print?code=${j.code}`, '_blank')
    } finally {
      setBusy(null)
    }
  }

  // 시험지 목록
  useEffect(() => {
    ;(async () => {
      const { data: sh } = await supabase
        .from('exam_sheets')
        .select('id, code, title, grade, semester, created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      const list = sh ?? []
      setSheets(list)

      if (list.length) {
        const { data: gs } = await supabase
          .from('gradings')
          .select('sheet_id, score, total')
          .in('sheet_id', list.map((s) => s.id))
          .limit(5000)
        const agg: Record<string, { n: number; sum: number }> = {}
        ;(gs ?? []).forEach((g: any) => {
          const a = (agg[g.sheet_id] ??= { n: 0, sum: 0 })
          a.n += 1
          a.sum += g.total ? (g.score ?? 0) / g.total : 0
        })
        setCounts(
          Object.fromEntries(
            Object.entries(agg).map(([k, v]) => [k, { n: v.n, avg: v.n ? v.sum / v.n : 0 }])
          )
        )
      }
      setLoading(false)
    })()
  }, [])

  // 서술형: 선생님이 풀이 사진을 보고 O/X → 그 학생 점수 다시 계산
  const markEssay = async (g: Grading, no: number, ok: boolean) => {
    const { error } = await supabase
      .from('grading_answers')
      .update({ is_correct: ok, graded_by: 'teacher' })
      .eq('grading_id', g.id)
      .eq('no', no)
    if (error) return alert('저장하지 못했습니다: ' + error.message)
    const next = answers.map((a) =>
      a.grading_id === g.id && a.no === no ? { ...a, is_correct: ok, graded_by: 'teacher' } : a
    )
    const score = next.filter((a) => a.grading_id === g.id && a.is_correct === true).length
    await supabase.from('gradings').update({ score }).eq('id', g.id)
    setAnswers(next)
    setGradings((gs) => gs.map((x) => (x.id === g.id ? { ...x, score } : x)))
  }

  // 학생 풀이 사진 (비공개 버킷 → 잠깐 쓰는 주소로 연다)
  const openPhoto = async (path: string) => {
    const { data } = await supabase.storage.from('grading-photos').createSignedUrl(path, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else alert('사진을 열 수 없습니다.')
  }

  // 선택한 시험지 상세
  useEffect(() => {
    if (!sel) return
    setOpenStudent(null)
    ;(async () => {
      setLoading(true)
      const [{ data: gs }, { data: ps }] = await Promise.all([
        supabase
          .from('gradings')
          .select('id, student_id, student_name, score, total, submitted_at')
          .eq('sheet_id', sel.id)
          .order('submitted_at', { ascending: false })
          .limit(2000),
        supabase
          .from('exam_sheet_problems')
          .select(
            'no, problem_id, problems(difficulty, type_code, answer_kind, answer_text, book, grade, semester, page_no, local_no)'
          )
          .eq('sheet_id', sel.id)
          .order('no'),
      ])

      const glist = (gs ?? []) as Grading[]
      setGradings(glist)
      setProblems((ps ?? []) as any)

      if (glist.length) {
        const { data: as } = await supabase
          .from('grading_answers')
          .select('grading_id, no, type_code, student_answer, is_correct, graded_by, photo_path')
          .in('grading_id', glist.map((g) => g.id))
          .limit(20000)
        setAnswers((as ?? []) as Answer[])
      } else {
        setAnswers([])
      }

      const codes = Array.from(
        new Set(((ps ?? []) as any[]).map((p) => p.problems?.type_code).filter(Boolean))
      )
      if (codes.length) {
        const { data: ts } = await supabase
          .from('standard_types')
          .select('code, type_title')
          .in('code', codes)
        setTypeTitles(Object.fromEntries((ts ?? []).map((t: any) => [t.code, t.type_title])))
      }
      setLoading(false)
    })()
  }, [sel])

  // 문항별 정답률
  const byProblem = useMemo(() => {
    const m = new Map<number, { ok: number; n: number }>()
    answers.forEach((a) => {
      if (a.is_correct === null) return // 서술형 채점 대기
      const e = m.get(a.no) ?? { ok: 0, n: 0 }
      e.n += 1
      if (a.is_correct) e.ok += 1
      m.set(a.no, e)
    })
    return problems.map((p) => {
      const e = m.get(p.no) ?? { ok: 0, n: 0 }
      return {
        no: p.no,
        difficulty: p.problems?.difficulty ?? null,
        answerText: p.problems?.answer_text ?? null,
        typeTitle: p.problems?.type_code ? typeTitles[p.problems.type_code] ?? null : null,
        source: sourceLabel(p.problems),
        ok: e.ok,
        n: e.n,
        rate: e.n ? e.ok / e.n : 0,
      }
    })
  }, [problems, answers, typeTitles])

  // 유형별 오답
  const byType = useMemo(() => {
    const m = new Map<string, { ok: number; n: number; nos: Set<number> }>()
    answers.forEach((a) => {
      if (a.is_correct === null) return
      const key = a.type_code ?? '미분류'
      const e = m.get(key) ?? { ok: 0, n: 0, nos: new Set<number>() }
      e.n += 1
      if (a.is_correct) e.ok += 1
      e.nos.add(a.no)
      m.set(key, e)
    })
    return [...m.entries()]
      .map(([code, e]) => ({
        code,
        title: typeTitles[code] ?? (code === '미분류' ? '유형 미지정' : code),
        ok: e.ok,
        n: e.n,
        rate: e.n ? e.ok / e.n : 0,
        nos: [...e.nos].sort((a, b) => a - b),
      }))
      .sort((a, b) => a.rate - b.rate)
  }, [answers, typeTitles])

  const answersOf = (gid: string) =>
    answers.filter((a) => a.grading_id === gid).sort((a, b) => a.no - b.no)

  if (authLoading) return <Center>불러오는 중…</Center>
  if (!isAdmin()) return <Center>관리자만 접근할 수 있습니다</Center>

  // ── 시험지 목록 ──
  if (!sel)
    return (
      <>
        <Header title="채점결과" subtitle="QR 채점으로 들어온 결과" />
        <div className="p-4">
          {loading ? (
            <Center>불러오는 중…</Center>
          ) : sheets.length === 0 ? (
            <Center>아직 발행한 시험지가 없습니다</Center>
          ) : (
            <div className="space-y-2">
              {sheets.map((s) => {
                const c = counts[s.id]
                return (
                  <button
                    key={s.id}
                    onClick={() => setSel(s)}
                    className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-gray-300"
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold" style={{ color: NAVY }}>
                          {s.title}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {s.code} · {new Date(s.created_at).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold" style={{ color: NAVY }}>
                          {c?.n ?? 0}명
                        </p>
                        {c?.n ? (
                          <p className="text-xs" style={{ color: rateColor(c.avg) }}>
                            평균 {Math.round(c.avg * 100)}점
                          </p>
                        ) : (
                          <p className="text-xs text-gray-300">미응시</p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </>
    )

  // ── 시험지 상세 ──
  const avg =
    gradings.length > 0
      ? gradings.reduce((s, g) => s + (g.total ? (g.score ?? 0) / g.total : 0), 0) / gradings.length
      : 0

  return (
    <>
      <Header
        title={sel.title}
        subtitle={`${sel.code} · ${gradings.length}명 응시`}
        showBack
        action={
          <button onClick={() => setSel(null)} className="text-xs text-gray-400 underline">
            목록
          </button>
        }
      />

      <div className="p-4">
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="응시" value={`${gradings.length}명`} />
          <Stat label="평균" value={`${Math.round(avg * 100)}점`} color={rateColor(avg)} />
          <Stat label="문항" value={`${problems.length}개`} />
        </div>

        <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
          {([
            ['students', '학생별'],
            ['problems', '문항별'],
            ['types', '유형별'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="flex-1 rounded-lg py-2 text-sm font-medium transition"
              style={tab === k ? { background: '#fff', color: NAVY } : { color: '#9ca3af' }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && <Center>불러오는 중…</Center>}

        {!loading && tab === 'students' && (
          <div className="space-y-2">
            {gradings.length === 0 && <Center>아직 아무도 채점하지 않았습니다</Center>}
            {gradings.map((g) => {
              const r = g.total ? (g.score ?? 0) / g.total : 0
              const open = openStudent === g.id
              return (
                <div key={g.id} className="rounded-xl border border-gray-200 bg-white">
                  <button
                    onClick={() => setOpenStudent(open ? null : g.id)}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    <span className="flex-1 font-medium">{g.student_name ?? '이름 없음'}</span>
                    <span className="text-xs text-gray-400">
                      {g.submitted_at
                        ? new Date(g.submitted_at).toLocaleString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                    <span className="font-bold" style={{ color: rateColor(r) }}>
                      {g.score}/{g.total}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          onClick={() => reprint(g.id, 'wrong')}
                          disabled={busy !== null}
                          className="rounded-lg border py-2 text-xs font-medium disabled:opacity-40"
                          style={{ borderColor: NAVY, color: NAVY }}
                          title="틀린 문제를 그대로 다시 뽑습니다"
                        >
                          {busy === `${g.id}:wrong` ? '만드는 중…' : '틀린 문제 그대로'}
                        </button>
                        <button
                          onClick={() => reprint(g.id, 'twin')}
                          disabled={busy !== null}
                          className="rounded-lg border py-2 text-xs font-medium disabled:opacity-40"
                          style={{ borderColor: NAVY, color: NAVY }}
                          title="쎈↔쎈B의 짝 문제 — 문장은 같고 숫자만 다릅니다"
                        >
                          {busy === `${g.id}:twin` ? '만드는 중…' : '쌍둥이 문제'}
                        </button>
                        <button
                          onClick={() => reprint(g.id, 'similar')}
                          disabled={busy !== null}
                          className="rounded-lg py-2 text-xs font-medium text-white disabled:opacity-40"
                          style={{ background: NAVY }}
                          title="같은 유형에서 안 풀어본 다른 문제를 뽑습니다"
                        >
                          {busy === `${g.id}:similar` ? '만드는 중…' : '같은 유형 다른 문제'}
                        </button>
                        <button
                          onClick={() => reprint(g.id, 'wrong+similar')}
                          disabled={busy !== null}
                          className="rounded-lg py-2 text-xs font-medium text-white disabled:opacity-40"
                          style={{ background: ORANGE }}
                          title="틀린 문제와 그 유사문제를 한 장에 이어서 뽑습니다"
                        >
                          {busy === `${g.id}:wrong+similar` ? '만드는 중…' : '오답＋유사'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {answersOf(g.id).map((a) => (
                          <span
                            key={a.no}
                            className="rounded-md px-2 py-1 text-xs"
                            style={
                              a.is_correct === null
                                ? { background: '#fff7e0', color: '#b7791f' }
                                : a.is_correct
                                  ? { background: '#eef2f8', color: NAVY }
                                  : { background: '#fdeceb', color: RED }
                            }
                            title={a.student_answer ?? ''}
                          >
                            {a.no} {a.is_correct === null ? '서술형 대기' : a.is_correct ? '○' : `✗ ${a.student_answer ?? ''}`}
                          </span>
                        ))}
                      </div>
                      {/* 서술형: 풀이 사진을 보고 선생님이 채점 */}
                      {answersOf(g.id).some((a) => a.graded_by === 'teacher_pending' || a.graded_by === 'teacher') && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-xs font-semibold text-gray-500">서술형 채점</p>
                          {answersOf(g.id)
                            .filter((a) => a.graded_by === 'teacher_pending' || a.graded_by === 'teacher')
                            .map((a) => (
                              <div key={a.no} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                                <span className="w-10 shrink-0 font-bold" style={{ color: NAVY }}>
                                  {a.no}번
                                </span>
                                {a.photo_path ? (
                                  <button
                                    onClick={() => openPhoto(a.photo_path!)}
                                    className="rounded border border-gray-300 bg-white px-2 py-1 text-gray-700"
                                  >
                                    풀이 사진 보기
                                  </button>
                                ) : (
                                  <span className="text-gray-400">사진 없음</span>
                                )}
                                <span className="ml-auto flex gap-1">
                                  <button
                                    onClick={() => markEssay(g, a.no, true)}
                                    className="h-7 w-9 rounded border text-sm font-bold"
                                    style={a.is_correct === true ? { background: NAVY, color: '#fff', borderColor: NAVY } : { borderColor: '#cbd5e1', color: NAVY }}
                                  >
                                    ○
                                  </button>
                                  <button
                                    onClick={() => markEssay(g, a.no, false)}
                                    className="h-7 w-9 rounded border text-sm font-bold"
                                    style={a.is_correct === false ? { background: RED, color: '#fff', borderColor: RED } : { borderColor: '#cbd5e1', color: RED }}
                                  >
                                    ✗
                                  </button>
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!loading && tab === 'problems' && (
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {byProblem.map((p) => (
              <div key={p.no} className="flex items-center gap-3 px-4 py-3">
                <span className="w-8 shrink-0 font-bold" style={{ color: NAVY }}>
                  {p.no}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.typeTitle ?? '유형 미지정'}</p>
                  <p className="text-xs text-gray-400">
                    {[p.difficulty, p.answerText ? `정답 ${p.answerText}` : null, p.source]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.rate * 100}%`, background: rateColor(p.rate) }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs" style={{ color: rateColor(p.rate) }}>
                    {p.n ? `${Math.round(p.rate * 100)}% (${p.ok}/${p.n})` : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'types' && (
          <div className="space-y-2">
            {byType.length === 0 && <Center>아직 데이터가 없습니다</Center>}
            {byType.map((t) => (
              <div key={t.code} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.nos.join(', ')}번</p>
                  </div>
                  <span className="shrink-0 font-bold" style={{ color: rateColor(t.rate) }}>
                    {Math.round(t.rate * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${t.rate * 100}%`, background: rateColor(t.rate) }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold" style={{ color: color ?? NAVY }}>
        {value}
      </p>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <p className="py-16 text-center text-sm text-gray-400">{children}</p>
}
