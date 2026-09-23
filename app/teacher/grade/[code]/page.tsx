'use client'

// 선생님이 직접 채점하는 화면 (교사·직원·원장).  /teacher/grade/<시험지코드>
//
// 학생용 채점(/grade/[code])은 학생이 스스로 ○/✗를 누르는 곳이라 정답을 하나씩 보여 준다.
// 이 화면은 선생님이 답안지를 보며 빠르게 매기는 곳이라
//   · 번호별 정답이 격자로 한눈에 보이고
//   · 칸을 누르면 ○ → ✗ → 안 함 으로 돌고
//   · 「상세」를 켜면 그 문항의 문제·정답·출처(교재 몇 쪽 몇 번)까지 본다.

import { use, useEffect, useMemo, useState } from 'react'
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
}
type Student = { id: number; name: string; grade: string | null; class_time: string | null }
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
  const [studentId, setStudentId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

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

  const total = data?.problems.length ?? 0
  const right = useMemo(() => Object.values(marks).filter((m) => m === 'o').length, [marks])
  const score = total ? Math.round((right / total) * 100) : 0

  const cycle = (no: number) =>
    setMarks((m) => ({ ...m, [no]: m[no] === 'o' ? 'x' : m[no] === 'x' ? null : 'o' }))

  const save = async () => {
    if (!data) return
    setSaving(true); setSaved('')
    try {
      const st = data.students.find((s) => s.id === studentId)
      const r = await apiFetch(`/api/grade/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId || null,
          studentName: st?.name ?? null,
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
      setSaved('저장했습니다. 채점결과 화면에서 볼 수 있어요.')
    } finally { setSaving(false) }
  }

  if (authLoading) return <Shell code={code}><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!staff) return <Shell code={code}><div className="p-10 text-center text-gray-500">선생님만 쓸 수 있습니다.</div></Shell>
  if (err) return <Shell code={code}><div className="p-10 text-center text-gray-500">{err}</div></Shell>
  if (!data) return <Shell code={code}><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>

  return (
    <Shell code={code} title={data.sheet.title}>
      <div className="px-4 pb-28">
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

        {/* 번호별 정답 격자 */}
        <div className="grid grid-cols-5 sm:grid-cols-6 lg:grid-cols-8 gap-2">
          {data.problems.map((p) => {
            const m = marks[p.no]
            const tone = m === 'o' ? 'bg-blue-50 border-blue-200'
              : m === 'x' ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'
            return (
              <button key={p.no} onClick={() => cycle(p.no)}
                onDoubleClick={() => setOpen(open === p.no ? null : p.no)}
                className={`relative border rounded-xl p-2 min-h-[74px] flex flex-col items-center justify-center ${tone}`}>
                <span className="absolute top-1 left-2 text-[11px] text-gray-400">{p.no}</span>
                {m === 'x' && <span className="absolute top-1 right-2 text-red-500 font-bold">✗</span>}
                <Answer p={p} />
              </button>
            )
          })}
        </div>

        {/* 상세 — 문제·정답·출처 */}
        {detail && (
          <div className="mt-5 space-y-3">
            {data.problems.map((p) => (
              <div key={p.no} className="border rounded-xl bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
                  <span className="font-bold" style={{ color: NAVY }}>{p.no}번</span>
                  {p.difficulty && <Chip>{p.difficulty}</Chip>}
                  {p.typeTitle && <Chip>{p.typeTitle}</Chip>}
                  <span className="ml-auto text-[11px] text-gray-400">{p.source}</span>
                  <button onClick={() => cycle(p.no)}
                    className={`ml-2 w-8 h-8 rounded-lg border text-sm ${
                      marks[p.no] === 'o' ? 'bg-blue-50 border-blue-300 text-blue-600'
                        : marks[p.no] === 'x' ? 'bg-red-50 border-red-300 text-red-600' : 'text-gray-400'
                    }`}>
                    {marks[p.no] === 'o' ? '○' : marks[p.no] === 'x' ? '✗' : '–'}
                  </button>
                </div>
                <div className="p-3 grid grid-cols-1 md:grid-cols-[1fr_200px] gap-3">
                  {p.image
                    ? // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={`${p.no}번 문제`} className="w-full rounded border" />
                    : <div className="text-sm text-gray-400">문제 그림이 없습니다.</div>}
                  <div className="rounded-lg border bg-blue-50/40 p-3">
                    <div className="text-xs text-gray-500 mb-1">정답</div>
                    <div className="text-lg"><Answer p={p} big /></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 격자에서 두 번 눌러 펼친 한 문항 */}
        {!detail && open != null && (() => {
          const p = data.problems.find((q) => q.no === open)!
          return (
            <div className="mt-4 border rounded-xl bg-white p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold" style={{ color: NAVY }}>{p.no}번</span>
                <span className="ml-auto text-[11px] text-gray-400">{p.source}</span>
                <button onClick={() => setOpen(null)} className="text-gray-400 text-sm">닫기</button>
              </div>
              {p.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="w-full rounded border" />
              )}
              <div className="mt-2 rounded-lg border bg-blue-50/40 p-3">
                <div className="text-xs text-gray-500 mb-1">정답</div>
                <div className="text-lg"><Answer p={p} big /></div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* 아래 고정 줄 — 점수·학생·저장 */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white px-4 py-3">
        <div className="max-w-[900px] mx-auto flex flex-wrap items-center gap-3">
          <div className="text-2xl font-extrabold" style={{ color: NAVY }}>{score}점</div>
          <div className="text-xs text-gray-400">{total}문항 중 {right}개 정답</div>
          <select value={studentId} onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : '')}
            className="ml-auto border rounded-lg px-2 py-2 text-sm max-w-[180px]">
            <option value="">학생 고르기(선택)</option>
            {data.students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.class_time ? ` · ${s.class_time}` : ''}</option>
            ))}
          </select>
          <button onClick={save} disabled={saving}
            className="px-5 py-2.5 rounded-xl text-white font-bold disabled:opacity-40"
            style={{ background: '#e8564a' }}>
            {saving ? '저장 중…' : '채점 저장'}
          </button>
        </div>
        {saved && <p className="max-w-[900px] mx-auto text-xs text-gray-500 mt-1">{saved}</p>}
      </div>
    </Shell>
  )
}

// 정답 한 칸 — 객관식은 동그라미 숫자, 숫자형은 글자, 그림형은 잘라 둔 정답 그림
function Answer({ p, big }: { p: P; big?: boolean }) {
  if (p.isEssay) return <span className="text-xs text-gray-400">서술형</span>
  if (p.answerChoices.length)
    return (
      <span className={big ? 'text-2xl' : 'text-lg'} style={{ color: '#2563eb' }}>
        {p.answerChoices.map((d) => '①②③④⑤'[Number(d) - 1]).join(', ')}
      </span>
    )
  if (p.answerText)
    return <span className={big ? 'text-xl' : 'text-sm'} style={{ color: '#2563eb' }}>{p.answerText}</span>
  if (p.answerImage)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.answerImage} alt="정답" className={big ? 'max-h-16' : 'max-h-9'} />
  return <span className="text-xs text-gray-300">정답 없음</span>
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
