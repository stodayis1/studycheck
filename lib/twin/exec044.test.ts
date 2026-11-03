/**
 * GPT_VIDEO_MAP_044_RESULT 검사 — 첫 세트 영상 고르기
 *
 * 무엇을 재는가
 *   044 §3 이 지적한 「두 유형을 합쳐 정렬 뒤 앞 3편」 방식은 유형 하나를
 *   통째로 밀어낸다. 그 방식과 지금 방식의 **차이를 이 파일이 재서 보인다** —
 *   「고쳤다」고 적는 것으로는 검사가 되지 않는다.
 *
 * 무엇을 재지 않는가
 *   운영 DB 에 붙지 않는다. 영상 재생·학생 접근·내용 적합성을 확인하지 않는다.
 *   그 칸들은 **모름**이어야 하고, 모름인지를 여기서 확인한다 (044 §6-3).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  FIRST_SET_VIDEOS, FIRST_SET_VIDEO_IDS, HELD_PENDING_SOURCE, MAX_FIRST_SET_VIDEOS,
  SLOT3_REPLACEMENT, coversEveryType, pendingChecks, readyForStudents, selectFirstSetVideos,
} from '../learning/firstSet'
import { FIRST_SET } from '../learning/providers'

const ROOT = join(__dirname, '..', '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

/** 044 결과가 준 후보 목록. **고정 목록의 유일한 출처**다 */
const CANDIDATES = JSON.parse(read('evidence-044/FIRST_SET_VIDEO_CANDIDATES_044.json')) as {
  status: string
  max_first_set_videos: number
  first_set_types: string[]
  live_access_authorized: boolean
  primary_candidates: Array<{
    target_type_code: string
    video_metadata: {
      id: string; kind: string; title: string; order_label: string
      duration_seconds: number; has_video_source: boolean; type_codes: string[]
    }
    review: Record<string, unknown>
  }>
  replacement_candidate_for_slot3: { id: string; has_video_source: boolean; duration_seconds: number }
  excluded_pending_youtube_identifier: { id: string; has_video_source: boolean; duration_seconds: number }
}

/**
 * 044 §3 이 쓴 그대로의 재현용 행들.
 *
 * 두 유형에 걸린 영상 중 **활성 + 목록조회에 돌아온** 것들이다.
 * `order_label` 만 고르기에 쓰이므로 그 칸만 적는다.
 */
const RETURNED_ROWS = [
  { id: 'v-0102-개념02',   order_label: '02',        type_codes: ['공수1-01-02'] },
  { id: 'v-0102-증명02',   order_label: '02-증명1',  type_codes: ['공수1-01-02'] },
  { id: '350b973a-46f6-4dee-981e-0143f8312423', order_label: '02-풀이01', type_codes: ['공수1-01-02'] },
  { id: '8e59d4bc-1e4f-4e65-b056-40c948da4fd8', order_label: '03',        type_codes: ['공수1-01-07'] },
  { id: '58671e09-3268-45b1-895a-34f3fca3eaaa', order_label: '03-증명1',  type_codes: ['공수1-01-07'] },
  { id: '2d8deba8-b3e9-4e05-95de-860511be4225', order_label: '03-풀이02', type_codes: ['공수1-01-07'] },
  { id: 'e5b46da8-624e-47f0-9e9d-3cf8297a3cc1', order_label: '03-풀이03', type_codes: ['공수1-01-07'] },
]

/** 옛 방식 — 합쳐 `order_label`(동률은 id) 로 정렬한 뒤 앞 3편 */
function oldWaySelect(rows: typeof RETURNED_ROWS): typeof RETURNED_ROWS {
  return [...rows]
    .sort((a, b) => a.order_label.localeCompare(b.order_label) || a.id.localeCompare(b.id))
    .slice(0, MAX_FIRST_SET_VIDEOS)
}

const typesCovered = (ids: readonly string[]): Set<string> => {
  const out = new Set<string>()
  for (const r of RETURNED_ROWS) if (ids.includes(r.id)) for (const t of r.type_codes) out.add(t)
  return out
}

// ════════════════════════════════════════════════════════════════════
// V — 고르는 방식
// ════════════════════════════════════════════════════════════════════

