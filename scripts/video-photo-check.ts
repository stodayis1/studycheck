/**
 * 「직접 푼 풀이 사진 받기」가 맞게 도는지 시험한다. (원장님 2026-11-04)
 *
 * 왜 필요한가
 *   「영상과제를 배부하면서 증명이 아니라 직접 풀이한것도 찍어 올리라고 할거거든.
 *    직접풀이한거 찍어올릴수 있도록 창 만들어주려고 하는데 기능좀 추가해줘」
 *
 *   ★ 여기서 틀리면 **에러가 안 나고 조용히 어긋난다** —
 *     ① 켰는데 학생 화면에 제출 칸이 안 뜬다 (학생은 낼 길이 없다)
 *     ② 껐는데 뜬다 (안 내도 되는 걸 내라고 한다)
 *     ③ 학습일지를 한 번 저장했더니 일괄배부에서 켜 둔 것이 **지워진다**
 *     ④ 링크 뒤에 ?si=… 가 붙어 들어와 같은 영상인데 못 알아본다
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/video-photo-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/lessonVideos.ts')
const { photoKindOf, photoUrlsOf, photoLabelOf, askedSet, needsPhoto } = await import(pathToFileURL(target).href)
const { safeAsks, asksOf } = await import(pathToFileURL(path.resolve('lib/photoAsk.ts')).href)
const { photoBrief } = await import(pathToFileURL(target).href)
const { hwLines } = await import(pathToFileURL(path.resolve('lib/briefing.ts')).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean | Promise<boolean>) {
  return (async () => {
    total++
    let ok = false, err = ''
    try { ok = await fn() } catch (e: any) { err = e?.message ?? String(e) }
    if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
  })()
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

const 증명 = { grade: '중3-2', kind: '증명' }
const 개념 = { grade: '중3-2', kind: '개념' }
const 컨씨 = { grade: '쎈C 중3-2', kind: '대표예제' }
const U = (id: string) => `https://youtu.be/${id}`
const A = U('aaaaaaaaaaa'), B = U('bbbbbbbbbbb'), C = U('ccccccccccc')

await T('증명 영상은 켜지 않아도 사진을 낸다', () =>
  photoKindOf(A, 증명, new Set()) === '증명' && needsPhoto(증명) === true)

await T('컨씨영상(쎈C)은 켜지 않아도 풀이 사진을 낸다', () =>
  photoKindOf(A, 컨씨, new Set()) === '풀이')

await T('그 밖의 영상은 켜야만 낸다', () =>
  photoKindOf(A, 개념, new Set()) === null
  && photoKindOf(A, 개념, askedSet([{ video_url: A }])) === '풀이')

await T('강의 목록에 없는 바깥 링크도 켜면 낸다', () =>
  photoKindOf(A, null, askedSet([{ video_url: A }])) === '풀이'
  && photoKindOf(A, null, new Set()) === null)

// ★ 같은 영상이라도 뒤에 ?si=… 가 붙어 들어온 것이 있다(학습일지와 같은 함정).
await T('링크 뒤에 ?si= 가 붙어도 같은 영상으로 본다', () =>
  photoKindOf(`${A}?si=XyZ`, 개념, askedSet([{ video_url: A }])) === '풀이'
  && photoKindOf(A, 개념, askedSet([{ video_url: `${A}?si=XyZ` }])) === '풀이')

await T('다른 영상까지 켜지지는 않는다', () =>
  photoKindOf(B, 개념, askedSet([{ video_url: A }])) === null)

await T('사진 내는 링크만, 낸 순서 그대로 골라 준다', () => {
  const got = photoUrlsOf([A, B, C], (u: string) => (u === B ? 증명 : 개념), [{ video_url: C }])
  return got.join() === [B, C].join()
})

await T('아무것도 아니면 빈 목록 (칩 자체가 안 뜬다)', () =>
  photoUrlsOf([A, B], () => 개념, []).length === 0)

await T('이름 — 증명만 「증명 제출」, 풀이만 「풀이 제출」, 섞이면 「사진 제출」', () =>
  photoLabelOf([A], () => 증명, []) === '증명 제출'
  && photoLabelOf([A], () => 개념, [{ video_url: A }]) === '풀이 제출'
  && photoLabelOf([A], () => 컨씨, []) === '풀이 제출'
  && photoLabelOf([A, B], (u: string) => (u === A ? 증명 : 개념), [{ video_url: B }]) === '사진 제출')

await T('켠 목록이 없거나 null 이어도 터지지 않는다', () =>
  askedSet(null).size === 0 && askedSet(undefined as any).size === 0
  && photoUrlsOf([A], () => 증명, null).length === 1)

// ★ 표(video_photo_requests)는 원장님이 손으로 만드신다. 만들기 전에 배포가 올라가도
//   화면이 멈추면 안 된다 — 못 읽으면 「켠 것이 없다」로 보고 지금까지대로 돈다.
await T('표를 못 읽어도 빈 목록으로 지나간다 (화면이 안 멈춘다)', async () => {
  const 에러 = await safeAsks(Promise.resolve({ data: null, error: { message: 'relation does not exist' } }))
  const 터짐 = await safeAsks(Promise.reject(new Error('boom')) as any)
  const 정상 = await safeAsks(Promise.resolve({ data: [{ session_id: 's1', video_url: A }], error: null }))
  return 에러.length === 0 && 터짐.length === 0 && 정상.length === 1
})

await T('한 수업 것만 골라 낸다', () =>
  asksOf([{ session_id: 's1', video_url: A }, { session_id: 's2', video_url: B }], 's1').length === 1)

// ── 화면·API 가 실제로 그렇게 하는지 ────────────────────────────────────
await T('제출 API 가 켠 것도 받아 준다 (증명만 받던 것을 넓혔다)', () => {
  const s = src('app/api/proof-submit/route.ts')
  return s.includes("from('video_photo_requests')")
    && /if \(!needsPhoto\(lesson\) && !asked\.has\(/.test(s)
    && s.includes('lesson_video_id: lesson?.id ?? null')   // 강의 목록에 없는 링크도 받는다
})

await T('학생 시청 화면이 켠 것을 읽어 제출 칸을 연다', () => {
  const s = src('app/student/watch/[sessionId]/[idx]/page.tsx')
  return s.includes("from('video_photo_requests')") && s.includes('photoKindOf(url, lesson, asked)')
    && s.includes("solve={photoKindOf(url, lesson, asked) === '풀이'}")
})

// ★ 저장은 그 수업 줄을 **지우고 다시 넣는다.** 열 때 안 읽어 오면 일괄배부에서 켜 둔 것이
//   학습일지를 한 번 저장하는 순간 조용히 사라진다.
await T('학습일지는 켜 둔 것을 열 때 읽어 오고, 저장할 때 맞춘다', () => {
  const s = src('app/teacher/learning-notes/page.tsx')
  return /setHwPhotoAsk\(new Set\(asksOf\(photoAsks, session\?\.id \?\? ''\)/.test(s)
    && s.includes("from('video_photo_requests').upsert(")
})

// ★ 통째로 지우고 다시 넣으면, 넣다가 막혔을 때 켜 둔 것이 **다 사라진다.**
//   넣고 나서 **뺀 것만** 지운다 — 지우는 질의에 video_url 조건이 반드시 붙어야 한다.
await T('저장이 그 수업 것을 통째로 지우지 않는다', () => {
  const s = src('app/teacher/learning-notes/page.tsx')
  const 지우기 = [...s.matchAll(/from\('video_photo_requests'\)\.delete\(\)[\s\S]{0,160}/g)].map((m) => m[0])
  return 지우기.length === 1 && 지우기[0].includes(".in('video_url'")
})

await T('일괄 배부에서 켜면 이미 들어 있는 학생에게도 켜진다', () => {
  const s = src('app/teacher/assignments/videos/page.tsx')
  return s.includes('const 붙일수있는사람 = plans.filter((p) => p.session)')
    && /for \(const p of 붙일수있는사람\)/.test(s)
    && /onConflict: 'session_id,video_url'/.test(s)
})

await T('선생님·학부모 칩과 주간보고도 켠 것을 센다', () => {
  const a = src('app/teacher/learning-notes/page.tsx')
  const b = src('app/parent/assignments/page.tsx')
  const c = src('app/api/weekly/route.ts')
  return [a, b, c].every((s) => s.includes('photoUrlsOf(') && s.includes('photoLabelOf('))
    && [b, c].every((s) => s.includes("from('video_photo_requests')"))
})

// ★ 학생도 익명이지만 authenticated 다 — to authenticated 로 열면 학생·학부모까지 다 읽는다.
await T('SQL 이 직원 전용 정책을 is_staff() 로 쓴다 (authenticated 로 열지 않는다)', () => {
  const s = src('docs/sql/영상과제_풀이사진_요청.sql')
  return /create policy staff_all[\s\S]*?using \(\(select public\.is_staff\(\)\)\)/.test(s)
    && !/to\s+authenticated/.test(s)
    && /create policy own_read[\s\S]*?for select/.test(s)
    && !/create policy own_read[\s\S]*?for all/.test(s)          // 학생은 읽기만
    && fs.existsSync(path.resolve('docs/sql/영상과제_풀이사진_요청_되돌리기.sql'))
})

// ── 학부모 브리핑 ───────────────────────────────────────────────────────
// ★ 켜 놓고 브리핑에 안 적으면 **학부모님은 사진을 내야 하는 줄 모르신다.**
await T('브리핑이 「풀이 사진 올리기」까지 적는다', () => {
  const 줄 = hwLines({} as any, { total: 3, proof: 0, photo: 2, photoWord: '풀이 사진' })
  return 줄.includes('· 영상과제 3개 시청 후 풀이 사진 올리기')
})

await T('증명이면 지금까지대로 「증명 올리기」', () =>
  hwLines({} as any, { total: 2, proof: 1, photo: 1, photoWord: '증명' })
    .includes('· 영상과제 2개 시청 후 증명 올리기'))

await T('섞이면 「사진 올리기」', () =>
  hwLines({} as any, { total: 2, proof: 1, photo: 2, photoWord: '사진' })
    .includes('· 영상과제 2개 시청 후 사진 올리기'))

await T('낼 것이 없으면 「시청」만 (잔소리가 되면 안 된다)', () =>
  hwLines({} as any, { total: 2, proof: 0, photo: 0, photoWord: '증명' })
    .includes('· 영상과제 2개 시청'))

// photo 를 안 주는 옛 호출(점검 스크립트 등)이 지금까지대로 돌아야 한다
await T('옛 호출(photo 없음)은 증명 편수로 센다', () =>
  hwLines({} as any, { total: 1, proof: 1 }).includes('· 영상과제 1개 시청 후 증명 올리기')
  && hwLines({} as any, { total: 1, proof: 0 }).includes('· 영상과제 1개 시청'))

await T('브리핑에 쓸 말 — 증명 / 풀이 사진 / 사진', () =>
  photoBrief([A], () => 증명, []).photoWord === '증명'
  && photoBrief([A], () => 개념, [{ video_url: A }]).photoWord === '풀이 사진'
  && photoBrief([A, B], (u: string) => (u === A ? 증명 : 개념), [{ video_url: B }]).photoWord === '사진'
  && photoBrief([A], () => 개념, []).photo === 0)

// ★ 세는 곳이 셋이다 — 카톡 발송 · 알림장 화면 · 학습일지 미리보기. 하나라도 빠지면 글이 달라진다.
await T('세는 곳 셋이 모두 같은 함수를 쓴다', () => {
  const a = src('app/api/kakao-briefing/route.ts')
  const b = src('lib/briefingSnapshots.ts')
  const c = src('app/teacher/learning-notes/page.tsx')
  return [a, b, c].every((x) => x.includes('photoBrief('))
    && [a, b].every((x) => x.includes("from('video_photo_requests')"))
    && c.includes('photoBrief(urls, (u) => lessonByYt[youtubeId(u) || \'\'], hwPhotoAsk)')
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
