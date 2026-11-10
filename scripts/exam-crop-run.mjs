/**
 * 시험지 PDF 하나를 **화면과 똑같은 코드**(lib/examPdfCrop.ts)로 잘라 본다 — 브라우저 없이.
 *
 * 왜 있나
 *   「문항 번호를 찾지 못했습니다」 같은 말을 들었을 때, 화면을 열지 않고도 그 파일에서
 *   무엇이 몇 개 나오는지 바로 잴 수 있다. 베껴 쓴 사본이 아니라 그 모듈을 그대로 부른다.
 *   (2026-11-09 고양중 · 2026-11-10 신원중 둘 다 이걸로 찾았다.)
 *
 * 쓰는 법
 *   node --import ./scripts/exam-crop-env.mjs scripts/exam-crop-run.mjs <시험지.pdf> [그림 나갈 폴더]
 *
 * 보는 것
 *   문항 수 · 쪽 · 그림 크기 · 배점 · 서술형인지 · 보기 수 · 정답(글자 또는 그림),
 *   그리고 경고(번호를 못 찾았다 · 번호가 안 이어진다).
 *   배점 합이 100점이면 수식 글꼴 숫자를 제대로 읽은 것이다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const file = process.argv[2]
if (!file || !fs.existsSync(file)) {
  console.error('✗ 시험지 PDF 경로를 주세요.\n  node --import ./scripts/exam-crop-env.mjs scripts/exam-crop-run.mjs <시험지.pdf> [나갈폴더]')
  process.exit(1)
}
if (!globalThis.document) {
  console.error('✗ 밑자리를 안 깔았습니다 — 앞에 `--import ./scripts/exam-crop-env.mjs` 를 붙여 주세요.')
  process.exit(1)
}

const { cropExamPdf } = await import(pathToFileURL(path.resolve('lib/examPdfCrop.ts')).href)
const buf = fs.readFileSync(file)
const r = await cropExamPdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

console.log(`\n${path.basename(file)} — 쪽 ${r.pages} · 문항 ${r.problems.length} · 정답 ${r.answersFound}`)
for (const w of r.warnings) console.log('⚠ ' + w)

console.log('\n번호  쪽   그림크기     배점 서술 보기 정답')
let 배점합 = 0
for (const p of r.problems) {
  배점합 += p.points ?? 0
  console.log(`${String(p.no).padStart(3)}  ${String(p.page).padStart(2)}쪽 ${String(p.w).padStart(4)}x${String(p.h).padStart(4)} ` +
    `${String(p.points ?? '-').padStart(4)} ${p.essay ? '서술' : '    '} ${String(p.choices).padStart(2)} ` +
    `${p.answer ? JSON.stringify(p.answer).slice(0, 26) : p.answerImage ? `[그림 ${p.answerImage.width}x${p.answerImage.height}]` : '(없음)'}`)
}
console.log(`\n배점 합계 ${배점합}점 ${배점합 === 100 ? '(100점 — 배점을 제대로 읽었다)' : '(100점이 아니면 배점을 못 읽은 문항이 있다)'}`)

const out = process.argv[3]
if (out) {
  fs.mkdirSync(out, { recursive: true })
  for (const p of r.problems) {
    fs.writeFileSync(path.join(out, `${String(p.no).padStart(2, '0')}.png`), p.image.toBuffer('image/png'))
    if (p.answerImage) fs.writeFileSync(path.join(out, `${String(p.no).padStart(2, '0')}_a.png`), p.answerImage.toBuffer('image/png'))
  }
  console.log('그림:', path.resolve(out))
}