test('V1 **측정**: 옛 방식은 유형 하나를 밀어내고, 지금 방식은 둘 다 덮는다', () => {
  const oldIds = oldWaySelect(RETURNED_ROWS).map((r) => r.id)
  const newIds = selectFirstSetVideos(RETURNED_ROWS).picked.map((p) => p.row.id)

  const oldTypes = typesCovered(oldIds)
  const newTypes = typesCovered(newIds)

  // 옛 방식 — `02…` 가 앞을 다 차지해 `공수1-01-07` 이 **한 편도 없다**
  assert.equal(oldIds.length, 3, '옛 방식도 3편은 고릅니다')
  assert.ok(oldTypes.has('공수1-01-02'))
  assert.ok(!oldTypes.has('공수1-01-07'),
    '옛 방식이 공수1-01-07 을 덮어 버리면 이 검사는 차이를 못 잽니다')

  // 지금 방식 — 두 유형 **모두** 들어 있다
  assert.deepEqual([...newTypes].sort(), ['공수1-01-02', '공수1-01-07'])
})

test('V2 전체 상한 3편을 **유지한다** — 유형을 맞추려고 넓히지 않는다', () => {
  assert.equal(MAX_FIRST_SET_VIDEOS, 3)
  assert.equal(CANDIDATES.max_first_set_videos, 3, '044 결과가 준 상한과 같아야 합니다')
  assert.equal(FIRST_SET.maxVideos, 3, '첫 세트 범위의 상한과 어긋납니다')
  assert.ok(selectFirstSetVideos(RETURNED_ROWS).picked.length <= 3)
  assert.equal(FIRST_SET_VIDEOS.length, 3)
})

test('V3 고정 목록이 **두 유형을 모두** 대표한다', () => {
  assert.ok(coversEveryType([...FIRST_SET.typeCodes]))
  assert.deepEqual(CANDIDATES.first_set_types, [...FIRST_SET.typeCodes])
})

test('V4 조회되지 않은 자리는 **다른 영상으로 메우지 않는다**', () => {
  // 2순위 영상이 조회에서 빠진 상황
  const without = RETURNED_ROWS.filter((r) => r.id !== FIRST_SET_VIDEOS[1].videoId)
  const { picked, missing } = selectFirstSetVideos(without)

  assert.equal(picked.length, 2, '빈 자리를 다른 영상으로 메웠습니다')
  assert.deepEqual(missing.map((m) => m.videoId), [FIRST_SET_VIDEOS[1].videoId])
  // 목록에 없는 행(`v-0102-개념02` 등)이 끼어들지 않았다
  for (const p of picked) assert.ok(FIRST_SET_VIDEO_IDS.includes(p.row.id))
})

test('V5 조회 결과의 **순서를 믿지 않는다** — 우선순위 순으로 나온다', () => {
  const shuffled = [...RETURNED_ROWS].reverse()
  const picked = selectFirstSetVideos(shuffled).picked
  assert.deepEqual(picked.map((p) => p.want.priority), [1, 2, 3])
  assert.deepEqual(picked.map((p) => p.row.id), [...FIRST_SET_VIDEO_IDS])
})

