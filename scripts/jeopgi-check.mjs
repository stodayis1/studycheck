/**
 * 전개도 접기 자료의 **계산**이 맞는지 본다 (public/visual/jeopgi.html 의 `<script id="core">`).
 *
 * 왜 필요한가
 *   접는 그림은 틀려도 그럴듯해 보인다. 면이 하나 뒤집혀도, 꼭짓점 이름이 한 칸 밀려도
 *   화면에는 멀쩡한 전개도가 그려진다. 그래서 **눈이 아니라 숫자로** 본다 —
 *   접으면 원래 입체와 같은 자리인가, 펴면 한 평면인가, 겹치지 않는가,
 *   꼭짓점이 모이는 면 수만큼 전개도에 나오는가.
 *
 * 쓰는 법
 *   node scripts/jeopgi-check.mjs
 *   node scripts/jeopgi-check.mjs <다른 html 경로>   ← 일부러 틀린 사본은 **실패해야** 한다
 */
import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('public/visual/jeopgi.html')
const html = fs.readFileSync(file, 'utf8')
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/)
if (!m) { console.error('✗ <script id="core"> 를 못 찾았어요:', file); process.exit(1) }
const CORE = new Function(m[1] + '\nreturn CORE;')()

let pass = 0, total = 0
const T = (name, fn) => {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e) { err = e.message }
  console.log((ok ? '✓ ' : '✗ ') + name + (err ? ' — ' + err : ''))
  if (ok) pass++
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const edgesOf = (S) => {
  const e = new Set()
  S.F.forEach((f) => f.forEach((v, i) => e.add([v, f[(i + 1) % f.length]].sort((a, b) => a - b).join('-'))))
  return e
}

// 화면이 고를 수 있는 입체 전부 — 하나라도 빠뜨리면 그 입체만 조용히 틀린다.
const WANT = {
  '정사면체': [4, 6, 4], '정육면체': [8, 12, 6], '정팔면체': [6, 12, 8],
  '정십이면체': [20, 30, 12], '정이십면체': [12, 30, 20],
}
const solids = {}
for (const n of Object.keys(WANT)) solids[n] = CORE.solid(n === '정육면체' ? '직육면체' : n, [1, 1, 1])
solids['직육면체'] = CORE.solid('직육면체', [1.6, 1, 0.7])

for (const [n, [V, E, F]] of Object.entries(WANT)) {
  T(`${n} — 꼭짓점 ${V} · 모서리 ${E} · 면 ${F} · 오일러 2`, () => {
    const S = solids[n], e = edgesOf(S)
    return S.V.length === V && e.size === E && S.F.length === F && S.V.length - e.size + S.F.length === 2
  })
}

for (const [n, S] of Object.entries(solids)) {
  const N = CORE.findNet(S)
  T(`${n} — 접으면(t=1) 원래 입체와 같은 자리`, () => {
    const L = CORE.layout(S, N, 1)
    return L.every((f) => f.pts.every((p, i) => dist(p, S.V[f.vid[i]]) < 1e-9))
  })
  T(`${n} — 펴면(t=0) 전부 한 평면 위`, () => {
    const L = CORE.layout(S, N, 0)
    const n0 = CORE.normalOf(S, S.F[N.root]), p0 = S.V[S.F[N.root][0]]
    return L.every((f) => f.pts.every((p) =>
      Math.abs((p[0] - p0[0]) * n0[0] + (p[1] - p0[1]) * n0[1] + (p[2] - p0[2]) * n0[2]) < 1e-9))
  })
  T(`${n} — 전개도가 겹치지 않는다`, () => !CORE.overlaps(S, N))
  // ★ 이 자료의 **핵심**이다. 「전개도에서 같은 이름인 점끼리 접으면 만난다」가 성립하려면
  //   꼭짓점 하나가 그 점에 모이는 면 수만큼 나와야 한다.
  T(`${n} — 꼭짓점마다 모이는 면 수만큼 전개도에 나온다`, () => {
    const L = CORE.layout(S, N, 0)
    return S.V.every((_, v) => CORE.sameVertex(L, v).length === S.F.filter((f) => f.indexOf(v) >= 0).length)
  })
  T(`${n} — 접었을 때 같은 이름인 점들이 정말 한 자리에 모인다`, () => {
    const L = CORE.layout(S, N, 1)
    return S.V.every((_, v) => CORE.sameVertex(L, v).every((h) => dist(h.p, S.V[v]) < 1e-9))
  })
  T(`${n} — 붙일 변 = 모서리 − (면 − 1)`, () =>
    CORE.gluedEdges(S, N).length === edgesOf(S).size - (S.F.length - 1))
}

// 종이는 늘어나지 않는다 — 접는 **도중**에도 변 길이가 그대로여야 한다.
for (const t of [0.17, 0.5, 0.83]) {
  T(`접는 도중(t=${t}) 모서리 길이가 안 변한다 — 정십이면체`, () => {
    const S = solids['정십이면체'], N = CORE.findNet(S), L = CORE.layout(S, N, t)
    return L.every((f) => f.pts.every((p, i) => {
      const q = f.pts[(i + 1) % f.pts.length]
      const a = S.V[f.vid[i]], b = S.V[f.vid[(i + 1) % f.vid.length]]
      return Math.abs(dist(p, q) - dist(a, b)) < 1e-9
    }))
  })
}

// 직육면체는 가로·세로·높이를 바꿔도 돌아가야 한다 (화면에서 끌 수 있는 범위 전부)
T('직육면체 — 가로·세로·높이를 0.6~2.0 으로 바꿔도 전개도가 멀쩡하다', () => {
  for (const a of [0.6, 1.2, 2.0]) for (const b of [0.6, 1.4]) for (const c of [0.7, 2.0]) {
    const S = CORE.solid('직육면체', [a, b, c])
    if (S.F.length !== 6 || S.V.length !== 8) return false
    const N = CORE.findNet(S)
    if (CORE.overlaps(S, N)) return false
    const L = CORE.layout(S, N, 1)
    if (!L.every((f) => f.pts.every((p, i) => dist(p, S.V[f.vid[i]]) < 1e-9))) return false
  }
  return true
})

console.log(`\n대상: ${path.relative(process.cwd(), file)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
