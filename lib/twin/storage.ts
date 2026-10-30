// 원문 이미지와 Storage 메타 (GPT-EXEC-007 작업 B · D-075)
//
// 왜 따로 두나
//   파이프라인이 "이미지를 못 받았다"를 조용히 넘기면, 모델은 **원문을 보지 않고**
//   문항을 만든다. 그렇게 만든 후보는 원문과 무관한데도 겉보기에는 멀쩡하다.
//   그래서 이 모듈의 모든 실패는 **예외**다. null 은 "이미지가 원래 없다"는 뜻으로만 쓴다.
//
// 계약 (§135)
//   경로 없음                                   → null
//   경로 있음 + 성공 + 0바이트 아님 + 허용 MIME → data URL
//   경로 있음 + 그 밖의 모든 경우                → 예외
//
// 로그에 남기지 않는 것: data URL 본문, 원문 본문, 정답.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { StorageMeta } from './fingerprint'

export const BUCKET = 'problem-images'

/** 파일럿에서 허용하는 이미지 형식. 목록 밖이면 실패한다 */
const ALLOWED: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export class StorageError extends Error {
  constructor(
    public code: 'storage_meta_unavailable' | 'image_load_failed',
    public imagePath: string,
    detail?: string,
  ) {
    // 경로는 비밀이 아니다. 본문·정답은 넣지 않는다
    super(`${code}:path=${imagePath}${detail ? `:${detail}` : ''}`)
    this.name = 'StorageError'
  }
}

/** 확장자로 MIME 을 정한다. 허용 목록 밖이면 null (호출부가 실패시킨다) */
export function mimeOf(path: string): string | null {
  const ext = path.toLowerCase().split('.').pop() ?? ''
  return ALLOWED[ext] ?? null
}

// ── Storage 메타 ────────────────────────────────────────────────────

/**
 * 정확히 그 경로 하나의 `updated_at` 과 ETag 를 읽는다 (§132).
 *
 * `list()` 는 디렉터리 안을 이름으로 거르므로, 접두사만 같은 다른 파일이 섞일 수 있다.
 * 그래서 **이름이 정확히 일치하는 항목이 하나일 때만** 받아들인다.
 *
 * @throws StorageError 객체 없음 · 중복 · 경로 불일치 · 메타 누락 · 조회 오류
 */
