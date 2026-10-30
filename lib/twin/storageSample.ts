// Storage SDK 표본 1건 점검 (GPT-EXEC-028 §66 · GPT-EXEC-029 §49 · D-091 · D-100)
//
// 왜 필요한가
//   SQL 로 `storage.objects.metadata` 에 ETag 가 있는지는 집계했다. 그러나 **SDK 응답에서
//   그 값이 어느 키로 오는지**(`eTag` / `etag`)는 SQL 로 확정할 수 없다 (D-100).
//   그리고 "이미지를 실제 프로그램 경로로 읽을 수 있는가" 는 메타 집계로 대신할 수 없다.
//   그래서 유료 모델 스모크 **전에** 표본 1건을 실제 SDK 로 읽어 확인한다 (D-091).
//
// ════════════════════════════════════════════════════════════════════
// 029 에서 고친 것 — 028 판의 두 가지 결함
// ════════════════════════════════════════════════════════════════════
// R028-01  필수 조건이 **성공 판정에 연결되지 않았다.**
//          `updated_at` 이 날짜로 해석되지 않아도, 정규화한 ETag 가 빈 값이어도
//          `ok = true` 였다. 보고서에는 「해석불가」·「etagLen=0」 이라 적으면서
//          동시에 「성공」이라 적는 모순이 났다.
//
// R028-02  **보고용 응답과 검증용 응답이 서로 달랐다.**
//          원시 `list` 한 번으로 보고 항목을 채우고, `loadStorageMeta` 가 **또 한 번**
//          `list` 했다. 두 응답이 같은지 확인하지 않고 「첫 응답의 키·길이」와
//          「둘째 응답의 통과」를 합쳐 성공이라 했다. 같은 경로를 두 번 읽은 것뿐이다.
//          메타 조회가 실패한 뒤에도 이미지 다운로드가 한 번 일어났다.
//
// 지금 구조
//   **SDK `list` 는 딱 한 번만 호출한다.** 그 한 응답을 `loadStorageMeta` 의 검증과
//   보고 항목 추출이 **함께** 쓴다. 전달용 어댑터가 `loadStorageMeta` 의 호출을 실제 db 로
//   그대로 넘기면서 그 응답을 포착한다. 호출 횟수도 센다 — list 1회·download 1회를 넘으면
//   그 자리에서 막는다. 필수 조건이 하나라도 어긋나면 **다운로드 전에** 끝낸다.
//
//   `storage.ts` 의 검증을 복제하지 않는다. `loadStorageMeta` 와
//   `loadSourceImageDataUrl` 를 그대로 쓰고, 보고는 **그 함수가 수락한 값**에서 뽑는다.
//   두 번째 list 를 몰래 보내거나 실패 뒤 다른 응답으로 재시도해 성공시키지 않는다.
//
// 무엇을 **하지 않는가**
//   - 모델을 부르지 않는다. 후보를 만들거나 저장하지 않는다. 공개하지 않는다.
//   - 파이프라인을 돌리지 않는다. 이미지 연결만 보려고 전체를 실행하지 않는다.
//   - **import 만으로 아무것도 접속하지 않는다.** 클라이언트를 인자로 받는다.
//   - 쓰기를 하지 않는다. `list` 와 `download` 뿐이다.
//   - 범용 SDK Proxy·새 파서·새 RPC 를 만들지 않는다. 필요한 만큼의 작은 어댑터다.
//
// 이것이 무엇이 **아닌지**
//   버전 식별을 위한 메타 점검이다. 메타 조회와 다운로드 사이에 파일이 바뀌지 않는다는
//   **원자적 보장이 아니고**, 이미지 디코딩 검증도, 수학 내용 품질 검증도 아니다.
//
// 보고서에 넣지 않는 것
//   비밀키 · 토큰 · 서명 URL · 원문 정답 · **전체 경로** · **ETag 값** · 이미지 본문 ·
//   **SDK 원문 오류 메시지**. 경로는 깊이·확장자·이름 해시 8자로만, ETag 는 **키 이름과
//   정규화 길이**만 적는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import {
  BUCKET, StorageError, mimeOf,
  loadStorageMeta, loadSourceImageDataUrl,
} from './storage'

