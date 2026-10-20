/**
 * 학생 이름 부르기 소리 — 원장님 목소리(ElevenLabs 복제)로 학생마다 짧은 말 8개를 만들어 Storage 에 올린다.
 *
 *   node scripts/lesson-video/name_calls.mjs [--only <학생id>] [--force] [--dry]
 *
 * · ElevenLabs 에는 「다윤아, 노트 펴고 같이 써야지.」 같은 문장 글자만 보낸다 (성·학교·연락처 등 다른 정보 없음 — 원장님 허락 2026-10-20)
 * · 저장: Storage 버킷 name-calls / v1/<student_id>/<key>.mp3  — 학생 시청 화면이 이 주소로 바로 틀어 준다
 * · 이미 있으면 건너뛴다(새 학생만 만든다). 문장을 바꾸면 VERSION 을 올려 다시 만든다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const force = args.includes('--force'), dry = args.includes('--dry')

export const VERSION = 'v1'
export const BUCKET = 'name-calls'
const VOICE = 'mbwQpKqHamJOPuXJoCPc'
// 문장 — ○ 자리에 「다윤아/지우야」가 들어간다. lib/nameCalls.ts 의 KEYS 와 같아야 한다.
const LINES = {
  start:     '○, 오늘도 같이 해 보자!',
  important: '○, 여기 중요해. 잘 봐.',
  check:     '○, 영상 멈추고 연습장에 풀어 봐.',
  answer:    '○, 다 맞혔어? 틀린 건 꼭 다시 풀어.',
  proof:     '○, 노트 펴고 같이 써야지.',
  away:      '○, 어디 갔어? 다시 화면 봐.',
  idle:      '○, 졸지 말고~',
  end:       '○, 오늘도 수고했어!',
}

// 부를 이름: 성을 뺀다 (세 글자 → 뒤 두 글자). 두 글자는 그대로, 뒤에 붙은 숫자·영문은 뗀다.
const OVERRIDE = { '호킨슨제레미': '제레미', '호킨슨루시리': '루시리' }
const DOUBLE_SURNAME = ['남궁', '제갈', '선우', '황보', '독고', '사공', '서문']
export function callName(full) {
  const raw = (full || '').replace(/[^가-힣]/g, '')
  if (OVERRIDE[raw]) return OVERRIDE[raw]
  if (raw.length <= 2) return raw
  if (raw.length >= 4 && DOUBLE_SURNAME.includes(raw.slice(0, 2))) return raw.slice(2)
  return raw.slice(1)
}
// 받침 있으면 「아」, 없으면 「야」
export function vocative(name) {
  const c = name.charCodeAt(name.length - 1) - 0xac00
  return name + (c >= 0 && c < 11172 && c % 28 !== 0 ? '아' : '야')
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function ensureBucket() {
  const { data } = await db.storage.getBucket(BUCKET)
  if (data) return
  const { error } = await db.storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ['audio/mpeg'], fileSizeLimit: '1MB' })
  if (error) throw error
  console.log('버킷 만듦:', BUCKET)
}

async function tts(text) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', language_code: 'ko',
        voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true } }),
    })
    if (r.ok) return Buffer.from(await r.arrayBuffer())
    const body = await r.text()
    if (r.status === 429 && !body.includes('quota')) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue }
    throw new Error(`ElevenLabs ${r.status}: ${body.slice(0, 200)}`)
  }
}

let q = db.from('students').select('id, name').eq('is_active', true)
if (only) q = q.eq('id', only)
const { data: students, error } = await q
if (error) throw error
console.log(`학생 ${students.length}명 × ${Object.keys(LINES).length}문장`)
if (dry) { for (const s of students.slice(0, 8)) console.log(s.name, '→', vocative(callName(s.name))); process.exit(0) }
await ensureBucket()

let made = 0, skipped = 0, failed = 0
async function one(s) {
  const who = vocative(callName(s.name))
  const { data: have } = await db.storage.from(BUCKET).list(`${VERSION}/${s.id}`)
  const exist = new Set((have || []).map((f) => f.name))
  for (const [key, line] of Object.entries(LINES)) {
    const path = `${VERSION}/${s.id}/${key}.mp3`
    if (!force && exist.has(`${key}.mp3`)) { skipped++; continue }
    try {
      const mp3 = await tts(line.replace('○', who))
      const { error: e } = await db.storage.from(BUCKET).upload(path, mp3, { contentType: 'audio/mpeg', upsert: true })
      if (e) throw e
      made++
    } catch (e) { failed++; console.log('실패', s.id, key, e.message) }
  }
}
// 동시에 3명까지 (ElevenLabs 동시 요청 한도)
const queue = [...students]
await Promise.all([0, 1, 2].map(async () => { while (queue.length) await one(queue.shift()) }))
console.log(`만듦 ${made} · 이미 있음 ${skipped} · 실패 ${failed}`)
