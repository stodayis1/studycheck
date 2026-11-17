/**
 * 올린 **뒤** 확인 — 보관함에서 **다시 받아** 자른 그림과 크기를 대조한다 (읽기만).
 *
 *   node scripts/exam-paper/after-upload-check.mjs "C:/Users/USER/문제은행/기출/자른것"
 *
 * 「올렸다」는 응답만 믿지 않는다. 보는 것 —
 *   ① problems 에 그 학교 문항이 번호대로 다 있나 (번호는 source_key 에서 읽는다 —
 *      local_no 는 「능곡고25-2기말-1」 꼴이라 숫자가 아니다)
 *   ② 정답이 빠진 문항이 없나 · 인쇄용 학습지가 만들어졌나
 *   ③ 첫·가운데·끝 3장을 **보관함에서 내려받아** PNG 인지와 폭이 같은지 견준다
 *      (한 쪽보다 길어 줄여 올린 문항은 폭도 줄어드니 그때는 넘어간다)
 *
 * 2026-11-17 고양시 고1 25개교를 넣고 돌렸다.
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
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ROOT = process.argv[2]
let bad = 0
const say = (s) => { console.log('  ✗ ' + s); bad++ }

const { data: sheets } = await db.from('exam_sheets').select('code, title, note').like('title', '25년 %고 2학기 기말고사')
const 학습지 = new Map((sheets ?? []).map((s) => [s.title, s]))

console.log('학교        문항 학습지 보관함대조(3장)  판정')
for (const d of fs.readdirSync(ROOT).filter((x) => fs.existsSync(path.join(ROOT, x, 'manifest.json'))).sort()) {
  const 학교 = d.replace(/^2025_2학기기말_/, '').replace(/_고1$/, '')
  const 전 = bad
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, d, 'manifest.json'), 'utf8'))
  const ps = m.problems ?? []

  // ① problems 에 그 학교 문항이 번호대로 다 있나
  const { data: rows } = await db.from('problems')
    .select('source_key, local_no, image_path, answer_text')
    .eq('book', '학교기출').like('source_key', `2025_2학기기말_${학교}_고1_%`).order('id')
  const noOf = (r) => Number(/_(\d+)\uBC88$/.exec(String(r.source_key ?? ''))?.[1] ?? NaN)
  const nos = (rows ?? []).map(noOf).sort((a, b) => a - b)
  if (nos.length !== ps.length) say(`${학교}: 문제은행 ${nos.length}개 · 자른 것 ${ps.length}개`)
  if (nos.some((n, i) => n !== i + 1)) say(`${학교}: 번호가 1부터 안 이어진다`)
  if ((rows ?? []).some((r) => !r.answer_text)) say(`${학교}: 정답 없는 문항이 있다`)

  // ② 학습지가 있나
  const sh = 학습지.get(`25년 ${학교} 2학기 기말고사`)
  if (!sh) say(`${학교}: 학습지가 없다`)

  // ③ 보관함에서 **다시 받아** 크기를 견준다 (첫·가운데·끝 3장)
  let 맞은장 = 0
  const 볼것 = [0, Math.floor(ps.length / 2), ps.length - 1].filter((v, i, a) => a.indexOf(v) === i)
  for (const i of 볼것) {
    const p = ps[i]
    const row = (rows ?? []).find((r) => noOf(r) === p.no)
    if (!row?.image_path) { say(`${학교} ${p.no}번: 그림 경로가 없다`); continue }
    const { data: blob, error } = await db.storage.from('problem-images').download(row.image_path)
    if (error || !blob) { say(`${학교} ${p.no}번: 보관함에서 못 받았다 (${error?.message ?? '빈 응답'})`); continue }
    const buf = Buffer.from(await blob.arrayBuffer())
    if (buf.length < 1000) { say(`${학교} ${p.no}번: 받은 그림이 비었다 (${buf.length}바이트)`); continue }
    if (buf.readUInt32BE(0) !== 0x89504e47) { say(`${학교} ${p.no}번: 받은 것이 PNG 가 아니다`); continue }
    const w = buf.readUInt32BE(16)
    if (w !== p.w) {
      // 한 쪽보다 긴 문항은 줄여서 올린다 — 그때는 폭도 같이 줄어든다
      const 줄임 = p.h > Math.floor((175 / 25.4) * 200)
      if (!줄임) say(`${학교} ${p.no}번: 폭이 다르다 (보관함 ${w} · 자른 것 ${p.w})`)
      else 맞은장++
    } else 맞은장++
  }
  console.log(`${학교.padEnd(10)} ${String(ps.length).padStart(3)} ${(sh?.code ?? '없음').padStart(7)} ${String(맞은장).padStart(10)}/${볼것.length}장        ${bad === 전 ? '✓' : '✗'}`)
}
console.log(bad ? `\n흠 ${bad}건` : '\n올린 것 확인 ✓')
process.exitCode = bad ? 1 : 0