/** 실패 분류. SDK 원문 메시지를 그대로 보고서에 넣지 않는다 */
export type SampleFailCode =
  | 'empty_path'
  | 'list_error'            // 목록 조회 자체가 실패
  | 'not_found'             // 그 경로에 객체가 없다
  | 'ambiguous'             // 이름이 정확히 같은 항목이 둘 이상
  | 'not_a_file'            // 폴더형 항목이거나 응답이 잘렸다
  | 'metadata_missing'
  | 'updated_at_missing'    // D-083 — created_at 으로 대신하지 않는다
  | 'updated_at_invalid'    // 문자열은 있으나 날짜로 해석되지 않는다 (R028-01)
  | 'etag_missing'          // D-086 — eTag/etag 어느 키에도 없다
  | 'etag_empty'            // 따옴표를 벗기니 빈 값이다 (R028-01)
  | 'meta_unavailable'      // 그 밖의 메타 실패
  | 'meta_report_mismatch'  // 검증한 값과 보고할 값이 같은 응답에서 나오지 않았다 (R028-02)
  | 'extra_read_blocked'    // list/download 를 정해진 횟수보다 더 하려 했다
  | 'image_unsupported_type'
  | 'image_download_failed'
  | 'image_empty'           // 0바이트
  | 'image_load_failed'
  | 'unexpected'

/** 경로를 비식별로 적는다. 전체 경로를 보고서에 넣지 않는다 */
export type RedactedPath = {
  /** `/` 로 나눈 디렉터리 깊이 (파일명 제외) */
  dirDepth: number
  /** 소문자 확장자. 없으면 null */
  ext: string | null
  /** 파일명 sha256 의 앞 8자. 같은 표본을 다시 가리킬 때만 쓴다 */
  nameHash8: string
}

export type SampleCheckReport = {
  /** 아래 모든 필수 조건을 만족했을 때만 true */
  ok: boolean
  code: SampleFailCode | null
  /** 비식별 실패 사유. 성공이면 null */
  detail: string | null
  bucket: string
  path: RedactedPath
  /** 실제 SDK 호출 횟수. list 1 / download 1 을 넘지 않아야 한다 */
  calls: { list: number; download: number }
  meta: {
    /** 검증과 보고가 **같은 응답**에서 나왔는가 */
    singleObservation: boolean
    /** `list` 가 돌려준 항목 수. 이름 정확일치 한 개만 채택한다 */
    listedEntries: number
    /** `loadStorageMeta` 가 수락한 `updated_at` 이 비어 있지 않은가 */
    updatedAtPresent: boolean
    /** 그 값이 날짜로 해석되는가 — **성공의 필수 조건** */
    updatedAtParsesAsDate: boolean
    /** **이번 점검의 핵심** — 수락된 ETag 가 어느 키로 왔는가. 값은 적지 않는다 */
    etagKey: 'eTag' | 'etag' | null
    /** 정규화(따옴표 제거) 후 길이. 0 이면 실패 */
    etagLength: number
    /** metadata 에 있던 키 **이름**만. 값은 적지 않는다 */
    metadataKeys: string[]
    /** `loadStorageMeta` (운영 경로) 가 받아들였는가 */
    acceptedByProductionPath: boolean
  }
  image: {
    /** 확장자로 정한 MIME. 허용 목록 밖이면 null */
    mime: string | null
    /** 실제로 읽혔는가 */
    read: boolean
    /** 바이트 수. 0바이트는 실패다 */
    bytes: number
  }
}

export function redactPath(imagePath: string): RedactedPath {
  const p = (imagePath ?? '').trim()
  const slash = p.lastIndexOf('/')
  const dir = slash === -1 ? '' : p.slice(0, slash)
  const name = slash === -1 ? p : p.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  return {
    dirDepth: dir === '' ? 0 : dir.split('/').filter(s => s !== '').length,
    ext: dot > 0 ? name.slice(dot + 1).toLowerCase() : null,
    nameHash8: createHash('sha256').update(name, 'utf8').digest('hex').slice(0, 8),
  }
}

/**
 * `StorageError` 의 사유를 꺼낸다.
 *
 * `storage.ts` 는 메시지를 `code:path=<경로>:<사유>` 로 만든다. 경로에 `:` 가 섞여도
 * 어긋나지 않게 **알고 있는 접두사를 정확히 잘라** 뒤쪽만 가져온다.
 * 경로나 SDK 원문 오류가 사유에 섞여 보고서로 새지 않게 하는 것이 목적이다.
 */
