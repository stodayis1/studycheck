'use client'

// 학생: 학습일지 영상 과제를 스터디체크 안에서 본다.
// 창을 열어 둔 시간이 아니라 **실제로 재생된 초**를 센다 — 건너뛴 곳은 안 세고, 다른 앱으로 가 있던 시간은 따로 센다.
// 영상의 90% 이상을 실제로 보면 「시청 완료」(video_watch_logs.completed_at). 그날 영상을 다 보면 학습일지에도 완료 표시.

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { youtubeId, mergeRanges, coveredSeconds, fmtDuration, COMPLETE_PCT, type LessonVideo } from '@/lib/lessonVideos'
import { nameCallText, nameCallUrl, type NameCallKey } from '@/lib/nameCalls'

declare global { interface Window { YT: any; onYouTubeIframeAPIReady?: () => void } }

type Log = {
  id?: string; watch_seconds: number; covered_seconds: number; coverage_pct: number; played_seconds: number
  focus_lost_seconds: number; scene_seconds: Record<string, number>; watched_ranges: [number, number][]; completed_at: string | null
}

function loadYouTubeApi(): Promise<any> {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script'); s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(s)
    }
  })
}

export default function WatchPage({ params }: { params: Promise<{ sessionId: string; idx: string }> }) {
  const { sessionId, idx } = use(params)
  const router = useRouter()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [sessionDate, setSessionDate] = useState('')
  const [allUrls, setAllUrls] = useState<string[]>([])
  const [lesson, setLesson] = useState<LessonVideo | null>(null)
  const [log, setLog] = useState<Log | null>(null)
  const [duration, setDuration] = useState(0)
  const [now, setNow] = useState(0)
  const [error, setError] = useState('')
  const player = useRef<any>(null)
  const logRef = useRef<Log | null>(null)
  const lastT = useRef<number | null>(null)
  const dirty = useRef(false)
  const saveRef = useRef<(force?: boolean) => void>(() => {})
  // 이름 부르기: 정해 둔 순간에 영상 소리를 줄이고 원장님 목소리로 「○○아, …」 (한 번 본 말은 다시 안 함)
  const [studentName, setStudentName] = useState('')
  const [bubble, setBubble] = useState<string | null>(null)
  const fired = useRef<Set<string>>(new Set())
  const awayCount = useRef(0)
  const hiddenSince = useRef<number | null>(null)
  const pausedSince = useRef<number | null>(null)
  const voice = useRef<HTMLAudioElement | null>(null)

  // 1) 과제·강의·지난 기록 읽기
  useEffect(() => {
    const stored = sessionStorage.getItem('studycheck_student')
    if (!stored) { router.push('/auth/login'); return }
    const sid = JSON.parse(stored).id as string
    setStudentId(sid)
    setStudentName(JSON.parse(stored).name || '')
    ;(async () => {
      const { data: s } = await supabase.from('class_sessions').select('id, session_date, video_url, student_id')
        .eq('id', sessionId).eq('student_id', sid).single()
      const urls = (s?.video_url || '').split('\n').map((u: string) => u.trim()).filter(Boolean)
      const u = urls[Number(idx)]
      if (!s || !u || !youtubeId(u)) { setError('영상을 찾을 수 없어요.'); return }
      setUrl(u); setAllUrls(urls); setSessionDate(s.session_date)
      const yt = youtubeId(u)!
      const [{ data: lv }, { data: lg }] = await Promise.all([
        supabase.from('lesson_videos').select('*').eq('youtube_id', yt).maybeSingle(),
        supabase.from('video_watch_logs').select('*').eq('student_id', sid).eq('session_id', sessionId).eq('video_url', u).maybeSingle(),
      ])
      if (lv) setLesson(lv as LessonVideo)
      const l: Log = {
        id: lg?.id, watch_seconds: lg?.watch_seconds ?? 0, covered_seconds: lg?.covered_seconds ?? 0,
        coverage_pct: Number(lg?.coverage_pct ?? 0), played_seconds: lg?.played_seconds ?? 0,
        focus_lost_seconds: lg?.focus_lost_seconds ?? 0, scene_seconds: lg?.scene_seconds ?? {},
        watched_ranges: lg?.watched_ranges ?? [], completed_at: lg?.completed_at ?? null,
      }
      logRef.current = l; setLog(l)
    })()
  }, [sessionId, idx])

  // 2) 유튜브 플레이어
  useEffect(() => {
    if (!url || !log || player.current) return
    let alive = true
    loadYouTubeApi().then((YT) => {
      if (!alive) return
      player.current = new YT.Player('yt-player', {
        videoId: youtubeId(url), playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: (e: any) => setDuration(e.target.getDuration() || lesson?.duration_seconds || 0),
          onStateChange: (e: any) => {
            if (e.data !== 1) { lastT.current = null; saveRef.current() }
            pausedSince.current = e.data === 2 ? Date.now() : null
            if (e.data === 0) callName('end')
          },
        },
      })
    })
    return () => { alive = false }
  }, [url, log])

  // 3) 1초마다: 재생 중이면 지난 위치~지금 위치를 「본 구간」에 더한다 (2.5초 넘게 뛰면 건너뛴 것 → 안 셈)
  useEffect(() => {
    const t = setInterval(() => {
      const p = player.current, l = logRef.current
      if (!p?.getPlayerState || !l) return
      const cur = p.getCurrentTime?.() ?? 0
      setNow(cur)
      cue(cur, p.getPlayerState())
      if (p.getPlayerState() !== 1) { lastT.current = null; return }
      const prev = lastT.current
      lastT.current = cur
      if (prev == null) return
      const dt = cur - prev
      if (dt <= 0 || dt > 2.5) return
      l.watched_ranges = mergeRanges([...l.watched_ranges, [prev, cur]])
      l.played_seconds += dt
      if (document.hidden) l.focus_lost_seconds += dt
      if (lesson?.scenes?.length) {
        const k = lesson.scenes.findIndex((s) => cur >= s.start && cur < s.end)
        if (k >= 0) l.scene_seconds = { ...l.scene_seconds, [k + 1]: Math.round(((l.scene_seconds[k + 1] ?? 0) + dt) * 10) / 10 }
      }
      const dur = p.getDuration?.() || duration
      l.covered_seconds = coveredSeconds(l.watched_ranges)
      l.coverage_pct = dur ? Math.min(100, Math.round((l.covered_seconds / dur) * 1000) / 10) : 0
      dirty.current = true
      setLog({ ...l })
    }, 1000)
    const s = setInterval(() => save(), 10000)
    const bye = () => save(true)
    window.addEventListener('pagehide', bye)
    document.addEventListener('visibilitychange', bye)
    return () => { clearInterval(t); clearInterval(s); window.removeEventListener('pagehide', bye); document.removeEventListener('visibilitychange', bye); save(true) }
  }, [lesson, duration, studentId, url])

  // 이름 부르기 — 언제 무슨 말을 할지
  function cue(cur: number, state: number) {
    const sc = lesson?.scenes ?? []
    if (state === 1) {
      if (cur > 1.5) callName(lesson?.kind === '증명' ? 'proof' : 'start')
      const firstConcept = sc.find((x) => x.kind === '개념')
      if (firstConcept && cur > (firstConcept.start + firstConcept.end) / 2) callName('important')
      const check = sc.find((x) => x.kind === 'check')
      if (check && cur > check.start + 1 && cur < check.end) callName('check')
      const ex = sc.find((x) => x.kind === 'examples')
      if (check && ex && cur > ex.start + 0.5) callName('answer')
    }
    // 멈춘 채 2분 넘게 화면만 켜 두면
    if (state === 2 && pausedSince.current && !document.hidden && Date.now() - pausedSince.current > 120000) callName('idle')
  }

  function callName(key: NameCallKey, again = false) {
    if (!studentId || !studentName) return
    if (!again && fired.current.has(key)) return
    fired.current.add(key)
    const p = player.current
    const vol = p?.getVolume?.() ?? 100
    const a = new Audio(nameCallUrl(studentId, key))
    voice.current?.pause(); voice.current = a
    a.onplay = () => { p?.setVolume?.(Math.max(10, Math.round(vol * 0.25))); setBubble(nameCallText(key, studentName)) }
    a.onended = a.onerror = () => { p?.setVolume?.(vol); setTimeout(() => setBubble(null), 1200) }
    a.play().catch(() => setBubble(nameCallText(key, studentName)))  // 소리가 막혀도 말풍선은 띄운다
  }

  // 다른 앱·탭에 8초 넘게 갔다 돌아오면 (재생 중이었을 때만, 최대 3번)
  useEffect(() => {
    const onVis = () => {
      const playing = player.current?.getPlayerState?.() === 1
      if (document.hidden) { if (playing) hiddenSince.current = Date.now(); return }
      if (hiddenSince.current && Date.now() - hiddenSince.current > 8000 && awayCount.current < 3) {
        awayCount.current++; callName('away', true)
      }
      hiddenSince.current = null
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [studentId, studentName])

  // 4) 저장 — 같은 날 같은 영상은 한 줄 (student_id, session_id, video_url)
  async function save(force = false) {
    const l = logRef.current
    if (!l || !studentId || !url || (!dirty.current && !force)) return
    dirty.current = false
    const nowIso = new Date().toISOString()
    const done = !l.completed_at && l.coverage_pct >= COMPLETE_PCT
    if (done) l.completed_at = nowIso
    const row = {
      student_id: studentId, session_id: sessionId, video_url: url, lesson_video_id: lesson?.id ?? null,
      duration_seconds: duration || lesson?.duration_seconds || null,
      watch_seconds: Math.round(l.played_seconds),          // 예전 칸: 이제 실제 재생 초를 넣는다
      covered_seconds: l.covered_seconds, coverage_pct: l.coverage_pct, played_seconds: Math.round(l.played_seconds),
      focus_lost_seconds: Math.round(l.focus_lost_seconds), scene_seconds: l.scene_seconds,
      watched_ranges: l.watched_ranges.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]),
      completed_at: l.completed_at, last_active_at: nowIso,
    }
    const { data } = await supabase.from('video_watch_logs')
      .upsert({ ...row, ...(l.id ? {} : { started_at: nowIso }) }, { onConflict: 'student_id,session_id,video_url' })
      .select('id').single()
    if (data?.id) l.id = data.id
    if (done) { setLog({ ...l }); await markNote(nowIso) }
  }

  saveRef.current = save

  // 그날 영상 과제를 다 봤으면 학습일지에도 완료 (학습일지가 있을 때만 — 출석을 대신 만들지 않는다)
  async function markNote(nowIso: string) {
    const { data: note } = await supabase.from('learning_notes').select('id, video_started_at, video_completed_at').eq('session_id', sessionId).maybeSingle()
    if (!note) return
    const { data: logs } = await supabase.from('video_watch_logs').select('video_url, completed_at').eq('session_id', sessionId).eq('student_id', studentId!)
    const doneUrls = new Set((logs || []).filter((x) => x.completed_at).map((x) => x.video_url))
    const all = allUrls.filter((u) => youtubeId(u)).every((u) => doneUrls.has(u))
    await supabase.from('learning_notes').update({
      video_started_at: note.video_started_at ?? nowIso,
      ...(all && !note.video_completed_at ? { video_completed_at: nowIso } : {}),
    }).eq('id', note.id)
  }

  const seek = (s: number) => { player.current?.seekTo?.(s, true); player.current?.playVideo?.() }
  const dur = duration || lesson?.duration_seconds || 0
  const pct = log?.coverage_pct ?? 0
  const resumeAt = log?.watched_ranges?.length ? mergeRanges(log.watched_ranges)[0][1] : 0

  if (error) return <div className="p-8 text-center text-sm text-gray-500">{error}</div>

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-28 space-y-3">
      <button onClick={() => { save(true); router.back() }} className="text-xs text-gray-500">← 돌아가기</button>
      <div>
        <p className="text-[11px] text-gray-400">{sessionDate} 영상 과제{lesson ? ` · ${lesson.grade} ${lesson.chapter ?? ''} › ${lesson.sub_chapter ?? ''}` : ''}</p>
        <h1 className="text-lg font-bold text-gray-900">
          {lesson ? `${lesson.order_label}. ${lesson.title}${lesson.kind === '증명' ? ' (증명)' : ''}` : '영상 과제'}
        </h1>
      </div>

      <div className="relative w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '16 / 9' }}>
        <div id="yt-player" className="absolute inset-0 w-full h-full" />
        {bubble && (
          <div className="absolute left-3 bottom-12 flex items-end gap-2 pointer-events-none">
            <img src="/exam-blog/suji_uniform_fighting.jpg" alt="" className="w-11 h-11 rounded-full object-cover object-top border-2 border-white shadow" />
            <div className="bg-white/95 text-gray-900 text-sm font-bold px-3 py-2 rounded-2xl rounded-bl-sm shadow-lg max-w-[70vw]">{bubble}</div>
          </div>
        )}
      </div>

      {/* 시청 진행 — 본 구간을 막대에 칠한다 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-gray-700">
            {log?.completed_at ? '시청 완료 ✓' : `시청 ${Math.round(pct)}% · ${COMPLETE_PCT}% 넘게 보면 완료`}
          </span>
          <span className="text-gray-400 tabular-nums">{fmtDuration(now)} / {fmtDuration(dur)}</span>
        </div>
        <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
          {dur > 0 && mergeRanges(log?.watched_ranges ?? []).map(([a, b], i) => (
            <div key={i} className="absolute top-0 h-full bg-[#E2703A]" style={{ left: `${(a / dur) * 100}%`, width: `${((b - a) / dur) * 100}%` }} />
          ))}
          {dur > 0 && <div className="absolute top-0 h-full w-0.5 bg-gray-800" style={{ left: `${(now / dur) * 100}%` }} />}
        </div>
        {resumeAt > 10 && !log?.completed_at && (
          <button onClick={() => seek(resumeAt)} className="text-xs font-bold text-[#993C1D]">이어서 보기 ({fmtDuration(resumeAt)}부터)</button>
        )}
        <p className="text-[11px] text-gray-400">건너뛴 부분은 시청 시간에 안 들어가요. 영상 속 문제는 멈추고 연습장에 풀어 보세요.</p>
      </div>

      {/* 장면 목차 */}
      {lesson?.scenes?.length ? (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          {lesson.scenes.map((s, i) => {
            const seen = log?.scene_seconds?.[i + 1] ?? 0
            const len = Math.max(1, s.end - s.start)
            const on = now >= s.start && now < s.end
            return (
              <button key={i} onClick={() => seek(s.start)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${on ? 'bg-[#FFF3EC]' : ''}`}>
                <span className="text-xs text-[#993C1D] font-bold tabular-nums w-10 shrink-0">{fmtDuration(s.start)}</span>
                <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{s.label}</span>
                <span className={`text-[11px] shrink-0 ${seen / len >= 0.9 ? 'text-green-600 font-bold' : 'text-gray-300'}`}>
                  {seen / len >= 0.9 ? '봄' : seen > 0 ? '조금' : ''}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
