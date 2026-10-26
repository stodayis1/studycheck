'use client'

// 학생: 학습일지 영상 과제를 스터디체크 안에서 본다.
// 창을 열어 둔 시간이 아니라 **실제로 재생된 초**를 센다 — 건너뛴 곳은 안 세고, 다른 앱으로 가 있던 시간은 따로 센다.
// 영상의 90% 이상을 실제로 보면 「시청 완료」(video_watch_logs.completed_at). 그날 영상을 다 보면 학습일지에도 완료 표시.

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { youtubeId, mergeRanges, coveredSeconds, fmtDuration, COMPLETE_PCT, type LessonVideo } from '@/lib/lessonVideos'
import { SOL_LINES, nameToneUrl, solLineUrl, solCallText, type SolCallKey, LEC_LINES, lecLineUrl, lecCallText, type LecCallKey, planLectureCalls, CALL_REPLIES, type CallResponse, buildQuiz, type QuizChoice, QUIZ_RATE, CIRCLED } from '@/lib/nameCalls'
import { ProofSubmitBox } from '@/components/student/ProofSubmitBox'

declare global { interface Window { YT: any; onYouTubeIframeAPIReady?: () => void } }

type Log = {
  id?: string; watch_seconds: number; covered_seconds: number; coverage_pct: number; played_seconds: number
  focus_lost_seconds: number; scene_seconds: Record<string, number>; watched_ranges: [number, number][]; completed_at: string | null
  call_responses: CallResponse[]
}