export function detailOf(e: StorageError): string {
  const prefix = `${e.code}:path=${e.imagePath}`
  if (e.message.startsWith(prefix + ':')) return e.message.slice(prefix.length + 1)
  return ''
}

const META_DETAIL_CODES: Record<string, SampleFailCode> = {
  empty_path: 'empty_path',
  no_file_name: 'empty_path',
  list_error: 'list_error',
  bad_response: 'meta_unavailable',
  not_found: 'not_found',
  ambiguous: 'ambiguous',
  not_a_file: 'not_a_file',
  metadata_missing: 'metadata_missing',
  updated_at_missing: 'updated_at_missing',
  etag_missing: 'etag_missing',
}

const IMAGE_DETAIL_CODES: Record<string, SampleFailCode> = {
  unsupported_type: 'image_unsupported_type',
  download_error: 'image_download_failed',
  download_throw: 'image_download_failed',
  array_buffer_failed: 'image_load_failed',
  empty_file: 'image_empty',
}

/** 정해진 횟수를 넘겨 읽으려 할 때 던진다. 추가 읽기를 그 자리에서 막는다 */
class ExtraReadError extends Error {
  constructor(public what: 'list' | 'download') {
    super(`extra_read_blocked:${what}`)
    this.name = 'ExtraReadError'
  }
}

type Observation = {
  listCalls: number
  downloadCalls: number
  /** 포착한 `list` 응답의 항목들. 검증과 보고가 **이것 하나**를 쓴다 */
  rows: Record<string, unknown>[] | null
}

/**
 * 전달용 어댑터.
 *
 * `loadStorageMeta` 가 `db.storage.from(BUCKET).list(...)` 를 부르면 **실제 db 로 그대로
 * 넘기고** 그 응답을 포착한다. 응답을 바꾸지 않고, 고정 합성 응답으로 갈아끼우지도 않는다.
 * 횟수를 넘기면 던져서 추가 읽기를 막는다.
 *
 * 범용 Proxy 가 아니다 — `loadStorageMeta`·`loadSourceImageDataUrl` 가 쓰는 두 메서드만 둔다.
 */
function tapClient(db: SupabaseClient, obs: Observation): SupabaseClient {
  return {
    storage: {
      from: (bucket: string) => {
        const real = db.storage.from(bucket)
        return {
          list: async (dir?: string, opts?: unknown) => {
            if (obs.listCalls >= 1) throw new ExtraReadError('list')
            obs.listCalls++
            const r = await (real as unknown as {
              list: (d?: string, o?: unknown) => Promise<{ data: unknown; error: unknown }>
            }).list(dir, opts)
            obs.rows = Array.isArray(r?.data) ? (r.data as Record<string, unknown>[]) : null
            return r
          },
          download: async (p: string) => {
            if (obs.downloadCalls >= 1) throw new ExtraReadError('download')
            obs.downloadCalls++
            return (real as unknown as {
              download: (p: string) => Promise<unknown>
            }).download(p)
          },
        }
      },
    },
  } as unknown as SupabaseClient
}

function emptyReport(imagePath: string, obs: Observation): SampleCheckReport {
  return {
    ok: false, code: null, detail: null,
    bucket: BUCKET,
    path: redactPath(imagePath),
    calls: { list: obs.listCalls, download: obs.downloadCalls },
    meta: {
      singleObservation: false, listedEntries: 0,
      updatedAtPresent: false, updatedAtParsesAsDate: false,
      etagKey: null, etagLength: 0, metadataKeys: [],
      acceptedByProductionPath: false,
    },
    image: { mime: mimeOf((imagePath ?? '').trim()), read: false, bytes: 0 },
  }
}

/** 따옴표를 벗긴다. `storage.ts` 와 같은 기준이어야 보고와 검증이 어긋나지 않는다 */
const normalizeEtag = (s: string) => s.trim().replace(/^"+|"+$/g, '')

/**
 * 표본 1건을 점검한다. **읽기만** 한다.
 *
 * 성공(`ok = true`)은 아래를 **모두** 만족할 때뿐이다 (GPT-EXEC-029 §68).
 *   1. 이름 정확일치 파일 항목 한 개가 기존 `loadStorageMeta` 에서 수락됨
 *   2. `updated_at` 이 비어 있지 않은 문자열이고 **날짜로 해석 가능**
 *   3. 수락된 키가 `eTag` 또는 `etag` 이고 정규화 후 **길이 > 0**
 *   4. 보고의 날짜·키·길이가 **검증한 그 응답**에 근거함
 *   5. 허용 확장자에서 기존 이미지 로더가 성공하고 **바이트 > 0**
 *
 * 2~4 가 어긋나면 **다운로드 전에** 끝낸다. 부족한 값을 `created_at`·임의 날짜·
 * 임의 ETag 로 채우지 않고, 보고용 boolean 을 true 로 강제해 모순을 감추지도 않는다.
 */
