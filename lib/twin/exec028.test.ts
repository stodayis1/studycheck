// GPT-EXEC-028 — Storage 표본 점검 도구의 판정 시험 (§84)
//
// 실행: npm run test:twin
//
// 무엇을 시험하는가
//   정상 1건 · 필수 메타데이터 누락 · 경로 불일치 · 읽기 실패/빈 이미지에서
//   **의도한 판정이 나오는지**. 그리고 보고서에 민감한 값이 새지 않는지.
//
// ⚠ 이 시험은 **합성 응답·로컬 fixture 만** 쓴다 (§82).
//   운영 Storage 응답 형태를 확인하지 않았으므로, 이 통과를 **실제 표본 성공이라고
//   쓰지 않는다** (§84). 실제 표본은 별도 승인 뒤에 한 건 읽어 확인한다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  checkStorageSample, redactPath, detailOf, formatSampleReport,
} from './storageSample'
import { StorageError } from './storage'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const readRaw = (p: string) => readFileSync(join(ROOT, p))

const PATH = 'syn/공수1/0001.png'
const NAME = '0001.png'

type Row = Record<string, unknown>

function fileRow(over: Row = {}): Row {
  return {
    name: NAME,
    id: 'syn-object-id',
    updated_at: '2026-10-02T01:02:03.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
    metadata: { eTag: '"abc123def456"', size: 4, mimetype: 'image/png' },
    ...over,
  }
}

/** 합성 Supabase Storage 대역. 네트워크를 쓰지 않는다 */
function fakeDb(opts: {
  list?: Row[]
  listError?: { message: string } | null
  listThrows?: boolean
  download?: { data: Blob | null; error: { message: string } | null }
  downloadThrows?: boolean
} = {}) {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  const defaultBlob = new Blob([bytes], { type: 'image/png' })
  return {
    storage: {
      from: () => ({
        list: async () => {
          if (opts.listThrows) throw new Error('syn list throw')
          return { data: opts.list ?? [fileRow()], error: opts.listError ?? null }
        },
        download: async () => {
          if (opts.downloadThrows) throw new Error('syn download throw')
          return opts.download ?? { data: defaultBlob, error: null }
        },
      }),
    },
  } as never
}

// ════════════════════════════════════════════════════════════════════
// 정상 1건
// ════════════════════════════════════════════════════════════════════

test('정상 표본 — 운영 경로가 수락하고 ETag 키·바이트 수를 보고한다', async () => {
  const r = await checkStorageSample(fakeDb(), PATH)
  assert.equal(r.ok, true, formatSampleReport(r))
  assert.equal(r.code, null)
  assert.equal(r.meta.acceptedByProductionPath, true)
  assert.equal(r.meta.updatedAtPresent, true)
  assert.equal(r.meta.updatedAtParsesAsDate, true)
  assert.equal(r.meta.etagKey, 'eTag')
  assert.equal(r.meta.etagLength, 12, '따옴표를 벗긴 길이여야 합니다')
  assert.deepEqual(r.meta.metadataKeys, ['eTag', 'mimetype', 'size'])
  assert.equal(r.image.mime, 'image/png')
  assert.equal(r.image.read, true)
  assert.equal(r.image.bytes, 4)
})

test('ETag 가 소문자 키로 와도 어느 키였는지 보고한다 (D-086)', async () => {
  const r = await checkStorageSample(
    fakeDb({ list: [fileRow({ metadata: { etag: 'zz99', size: 4 } })] }), PATH)
  assert.equal(r.ok, true, formatSampleReport(r))
  assert.equal(r.meta.etagKey, 'etag')
  assert.equal(r.meta.etagLength, 4)
})

// ════════════════════════════════════════════════════════════════════
// 필수 메타데이터 누락 — 보충해서 통과시키지 않는다
// ════════════════════════════════════════════════════════════════════

