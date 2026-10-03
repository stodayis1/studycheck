'use client'

// 시험지 분석 — 학교별 진행 현황판.
// 시험이 끝날 때마다 「수합 → 정답 → 변별문항·손풀이 → 총평 → 이너프원 매칭 → 문제은행 → 블로그」를 한눈에 본다.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { EXAM_TYPES, GRADES, SCHOOLS, examPrefix } from '@/lib/examAnalysis'

const GREEN = '#085041'

function Chip({ ok, warn, children }: { ok?: boolean; warn?: boolean; children: React.ReactNode }) {
  const style = ok
    ? { background: '#E1F5EE', color: GREEN }
    : warn
      ? { background: '#FEF3C7', color: '#92400E' }
      : { background: '#f3f4f6', color: '#9ca3af' }
  return <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={style}>{children}</span>
}

function dday(date: string | null) {
  if (!date) return null
  const d = Math.ceil((new Date(date + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
  return d === 0 ? 'D-day' : d > 0 ? `D-${d}` : `D+${-d}`
}

export default function ExamAnalysisPage() {
  const router = useRouter()
  const { currentUser, loading } = useAuth()
  const [papers, setPapers] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [exam, setExam] = useState('')            // 2026_2학기중간
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<any>({
    exam_year: new Date().getFullYear(), term: 2, exam_type: '중간고사',
    school_name: SCHOOLS[0], grade: '중3', exam_end_date: '', assignee: '',
  })

  const load = () =>
    apiFetch('/api/exam-analysis?list=1')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setPapers(j.papers)
      })
      .catch((e) => setErr(e.message))

  useEffect(() => { if (!loading && currentUser) load() }, [loading, currentUser])

  const exams = useMemo(() => Array.from(new Set((papers ?? []).map((p) => examPrefix(p)))), [papers])
  const curExam = exam || exams[0] || ''
  const rows = (papers ?? []).filter((p) => !curExam || examPrefix(p) === curExam)

  const create = async () => {
    const r = await apiFetch('/api/exam-analysis', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createPaper', paper: form }),
    })
    const j = await r.json()
    if (r.status === 409 && j.id) { router.push(`/teacher/exam-analysis/${j.id}`); return }
    if (!r.ok) { alert(j.error ?? '만들지 못했습니다.'); return }
    router.push(`/teacher/exam-analysis/${j.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="시험지 분석" subtitle="학교별 시험지 수합 · 정답 · 변별문항 · 총평 · 이너프원 매칭 · 문제은행 · 블로그"
        action={
          <button onClick={() => setAdding((v) => !v)} className="rounded-xl px-3 py-2 text-xs font-semibold text-white" style={{ background: GREEN }}>
            + 시험지 추가
          </button>
        } />
      <div className="max-w-[1400px] mx-auto px-4 py-5">
        {adding && (
          <div className="mb-4 rounded-xl border bg-white p-4 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1 text-xs text-gray-500">연도
              <input type="number" value={form.exam_year} onChange={(e) => setForm({ ...form, exam_year: Number(e.target.value) })} className="w-24 rounded border px-2 py-1.5 text-sm text-gray-900" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">학기
              <select value={form.term} onChange={(e) => setForm({ ...form, term: Number(e.target.value) })} className="rounded border px-2 py-1.5 text-sm text-gray-900">
                <option value={1}>1학기</option><option value={2}>2학기</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">시험구분
              <select value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })} className="rounded border px-2 py-1.5 text-sm text-gray-900">
                {EXAM_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">학교명
              <input list="ea-schools" value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} className="w-32 rounded border px-2 py-1.5 text-sm text-gray-900" />
              <datalist id="ea-schools">{SCHOOLS.map((s) => <option key={s} value={s} />)}</datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">학년
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="rounded border px-2 py-1.5 text-sm text-gray-900">
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">시험 종료일
              <input type="date" value={form.exam_end_date} onChange={(e) => setForm({ ...form, exam_end_date: e.target.value })} className="rounded border px-2 py-1.5 text-sm text-gray-900" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">담당자
              <input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} className="w-24 rounded border px-2 py-1.5 text-sm text-gray-900" />
            </label>
            <button onClick={create} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: GREEN }}>만들기</button>
          </div>
        )}

        {exams.length > 1 && (
          <div className="mb-3 flex gap-2">
            {exams.map((x) => (
              <button key={x} onClick={() => setExam(x)} className="rounded-full px-3 py-1.5 text-xs font-semibold"
                style={curExam === x ? { background: GREEN, color: '#fff' } : { background: '#fff', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                {x.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}

        {err && <p className="p-10 text-center text-sm text-red-600">{err}</p>}
        {!err && !papers && <p className="p-10 text-center text-gray-400">불러오는 중…</p>}
        {papers && !rows.length && <p className="p-10 text-center text-gray-400">아직 등록된 시험지가 없습니다. 「+ 시험지 추가」로 만들어 주세요.</p>}

        {!!rows.length && (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500" style={{ background: '#F0FBF7' }}>
                  {['학교 · 학년', '시험명', '시험 종료일', '시험지', '정답', '변별문항', '손풀이', '총평', '이너프원', '적중률', '문제은행', '블로그', '담당자', '작업 기한', '비고'].map((h) => (
                    <th key={h} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const t = p.tasks ?? {}
                  const s = p.stat ?? {}
                  const nDisc = (p.discriminating_nos ?? []).length
                  const reviewed = !!(p.review_difficulty || p.review_blog_summary)
                  return (
                    <tr key={p.id} onClick={() => router.push(`/teacher/exam-analysis/${p.id}`)}
                      className="cursor-pointer border-t hover:bg-gray-50">
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold" style={{ color: GREEN }}>
                        {p.school_name} {p.grade}
                        {p.priority === '높음' && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">우선</span>}
                        {t.done && <i className="ti ti-circle-check ml-1" style={{ color: '#0F6E56' }} />}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{p.exam_name}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{p.exam_end_date ?? <Chip warn>확인 필요</Chip>}</td>
                      <td className="px-3 py-2.5"><Chip ok={s.files > 0}>{s.files > 0 ? `${s.files}개` : '없음'}</Chip></td>
                      <td className="px-3 py-2.5"><Chip ok={!!t.answers} warn={!t.answers && !!p.answers_text}>{t.answers ? '완료' : p.answers_text ? '작업중' : '대기'}</Chip></td>
                      <td className="px-3 py-2.5"><Chip ok={nDisc >= 2} warn={nDisc === 1}>{nDisc ? `${nDisc}문항` : '대기'}</Chip></td>
                      <td className="px-3 py-2.5"><Chip ok={s.handsolve >= Math.max(nDisc, 1)} warn={s.handsolve > 0 && s.handsolve < nDisc}>{s.handsolve ? `${s.handsolve}장` : '대기'}</Chip></td>
                      <td className="px-3 py-2.5"><Chip ok={!!t.review} warn={!t.review && reviewed}>{t.review ? '완료' : reviewed ? '작성중' : '대기'}</Chip></td>
                      <td className="px-3 py-2.5"><Chip ok={p.match_status === '완료'} warn={p.match_status === '진행중'}>{p.match_status}{s.matches ? ` ${s.matches}` : ''}</Chip></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {s.hitRate == null ? <Chip>-</Chip> : <Chip ok={p.match_status === '완료'} warn={p.match_status !== '완료'}>{s.hitRate}% ({s.hit}/{s.total})</Chip>}
                      </td>
                      <td className="px-3 py-2.5"><Chip ok={s.questions > 0 && s.reflected === s.questions} warn={s.questions > 0 && s.reflected < s.questions}>{s.questions ? `${s.reflected}/${s.questions}` : '대기'}</Chip></td>
                      <td className="px-3 py-2.5"><Chip ok={p.blog_status === '업로드완료'} warn={p.blog_status === '작성중'}>{p.blog_status}</Chip></td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                        {p.assignee ?? '-'}
                        {t.needs_check && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">윤T 확인</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                        {p.work_due_date ?? '-'}
                        {p.work_due_date && !t.done && <span className="ml-1 text-[11px] text-gray-400">{dday(p.work_due_date)}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[220px] truncate">{p.note}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-400">
          줄을 누르면 그 학교의 상세 화면으로 갑니다. 학생·학부모 계정에서는 이 화면과 자료가 보이지 않습니다.
        </p>
      </div>
    </div>
  )
}