export async function checkStorageSample(
  db: SupabaseClient,
  imagePath: string,
): Promise<SampleCheckReport> {
  const obs: Observation = { listCalls: 0, downloadCalls: 0, rows: null }
  const out = emptyReport(imagePath, obs)
  const sync = () => { out.calls = { list: obs.listCalls, download: obs.downloadCalls } }

  const path = (imagePath ?? '').trim()
  if (path === '') {
    out.code = 'empty_path'
    out.detail = '경로가 비어 있습니다'
    return out
  }
  const slash = path.lastIndexOf('/')
  const name = slash === -1 ? path : path.slice(slash + 1)

  const tap = tapClient(db, obs)

  // ── [1] 운영 경로의 검증. 이 안의 list 한 번이 **유일한** 조회다 ──
  let meta: { updated_at: string; etag: string }
  try {
    meta = await loadStorageMeta(tap, path)
    out.meta.acceptedByProductionPath = true
  } catch (e) {
    sync()
    if (e instanceof ExtraReadError) {
      out.code = 'extra_read_blocked'
      out.detail = `${e.what} 를 정해진 횟수보다 더 하려 했습니다`
    } else if (e instanceof StorageError) {
      const d = detailOf(e)
      out.code = META_DETAIL_CODES[d] ?? 'meta_unavailable'
      out.detail = d === '' ? '메타 조회 실패' : d
    } else {
      // SDK 원문 오류를 보고서에 넣지 않는다
      out.code = 'unexpected'
      out.detail = '메타 조회에서 예상 밖 오류'
    }
    return out
  }
  sync()

  // ── [2] 보고 항목은 **검증에 쓰인 그 응답**에서 뽑는다 ────────────
  const rows = obs.rows
  if (rows === null) {
    out.code = 'meta_report_mismatch'
    out.detail = '검증에 쓰인 목록 응답을 포착하지 못했습니다'
    return out
  }
  out.meta.listedEntries = rows.length
  // limit 100 이므로 다른 객체가 섞여 올 수 있다. 이름 정확일치 한 개만 채택하고
  // 나머지 원시 목록은 출력하거나 저장하지 않는다
  const exact = rows.filter(o => o && o.name === name)
  if (exact.length !== 1) {
    out.code = 'meta_report_mismatch'
    out.detail = `검증은 통과했는데 포착한 응답의 정확일치 항목이 ${exact.length}개입니다`
    return out
  }
  const row = exact[0]
  out.meta.singleObservation = true

  const md = row.metadata
  if (md !== null && typeof md === 'object' && !Array.isArray(md)) {
    out.meta.metadataKeys = Object.keys(md as Record<string, unknown>).sort()
  }

  // ── [3] updated_at — 검증이 수락한 값으로 본다 ───────────────────
  out.meta.updatedAtPresent = meta.updated_at.trim() !== ''
  out.meta.updatedAtParsesAsDate = out.meta.updatedAtPresent
    && !Number.isNaN(Date.parse(meta.updated_at))
  // 포착한 응답의 값과 같은지 확인한다 (§75 — 같은 응답에 근거해야 한다)
  const rawUpdated = typeof row.updated_at === 'string' ? row.updated_at.trim() : ''
  if (rawUpdated !== meta.updated_at) {
    out.code = 'meta_report_mismatch'
    out.detail = '검증한 updated_at 과 포착한 응답의 값이 다릅니다'
    return out
  }
  if (!out.meta.updatedAtPresent) {
    out.code = 'updated_at_missing'
    out.detail = 'updated_at 이 비어 있습니다'
    return out
  }
  if (!out.meta.updatedAtParsesAsDate) {
    // R028-01: 028 판은 여기서 멈추지 않고 성공이라 했다
    out.code = 'updated_at_invalid'
    out.detail = 'updated_at 이 날짜로 해석되지 않습니다'
    return out
  }

  // ── [4] ETag — 어느 키였는지는 포착한 응답에서, 값은 검증본에서 ──
  const mdObj = (md !== null && typeof md === 'object' && !Array.isArray(md))
    ? md as Record<string, unknown> : {}
  const cameFrom: 'eTag' | 'etag' | null =
    typeof mdObj.eTag === 'string' && normalizeEtag(mdObj.eTag) === meta.etag ? 'eTag'
      : typeof mdObj.etag === 'string' && normalizeEtag(mdObj.etag) === meta.etag ? 'etag'
        : null
  if (cameFrom === null) {
    out.code = 'meta_report_mismatch'
    out.detail = '검증한 ETag 가 포착한 응답의 eTag/etag 어느 쪽과도 맞지 않습니다'
    return out
  }
  out.meta.etagKey = cameFrom
  out.meta.etagLength = meta.etag.length
  if (out.meta.etagLength === 0) {
    // R028-01: 028 판은 etagLen=0 인데도 성공이라 했다
    out.code = 'etag_empty'
    out.detail = '정규화한 ETag 가 빈 값입니다'
    return out
  }

  // ── [5] 여기까지 통과한 뒤에만 이미지를 읽는다 ───────────────────
  try {
    const dataUrl = await loadSourceImageDataUrl(tap, path)
    sync()
    if (dataUrl === null) {
      // 경로가 있는데 null 이면 계약 위반이다 (storage.ts 는 빈 경로에만 null 을 준다)
      out.code = 'image_load_failed'
      out.detail = '경로가 있는데 이미지가 null 로 왔습니다'
      return out
    }
    const comma = dataUrl.indexOf(',')
    const b64 = comma === -1 ? '' : dataUrl.slice(comma + 1)
    // 바이트 수만 센다. data URL 본문을 보관하거나 보고하지 않는다
    out.image.bytes = Buffer.from(b64, 'base64').length
    out.image.read = out.image.bytes > 0
    if (!out.image.read) {
      out.code = 'image_empty'
      out.detail = '0바이트'
      return out
    }
  } catch (e) {
    sync()
    if (e instanceof ExtraReadError) {
      out.code = 'extra_read_blocked'
      out.detail = `${e.what} 를 정해진 횟수보다 더 하려 했습니다`
    } else if (e instanceof StorageError) {
      const d = detailOf(e)
      out.code = IMAGE_DETAIL_CODES[d] ?? 'image_load_failed'
      out.detail = d === '' ? '이미지 읽기 실패' : d
    } else {
      out.code = 'unexpected'
      out.detail = '이미지 읽기에서 예상 밖 오류'
    }
    return out
  }

  // ── 성공은 필수 조건의 논리곱이다 ────────────────────────────────
  out.ok = out.meta.acceptedByProductionPath
    && out.meta.singleObservation
    && out.meta.updatedAtPresent
    && out.meta.updatedAtParsesAsDate
    && out.meta.etagKey !== null
    && out.meta.etagLength > 0
    && out.image.read
    && out.image.bytes > 0
    && out.calls.list === 1
    && out.calls.download === 1
  if (!out.ok) {
    // 여기 오면 위 분기 중 하나를 빠뜨린 것이다. 조용히 성공으로 넘기지 않는다
    out.code = 'unexpected'
    out.detail = '필수 조건 중 하나가 충족되지 않았습니다'
  }
  return out
}

/** 보고용 한 줄 요약. 민감한 값이 들어가지 않는다 */
export function formatSampleReport(r: SampleCheckReport): string {
  const p = `bucket=${r.bucket} dirDepth=${r.path.dirDepth} ext=${r.path.ext ?? '-'} name8=${r.path.nameHash8}`
  const calls = `list=${r.calls.list} download=${r.calls.download}`
  if (!r.ok) return `실패 code=${r.code} detail=${r.detail ?? '-'} · ${p} · ${calls}`
  return [
    '성공',
    p,
    `단일관측=${r.meta.singleObservation} 목록항목=${r.meta.listedEntries}`,
    `updated_at=있음/날짜해석가능`,
    `etagKey=${r.meta.etagKey} etagLen=${r.meta.etagLength}`,
    `metadataKeys=[${r.meta.metadataKeys.join(',')}]`,
    `운영경로수락=${r.meta.acceptedByProductionPath}`,
    `mime=${r.image.mime} bytes=${r.image.bytes}`,
    calls,
  ].join(' · ')
}