// 0.1초짜리 무음 WAV — 「강의 시작」 누를 때 한 번 틀어서 소리 재생을 열어 둔다
function silentWav(): string {
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
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
  const lessonRef = useRef<LessonVideo | null>(null)          // 유튜브·화면 이벤트(처음 만든 함수)에서 지금 강의를 읽으려고
  lessonRef.current = lesson
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
  // 브라우저는 「이 페이지를 누른 뒤」에만 소리를 틀게 한다. 유튜브 화면 안을 누른 건 안 쳐 준다
  // → 「강의 시작」을 한 번 누르게 해서 그때 소리 상자를 열어 두고, 이름 부르기는 그 상자로 튼다 (아이폰도 이래야 난다)
  const [started, setStarted] = useState(false)
  // 이름을 부르면 대답 버튼을 띄우고, 누를 때까지 영상은 멈춰 둔다 (원장님 2026-10-21)
  // 풀이 영상의 「먼저 풀어 봐」도 여기서 「다 풀었어요」를 눌러야 풀이가 이어진다
  type Ask = { tag: string; replies: string[]; askedAt: number; at: number; resume: (answer: string) => void; quiz?: boolean }
  const [ask, setAsk] = useState<Ask | null>(null)
  const askRef = useRef<Ask | null>(null)
  const [nudge, setNudge] = useState(false)
  const isSol = lesson?.kind === '대표예제'
  // 객관식: 이 영상을 열 때 한 번 정한다 — 절반쯤만 보기가 나온다 (원장님 2026-10-24: 랜덤으로)
  const quiz = useRef<{ choices: QuizChoice[]; picked?: QuizChoice } | null | undefined>(undefined)
  function quizNow() {
    if (quiz.current === undefined) quiz.current = isSol && lesson?.quiz?.answer && Math.random() < QUIZ_RATE ? { choices: buildQuiz(lesson.quiz, studentName) } : null
    return quiz.current
  }

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
        call_responses: lg?.call_responses ?? [],
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
            if (e.data === 0) { if (lessonRef.current?.kind === '대표예제') callSol('end'); else callLec('end') }
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

  // 이름 부르기 — 언제 무슨 말을 할지.
  // 설명과 겹치지 않게: 장면이 바뀌기 직전 쉼(장면 끝 0.45초 무음) 안에서 영상을 멈추고, 말이 끝나면 이어서 재생한다.
  // (원장님 확인 2026-10-20: 설명 중간에 겹쳐 나왔다)
  function cue(cur: number, state: number) {
    const sc = lesson?.scenes ?? []
    const justBefore = (x?: { start: number }) => !!x && cur >= x.start - 0.42 && cur < x.start + 0.05
    if (isSol) {
      // 장면 2 = 「먼저 혼자 풀어 봐」 → 그 장면이 끝나는 쉼에서 멈추고 이름을 부른 뒤 멈춘 채로 기다린다
      if (state === 1 && sc.length > 3 && justBefore(sc[2])) callSol('try', { hold: true })
      // 마지막 장면(정리) 직전 = 답이 다 나온 뒤 → 「답 맞았어?」
      if (state === 1 && sc.length > 3 && justBefore(sc[sc.length - 1])) {
        const pk = quiz.current?.picked
        if (pk) callSol(pk.right ? 'right' : 'wrong', { tag: 'sol:answer', scene: 3, extra: pk.right ? '' : ` 정답은 ${lesson?.quiz?.answer}` })
        else callSol('answer')
      }
      if (state === 2 && !askRef.current && pausedSince.current && !document.hidden && Date.now() - pausedSince.current > 120000) callSol('idle')
      return
    }
    // 개념 영상: 어느 장면 앞에서 무슨 말을 할지는 강의마다 다르다 (lib/nameCalls.ts planLectureCalls)
    if (state === 1 && lesson?.kind === '개념') {
      for (const c of lecPlan) if (justBefore(sc[c.scene])) callLec(c.key, { tag: 'lec:' + c.key + '@' + c.scene, scene: c.scene })
    }
    // 멈춘 채 2분 넘게 화면만 켜 두면
    if (state === 2 && !askRef.current && pausedSince.current && !document.hidden && Date.now() - pausedSince.current > 120000) callLec('idle')
  }
  const lecPlan = lesson?.kind === '개념' && lesson.scenes?.length ? planLectureCalls(lesson.id, lesson.scenes) : []

  // 풀이 영상용: 학생 이름(말투 하나) → 0.12초 → 여럿이 같이 쓰는 문장. 문장은 그때그때 고르고 바로 전에 쓴 것은 피한다
  const lastLine = useRef<Record<string, number>>({})
  type CallOpt = { again?: boolean; hold?: boolean; after?: () => void; tag?: string; scene?: number; extra?: string }
  function callSol(key: SolCallKey, opt: CallOpt = {}) { callLine('sol', key, opt) }
  // 개념·증명 영상: 같은 방식(이름 → 문장)인데 문장 표가 따로다 (원장님 2026-10-24: 매번 같은 말이면 지루하다)
  function callLec(key: LecCallKey, opt: CallOpt = {}) { callLine('lec', key, opt) }
  function callLine(table: 'sol' | 'lec', key: string, opt: CallOpt) {
    if (!studentId || !studentName) { opt.after?.(); return }
    const tag = table + ':' + key
    const once = opt.tag ?? tag
    if (!opt.again && fired.current.has(once)) { opt.after?.(); return }
    fired.current.add(once)
    const p = player.current
    const wasPlaying = p?.getPlayerState?.() === 1
    if (wasPlaying || opt.hold) p?.pauseVideo?.()
    const { tone, lines } = (table === 'sol' ? SOL_LINES[key as SolCallKey] : LEC_LINES[key as LecCallKey]) as { tone: 'call' | 'soft'; lines: readonly string[] }
    const mem = `sc_${table}_${key}`
    let prev = lastLine.current[mem]
    try { if (prev == null) prev = Number(localStorage.getItem(mem) ?? -1) } catch {}
    let n = Math.floor(Math.random() * lines.length)
    if (lines.length > 1 && n === prev) n = (n + 1) % lines.length
    lastLine.current[mem] = n
    try { localStorage.setItem(mem, String(n)) } catch {}
    const text = (table === 'sol' ? solCallText(key as SolCallKey, n, studentName) : lecCallText(key as LecCallKey, n, studentName)) + (opt.extra ?? '')
    const lineUrl = table === 'sol' ? solLineUrl(key as SolCallKey, n) : lecLineUrl(key as LecCallKey, n)
    const a = voice.current ?? (voice.current = new Audio())
    a.pause()
    // 「먼저 풀어 봐」(hold)는 「다 풀었어요」를 누르면 「같이 맞춰 보자」 하고 풀이를 튼다
    // 「여기까지 이해됐어?」에 「한 번 더 볼래요」면 앞 장면 처음부터 다시 튼다
    const q = tag === 'sol:try' ? quizNow() : null
    const done = () => openAsk(tag, (answer) => {
      if (opt.hold) callSol('back', { again: true, after: () => player.current?.playVideo?.() })
      else if (answer === '한 번 더 볼래요' && opt.scene != null && lessonRef.current?.scenes?.[opt.scene - 1]) {
        p?.seekTo?.(lessonRef.current.scenes[opt.scene - 1].start, true); p?.playVideo?.()
      } else if (wasPlaying) p?.playVideo?.()
      opt.after?.()
    }, q ? q.choices.map((c) => c.text) : undefined)
    let part = 0
    a.onplay = () => setBubble(text)
    a.onerror = () => { if (part === 0) { part = 1; a.src = lineUrl; a.play().catch(done) } else done() }
    a.onended = () => {
      if (part === 0) { part = 1; setTimeout(() => { a.src = lineUrl; a.play().catch(done) }, 120) }
      else done()
    }
    a.src = nameToneUrl(studentId, tone)
    a.play().catch(() => { setBubble(text); setTimeout(done, 2600) })
  }

  function pushResp(r: CallResponse) {
    const l = logRef.current; if (!l) return
    l.call_responses = [...(l.call_responses ?? []), r]
    dirty.current = true; saveRef.current(true)
  }
  function openAsk(tag: string, resume: (answer: string) => void, choices?: string[]) {
    const replies = choices ?? CALL_REPLIES[tag]
    if (!replies) { setTimeout(() => setBubble(null), 900); resume(''); return }
    const a: Ask = { tag, replies, askedAt: Date.now(), at: Math.round((player.current?.getCurrentTime?.() ?? 0) * 10) / 10, resume, quiz: !!choices }
    askRef.current = a; setAsk(a); setNudge(false)
    setTimeout(() => {                                  // 15초 안에 안 누르면 무응답으로 한 번 적고 말풍선을 흔든다
      if (askRef.current !== a) return
      pushResp({ key: tag, at: a.at, answer: null, noanswer: true, ts: new Date().toISOString() }); setNudge(true)
    }, 15000)
  }
  function reply(answer: string) {
    const a = askRef.current; if (!a) return
    const q = a.quiz ? quiz.current : null
    const c = q?.choices.find((x) => x.text === answer)
    if (q && c?.fun) {
      // 엉뚱한 보기: 웃고 나서 그 보기를 빼고 다시 고르게 한다 (기록은 남긴다)
      pushResp({ key: 'sol:quiz-fun', at: a.at, answer, ms: Date.now() - a.askedAt, ts: new Date().toISOString() })
      q.choices = q.choices.filter((x) => x !== c)
      askRef.current = null; setAsk(null); setNudge(false)
      callSol('fun', { again: true, after: () => openAsk(a.tag, a.resume, q.choices.map((x) => x.text)) })
      return
    }
    if (q && c) q.picked = c
    pushResp({ key: q ? 'sol:quiz' : a.tag, at: a.at, answer, ms: Date.now() - a.askedAt, ts: new Date().toISOString(), ...(q && c ? { correct: !!c.right } : {}) })
    askRef.current = null; setAsk(null); setNudge(false); setBubble(null); pausedSince.current = null
    a.resume(answer)
  }

  // 장면 경계를 놓치지 않게 0.2초마다 본다 (쉼이 0.45초라 1초 간격이면 지나친다)
  useEffect(() => {
    const t = setInterval(() => {
      const p = player.current
      if (!p?.getPlayerState || !started) return
      cue(p.getCurrentTime?.() ?? 0, p.getPlayerState())
    }, 200)
    return () => clearInterval(t)
  }, [lesson, studentId, studentName, started])

  // 다른 앱·탭에 8초 넘게 갔다 돌아오면 (재생 중이었을 때만, 최대 3번)
  useEffect(() => {
    const onVis = () => {
      const playing = player.current?.getPlayerState?.() === 1
      if (document.hidden) { if (playing) hiddenSince.current = Date.now(); return }
      if (hiddenSince.current && Date.now() - hiddenSince.current > 8000 && awayCount.current < 3) {
        awayCount.current++; if (lessonRef.current?.kind === '대표예제') callSol('away', { again: true }); else callLec('away', { again: true })
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
      completed_at: l.completed_at, last_active_at: nowIso, call_responses: l.call_responses ?? [],
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

  // 「강의 시작」: 이 누름으로 소리 상자를 연다 (무음을 한 번 틀어 둠) → 그다음 영상 재생
  function start() {
    const a = voice.current ?? (voice.current = new Audio())
    a.src = silentWav()
    a.play().catch(() => {})
    setStarted(true)
    // 시작 인사를 먼저 하고 영상을 튼다 (증명 영상은 「노트 펴고 같이 써야지」)
    if (isSol) callSol('start', { after: () => player.current?.playVideo?.() })
    else callLec(lesson?.kind === '증명' ? 'proof' : 'start', { after: () => player.current?.playVideo?.() })
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
          {lesson ? `${lesson.order_label}. ${lesson.title}${lesson.kind === '증명' ? ' (증명)' : lesson.kind === '대표예제' ? ' (문제풀이)' : ''}` : '영상 과제'}
        </h1>
      </div>

      <div className="relative w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '16 / 9' }}>
        <div id="yt-player" className="absolute inset-0 w-full h-full" />
        {!started && (
          <button onClick={start}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
            <span className="w-16 h-16 rounded-full bg-[#E2703A] flex items-center justify-center text-3xl pl-1">▶</span>
            <span className="text-sm font-bold">강의 시작</span>
            <span className="text-[11px] text-white/70">소리를 켜고 들어 주세요</span>
          </button>
        )}
        {ask && (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 p-3 bg-gradient-to-t from-black/70 to-transparent">
            {ask.replies.map((r, i) => (
              <button key={r} onClick={() => reply(r)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg ${ask.quiz ? 'bg-white text-gray-900' : r === '틀렸어요' ? 'bg-white text-gray-800' : 'bg-[#E2703A] text-white'} ${nudge ? 'animate-bounce' : ''}`}>
                {ask.quiz ? `${CIRCLED[i]} ${r}` : r}
              </button>
            ))}
          </div>
        )}
        {bubble && (
          <div className={`absolute left-3 ${ask?.quiz ? 'bottom-32' : ask ? 'bottom-20' : 'bottom-12'} flex items-end gap-2 pointer-events-none ${nudge ? 'animate-pulse' : ''}`}>
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

      {/* 증명 영상: 다 본 뒤 백지에 써서 사진 제출 (채점 없음) */}
      {lesson?.kind === '증명' && studentId && url && (
        <ProofSubmitBox studentId={studentId} sessionId={sessionId} videoUrl={url} watched={!!log?.completed_at} formula={/공식.*써 보기/.test(lesson.title)} />
      )}

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
