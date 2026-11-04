'use client'

/**
 * 영상 과제를 **여러 학생에게 한꺼번에** 배부하는 화면.
 *
 * 왜 (원장님 2026-11-03)
 *   「영상과제를 하나하나 일일이 과제 배부하려면 너무 일이 많은데 일괄적으로 배부할수
 *   있도록 메뉴만들자 … 이게 자동으로 학습일지 과제로 들어가도록 해줘」
 *
 * 반드시 지키는 것
 *   ① **넣는 자리는 지금과 똑같다** — 학습일지와 같은 `class_sessions.video_url` 이다.
 *      그래야 학생·학부모 화면, 브리핑의 「다음 시간까지 과제」, 시청 기록이 그대로 돈다.
 *      학습일지에서 하나씩 넣는 길도 **그대로 둔다** (원장님 「지금처럼 개별적으로 … 그대로 두고」).
 *   ② **덮어쓰지 않는다.** 이미 들어 있는 영상 뒤에 이어 붙인다. 같은 영상은 두 번 안 넣는다.
 *   ③ **바로 저장하지 않는다.** 누구의 어느 수업에 붙는지 표로 먼저 보여 주고, 확인한 뒤에 넣는다.
 *   ④ **앞으로의 수업에는 안 붙인다.** 아직 하지 않은 수업에 과제가 달리면 학생 화면에
 *      미래 날짜가 뜬다(2026-11-02 에 그걸로 한 번 고쳤다).
 */

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { LessonVideoPicker } from '@/components/teacher/LessonVideoPicker'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx, fetchAllRows } from '@/lib/utils'
import { lessonLabel, youtubeId, type LessonVideo } from '@/lib/lessonVideos'
import { canAssignVideos, mergeVideoUrls, pickSessionFor, type SessionLite } from '@/lib/videoAssign'

interface StudentLite {
  id: string; name: string; grade: string | null; teacher_name: string | null
  is_active: boolean | null; on_leave: boolean | null
}
interface Row {
  student: StudentLite
  session: (SessionLite & { video_url: string | null }) | null
  /** 이번에 새로 들어갈 영상 */
  added: string[]
  /** 이미 들어 있어 건너뛰는 영상 */
  skipped: string[]
}

const 칩 = 'text-[10px] font-bold px-1.5 py-0.5 rounded-md'
/** 몇 날 전 수업까지 과제를 붙일 수 있나 — 그보다 오래된 수업에 붙이면 아무도 안 본다. */
const MAX_BACK_DAYS = 21
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)

