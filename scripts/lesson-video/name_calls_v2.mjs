/**
 * 풀이 영상용 이름 부르기 (v2) — 이름 따로 + 문장 따로, 둘 다 「한 번에 읽힌 문장」에서 잘라 쓴다 (원장님 2026-10-20)
 *
 *   node scripts/lesson-video/name_calls_v2.mjs [--lines] [--names] [--only <학생id>] [--force] [--dry]
 *
 * · 문장(모두 같이 씀): 「서연아, <문장>」을 한 번에 읽혀 쉼표 뒤 문장 부분만 자른다 → v2/line/<key>/<n>.mp3
 * · 이름(학생마다):     「<이름>아, 같이 풀어 보자.」(call) · 「<이름>아~ 오늘도 같이 해 보자.」(soft) 를 한 번에 읽혀
 *                      이름 부분만 자른다 → v2/name/<student_id>/<tone>.mp3
 *   따로 읽힌 짧은 「지민아」보다 문장 안에서 읽힌 이름이 덜 기계 같다(원장님: 한 번에 읽은 게 더 좋다).
 * · 문장 표는 lib/nameCalls.ts 의 SOL_LINES 를 그대로 읽는다. 문장을 바꾸면 NAME_CALL_V2 를 올리고 --lines --force.
 * · ElevenLabs 에는 이름(성 뺀 것)과 문장만 보낸다 (원장님 허락 2026-10-20). 부드러운 목소리 설정.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
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
// --keys right,wrong,fun : 그 문장들만 새로 만든다(문장을 바꿨을 때). 판(NAME_CALL_V2)을 안 올려도 된다
const onlyKeys = args.includes('--keys') ? args[args.indexOf('--keys') + 1].split(',') : null
const doLines = args.includes('--lines') || !args.includes('--names')
const doNames = args.includes('--names') || !args.includes('--lines')

// lib/nameCalls.ts 에서 판(NAME_CALL_V2)과 문장 표(SOL_LINES)를 읽는다
const ts = fs.readFileSync('lib/nameCalls.ts', 'utf8')
const VERSION = ts.match(/NAME_CALL_V2 = '(\w+)'/)[1]
// 풀이용 SOL_LINES 는 line/<key>/, 개념·증명용 LEC_LINES 는 line/lec_<key>/ 에 올라간다
const SOL = {}
function readTable(name, prefix) {
  const from = ts.indexOf(`export const ${name}`), to = ts.indexOf('} as const', from)
  for (const m of ts.slice(from, to).matchAll(/^\s+(\w+):\s*\{ tone: '(\w+)', lines: \[(.*)\] \},?$/gm)) {
    SOL[prefix + m[1]] = { tone: m[2], lines: [...m[3].matchAll(/'([^']*)'/g)].map((x) => x[1]) }
  }
}
readTable('SOL_LINES', '')
readTable('LEC_LINES', 'lec_')
if (!Object.keys(SOL).length) throw new Error('SOL_LINES 를 못 읽음')
const CARRIER = { call: ', 같이 풀어 보자.', soft: '~ 오늘도 같이 해 보자.' }

const BUCKET = 'name-calls'
const VOICE = 'mbwQpKqHamJOPuXJoCPc'
const SOFT = { stability: 0.65, similarity_boost: 0.85, style: 0.1, use_speaker_boost: true }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'namecall2-'))

async function tts(text) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', language_code: 'ko', voice_settings: SOFT }),
    })
    if (r.ok) { const j = await r.json(); return { mp3: Buffer.from(j.audio_base64, 'base64'), al: j.alignment } }
    const body = await r.text()
    if (r.status === 429 && !body.includes('quota')) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue }
    throw new Error(`ElevenLabs ${r.status}: ${body.slice(0, 200)}`)
  }
}
// 이름 뒤 쉼표(또는 ~) 자리: 이름이 끝나는 시각, 뒤 문장이 시작하는 시각
function split(al) {
  const i = al.characters.findIndex((c) => c === ',' || c === '~')
  let k = i + 1; while (al.characters[k] === ' ') k++
  return { nameEnd: al.character_end_times_seconds[i], lineStart: al.character_start_times_seconds[k] }
}
function cut(mp3, from, to) {
  const a = path.join(tmp, 'in.mp3'), b = path.join(tmp, 'out.mp3')
  fs.writeFileSync(a, mp3)
  const fade = to != null ? `afade=t=in:d=0.01,areverse,afade=t=in:d=0.04,areverse` : 'afade=t=in:d=0.01'
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', a, '-ss', String(Math.max(0, from)), ...(to != null ? ['-to', String(to)] : []), '-af', fade, '-b:a', '128k', b])
  return fs.readFileSync(b)
}
async function exists(p) {
  const dir = path.posix.dirname(p), name = path.posix.basename(p)
  const { data } = await db.storage.from(BUCKET).list(dir, { search: name })
  return !!data?.some((f) => f.name === name)
}
async function put(p, buf) {
  if (dry) { console.log('dry', p); return }
  const { error } = await db.storage.from(BUCKET).upload(p, buf, { contentType: 'audio/mpeg', upsert: true, cacheControl: '31536000' })
  if (error) throw error
}

// 부를 이름 — lib/nameCalls.ts 의 callName·vocative 와 같아야 한다
const OVERRIDE = { '호킨슨제레미': '제레미', '호킨슨루시리': '루시리' }
const DOUBLE_SURNAME = ['남궁', '제갈', '선우', '황보', '독고', '사공', '서문']
function callName(full) {
  const raw = (full || '').replace(/[^가-힣]/g, '')
  if (OVERRIDE[raw]) return OVERRIDE[raw]
  if (raw.length <= 2) return raw
  if (raw.length >= 4 && DOUBLE_SURNAME.includes(raw.slice(0, 2))) return raw.slice(2)
  return raw.slice(1)
}
function vocative(name) {
  const c = name.charCodeAt(name.length - 1) - 0xac00
  return name + (c >= 0 && c < 11172 && c % 28 !== 0 ? '아' : '야')
}

let chars = 0
if (doLines) {
  for (const [key, { lines }] of Object.entries(SOL)) {
    for (const [n, line] of lines.entries()) {
      if (onlyKeys && !onlyKeys.includes(key)) continue
      const p = `${VERSION}/line/${key}/${n}.mp3`
      if (!force && !onlyKeys && await exists(p)) continue
      const text = '서연아, ' + line; chars += text.length
      if (dry) { console.log('dry', p, text); continue }
      const { mp3, al } = await tts(text)
      await put(p, cut(mp3, split(al).lineStart - 0.03))
      console.log('문장', p, line)
    }
  }
}
if (doNames) {
  let q = db.from('students').select('id, name').eq('is_active', true)
  if (only) q = q.eq('id', only)
  const { data: students, error } = await q
  if (error) throw error
  const tones = [...new Set(Object.values(SOL).map((x) => x.tone))]
  let made = 0
  for (const s of students) {
    const nm = callName(s.name); if (!nm) { console.log('! 이름 없음', s.id); continue }
    for (const tone of tones) {
      const p = `${VERSION}/name/${s.id}/${tone}.mp3`
      if (!force && await exists(p)) continue
      const text = vocative(nm) + CARRIER[tone]; chars += text.length
      if (dry) { console.log('dry', p, text); continue }
      const { mp3, al } = await tts(text)
      await put(p, cut(mp3, 0, split(al).nameEnd + 0.05)); made++
    }
  }
  console.log(`이름 ${made}개 (학생 ${students.length}명)`)
}
console.log(`보낸 글자 약 ${chars}자${dry ? ' (dry — 실제로는 안 보냄)' : ''}`)
fs.rmSync(tmp, { recursive: true, force: true })
