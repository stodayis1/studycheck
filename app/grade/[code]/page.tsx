// 시험지 QR을 찍으면 열리는 채점 화면. 로그인 없이 동작한다.
// 이름 고르기 → 문항별 답 입력 → 자동 채점 → 점수·오답·틀린 유형
'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { MathInput } from '@/components/grade/MathInput'

const NAVY = '#0f3460'
const GOLD = '#c8992e'
const RED = '#dc2626'
const CIRCLE = ['①', '②', '③', '④', '⑤']

type Problem = {
  no: number
  problemId: number | null
  source: string | null
  difficulty: string | null
  typeCode: string | null
  typeTitle: string | null
  answerKind: 'choice' | 'number' | 'image'
  answerText: string | null
  answerChoices: string[]
  answerImage: string | null
}

type Student = {
  id: string
  name: string
  grade: string | null
  class_time: string | null
  teacher_name: string | null
}

type SheetData = {
  sheet: { id: string; code: string; title: string; grade: string | null; note: string | null }
  problems: Problem[]
  students: Student[]
}

const norm = (s: string) => s.replace(/[\s,]/g, '').trim()

type Photo = { path: string | null; preview: string; uploading: boolean; error?: string }
type AiResult = { isCorrect: boolean; gradedBy?: string; aiReason: string | null }

