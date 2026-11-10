// node 에서는 unpkg 워커를 받지 못한다 → workerSrc 를 이 컴퓨터의 워커로 못 박고 바꾸지 못하게 한다
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const worker = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
try {
  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', { get: () => worker, set: () => {}, configurable: true })
} catch {}
export * from 'pdfjs-dist/legacy/build/pdf.mjs'
