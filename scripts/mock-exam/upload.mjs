/**
 * 모의고사 기출 한 회차를 앱에 올린다 (선생님 전용 화면 /teacher/mock-exams 에서 본다).
 *
 *   node scripts/mock-exam/upload.mjs <slug> "<회차 폴더>"
 *   예) node scripts/mock-exam/upload.mjs 2027-suneung "C:\Users\USER\문제은행\모의고사\2027수능"
 *
 * <회차 폴더>/crops/<과목>/NN.png  문항 그림 (crop_suneung.py 가 만든다, 200dpi)
 * <회차 폴더>/해설/<과목>_NN.json   문항 해설 (모양은 lib/mockExams.ts 의 MockQuestion)
 * → 보관함 exam-analysis 의 mock/<slug>/<영문 과목>/NN.png 와 mock/<slug>/data.json
 *
 * 그림은 이미 있으면 덮어쓴다(다시 자른 그림을 반영해야 하므로). 회차는 lib/mockExams.ts 의 MOCK_EXAMS 에도 적어야 목록에 보인다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const [slug, dir] = process.argv.slice(2)
if (!slug || !dir) { console.error('쓰는 법: node scripts/mock-exam/upload.mjs <slug> "<회차 폴더>"'); process.exit(1) }
const SEC = { 공통: 'common', 확통: 'prob', 미적: 'calc', 기하: 'geom' }      // 보관함 경로는 영문만
const BUCKET = 'exam-analysis'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// PNG 머리에서 가로·세로를 읽는다 (인쇄 크기를 원본과 같게 맞추는 데 쓴다)
const size = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })

const questions = []
for (const f of fs.readdirSync(path.join(dir, '해설')).filter((x) => x.endsWith('.json')).sort()) {
  const q = JSON.parse(fs.readFileSync(path.join(dir, '해설', f), 'utf8'))
  if (!SEC[q.sec]) { console.error('모르는 과목:', f); process.exit(1) }
  const nn = String(q.no).padStart(2, '0')
  const png = fs.readFileSync(path.join(dir, 'crops', q.sec, `${nn}.png`))
  const key = `mock/${slug}/${SEC[q.sec]}/${nn}.png`
  const { error } = await s.storage.from(BUCKET).upload(key, png, { contentType: 'image/png', upsert: true })
  if (error) { console.error('✗', key, error.message); process.exit(1) }
  delete q.check
  questions.push({ ...q, image: key, ...size(png) })
}
const body = JSON.stringify({ slug, questions })
// 보관함 exam-analysis 는 pdf·png·jpeg·octet-stream 만 받는다 → json 도 octet-stream 으로 올린다
const { error } = await s.storage.from(BUCKET).upload(`mock/${slug}/data.json`, Buffer.from(body), { contentType: 'application/octet-stream', upsert: true })
if (error) { console.error('✗ data.json', error.message); process.exit(1) }

// 올린 것을 다시 내려받아 센다
const { data } = await s.storage.from(BUCKET).download(`mock/${slug}/data.json`)
const back = JSON.parse(await data.text())
const by = {}
for (const q of back.questions) by[q.sec] = (by[q.sec] ?? 0) + 1
console.log(`${slug}: 문항 ${back.questions.length}개 올림`, by)