export async function loadStorageMeta(
  db: SupabaseClient,
  imagePath: string,
): Promise<StorageMeta> {
  const path = (imagePath ?? '').trim()
  if (path === '') throw new StorageError('storage_meta_unavailable', imagePath, 'empty_path')

  const slash = path.lastIndexOf('/')
  const dir = slash === -1 ? '' : path.slice(0, slash)
  const name = slash === -1 ? path : path.slice(slash + 1)
  if (name === '') throw new StorageError('storage_meta_unavailable', imagePath, 'no_file_name')

  const { data, error } = await db.storage.from(BUCKET).list(dir, {
    limit: 100,
    search: name,
  })
  if (error) throw new StorageError('storage_meta_unavailable', imagePath, 'list_error')
  if (!Array.isArray(data)) throw new StorageError('storage_meta_unavailable', imagePath, 'bad_response')

  // search 는 부분일치다. 이름이 **정확히** 같은 것만 남긴다
  const exact = data.filter(o => o && o.name === name)
  if (exact.length === 0) throw new StorageError('storage_meta_unavailable', imagePath, 'not_found')
  if (exact.length > 1) throw new StorageError('storage_meta_unavailable', imagePath, 'ambiguous')

  // 여기서부터는 **모양을 하나도 믿지 않는다.** SDK 판이 바뀌거나 응답이 잘리면
  // `.trim()` 이 예외로 터지거나 조용히 잘못된 값을 쓴다. 전부 안정 사유로 정규화한다.
  const obj = exact[0] as unknown as Record<string, unknown>

  // §124: 파일이면 `id` 가 **비어 있지 않은 문자열**이다.
  // 폴더형 항목은 null 이고, 응답이 잘리면 undefined 다. 둘 다 파일이 아니다.
  const id = obj.id
  if (typeof id !== 'string' || id.trim() === '') {
    throw new StorageError('storage_meta_unavailable', imagePath, 'not_a_file')
  }

  // §128: metadata 는 **null 이 아닌 평범한 객체**여야 한다. 배열·문자열은 계약 위반이다
  const metadata = obj.metadata
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new StorageError('storage_meta_unavailable', imagePath, 'metadata_missing')
  }

  // D-083: `updated_at` 은 **대체 불가**다.
  //   예전 판은 없으면 `created_at` 으로 대신했다. 파일을 교체하면 생성 시각은 그대로인데
  //   변경 시각만 바뀌므로, created_at 으로 대신하면 **바뀐 이미지를 안 바뀐 것으로 본다.**
  //   캐시 무효화가 거기서 깨진다. 없으면 그냥 실패한다.
  // §126: 문자열이 아닌 값에 `.trim()` 을 걸어 깨지지 않게, 타입부터 본다
  const rawUpdated = obj.updated_at
  if (typeof rawUpdated !== 'string' || rawUpdated.trim() === '') {
    throw new StorageError('storage_meta_unavailable', imagePath, 'updated_at_missing')
  }
  const updatedAt = rawUpdated.trim()

  // ETag 키 표기는 SDK 판마다 `eTag`/`etag` 로 다르다. 운영 표본으로 확인하기 전까지
  // 이 둘만 본다 — 추측으로 fallback 을 늘리지 않는다 (§130 · D-086).
  const md = metadata as Record<string, unknown>
  const rawTag = typeof md.eTag === 'string' ? md.eTag
    : typeof md.etag === 'string' ? md.etag
    : ''
  // ETag 는 보통 따옴표로 감싸여 온다. 표현을 고정해야 같은 파일이 같은 해시를 낸다
  const etag = rawTag.trim().replace(/^"+|"+$/g, '')
  if (etag === '') {
    throw new StorageError('storage_meta_unavailable', imagePath, 'etag_missing')
  }

  return { updated_at: updatedAt, etag }
}

// ── 이미지 ──────────────────────────────────────────────────────────

/**
 * 원문 이미지를 Base64 data URL 로 바꾼다 (D-036).
 *
 * 예전 판은 실패해도 `null` 을 돌려줬다. 그래서 모델이 원문을 못 본 채 문항을 만들 수 있었다.
 * 지금은 **경로가 있는데 못 받으면 예외**다 (D-075).
 *
 * @throws StorageError 다운로드 실패 · 0바이트 · 허용 밖 형식
 */
export async function loadSourceImageDataUrl(
  db: SupabaseClient,
  imagePath: string | null,
): Promise<string | null> {
  if (!imagePath || imagePath.trim() === '') return null   // 이미지가 원래 없는 원문
  const path = imagePath.trim()

  const mime = mimeOf(path)
  if (!mime) throw new StorageError('image_load_failed', path, 'unsupported_type')

  let blob: Blob
  try {
    const { data, error } = await db.storage.from(BUCKET).download(path)
    if (error || !data) throw new StorageError('image_load_failed', path, 'download_error')
    blob = data
  } catch (e) {
    if (e instanceof StorageError) throw e
    throw new StorageError('image_load_failed', path, 'download_throw')
  }

  // §117: arrayBuffer() 실패도 같은 코드로 정규화한다.
  // 여기서 새는 예외가 있으면 파이프라인의 catch 가 코드 없이 받게 된다
  let buf: Buffer
  try {
    buf = Buffer.from(await blob.arrayBuffer())
  } catch {
    throw new StorageError('image_load_failed', path, 'array_buffer_failed')
  }
  if (buf.length === 0) throw new StorageError('image_load_failed', path, 'empty_file')

  return `data:${mime};base64,${buf.toString('base64')}`
}