export default function VideoAssignPage() {
  // ★ 보이는 학생 범위는 **다른 화면과 똑같다** (원장님 2026-11-03 「강사들에게는 본인
  //   학생만 … 중등주임은 중등전체, 다른 강사들은 본인학생만」).
  //   그 판단은 canViewStudent 한 곳에만 있다 — 여기서 따로 만들지 않는다.
  //   adminMode·supervisorMode 를 같이 본다: 모드를 바꾸면 **명단을 다시 읽어야** 한다.
  //   안 그러면 강사모드로 바꿔도 아까 읽어 둔 전체 명단이 그대로 남는다.
  const { currentUser, canViewStudent, adminMode, supervisorMode, supervisorLabel } = useAuth()
  const 쓸수있나 = canAssignVideos(currentUser)

  const [students, setStudents] = useState<StudentLite[]>([])
  const [sessionsOf, setSessionsOf] = useState<Map<string, (SessionLite & { video_url: string | null })[]>>(new Map())
  const [videos, setVideos] = useState<LessonVideo[]>([])
  const [loading, setLoading] = useState(true)

  const [picked, setPicked] = useState<string[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [baseDate, setBaseDate] = useState(kstToday())
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [grade, setGrade] = useState('')
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ 넣음: number; 건너뜀: number; 실패: string[] } | null>(null)

  useEffect(() => {
    if (!쓸수있나) { setLoading(false); return }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [쓸수있나, adminMode, supervisorMode])

  async function load() {
    setLoading(true)
    try {
      // 재원생만. 휴원생은 과제를 받을 수 없다.
      const all = await fetchAllRows<StudentLite>(() => supabase.from('students')
        .select('id, name, grade, teacher_name, is_active, on_leave, is_test')
        .eq('is_active', true).order('id'))
      const mine = all.filter((s) => !s.on_leave && canViewStudent(s))
      setStudents(mine)

      // 최근 수업만 읽는다 — 과제를 붙일 수업은 늘 최근 것이다.
      const from = new Date(Date.now() + 9 * 3600_000 - MAX_BACK_DAYS * 86400_000).toISOString().slice(0, 10)
      const ids = mine.map((s) => s.id)
      const chunks: string[][] = []
      for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
      const rows = (await Promise.all(chunks.map((c) => fetchAllRows<SessionLite & { student_id: string; video_url: string | null }>(
        () => supabase.from('class_sessions').select('id, student_id, session_date, video_url')
          .in('student_id', c).gte('session_date', from).order('id'))))).flat()
      const map = new Map<string, (SessionLite & { video_url: string | null })[]>()
      for (const r of rows) map.set(r.student_id, [...(map.get(r.student_id) ?? []), r])
      setSessionsOf(map)

      const lv = await fetchAllRows<LessonVideo>(() => supabase.from('lesson_videos')
        .select('*').eq('is_active', true).not('youtube_id', 'is', null).order('id'))
      setVideos(lv)
    } finally { setLoading(false) }
  }

  const videoByYt = useMemo(() => {
    const m: Record<string, LessonVideo> = {}
    for (const v of videos) if (v.youtube_id) m[v.youtube_id] = v
    return m
  }, [videos])

  const grades = useMemo(() =>
    [...new Set(students.map((s) => s.grade).filter(Boolean) as string[])].sort(), [students])

  const 보이는학생 = useMemo(() => students.filter((s) =>
    (!grade || s.grade === grade) && (!q.trim() || s.name.includes(q.trim()))), [students, grade, q])

  /** 누구의 어느 수업에 무엇이 붙는지 — 저장하기 전에 그대로 보여 준다. */
  const plans: Row[] = useMemo(() => 보이는학생
    .filter((s) => chosen.has(s.id))
    .map((student) => {
      const ses = pickSessionFor(baseDate, sessionsOf.get(student.id) ?? [])
      if (!ses) return { student, session: null, added: [], skipped: [] }
      const full = (sessionsOf.get(student.id) ?? []).find((x) => x.id === ses.id)!
      const r = mergeVideoUrls(full.video_url, picked)
      return { student, session: full, added: r.added, skipped: r.skipped }
    }), [보이는학생, chosen, baseDate, sessionsOf, picked])

  const 넣을것 = plans.filter((p) => p.session && p.added.length)
  const 수업없음 = plans.filter((p) => !p.session)
  const 이미있음 = plans.filter((p) => p.session && !p.added.length)

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const 전체고르기 = () => setChosen((prev) => {
    const next = new Set(prev)
    const 다골랐나 = 보이는학생.every((s) => next.has(s.id))
    for (const s of 보이는학생) { if (다골랐나) next.delete(s.id); else next.add(s.id) }
    return next
  })

  /** 고른 대로 넣는다. 한 명이 실패해도 나머지는 계속 간다. */
  async function handleSave() {
    if (!넣을것.length) return
    if (!confirm(`${넣을것.length}명의 학습일지 과제에 영상 ${picked.length}개를 넣습니다. 계속할까요?`)) return
    setSaving(true)
    let 넣음 = 0
    const 실패: string[] = []
    for (const p of 넣을것) {
      try {
        const r = mergeVideoUrls(p.session!.video_url, picked)
        const { error } = await supabase.from('class_sessions')
          .update({ video_url: r.urls.join('\n') }).eq('id', p.session!.id)
        if (error) throw new Error(error.message)
        넣음++
      } catch (e: any) { 실패.push(`${p.student.name} — ${e?.message ?? '실패'}`) }
    }
    setSaving(false)
    setDone({ 넣음, 건너뜀: 이미있음.length, 실패 })
    setChosen(new Set())
    await load()
  }

  if (!쓸수있나) {
    return (
      <div className="min-h-screen" style={{ background: '#F0FBF7' }}>
        <Header title="영상과제 배부" showBack />
        <div className="p-4">
          <div className="rounded-2xl p-4 text-sm" style={{ background: 'white', border: '1px solid #e5e7eb', color: '#6b7280' }}>
            아직 일부 선생님만 쓰는 화면이에요 (테스트 중). 필요하시면 원장님께 말씀해 주세요.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: '#F0FBF7' }}>
      <Header title="영상과제 배부" subtitle="여러 학생에게 한 번에 · 학습일지 과제로 바로 들어가요" showBack />
      <div className="p-4 space-y-4">

        {/* ① 영상 고르기 */}
        <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #e5e7eb' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-gray-800">① 어떤 영상을 낼까요</p>
            <button onClick={() => setShowPicker(true)}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg"
              style={{ background: '#EAF3DE', color: '#3B6D11', border: '1px solid #9FE1CB' }}>
              강의 고르기
            </button>
          </div>
          {showPicker && (
            <LessonVideoPicker picked={picked}
              onPick={(url) => setPicked((prev) => [...prev.filter((u) => u.trim()), url])}
              onUnpick={(url) => setPicked((prev) => {
                const id = youtubeId(url)
                return prev.filter((u) => (id ? youtubeId(u) !== id : u.trim() !== url))
              })}
              onClose={() => setShowPicker(false)} />
          )}
          {picked.length === 0 ? (
            <p className="text-xs text-gray-400">아직 고른 영상이 없어요.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((u) => {
                const v = videoByYt[youtubeId(u) ?? '']
                return (
                  <span key={u} className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1.5"
                    style={{ background: '#EAF3DE', color: '#27500A' }}>
                    {v ? `${v.grade} ${lessonLabel(v)}` : u}
                    <button onClick={() => setPicked((prev) => prev.filter((x) => x !== u))}
                      className="text-green-700/50 hover:text-red-500">✕</button>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* ② 학생 고르기 */}
        <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #e5e7eb' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-800">② 누구에게 낼까요</p>
            <label className="text-xs text-gray-500 flex items-center gap-1.5">
              기준 날짜
              <input type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value || kstToday())}
                className="px-2 py-1 rounded-lg border border-gray-200 text-xs" />
            </label>
          </div>
          <p className="text-[11px] text-gray-400 mb-2">
            기준 날짜까지의 <b>가장 최근 수업</b>에 붙습니다. 학습일지에서 하나씩 넣는 것과 같은 자리예요.
          </p>
          {/* ★ 어떤 범위가 보이는지 적어 둔다 — 「왜 그 학생이 없지」를 묻지 않아도 되게. */}
          <p className="text-[11px] mb-2" style={{ color: '#3B6D11' }}>
            <i className="ti ti-users align-[-0.125em]" />{' '}
            {supervisorLabel() ? `${supervisorLabel()} 범위` : '내 담당 학생'} {students.length}명이 보여요
          </p>

          <div className="flex flex-wrap gap-1.5 mb-2">
            <button onClick={() => setGrade('')} className={cx(칩, grade === '' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>전체</button>
            {grades.map((g) => (
              <button key={g} onClick={() => setGrade(g === grade ? '' : g)}
                className={cx(칩, g === grade ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500')}>{g}</button>
            ))}
          </div>
          <div className="flex gap-2 mb-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름으로 찾기"
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" />
            <button onClick={전체고르기} className="text-xs font-semibold px-3 py-2 rounded-xl border border-gray-300 bg-white text-gray-600 whitespace-nowrap">
              {보이는학생.every((s) => chosen.has(s.id)) && 보이는학생.length > 0 ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          {loading ? <p className="text-xs text-gray-400">읽는 중…</p> : (
            <div className="max-h-80 overflow-y-auto space-y-1">
              {보이는학생.map((s) => {
                const ses = pickSessionFor(baseDate, sessionsOf.get(s.id) ?? [])
                const 이미 = ses && picked.length
                  ? mergeVideoUrls((sessionsOf.get(s.id) ?? []).find((x) => x.id === ses.id)?.video_url, picked).added.length === 0
                  : false
                return (
                  <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} />
                    <span className="text-sm text-gray-800">{s.name}</span>
                    <span className="text-[11px] text-gray-400">{s.grade} · {s.teacher_name}</span>
                    <span className="ml-auto text-[11px]">
                      {!ses ? <span className="text-amber-700">최근 수업 없음</span>
                        : 이미 ? <span className="text-gray-400">이미 있음 · {ses.session_date}</span>
                        : <span className="text-gray-500">{ses.session_date} 수업에</span>}
                    </span>
                  </label>
                )
              })}
              {보이는학생.length === 0 && <p className="text-xs text-gray-400">해당하는 학생이 없어요.</p>}
            </div>
          )}
        </div>

        {/* ③ 확인하고 넣기 */}
        {chosen.size > 0 && (
          <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #e5e7eb' }}>
            <p className="text-sm font-bold text-gray-800 mb-2">③ 이렇게 들어갑니다</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className={cx(칩, 'bg-green-50 text-green-700')}>넣기 {넣을것.length}명</span>
              <span className={cx(칩, 'bg-gray-100 text-gray-600')}>이미 있음 {이미있음.length}명</span>
              <span className={cx(칩, 'bg-amber-50 text-amber-700')}>수업 없음 {수업없음.length}명</span>
            </div>
            {수업없음.length > 0 && (
              <p className="text-[11px] text-amber-700 mb-2">
                {수업없음.map((p) => p.student.name).join(', ')} — {MAX_BACK_DAYS}일 안에 수업 기록이 없어 넣지 않아요.
              </p>
            )}
            <button onClick={handleSave} disabled={saving || !넣을것.length || !picked.length}
              className="w-full text-sm font-bold py-2.5 rounded-xl disabled:opacity-40"
              style={{ background: '#9FE1CB', color: '#0f3d2e' }}>
              {saving ? '넣는 중…' : `${넣을것.length}명에게 영상 ${picked.length}개 넣기`}
            </button>
          </div>
        )}

        {done && (
          <div className="rounded-2xl p-4" style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC' }}>
            <p className="text-xs font-bold" style={{ color: '#166534' }}>
              끝났어요 — {done.넣음}명에게 넣었어요 {done.건너뜀 > 0 && `· 이미 있어 건너뛴 ${done.건너뜀}명`}
            </p>
            {done.실패.length > 0 && (
              <div className="mt-2 text-[11px] text-red-600">
                <p className="font-bold">실패 {done.실패.length}건</p>
                {done.실패.map((f, i) => <p key={i}>{f}</p>)}
              </div>
            )}
            <p className="text-[11px] mt-2" style={{ color: '#3B6D11' }}>
              학습일지 그 수업의 「영상 과제」 칸에 들어갔어요. 학생 화면과 학부모 브리핑에도 그대로 나갑니다.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