// 휴대폰 사진은 크다 → 긴 변 1600px JPEG로 줄여서 올린다
async function shrinkPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = no
      i.src = url
    })
    const k = Math.min(1, 1600 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.85))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function GradePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)

  const [data, setData] = useState<SheetData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [student, setStudent] = useState<Student | null>(null)
  const [q, setQ] = useState('')

  const [picks, setPicks] = useState<Record<number, string[]>>({})
  const [texts, setTexts] = useState<Record<number, string>>({})
  const [latex, setLatex] = useState<Record<number, string>>({})
  const [photos, setPhotos] = useState<Record<number, Photo>>({})
  const [ai, setAi] = useState<Record<number, AiResult>>({}) // 서버(AI)가 채점한 결과

  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/grade/${code}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setData(j)
      })
      .catch((e) => setErr(e.message))
  }, [code])

  const filtered = useMemo(() => {
    if (!data) return []
    const k = q.trim()
    if (!k) return data.students
    return data.students.filter(
      (s) => s.name.includes(k) || (s.teacher_name ?? '').includes(k) || (s.grade ?? '').includes(k)
    )
  }, [data, q])

  const judge = (p: Problem) => {
    if (p.answerKind === 'choice') {
      const mine = [...(picks[p.no] ?? [])].sort().join(',')
      const real = [...p.answerChoices].sort().join(',')
      return mine !== '' && mine === real
    }
    if (p.answerKind === 'number') {
      const mine = norm(texts[p.no] ?? '')
      return mine !== '' && mine === norm(p.answerText ?? '')
    }
    return ai[p.no]?.isCorrect === true
  }

  const myAnswerLabel = (p: Problem) => {
    if (p.answerKind === 'choice') {
      const v = picks[p.no] ?? []
      return v.length ? v.map((n) => CIRCLE[Number(n) - 1]).join(', ') : '무응답'
    }
    if (p.answerKind === 'image') {
      const t = (latex[p.no] ?? '').trim()
      return t || (photos[p.no]?.path ? '(풀이 사진)' : '무응답')
    }
    const t = (texts[p.no] ?? '').trim()
    return t || '무응답'
  }

  const answered = (p: Problem) => {
    if (p.answerKind === 'choice') return (picks[p.no] ?? []).length > 0
    if (p.answerKind === 'number') return (texts[p.no] ?? '').trim() !== ''
    return (latex[p.no] ?? '').trim() !== '' || !!photos[p.no]?.path
  }

  const addPhoto = async (no: number, file: File | undefined) => {
    if (!file) return
    const preview = URL.createObjectURL(file)
    setPhotos((ps) => ({ ...ps, [no]: { path: null, preview, uploading: true } }))
    try {
      const fd = new FormData()
      fd.append('no', String(no))
      fd.append('photo', await shrinkPhoto(file), 'photo.jpg')
      const r = await fetch(`/api/grade/${code}/photo`, { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? '업로드 실패')
      setPhotos((ps) => ({ ...ps, [no]: { path: j.path, preview, uploading: false } }))
    } catch (e: any) {
      setPhotos((ps) => ({ ...ps, [no]: { path: null, preview, uploading: false, error: e.message } }))
    }
  }

  const allDone = data ? data.problems.every(answered) : false

  const submit = async () => {
    if (!data) return
    setSaving(true)
    const answers = data.problems.map((p) => ({
      no: p.no,
      problemId: p.problemId,
      typeCode: p.typeCode,
      studentAnswer: myAnswerLabel(p),
      isCorrect: p.answerKind === 'image' ? false : judge(p),
      kind: p.answerKind,
      latex: p.answerKind === 'image' ? latex[p.no] ?? null : null,
      photoPath: p.answerKind === 'image' ? photos[p.no]?.path ?? null : null,
    }))
    try {
      const r = await fetch(`/api/grade/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student?.id ?? null,
          studentName: student?.name ?? null,
          answers,
        }),
      })
      const j = await r.json()
      if (r.ok && Array.isArray(j.results)) {
        const m: Record<number, AiResult> = {}
        j.results.forEach((x: any) => (m[x.no] = x))
        setAi(m)
      }
    } catch {
      /* 저장이 실패해도 결과는 보여준다 */
    }
    setSaving(false)
    setDone(true)
    window.scrollTo({ top: 0 })
  }

  if (err)
    return (
      <Shell>
        <p className="py-20 text-center text-slate-600">{err}</p>
      </Shell>
    )

  if (!data)
    return (
      <Shell>
        <p className="py-20 text-center text-slate-400">불러오는 중…</p>
      </Shell>
    )

  // ── 1) 이름 고르기 ──
  if (!student)
    return (
      <Shell title={data.sheet.title}>
        <p className="mb-3 text-sm text-slate-500">본인 이름을 찾아 눌러 주세요.</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 검색"
          className="mb-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-500"
        />
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {filtered.slice(0, 300).map((s) => (
            <button
              key={s.id}
              onClick={() => setStudent(s)}
              className="w-full px-4 py-3 text-left active:bg-slate-100"
            >
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 text-xs text-slate-400">
                {[s.grade, s.teacher_name].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">검색 결과가 없습니다.</p>
          )}
        </div>
      </Shell>
    )

  // ── 3) 결과 ──
  if (done) {
    const wrong = data.problems.filter((p) => !judge(p))
    const score = data.problems.length - wrong.length
    const byType = new Map<string, { title: string; nos: number[] }>()
    wrong.forEach((p) => {
      const key = p.typeCode ?? '미분류'
      const cur = byType.get(key) ?? { title: p.typeTitle ?? '유형 미지정', nos: [] }
      cur.nos.push(p.no)
      byType.set(key, cur)
    })

    return (
      <Shell title={data.sheet.title}>
        <div className="mb-5 rounded-2xl p-6 text-center text-white" style={{ background: NAVY }}>
          <p className="text-sm opacity-80">{student.name}</p>
          <p className="mt-1 text-4xl font-bold">
            {score}
            <span className="text-xl opacity-70"> / {data.problems.length}</span>
          </p>
          <p className="mt-1 text-sm" style={{ color: GOLD }}>
            {Math.round((score / data.problems.length) * 100)}점
          </p>
        </div>

        <h2 className="mb-2 font-semibold">틀린 문제</h2>
        {wrong.length === 0 ? (
          <p className="mb-6 text-sm text-slate-500">다 맞았습니다. 잘했어요!</p>
        ) : (
          <div className="mb-6 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {wrong.map((p) => (
              <div key={p.no} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-semibold" style={{ color: NAVY }}>
                    {p.no}번
                  </span>
                  <span className="text-slate-500">내 답 {myAnswerLabel(p)}</span>
                  {p.answerKind !== 'image' && (
                    <span className="ml-auto font-medium" style={{ color: GOLD }}>
                      정답 {p.answerText}
                    </span>
                  )}
                </div>
                {p.answerKind === 'image' && latex[p.no] && (
                  <div className="mt-1 overflow-x-auto">
                    <MathInput value={latex[p.no]} readOnly />
                  </div>
                )}
                {p.answerKind === 'image' && ai[p.no]?.aiReason && (
                  <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    AI 채점: {ai[p.no]!.aiReason}
                  </p>
                )}
                {p.answerKind === 'image' && p.answerImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.answerImage} alt={`${p.no}번 정답`} className="mt-2 max-w-full rounded border border-slate-200" />
                )}
                {p.typeTitle && <p className="mt-1 text-xs text-slate-400">{p.typeTitle}</p>}
              </div>
            ))}
          </div>
        )}

        <h2 className="mb-2 font-semibold">틀린 유형 정리</h2>
        {byType.size === 0 ? (
          <p className="text-sm text-slate-500">없습니다.</p>
        ) : (
          <div className="space-y-2">
            {[...byType.entries()]
              .sort((a, b) => b[1].nos.length - a[1].nos.length)
              .map(([tc, v]) => (
                <div
                  key={tc}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                    style={{ background: GOLD }}
                  >
                    {v.nos.length}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.title}</p>
                    <p className="text-xs text-slate-400">{v.nos.join(', ')}번</p>
                  </div>
                </div>
              ))}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">결과가 선생님께 저장되었습니다.</p>
      </Shell>
    )
  }

  // ── 2) 답 입력 ──
  return (
    <Shell title={data.sheet.title}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          <span className="font-medium text-slate-800">{student.name}</span> · 총{' '}
          {data.problems.length}문항
        </p>
        <button onClick={() => setStudent(null)} className="text-xs text-slate-400 underline">
          이름 바꾸기
        </button>
      </div>

      <div className="space-y-3 pb-28">
        {data.problems.map((p) => (
          <div key={p.no} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-bold" style={{ color: NAVY }}>
                {p.no}번
              </span>
              {p.difficulty && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  {p.difficulty}
                </span>
              )}
              {answered(p) && (
                <span className="ml-auto text-xs" style={{ color: GOLD }}>
                  ✓
                </span>
              )}
            </div>

            {p.answerKind === 'choice' && (
              <div className="flex gap-2">
                {CIRCLE.map((c, i) => {
                  const n = String(i + 1)
                  const on = (picks[p.no] ?? []).includes(n)
                  return (
                    <button
                      key={n}
                      onClick={() =>
                        setPicks((prev) => {
                          const cur = prev[p.no] ?? []
                          return {
                            ...prev,
                            [p.no]: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n],
                          }
                        })
                      }
                      className="h-12 flex-1 rounded-lg border text-lg transition"
                      style={
                        on
                          ? { background: NAVY, color: '#fff', borderColor: NAVY }
                          : { borderColor: '#cbd5e1', color: '#334155' }
                      }
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            )}

            {p.answerKind === 'number' && (
              <input
                inputMode="numeric"
                value={texts[p.no] ?? ''}
                onChange={(e) => setTexts((t) => ({ ...t, [p.no]: e.target.value }))}
                placeholder="답을 입력하세요"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none focus:border-slate-500"
              />
            )}

            {p.answerKind === 'image' && (
              <div className="space-y-2">
                <MathInput
                  value={latex[p.no] ?? ''}
                  onChange={(v) => setLatex((t) => ({ ...t, [p.no]: v }))}
                  placeholder="답을 입력하세요"
                />
                <label className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 active:bg-slate-50">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => addPhoto(p.no, e.target.files?.[0])}
                  />
                  📷 {photos[p.no] ? '풀이 사진 다시 찍기' : '풀이 사진 찍기 (서술형)'}
                </label>
                {photos[p.no] && (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photos[p.no].preview} alt="풀이 사진" className="h-16 w-16 rounded object-cover" />
                    <span className="text-xs text-slate-500">
                      {photos[p.no].uploading
                        ? '올리는 중…'
                        : photos[p.no].error
                          ? `실패: ${photos[p.no].error}`
                          : '사진이 올라갔어요'}
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-slate-400">식·서술형 답은 제출하면 AI가 채점합니다.</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-lg">
          <button
            onClick={submit}
            disabled={saving}
            className="h-12 w-full rounded-xl font-semibold text-white disabled:opacity-50"
            style={{ background: allDone ? NAVY : '#94a3b8' }}
          >
            {saving ? 'AI가 채점하고 있어요…' : allDone ? '채점하기' : '채점하기 (안 푼 문제 있음)'}
          </button>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-lg px-4 py-5">
        {title && (
          <h1 className="mb-4 text-lg font-bold" style={{ color: NAVY }}>
            {title}
          </h1>
        )}
        {children}
      </div>
    </div>
  )
}
