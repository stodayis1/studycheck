/**
 * 앱이 부르는 **Claude 모델**이 살아 있는 것인지, 답을 제대로 꺼내는지 시험한다. (2026-11-05)
 *
 * 왜 필요한가
 *   ① 쓰던 `claude-sonnet-4-5` 는 **2026-11-30 에 서비스가 끝난다.** 그날이 지나면
 *     그 이름으로 부르는 곳이 전부 멈춘다 — 한 줄 평·알림장 AI·보고서 코멘트·사진 판독.
 *   ② 새 모델은 **생각하기가 기본으로 켜져** 있어서 답의 **첫 블록이 글이 아니다.**
 *     `content[0].text` 를 그대로 읽던 코드는 **에러도 없이 빈 글자**를 돌려준다.
 *     실제로 불러 확인했다(2026-11-05) —
 *       Haiku 5.5(생각 끔)  첫 블록 text     · 옛 방식 235자 · 새 방식 235자
 *       Sonnet 5.5(생각 켬) 첫 블록 thinking · 옛 방식  0자 · 새 방식 311자
 *     한 줄 평이 빈칸으로 학부모님께 나갈 뻔했다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/ai-model-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/aiModels.ts')
const { AI_TEXT_MODEL, AI_VISION_MODEL, NO_THINKING, textOf, wasCut } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')
const 부르는곳 = ['app/api/generate-feedback/route.ts', 'app/api/generate-report/route.ts', 'app/api/parse-records/route.ts']

// ★ 끝나는 모델을 한 곳이라도 남기면 그 기능만 조용히 죽는다.
T('서비스가 끝나는 모델을 아무 데도 안 쓴다 (claude-sonnet-4-5)', () => {
  const 남은곳: string[] = []
  for (const dir of ['app', 'lib', 'scripts', 'components']) {
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name)
        if (f.isDirectory()) { if (f.name !== 'node_modules') walk(p); continue }
        if (!/\.(ts|tsx|mjs|js)$/.test(f.name)) continue
        const s = fs.readFileSync(p, 'utf8')
        // 설명하는 주석은 봐준다 — 부르는 자리만 센다
        if (/model:\s*'claude-sonnet-4-5'|'claude-sonnet-4-5'\s*\]/.test(s)) 남은곳.push(p)
      }
    }
    if (fs.existsSync(dir)) walk(dir)
  }
  if (남은곳.length) console.log('   ↳ 남은 곳:', 남은곳.join(', '))
  return 남은곳.length === 0
})

T('모델 이름을 lib 한 곳에서만 정한다', () => {
  return 부르는곳.every((f) => /model: AI_(TEXT|VISION)_MODEL/.test(src(f)))
    && AI_TEXT_MODEL === 'claude-haiku-5-5' && AI_VISION_MODEL === 'claude-sonnet-5-5'
})

// ★ 이게 핵심 — content[0] 을 믿으면 생각 블록을 글로 착각한다.
T('답을 content[0] 으로 꺼내는 곳이 없다', () => {
  const 남은곳 = 부르는곳.filter((f) => /content\[0\]\.(type|text)/.test(src(f)))
  if (남은곳.length) console.log('   ↳ 남은 곳:', 남은곳.join(', '))
  return 남은곳.length === 0 && 부르는곳.every((f) => src(f).includes('textOf(message)'))
})

T('글 블록을 찾아서 꺼낸다 (생각 블록이 먼저 와도)', () => {
  const 답 = { content: [{ type: 'thinking', thinking: '음…' }, { type: 'text', text: '안녕하세요.' }] }
  return textOf(답) === '안녕하세요.'
})

T('글이 여러 블록으로 쪼개져 와도 이어 붙인다', () =>
  textOf({ content: [{ type: 'text', text: '앞' }, { type: 'thinking' }, { type: 'text', text: '뒤' }] }) === '앞뒤')

T('글이 없거나 모양이 이상해도 터지지 않는다', () =>
  textOf({ content: [{ type: 'thinking' }] }) === '' && textOf({}) === '' && textOf(null) === '')

// ★ 잘린 글을 학부모께 보내면 안 된다.
T('잘렸는지 본다', () =>
  wasCut({ stop_reason: 'max_tokens' }) === true && wasCut({ stop_reason: 'end_turn' }) === false)

T('부르는 곳 모두 잘림을 확인한다', () =>
  부르는곳.every((f) => src(f).includes('wasCut(message)')))

// ★ 생각하기를 켜 두면 생각도 max_tokens 를 먹어 답이 잘린다.
//   Haiku 5.5 는 끌 수 있고, Sonnet 5.5 는 못 끈다(400) — 대신 넉넉히 준다.
T('글쓰기는 생각하기를 끄고, 사진 판독은 넉넉히 준다', () => {
  const 글 = [src('app/api/generate-feedback/route.ts'), src('app/api/generate-report/route.ts')]
  const 사진 = src('app/api/parse-records/route.ts')
  return (NO_THINKING as any).type === 'disabled'
    && 글.every((s) => s.includes('thinking: NO_THINKING'))
    && !사진.includes('thinking:')              // Sonnet 5.5 는 끌 수 없다
    && /max_tokens: 6000/.test(사진)
})

T('예비 모델도 살아 있는 것으로 바꿨다', () => {
  for (const f of ['lib/notePolish.ts', 'scripts/polish-raw.ts', 'scripts/make-lesson-scripts.mjs', 'scripts/match-type-concept.mjs']) {
    if (!src(f).includes("'claude-haiku-5-5'")) return false
  }
  return true
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
