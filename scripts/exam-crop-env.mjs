// 브라우저 없이 lib/examPdfCrop.ts 를 돌리기 위한 밑자리.
//   node --import ./scripts/exam-crop-env.mjs scripts/exam-crop-run.mjs <시험지.pdf> [나갈폴더]
//
// 자르는 코드는 캔버스를 쓴다(브라우저 것). node 에서는 @napi-rs/canvas 를 대신 끼워 주고,
// pdfjs 는 인터넷에서 워커를 받지 못하므로 이 컴퓨터의 워커 파일을 보게 못 박는다.
// ★ 베껴 쓴 사본이 아니라 **진짜 모듈**을 돌린다 — 화면에서 보는 것과 같은 결과를 본다.
import { createCanvas, Image, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('캔버스만 만듭니다: ' + tag)
    return createCanvas(1, 1)
  },
}
globalThis.Image = Image
globalThis.DOMMatrix = DOMMatrix
globalThis.ImageData = ImageData
globalThis.Path2D = Path2D

// 'pdfjs-dist' → node 에서 도는 legacy 빌드 + 이 컴퓨터의 워커
register(new URL('./exam-crop-pdfjs.mjs', import.meta.url).href, pathToFileURL('./').href)
