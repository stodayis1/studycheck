// 'pdfjs-dist' 를 node 에서 도는 legacy 빌드(+ 이 컴퓨터의 워커)로 바꿔 준다
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const SHIM = pathToFileURL(path.resolve('scripts/exam-crop-pdfjs-shim.mjs')).href
export async function resolve(specifier, context, next) {
  if (specifier === 'pdfjs-dist') return { url: SHIM, shortCircuit: true }
  return next(specifier, context)
}
