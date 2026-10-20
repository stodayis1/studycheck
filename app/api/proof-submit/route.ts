// 증명 백지 제출 — 학생이 증명 영상을 다 본 뒤, 백지에 직접 쓴 증명 사진(최대 3장)을 낸다. 채점 없음.
// 학생은 이 API 로만 낸다(표·보관함에 직접 못 씀). 여기서 「내 과제인지 · 영상을 다 봤는지」를 확인한다.
//   POST multipart: sessionId, videoUrl, photos(1~3, jpeg/png/webp, 각 5MB 이하)
// 사진: proof-photos/<student_id>/<session_id>/<n>.jpg (비공개 — 선생님·그 학생 학부모만 열림)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MAX = 3
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const db = createClient(url, key, { auth: { persistSession: false } })

  // 누가 냈나 — 학생 익명 로그인 토큰 → students.session_uid
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  const { data: au } = await db.auth.getUser(token)
  if (!au?.user) return NextResponse.json({ error: '다시 로그인해 주세요.' }, { status: 401 })
  const { data: student } = await db.from('students').select('id').eq('session_uid', au.user.id).maybeSingle()
  if (!student) return NextResponse.json({ error: '학생 계정으로 들어와 주세요.' }, { status: 403 })

  const form = await req.formData()
  const sessionId = String(form.get('sessionId') ?? '')
  const videoUrl = String(form.get('videoUrl') ?? '')
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  if (!photos.length) return NextResponse.json({ error: '사진을 골라 주세요.' }, { status: 400 })
  if (photos.length > MAX) return NextResponse.json({ error: `사진은 ${MAX}장까지 낼 수 있어요.` }, { status: 400 })
  for (const p of photos) {
    if (!TYPES.includes(p.type)) return NextResponse.json({ error: '사진(jpg·png)만 낼 수 있어요.' }, { status: 400 })
    if (p.size > 5 * 1024 * 1024) return NextResponse.json({ error: '사진 한 장이 너무 커요(5MB까지).' }, { status: 400 })
  }

  // 내 과제가 맞나 — 그 수업의 영상 과제에 이 링크가 있어야 하고, 증명 강의여야 한다
  const { data: session } = await db.from('class_sessions').select('id, student_id, video_url').eq('id', sessionId).maybeSingle()
  if (!session || session.student_id !== student.id) return NextResponse.json({ error: '내 과제가 아니에요.' }, { status: 403 })
  const urls = String(session.video_url ?? '').split('\n').map((u) => u.trim())
  if (!urls.includes(videoUrl)) return NextResponse.json({ error: '과제에 없는 영상이에요.' }, { status: 400 })
  const yt = videoUrl.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1]
  const { data: lesson } = await db.from('lesson_videos').select('id, kind').eq('youtube_id', yt ?? '').maybeSingle()
  if (!lesson || lesson.kind !== '증명') return NextResponse.json({ error: '증명 영상 과제만 사진을 내요.' }, { status: 400 })

  // 영상을 다 봤나 — 시청 기록의 완료(90% 이상)
  const { data: log } = await db.from('video_watch_logs').select('completed_at')
    .eq('student_id', student.id).eq('session_id', sessionId).eq('video_url', videoUrl).maybeSingle()
  if (!log?.completed_at) return NextResponse.json({ error: '영상을 끝까지 본 다음에 낼 수 있어요.' }, { status: 400 })

  // 올리기 — 다시 내면 같은 자리를 덮어쓴다
  const paths: string[] = []
  for (let i = 0; i < photos.length; i++) {
    const path = `${student.id}/${sessionId}/${i + 1}-${Date.now()}.jpg`
    const { error } = await db.storage.from('proof-photos').upload(path, Buffer.from(await photos[i].arrayBuffer()), { contentType: photos[i].type, upsert: true })
    if (error) return NextResponse.json({ error: '사진을 올리지 못했어요. 다시 해 주세요.' }, { status: 500 })
    paths.push(path)
  }
  const { data: old } = await db.from('proof_submissions').select('photo_paths')
    .eq('student_id', student.id).eq('session_id', sessionId).eq('video_url', videoUrl).maybeSingle()
  const { error: e2 } = await db.from('proof_submissions').upsert({
    student_id: student.id, session_id: sessionId, lesson_video_id: lesson.id, video_url: videoUrl,
    photo_paths: paths, submitted_at: new Date().toISOString(),
  }, { onConflict: 'student_id,session_id,video_url' })
  if (e2) return NextResponse.json({ error: '제출을 저장하지 못했어요.' }, { status: 500 })
  if (old?.photo_paths?.length) await db.storage.from('proof-photos').remove(old.photo_paths)   // 예전 사진은 지운다
  return NextResponse.json({ ok: true, count: paths.length })
}
