'use client'

// 선생님이 직접 채점하는 화면 (교사·직원·원장).  /teacher/grade/<시험지코드>
//
// 학생용 채점(/grade/[code])은 학생이 스스로 ○/✗를 누르는 곳이라 정답을 하나씩 보여 준다.
// 이 화면은 선생님이 답안지를 보며 빠르게 매기는 곳이라
//   · 번호별 정답이 격자로 한눈에 보이고
//   · 칸을 누르면 ○ → ✗ → 안 함 으로 돌고
//   · 「상세」를 켜면 그 문항의 문제·정답·출처(교재 몇 쪽 몇 번)까지 본다.

import { Fragment, use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'

type P = {
  no: number
  problemId: number | null
  source: string | null
  difficulty: string | null
  typeCode: string | null
  typeTitle: string | null
  answerKind: 'choice' | 'number' | 'image' | string
  isEssay: boolean
  answerText: string | null
  answerChoices: string[]
  answerImage: string | null
  image: string | null
  solution?: string | null      // 해설집 풀이 (「상세」를 펼칠 때 받아 온다)
  hasSolution?: boolean
}
type Student = { id: number; name: string; grade: string | null; class_time: string | null; teacher_name?: string | null }
type Data = { sheet: { code: string; title: string }; problems: P[]; students: Student[] }

type Mark = 'o' | 'x' | null

export default function TeacherGradePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const { currentUser, loading: authLoading } = useAuth()
  // 교사·직원·원장이면 쓸 수 있다
  const staff = ['admin', 'teacher', 'staff'].includes(currentUser?.role ?? '')
  const router = useRouter()

  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [marks, setMarks] = useState<Record<number, Mark>>({})
  const [detail, setDetail] = useState(false)
  const [open, setOpen] = useState<number | null>(null)   // 상세로 펼친 문항
  const [student, setStudent] = useState<Student | null>(null)
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')
  const [done, setDone] = useState(false)   // 저장 끝 — 두 번 저장하지 않게

  useEffect(() => {
    apiFetch(`/api/grade/${code}?full=1`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setData(j)
        // 처음에는 모두 ○ 로 두고, 틀린 것만 눌러서 ✗ 로 바꾸는 게 빠르다
        const init: Record<number, Mark> = {}
        for (const p of j.problems) init[p.no] = 'o'
        setMarks(init)
      })
      .catch((e) => setErr(e.message))
  }, [code])

  // 문제 그림은 「상세」를 볼 때만 받는다.
  // 격자에는 정답만 있으면 되는데 24장을 미리 받느라 QR을 찍고 한참 기다려야 했다.
  const [imgsOn, setImgsOn] = useState(false)
  const needImages = detail || open != null
  useEffect(() => {
    if (!needImages || imgsOn) return
    setImgsOn(true)
    apiFetch(`/api/grade/${code}?full=1&images=1`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) return
        const byNo = new Map<number, P>(j.problems.map((p: P) => [p.no, p]))
        setData((d) =>
          d
            ? {
                ...d,
                problems: d.problems.map((p) => ({
                  ...p,
                  image: byNo.get(p.no)?.image ?? p.image,
                  solution: byNo.get(p.no)?.solution ?? p.solution,
                  hasSolution: byNo.get(p.no)?.hasSolution ?? p.hasSolution,
                })),
              }
            : d
        )
      })
      .catch(() => setImgsOn(false))
  }, [needImages, imgsOn, code])

  const total = data?.problems.length ?? 0
  const right = useMemo(() => Object.values(marks).filter((m) => m === 'o').length, [marks])
  const score = total ? Math.round((right / total) * 100) : 0

  const cycle = (no: number) =>
    setMarks((m) => ({ ...m, [no]: m[no] === 'o' ? 'x' : m[no] === 'x' ? null : 'o' }))

  const save = async () => {
    if (!data) return
    setSaving(true); setSaved('')
    try {
      const r = await apiFetch(`/api/grade/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student?.id ?? null,
          studentName: student?.name ?? null,
          answers: data.problems.map((p) => ({
            no: p.no,
            problemId: p.problemId,
            typeCode: p.typeCode,
            studentAnswer: '',
            isCorrect: marks[p.no] === 'o',
            kind: 'image',          // 선생님이 직접 매겼다는 뜻으로 자기채점과 같은 칸에 넣는다
          })),
        }),
      })
      const j = await r.json()
      if (!r.ok) { setSaved(j.error ?? '저장하지 못했습니다.'); return }
      setSaved('')
      setDone(true)
    } finally { setSaving(false) }
  }

  if (authLoading) return <Shell code={code}><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!staff) return <Shell code={code}><div className="p-10 text-center text-gray-500">선생님만 쓸 수 있습니다.</div></Shell>
  if (err) return <Shell code={code}><div className="p-10 text-center text-gray-500">{err}</div></Shell>
  if (!data) return <Shell code={code}><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>

  // ── 누구 것인지 먼저 고른다 ──
  // 채점을 다 해 놓고 학생을 안 고른 채 저장해 버리면 누구 점수인지 알 수 없다.
  if (!student) {
    const k = q.trim()
    const list = k
      ? data.students.filter(
          (s) =>
            s.name.includes(k) ||
            (s.teacher_name ?? '').includes(k) ||
            (s.grade ?? '').includes(k) ||
            (s.class_time ?? '').includes(k)
        )
      : data.students
    return (
      <Shell code={code} title={data.sheet.title}>
        <div className="px-4 py-5">
          <p className="mb-3 text-sm text-gray-500">
            <b style={{ color: NAVY }}>누구 시험지인가요?</b> 먼저 학생을 고르면 채점 화면이 열립니다.
          </p>
          <div className="relative mb-3">
            <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="이름 · 담당쌤 · 반으로 찾기"
              className="w-full border rounded-xl pl-9 pr-3 py-3 text-base"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {list.map((s) => (
              <button
                key={s.id}
                onClick={() => { setStudent(s); setDone(false); setSaved('') }}
                className="border rounded-xl bg-white px-3 py-3 text-left hover:shadow-sm"
              >
                <div className="font-semibold">{s.name}</div>
                <div className="text-[11px] text-gray-400 truncate">
                  {[s.grade, s.class_time, s.teacher_name].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
          </div>
          {!list.length && <p className="py-8 text-center text-sm text-gray-400">찾는 학생이 없습니다.</p>}
        </div>
      </Shell>
    )
  }

  return (
    <Shell code={code} title={data.sheet.title}>
      <div className="px-4 pb-44 md:pb-28">
        {/* 누구 것인지 늘 보이게 */}
        <div className="mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 bg-white">
          <i className="ti ti-user text-gray-300" />
          <span className="font-bold" style={{ color: NAVY }}>{student.name}</span>
          <span className="text-[11px] text-gray-400 truncate">
            {[student.grade, student.class_time, student.teacher_name].filter(Boolean).join(' · ')}
          </span>
          <button onClick={() => setStudent(null)} className="ml-auto text-xs text-gray-400 underline">
            학생 바꾸기
          </button>
        </div>
        {/* 위쪽 조작 줄 */}
        <div className="flex flex-wrap items-center gap-2 py-3">
          <button onClick={() => setDetail((d) => !d)}
            className={`px-3 py-1.5 rounded-lg border text-sm ${detail ? 'text-white' : 'text-gray-600'}`}
            style={detail ? { background: NAVY, borderColor: NAVY } : undefined}>
            <i className="ti ti-layout-columns mr-1" />상세
          </button>
          <button onClick={() => setMarks(Object.fromEntries(data.problems.map((p) => [p.no, 'o'])))}
            className="px-3 py-1.5 rounded-lg border text-sm text-gray-600">모두 ○</button>
          <button onClick={() => setMarks({})}
            className="px-3 py-1.5 rounded-lg border text-sm text-gray-600">지우기</button>
          <span className="ml-auto text-sm text-gray-400">
            {total}문항 중 <b style={{ color: NAVY }}>{right}</b>개 정답
          </span>
        </div>

        {/* 번호별 정답 격자.
            「상세」를 누르면 그 번호가 있는 **줄 바로 아래**에 펼쳐진다.
            (전에는 격자를 다 지나 맨 밑까지 스크롤해야 보였다) */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.problems.map((p) => {
            const m = marks[p.no]
            const tone = m === 'o' ? 'bg-blue-50 border-blue-200'
              : m === 'x' ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
            const isOpen = open === p.no
            return (
              <Fragment key={p.no}>
                <div
                  className={`relative border rounded-xl px-2 pt-5 pb-7 min-h-[104px] flex flex-col items-center justify-center overflow-hidden ${tone} ${
                    isOpen ? 'ring-2 ring-offset-1' : ''
                  }`}
                  style={isOpen ? { borderColor: NAVY, boxShadow: `0 0 0 2px ${NAVY}` } : undefined}
                >
                  <button onClick={() => cycle(p.no)} className="absolute inset-0" aria-label={`${p.no}번 ○✗`} />
                  <span className="absolute top-1 left-2 text-[11px] text-gray-400">{p.no}</span>
                  {m === 'x' && <span className="absolute top-1 right-2 text-red-500 font-bold">✗</span>}
                  <span className="pointer-events-none"><Answer p={p} /></span>
                  <button
                    onClick={() => setOpen(isOpen ? null : p.no)}
                    className="absolute bottom-0 left-0 right-0 h-6 text-[11px] border-t bg-white/70"
                    style={{ color: NAVY }}
                  >
                    <i className={`ti ti-chevron-${isOpen ? 'up' : 'down'} mr-0.5`} />
                    {isOpen ? '닫기' : '상세'}
                  </button>
                </div>
                {isOpen && (
                  <div className="col-span-full border rounded-xl bg-white p-3" style={{ borderColor: NAVY }}>
                    <Detail p={p} mark={m} onMark={() => cycle(p.no)} onClose={() => setOpen(null)} />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>

        {/* 「상세」를 켜면 전부 펼친다 (한 장에 쭉 훑어볼 때) */}
        {detail && (
          <div className="mt-5 space-y-3">
            {data.problems.map((p) => (
              <div key={p.no} className="border rounded-xl bg-white p-3">
                <Detail p={p} mark={marks[p.no]} onMark={() => cycle(p.no)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 아래 고정 줄 — 점수·학생·저장.
          휴대폰에는 하단 탭(높이 64px, z-40)이 있어서 그 위에 올려야 한다.
          전에는 z 값이 없어 탭에 가려 「채점 저장」이 아예 안 보였다. */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 border-t bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="max-w-[900px] mx-auto flex flex-wrap items-center gap-3">
          <div className="text-2xl font-extrabold" style={{ color: NAVY }}>{score}점</div>
          <div className="text-xs text-gray-400">{total}문항 중 {right}개 정답</div>
          <span className="ml-auto text-sm font-semibold" style={{ color: NAVY }}>{student.name}</span>
          {done ? (
            <span className="px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: '#dcfce7', color: '#166534' }}>
              <i className="ti ti-check mr-1" />저장 완료
            </span>
          ) : (
            <button onClick={save} disabled={saving}
              className="px-5 py-2.5 rounded-xl text-white font-bold disabled:opacity-40"
              style={{ background: '#e8564a' }}>
              {saving ? '저장 중…' : '채점 저장'}
            </button>
          )}
        </div>
        {saved && <p className="max-w-[900px] mx-auto text-xs text-red-600 mt-1">{saved}</p>}
        {/* 저장했으면 다음에 뭘 할지 바로 보여 준다 */}
        {done && (
          <div className="max-w-[900px] mx-auto mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500">
              <b style={{ color: NAVY }}>{student.name}</b> · {score}점으로 기록했습니다.
            </span>
            <button onClick={() => router.push('/teacher/gradings')}
              className="ml-auto px-3 py-1.5 rounded-lg border" style={{ borderColor: NAVY, color: NAVY }}>
              채점결과 보기
            </button>
            <button onClick={() => router.push('/teacher/scan')}
              className="px-3 py-1.5 rounded-lg text-white" style={{ background: NAVY }}>
              다음 시험지 찍기
            </button>
          </div>
        )}
      </div>
    </Shell>
  )
}

// 한 문항 펼침 — 문제 그림·정답·출처·해설. 격자 줄 아래와 「상세」 목록에서 같이 쓴다.
function Detail({
  p, mark, onMark, onClose,
}: { p: P; mark: Mark; onMark: () => void; onClose?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-lg" style={{ color: NAVY }}>{p.no}번</span>
        {p.difficulty && <Chip>{p.difficulty}</Chip>}
        {p.typeTitle && <Chip>{p.typeTitle}</Chip>}
        <button
          onClick={onMark}
          className={`ml-1 w-9 h-9 rounded-lg border ${
            mark === 'o' ? 'bg-blue-50 border-blue-300 text-blue-600'
              : mark === 'x' ? 'bg-red-50 border-red-300 text-red-600' : 'text-gray-400'
          }`}
        >
          {mark === 'o' ? '○' : mark === 'x' ? '✗' : '–'}
        </button>
        <span className="ml-auto text-[11px] text-gray-400">{p.source}</span>
        {onClose && <button onClick={onClose} className="text-gray-400 text-sm ml-2">닫기</button>}
      </div>
      <div className="rounded-lg border bg-blue-50/50 px-3 py-2 mb-2">
        <span className="text-xs text-gray-500 mr-2">정답</span>
        <span className="text-lg align-middle"><Answer p={p} big /></span>
      </div>
      {p.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt={`${p.no}번 문제`} className="w-full rounded border" />
      ) : (
        <p className="text-sm text-gray-400">문제 그림을 받는 중…</p>
      )}
      <Solution p={p} />
    </>
  )
}

// 정답 한 칸 — 객관식은 동그라미 숫자, 숫자형은 글자, 그림형은 잘라 둔 정답 그림.
// 그림 정답(주로 서술형 풀이)은 글자로 옮길 수 없어서 그림 그대로다.
// 작게 넣으면 안 읽히므로 칸을 꽉 채우고, 누르면 크게 펼친다.
function Answer({ p, big }: { p: P; big?: boolean }) {
  // 서술형이라도 해설집에 최종 단답이 적혀 있다 → 있으면 보여 준다.
  // (풀이 과정은 학생이 쓴 것을 보고 매기고, 여기 단답은 맞았는지 빨리 보는 용도)
  if (p.isEssay)
    return (
      <span className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">서술형</span>
        {p.answerText ? (
          <span className={big ? 'text-2xl' : 'text-base font-bold'} style={{ color: '#2563eb' }}>
            {p.answerText}
          </span>
        ) : p.answerImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.answerImage} alt="정답" className="w-full object-contain" style={{ maxHeight: big ? undefined : 110 }} />
        ) : null}
      </span>
    )
  if (p.answerChoices.length)
    return (
      <span className={big ? 'text-3xl' : 'text-2xl'} style={{ color: '#2563eb' }}>
        {p.answerChoices.map((d) => '①②③④⑤'[Number(d) - 1]).join(', ')}
      </span>
    )
  if (p.answerText)
    return <span className={big ? 'text-2xl' : 'text-base font-bold'} style={{ color: '#2563eb' }}>{p.answerText}</span>
  if (p.answerImage)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={p.answerImage}
        alt="정답"
        className={big ? 'w-full' : 'w-full object-contain'}
        style={big ? undefined : { maxHeight: 140 }}
      />
    )
  return <span className="text-xs text-gray-300">정답 없음</span>
}

// 해설집 풀이 — 증명 서술형은 정답만으로 매길 수 없어서 풀이를 그대로 본다.
// 해설집에서 못 잘라낸 문항도 있어서, 있는 것만 단추가 뜬다.
function Solution({ p }: { p: P }) {
  const [open, setOpen] = useState(false)
  if (!p.hasSolution && !p.solution) return null
  return (
    <div className="border-t">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 text-left text-sm flex items-center gap-2"
        style={{ color: NAVY }}
      >
        <i className={`ti ti-chevron-${open ? 'down' : 'right'} text-gray-300`} />
        <b>해설 풀이</b>
        <span className="text-[11px] text-gray-400">
          {p.isEssay ? '증명·서술형은 풀이를 보고 매기세요' : '푸는 과정'}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {p.solution ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.solution} alt={`${p.no}번 풀이`} className="w-full rounded border bg-white" />
          ) : (
            <p className="text-sm text-gray-400">풀이를 불러오는 중…</p>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{children}</span>
}

function Shell({ code, title, children }: { code: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={title ?? 'QR 채점'} subtitle={`시험지 ${code}`} showBack />
      <div className="max-w-[900px] mx-auto">{children}</div>
    </div>
  )
}