test('updated_at 이 없으면 실패한다 — created_at 으로 대신하지 않는다 (D-083)', async () => {
  const r = await checkStorageSample(
    fakeDb({ list: [fileRow({ updated_at: null })] }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'updated_at_missing')
  assert.equal(r.meta.acceptedByProductionPath, false)
  // created_at 이 있어도 통과하지 않는다
  assert.equal(r.meta.updatedAtPresent, false)
})

test('metadata 가 없으면 실패한다', async () => {
  const r = await checkStorageSample(
    fakeDb({ list: [fileRow({ metadata: null })] }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'metadata_missing')
})

test('ETag 가 두 키 어디에도 없으면 실패한다', async () => {
  const r = await checkStorageSample(
    fakeDb({ list: [fileRow({ metadata: { size: 4, mimetype: 'image/png' } })] }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'etag_missing')
  assert.equal(r.meta.etagKey, null)
})

test('파일이 아닌 항목(id 없음)이면 실패한다', async () => {
  const r = await checkStorageSample(
    fakeDb({ list: [fileRow({ id: null })] }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'not_a_file')
})

// ════════════════════════════════════════════════════════════════════
// 경로 불일치
// ════════════════════════════════════════════════════════════════════

test('이름이 정확히 같지 않으면 실패한다 — 접두사 일치로 통과시키지 않는다', async () => {
  const r = await checkStorageSample(
    fakeDb({ list: [fileRow({ name: '0001.png.bak' })] }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'not_found')
  assert.equal(r.meta.etagKey, null, '정확일치가 아니면 probe 도 값을 읽지 않아야 합니다')
})

test('같은 이름이 둘 이상이면 실패한다', async () => {
  const r = await checkStorageSample(
    fakeDb({ list: [fileRow(), fileRow()] }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'ambiguous')
})

test('목록에 없으면 실패한다', async () => {
  const r = await checkStorageSample(fakeDb({ list: [] }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'not_found')
})

test('목록 조회 자체가 실패하면 실패한다', async () => {
  const r = await checkStorageSample(fakeDb({ listError: { message: 'syn' } }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'list_error')
})

test('빈 경로는 조회하지 않고 실패한다', async () => {
  const r = await checkStorageSample(fakeDb(), '   ')
  assert.equal(r.ok, false)
  assert.equal(r.code, 'empty_path')
})

// ════════════════════════════════════════════════════════════════════
// 읽기 실패 / 빈 이미지
// ════════════════════════════════════════════════════════════════════

test('0바이트 이미지는 실패한다', async () => {
  const empty = new Blob([Buffer.alloc(0)], { type: 'image/png' })
  const r = await checkStorageSample(
    fakeDb({ download: { data: empty, error: null } }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'image_empty')
  assert.equal(r.image.bytes, 0)
  // 메타는 통과했다는 것도 함께 보인다
  assert.equal(r.meta.acceptedByProductionPath, true)
})

test('다운로드 오류는 실패한다', async () => {
  const r = await checkStorageSample(
    fakeDb({ download: { data: null, error: { message: 'syn' } } }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'image_download_failed')
})

test('다운로드가 예외를 던져도 실패로 분류한다', async () => {
  const r = await checkStorageSample(fakeDb({ downloadThrows: true }), PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'image_download_failed')
})

test('허용 밖 확장자는 실패한다', async () => {
  const r = await checkStorageSample(
    fakeDb({ list: [fileRow({ name: '0001.gif' })] }), 'syn/공수1/0001.gif')
  assert.equal(r.ok, false)
  assert.equal(r.code, 'image_unsupported_type')
  assert.equal(r.image.mime, null)
})

test('원시 목록이 예외를 던져도 운영 경로가 판정한다', async () => {
  const r = await checkStorageSample(fakeDb({ listThrows: true }), PATH)
  assert.equal(r.ok, false)
  // probe 가 터졌다고 통과시키지 않는다
  assert.ok(r.code !== null)
})

// ════════════════════════════════════════════════════════════════════
// 보고서에 민감한 값이 새지 않는가 (§77)
// ════════════════════════════════════════════════════════════════════

test('보고서에 전체 경로·ETag 값·이미지 본문이 없다', async () => {
  const r = await checkStorageSample(fakeDb(), PATH)
  const text = JSON.stringify(r) + ' ' + formatSampleReport(r)
  assert.ok(!text.includes(PATH), '전체 경로가 보고서에 있습니다')
  assert.ok(!text.includes('공수1'), '경로의 디렉터리 이름이 보고서에 있습니다')
  assert.ok(!text.includes(NAME), '파일명이 보고서에 있습니다')
  assert.ok(!text.includes('abc123def456'), 'ETag 값이 보고서에 있습니다')
  assert.ok(!text.includes('data:image'), 'data URL 이 보고서에 있습니다')
  assert.ok(!/iVBOR|base64,/.test(text), '이미지 본문이 보고서에 있습니다')
  // 그래도 필요한 사실은 들어 있다
  assert.ok(text.includes('eTag'), 'ETag 키 표기는 있어야 합니다')
  assert.ok(text.includes('"bytes":4'), '바이트 수는 있어야 합니다')
})

test('경로 비식별화는 깊이·확장자·이름해시만 남긴다', () => {
  const p = redactPath('a/b/c/0042.JPG')
  assert.equal(p.dirDepth, 3)
  assert.equal(p.ext, 'jpg')
  assert.equal(p.nameHash8.length, 8)
  assert.match(p.nameHash8, /^[0-9a-f]{8}$/)
  // 같은 이름은 같은 해시, 다른 이름은 다른 해시
  assert.equal(redactPath('x/0042.JPG').nameHash8, p.nameHash8)
  assert.notEqual(redactPath('x/0043.JPG').nameHash8, p.nameHash8)
  // 디렉터리가 없어도 깨지지 않는다
  assert.deepEqual(redactPath('only.png').dirDepth, 0)
})

test('실패 사유를 꺼낼 때 경로가 섞여 나오지 않는다', () => {
  const weird = 'dir:with:colons/0001.png'
  const e = new StorageError('storage_meta_unavailable', weird, 'not_found')
  assert.equal(detailOf(e), 'not_found', '경로에 콜론이 있어도 사유만 나와야 합니다')
  const noDetail = new StorageError('image_load_failed', weird)
  assert.equal(detailOf(noDetail), '')
})

// ════════════════════════════════════════════════════════════════════
// 이 도구가 해서는 안 되는 것 (§78·§82)
// ════════════════════════════════════════════════════════════════════

test('import 만으로 접속하거나 모델을 부르지 않는다', () => {
  const s = read('lib/twin/storageSample.ts')
  // 클라이언트를 만들지 않는다 — 인자로 받는다
  assert.ok(!/createClient\s*\(/.test(s), 'createClient 를 부르고 있습니다')
  assert.ok(!/serverClient\s*\(/.test(s), 'serverClient 를 부르고 있습니다')
  assert.ok(!/process\.env/.test(s), '환경변수를 읽고 있습니다')
  // 모델·생성·공개 경로를 건드리지 않는다
  for (const bad of ['openai', 'anthropic', 'generate', 'runPipeline',
                     'server_create_twin_candidate', 'admin_set_practice_publication']) {
    assert.ok(!s.toLowerCase().includes(bad.toLowerCase()), `${bad} 를 참조하고 있습니다`)
  }
  // 쓰기를 하지 않는다 — Storage API 는 list 와 download 뿐이다.
  //
  // `.update(` 를 뭉뚱그려 찾으면 `createHash(...).update(...)` 가 걸린다.
  // 실제로 걸려서 시험이 실패했다. 그래서 **Storage/테이블 접근 지점만** 본다
  const storageCalls = [...s.matchAll(/storage\.from\([^)]*\)\.(\w+)\(/g)].map(m => m[1])
  assert.deepEqual([...new Set(storageCalls)].sort(), ['list'],
    `storage.from(...) 에서 쓰는 메서드가 list 뿐이어야 합니다: ${storageCalls.join(',')}`)
  // download 는 storage.ts 의 loadSourceImageDataUrl 이 하고, 이 파일은 직접 부르지 않는다
  assert.ok(!/storage\.from\([^)]*\)\.download\(/.test(s))
  for (const bad of ['.upload(', '.remove(', '.move(', '.copy(',
                     'createSignedUrl', 'getPublicUrl', 'createBucket', 'emptyBucket']) {
    assert.ok(!s.includes(bad), `${bad} 를 쓰고 있습니다`)
  }
  // 테이블에 직접 쓰지 않는다 (db.from('...') 경로 자체를 쓰지 않는다)
  // R028-03: 028 판은 `\b` 대신 **U+0008(backspace)** 가 들어가 평범한
  // `db.from(` 을 하나도 잡지 못했다. heredoc 에서 백슬래시가 먹힌 그 버그다.
  assert.ok(!/\bdb\.from\(/.test(s), 'db.from(...) 으로 테이블에 접근하고 있습니다')
})

test('검증 자체는 기존 storage.ts 에 맡긴다 — 다시 구현하지 않았다 (§72)', () => {
  const s = read('lib/twin/storageSample.ts')
  assert.match(s, /from '\.\/storage'/)
  // 029 부터는 전달용 어댑터(tap)를 거친다 — list 를 한 번만 부르고 그 응답을 포착하기 위해서다.
  // 검증 자체는 여전히 storage.ts 가 한다 (복제하지 않았다)
  assert.match(s, /loadStorageMeta\(tap, path\)/)
  assert.match(s, /loadSourceImageDataUrl\(tap, path\)/)
  // storage.ts 는 이번에 바뀌지 않았다 (기존 검사의 의미를 유지한다)
  const st = read('lib/twin/storage.ts')
  assert.match(st, /updated_at_missing/)
  assert.match(st, /etag_missing/)
  assert.match(st, /empty_file/)
})

test('표본 계획 문서가 운영 실행 미승인을 표시한다', () => {
  const plan = read('STORAGE_SAMPLE_PLAN_028.md')
  for (const w of ['미승인', '표본', '1건', '공통수학1', '중단 조건', 'updated_at', 'ETag']) {
    assert.ok(plan.includes(w), `계획 문서에 "${w}" 가 없습니다`)
  }
  // 표본 ID·경로를 임의로 만들어 넣지 않았다 (§73)
  assert.ok(plan.includes('미확정'), '아직 정해지지 않은 항목을 미확정으로 적어야 합니다')
})

test('파일럿 범위는 공통수학1 그대로다 (D-110)', () => {
  const j = JSON.parse(read('docs/twin/PILOT_TYPES_014.json')) as {
    types: { type_code: string; grade: string }[]
    scope_note: string
  }
  assert.equal(j.types.length, 10)
  assert.ok(j.types.every(t => t.grade === '공통수학1'))
  assert.match(j.scope_note, /공통수학1/)
})

// ════════════════════════════════════════════════════════════════════
// 상태 문서가 이번 운영 결과를 정확히 적는가 (§1·§3)
// ════════════════════════════════════════════════════════════════════

test('체크포인트 문서는 루트 사본과 바이트까지 같다', () => {
  // 원장님이 GPT 에 보낼 때 폴더를 왔다갔다 하지 않도록 루트에도 둔다.
  // 사본이 조용히 어긋나면 어느 쪽이 맞는지 알 수 없으므로 여기서 묶어 둔다
  // (PATCH_PUBLICATION_025.sql = migration 과 같은 방식).
  assert.deepEqual(readRaw('DB_CHECKPOINT_028.md'), readRaw('docs/twin/DB_CHECKPOINT_028.md'))
})

test('체크포인트 문서가 근거와 미확인 범위를 함께 적는다', () => {
  const d = read('docs/twin/DB_CHECKPOINT_028.md')
  // 성공 기록
  assert.ok(d.includes('Success. No rows returned'))
  assert.match(d, /62d7c260/, '025 패치 해시가 있어야 합니다')
  assert.match(d, /4c913d8d/, '017 검증 해시가 있어야 합니다')
  // 과대 해석 방지 문구
  for (const w of ['관찰하지 않았', '0 rows', 'NOTICE', '미확인']) {
    assert.ok(d.includes(w), `"${w}" 에 대한 한계 기술이 없습니다`)
  }
  // 과거 실패 이력 보존
  for (const w of ['42501', '42P10', 'P0001']) {
    assert.ok(d.includes(w), `과거 실패 이력 ${w} 이 없습니다`)
  }
})

test('과거 보고서의 「미적용」 기술을 일괄 치환하지 않았다 (§62)', () => {
  // 021·022·025 회차 보고서는 그 시점의 자료로 남아 있어야 한다
  assert.match(read('CLAUDE_RESULT_021.md'), /미승인/)
  assert.match(read('CLAUDE_RESULT_025.md'), /미승인/)
  assert.match(read('PATCH_RUNBOOK_025.md'), /미승인/)
  // 실패 이력 로그도 그대로
  assert.match(read('PGTEST_LOG_021_NOTE.md'), /429/)
})

test('028 운영 결과에 D 번호를 붙이지 않았다 (§63)', () => {
  const log = read('docs/AI_QUESTION_APP_DECISION_LOG.md')
  const nums = [...log.matchAll(/^### D-(\d+)/gm)].map(m => Number(m[1]))

  // §63 은 「**이번(028) 운영 결과는** 번호 없는 체크포인트로 기록한다」는 지시였다.
  //
  // 처음에는 `max(nums) === 126` 으로 적었다. 028 시점에는 맞았지만, 그건 028 의 성질이
  // 아니라 **파일 전체의 미래를 얼리는** 단정이었다. 뒤 회차가 지시대로 결정을 남기면
  // (041 의 D-127~132, 2026-10-27 의 D-133~136) 무조건 깨진다 —
  // AGENTS.md 의 「바꾸면 DECISION_LOG 에 기록한다」와도 부딪힌다.
  //
  // 그래서 **지키려던 것만** 본다: 028 체크포인트 구역에 번호가 붙지 않았는가.
  // 느슨해진 것이 아니라, 구역을 지정해 **더 좁게** 본다 (2026-10-27, 042 회차).
  const head = log.indexOf('## 운영 체크포인트')
  assert.notEqual(head, -1, '운영 체크포인트 구역이 없습니다')
  const rest = log.slice(head)
  const next = rest.indexOf('\n## ', 1)
  const section = next === -1 ? rest : rest.slice(0, next)

  assert.ok(/^### CP-/m.test(section), '체크포인트 항목이 없습니다')
  assert.deepEqual([...section.matchAll(/^### D-(\d+)/gm)].map(m => m[1]), [],
    '028 운영 결과에 D 번호를 붙였습니다')

  // 028 시점까지의 번호는 그대로 남아 있어야 한다 (뒤 회차가 지우지 않았는가)
  assert.ok(nums.includes(126), 'D-126 이 사라졌습니다')
  assert.equal(nums.filter(n => n <= 126).length, 125,
    '028 시점까지의 D 번호 개수가 달라졌습니다')
})

test('028 번호의 설치·패치·검증·rollback SQL 을 만들지 않았다 (§55)', () => {
  for (const p of ['INSTALL_TO_RUN_028.sql', 'PATCH_PUBLICATION_028.sql',
                   'POSTINSTALL_TO_RUN_028.sql', 'ROLLBACK_028.sql']) {
    assert.throws(() => readFileSync(join(ROOT, p)), `${p} 를 만들면 안 됩니다`)
  }
})

test('현행 실행 파일 해시가 그대로다 (§42)', async () => {
  const { createHash } = await import('node:crypto')
  const sha = (p: string) => createHash('sha256')
    .update(readFileSync(join(ROOT, p))).digest('hex')
  assert.equal(sha('PATCH_PUBLICATION_025.sql'),
    '62d7c26039af9c7c3346f6aa4f1e4c7210e377bf2185efab2feb8241031f8cb0')
  assert.equal(sha('POSTINSTALL_TO_RUN_017.sql'),
    '4c913d8d4beef1fb8247afee5e31084d7163b5cafe9271ecea613bbffccb5deb')
  assert.equal(sha('INSTALL_TO_RUN_014.sql'),
    'a5e441e59c2c08aa65d6a0b85b2a4737b0799aaece5376e0a151a5105946f9b0')
})