test('V6 운영 어댑터에 **전역 정렬·상한 선택 경로가 없다**', () => {
  const src = read('lib/learning/supabaseContent.ts')
  const videos = src.slice(src.indexOf('async function loadVideos'), src.indexOf('return {\n    source:'))

  assert.ok(/\.in\('id', \[\.\.\.FIRST_SET_VIDEO_IDS\]\)/.test(videos),
    '고정 id 로 읽지 않습니다')
  assert.ok(!/order\('order_label'/.test(videos),
    'order_label 정렬로 다시 고르고 있습니다 (044 §3 이 지적한 경로)')
  assert.ok(!/\.limit\(/.test(videos),
    '조회에 전역 상한이 남아 있습니다')
  assert.ok(/selectFirstSetVideos\(/.test(videos),
    '고르는 규칙이 두 곳으로 갈라졌습니다')
})

// ════════════════════════════════════════════════════════════════════
// R — 검수 상태를 **각각 실제대로**
// ════════════════════════════════════════════════════════════════════

test('R1 다섯 칸이 **각각** 있다 — 하나로 합치지 않는다', () => {
  for (const v of FIRST_SET_VIDEOS) {
    assert.deepEqual(Object.keys(v.status).sort(),
      ['assetExists', 'confirmItemsReady', 'exposureReviewed', 'playbackVerified', 'studentAccess'])
  }
})

test('R2 모르는 검수를 **참으로 채우지 않았다**', () => {
  // 044 결과의 review 는 전부 null = 모름이다
  for (const c of CANDIDATES.primary_candidates) {
    for (const [k, val] of Object.entries(c.review)) {
      assert.equal(val, null, `044 결과의 ${k} 가 null 이 아닙니다 — 고정 목록을 다시 맞춰야 합니다`)
    }
  }
  for (const v of FIRST_SET_VIDEOS) {
    assert.equal(v.status.playbackVerified, 'unknown')
    assert.equal(v.status.studentAccess, 'unknown')
    assert.equal(v.status.exposureReviewed, 'unknown')
    assert.equal(v.status.confirmItemsReady, 'no', '검수된 확인문제가 아직 없습니다')
    assert.equal(readyForStudents(v), false, '학생에게 내보낼 수 있다고 적혀 있습니다')
    assert.ok(pendingChecks(v).length >= 4)
  }
})

test('R3 `assetExists` 는 **재생 성공이 아니다** — 따로 적는다', () => {
  for (const v of FIRST_SET_VIDEOS) {
    assert.equal(v.status.assetExists, 'yes')
    assert.notEqual(v.status.playbackVerified, 'yes',
      'youtube_id 가 있다고 재생 성공으로 적었습니다 (044 §2)')
  }
})

test('R4 운영 어댑터는 `youtube_id` 를 **지금 읽은 값으로** 적는다', () => {
  const src = read('lib/learning/supabaseContent.ts')
  assert.ok(/assetExists: assetExistsNow \?\? 'unknown'/.test(src),
    '조회 못 한 것을 모름으로 두지 않습니다')
  assert.ok(/assetExistsDisagrees/.test(src),
    '고정 목록과 조회값이 다를 때를 남기지 않습니다')
  // 네 칸은 고정 목록의 값을 그대로 옮긴다 — 코드가 참으로 바꾸지 않는다
  assert.ok(!/playbackVerified: 'yes'|studentAccess: 'yes'|exposureReviewed: 'yes'/.test(src),
    '코드가 검수를 통과시켜 버립니다')
})

// ════════════════════════════════════════════════════════════════════
// H — 044 가 금지한 과잉 처리
// ════════════════════════════════════════════════════════════════════

test('H1 대체 후보는 **3번 자리 대체**다 — 네 번째가 아니다', () => {
  assert.equal(SLOT3_REPLACEMENT.priority, 3)
  assert.equal(SLOT3_REPLACEMENT.videoId, CANDIDATES.replacement_candidate_for_slot3.id)
  assert.ok(!FIRST_SET_VIDEO_IDS.includes(SLOT3_REPLACEMENT.videoId),
    '대체 후보가 기본 3편에 들어가 있습니다')
})

test('H2 소스 미확인 후보를 **지우거나 자동 대체하지 않는다**', () => {
  assert.equal(HELD_PENDING_SOURCE.videoId, CANDIDATES.excluded_pending_youtube_identifier.id)
  assert.equal(HELD_PENDING_SOURCE.status.assetExists, 'no')
  // 상태로 남아 있고, 기본 3편에는 들어가지 않는다
  assert.ok(!FIRST_SET_VIDEO_IDS.includes(HELD_PENDING_SOURCE.videoId))
  // 「제작 파일이 없다」로 올려 적지 않았다 (044 §2)
  assert.ok(/제작 파일이 없다는 뜻이 아니다/.test(read('lib/learning/firstSet.ts')))
})

test('H3 `type_codes` 중복은 **세는 자리에서만** 지운다', () => {
  const src = read('lib/learning/supabaseContent.ts')
  assert.ok(/new Set\(\(row\.type_codes as string\[\]\)\.map\(String\)\)/.test(src),
    '중복 태그를 세는 자리에서 지우지 않습니다')
  // 운영 데이터를 고치는 쪽으로 가지 않았다
  assert.ok(!/update\(|delete\(|\.rpc\(/.test(src), '운영 데이터를 고치려 합니다')
})

/** 주석을 뺀 **코드만** 본다 — 설명 글에 적힌 옛 경로가 걸리지 않게 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

test('H4 장면 **시작·끝 초를 만들어 쓰지 않는다**', () => {
  // 고정 목록에는 장면 **이름만** 있다
  for (const v of FIRST_SET_VIDEOS) {
    assert.ok(v.sceneLabels.length > 0)
    assert.ok(!Object.keys(v).some((k) => /start|end|segment/i.test(k)),
      '044 결과에 없는 장면 시각을 적어 두었습니다')
  }
  // 어댑터는 초가 숫자가 아니면 구간을 만들지 않는다.
  //
  // ⚠️ 045 (R045-04 §7.4) 로 **검사 방식이 더 세졌다.** 044 는
  //   `Number.isFinite(Number(scene.start))` 였는데, 그러면 `null` 과 `''` 가
  //   **0 으로 바뀌어 통과**한다 (`true` 는 1 이 된다). GPT 탐침 P07 이
  //   `start:null, end:null` 에서 `0–0` 구간이 만들어지는 것을 잡았다.
  // 설명 주석에 옛 경로를 적어 두었으므로 **주석을 뺀 코드**만 본다
  const src = codeOnly(read('lib/learning/supabaseContent.ts'))
  assert.ok(!/Number\(scene\.start\)|Number\(scene\.end\)/.test(src),
    '초를 Number() 로 바꾸고 있습니다 — null·빈문자열이 0 으로 통과합니다')
  assert.ok(/typeof start !== 'number' \|\| typeof end !== 'number'/.test(src),
    '초의 자료형을 보지 않습니다')

  // 그리고 **값으로** 확인한다 — 글자만 보는 시험이 아니다
  const { sceneSeconds } = require('../learning/supabaseContent') as {
    sceneSeconds: (s: unknown, d: number | null) => unknown
  }
  for (const bad of [
    { start: null, end: null }, { start: '', end: '' }, { start: true, end: true },
    { start: 0, end: 0 }, { start: 10, end: 5 }, { start: -1, end: 5 },
    { start: 1, end: Number.NaN }, {},
  ]) {
    assert.equal(sceneSeconds(bad, 100), null,
      `장면 ${JSON.stringify(bad)} 에서 구간을 만들었습니다`)
  }
  // 영상 길이를 넘는 끝도 받지 않는다
  assert.equal(sceneSeconds({ start: 10, end: 500 }, 100), null)
  // 말이 되는 값은 그대로
  assert.deepEqual(sceneSeconds({ start: 10, end: 40 }, 100), { startSeconds: 10, endSeconds: 40 })
})

test('H5 후보 목록이 **044 결과와 글자까지 같다**', () => {
  const want = CANDIDATES.primary_candidates
  assert.equal(FIRST_SET_VIDEOS.length, want.length)
  for (let i = 0; i < want.length; i += 1) {
    const mine = FIRST_SET_VIDEOS[i]
    const m = want[i].video_metadata
    assert.equal(mine.videoId, m.id)
    assert.equal(mine.title, m.title)
    assert.equal(mine.kind, m.kind)
    assert.equal(mine.orderLabel, m.order_label)
    assert.equal(mine.durationSeconds, m.duration_seconds, '길이를 반올림해 적었습니다')
    assert.equal(mine.targetTypeCode, want[i].target_type_code)
    assert.equal(mine.status.assetExists, m.has_video_source ? 'yes' : 'no')
    assert.equal(mine.priority, i + 1)
  }
})

test('H6 이 목록이 **공개 승인이 아님**을 044 결과가 못 박았다', () => {
  assert.equal(CANDIDATES.status, 'metadata_based_candidate_shortlist_not_publication_approval')
  assert.equal(CANDIDATES.live_access_authorized, false)
  // 코드 주석에도 같은 말이 남아 있어야 한다
  assert.ok(/운영 공개·노출 안전 승인 목록이 아니다/.test(read('lib/learning/firstSet.ts')))
})

// ════════════════════════════════════════════════════════════════════
// C — 내가 틀렸던 보고의 정정
// ════════════════════════════════════════════════════════════════════

test('C1 「공수1-01-07 영상 0편」 이라는 **내 보고가 틀렸다는 것**이 기록돼 있다', () => {
  const log = read('docs/AI_QUESTION_APP_DECISION_LOG.md')
  // 044 결과: 01-07 에 4편이 태그돼 있었다
  assert.ok(/01-07[^\n]*4편|4편[^\n]*01-07/.test(log),
    '정정 기록이 대장에 없습니다')
  assert.ok(/전역 상한|LIMIT 3|합쳐/.test(log), '원인(조회 방식)이 적혀 있지 않습니다')
})

test('C2 밀려난 원인이 **자료 부재가 아니라 조회 방식**이라고 적혀 있다', () => {
  const src = read('lib/learning/firstSet.ts')
  assert.ok(/원인은 자료가 아니라/.test(src))
  assert.ok(/4편/.test(src), '01-07 에 영상이 몇 편 있었는지 적혀 있지 않습니다')
})
