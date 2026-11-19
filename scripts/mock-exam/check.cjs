// 한 회차의 해설 JSON 을 검산한다 — 올리기 전에 꼭 돌린다.
//   node scripts/mock-exam/check.cjs "<회차 폴더>"
// <회차 폴더>/answers.json (공식 정답·배점)과 <회차 폴더>/해설/*.json 을 맞춘다:
//   빠진 문항 · 정답 · 배점 · 선지 5개 · 정답 표시 하나 · 빈칸 · 난이도 이름 · check 메모 · KaTeX 수식 오류
// 하나라도 걸리면 종료 코드 1. (검사가 진짜 잡는지는 answers.json 을 일부러 틀리게 한 사본으로 확인해 둘 것)
const fs = require('fs'), path = require('path')
const katex = require(path.resolve('node_modules/katex'))
const R = process.argv[2]
const ANS = JSON.parse(fs.readFileSync(path.join(R, 'answers.json'), 'utf8'))
const bad = [], tex = []
let n = 0
for (const [sec, list] of Object.entries(ANS)) {
  for (const [no, { answer, pts }] of Object.entries(list)) {
    const f = path.join(R, '해설', `${sec}_${String(no).padStart(2, '0')}.json`)
    if (!fs.existsSync(f)) { bad.push(`없음 ${sec} ${no}`); continue }
    const q = JSON.parse(fs.readFileSync(f, 'utf8')); n++
    const id = `${sec}${no}`
    if (String(q.answer).trim() !== String(answer)) bad.push(`${id} 답 ${q.answer} ≠ ${answer}`)
    if (q.pts !== pts) bad.push(`${id} 배점 ${q.pts} ≠ ${pts}`)
    if (q.sec !== sec || Number(q.no) !== Number(no)) bad.push(`${id} sec/no 가 파일 이름과 다름`)
    const mc = /[①②③④⑤]/.test(answer)
    if (mc) {
      if ((q.choices || []).length !== 5) bad.push(`${id} 선지 ${q.choices?.length}개`)
      const ok = (q.choices || []).filter((c) => c.ok).map((c) => c.n)
      if (ok.join() !== answer) bad.push(`${id} 정답 표시 ${ok}`)
    } else if ((q.choices || []).length) bad.push(`${id} 단답형인데 선지가 있음`)
    if (q.check) bad.push(`${id} check: ${q.check}`)
    for (const k of ['unit', 'type', 'difficulty', 'seconds', 'read', 'approach', 'why', 'know', 'mistakes', 'review']) if (!q[k]) bad.push(`${id} 빈칸 ${k}`)
    if (!(q.steps || []).length) bad.push(`${id} 빈칸 steps`)
    if (!['상', '중상', '중', '중하', '하'].includes(q.difficulty)) bad.push(`${id} 난이도 ${q.difficulty}`)
    const texts = [q.read, q.approach, ...(q.steps || []), q.why, q.know, q.mistakes, q.review, ...(q.choices || []).map((c) => c.note)]
    for (const t of texts) {
      for (const m of (t || '').matchAll(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g)) {
        try { katex.renderToString(m[1] ?? m[2], { throwOnError: true, strict: false }) } catch (e) { tex.push(`${id}: ${(m[1] ?? m[2]).slice(0, 50)} — ${e.message.slice(0, 60)}`) }
      }
      if (((t || '').match(/\$/g) || []).length % 2) tex.push(`${id}: $ 짝이 안 맞음 — ${t.slice(0, 50)}`)
    }
  }
}
console.log(`${path.basename(R)}: 문항 ${n} · 문제 ${bad.length} · 수식 오류 ${tex.length}`)
if (bad.length) console.log(bad.join('\n'))
if (tex.length) console.log(tex.join('\n'))
process.exit(bad.length || tex.length ? 1 : 0)
