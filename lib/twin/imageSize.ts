/**
 * **이미 메모리에 있는** 이미지의 픽셀 크기를 읽는다 — GPT-EXEC-034 §126.
 *
 * 왜 필요한가
 *   생성 요청의 이미지 입력 비용은 `ceil(w/32) × ceil(h/32)` 패치 수에 매여 있다.
 *   033 까지 폭·높이를 몰랐고, 그래서 이미지 토큰을 띠로만 적었다.
 *   이제 **승인된 이미지 로드가 이미 읽어 온 바이트**에서 크기를 확인한다.
 *
 * 하지 않는 것
 *   - 원문을 **다시 내려받지 않는다.** 이 모듈은 네트워크를 쓰지 않는다.
 *   - 재크롭·확대·포맷 변환을 하지 않는다. 바이트를 **읽기만** 한다.
 *   - 크기를 모르거나 지원하지 않는 형식이면 **생성 전에 멈춘다** (추측하지 않는다).
 *   - 포괄 이미지 처리 시스템을 만들지 않는다. PNG 머리글만 읽는다.
 *   - 과거 관측값(42,665바이트)을 픽셀 크기 대신 쓰지 않는다.
 *
 * 의존성이 없다. Node 기본 기능만 쓴다.
 */

/** PNG 서명 — `\x89PNG\r\n\x1a\n` */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * 판정 결과.
 *
 * **판별 유니온으로 두지 않는다** — `strictNullChecks` 가 꺼져 있어 좁혀지지 않는다
 * (AGENTS.md 함정 3).
 */
export type ImageSizeVerdict = {
  ok: boolean
  width: number | null
  height: number | null
  /** 이미지 입력의 패치 수. `detail='high'` 환산은 호출부가 한다 */
  patchCount: number | null
  /** 실패 사유 코드. 성공하면 null */
  code: string | null
}

const bad = (code: string): ImageSizeVerdict =>
  ({ ok: false, width: null, height: null, patchCount: null, code })

/** `ceil(w/32) × ceil(h/32)` — 공개 이미지 가이드의 패치 환산 */
export function patchCountFor(width: number, height: number): number {
  return Math.ceil(width / 32) * Math.ceil(height / 32)
}

/**
 * PNG 바이트에서 폭·높이를 읽는다.
 *
 * IHDR 은 규격상 **첫 chunk** 다. 그 자리만 본다 — chunk 를 훑어 다니지 않는다.
 * 서명·chunk 이름·길이가 어긋나면 `png_malformed` 로 **실패**시킨다. 추측하지 않는다.
 */
export function readPngSize(bytes: Uint8Array): ImageSizeVerdict {
  // 서명 8 + 길이 4 + 'IHDR' 4 + 폭 4 + 높이 4 = 24
  if (bytes.length < 24) return bad('png_too_short')
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return bad('not_png')
  }
  const be32 = (at: number) =>
    ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0

  // IHDR 의 데이터 길이는 규격상 13 이다
  if (be32(8) !== 13) return bad('png_malformed')
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return bad('png_malformed')   // 'IHDR' 이 아니다
  }
  const width = be32(16)
  const height = be32(20)
  if (width === 0 || height === 0) return bad('png_zero_size')
  // 규격 상한 (2^31 - 1). 터무니없는 값을 통과시키지 않는다
  if (width > 0x7fffffff || height > 0x7fffffff) return bad('png_malformed')
  return { ok: true, width, height, patchCount: patchCountFor(width, height), code: null }
}

/**
 * 생성 입력으로 쓸 data URL 을 검사한다.
 *
 * `data:image/png;base64,…` 만 받는다. 다른 형식은 **지원하지 않는다고 보고하고 멈춘다** —
 * 조용히 통과시키면 비용을 계산할 근거가 없는 채로 유료 요청이 나간다.
 */
export function inspectImageDataUrl(dataUrl: string | null): ImageSizeVerdict {
  if (dataUrl === null || dataUrl === '') return bad('image_missing')
  // `s` 플래그를 쓰지 않는다 — 이 저장소의 tsconfig target 이 그것보다 낮다.
  // `[\s\S]` 로 같은 뜻을 쓴다
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl)
  if (m === null) return bad('data_url_malformed')
  const mime = m[1].toLowerCase()
  if (mime !== 'image/png') return bad(`unsupported_mime`)
  let bytes: Buffer
  try {
    bytes = Buffer.from(m[2], 'base64')
  } catch {
    return bad('base64_malformed')
  }
  if (bytes.length === 0) return bad('image_empty')
  return readPngSize(bytes)
}

/**
 * 이미지 패치 수가 허용 상한 안인가.
 *
 * `detail='high'` 는 공개 가이드상 2,500패치 예산이 있고 모델 승수는 1.2 다.
 * 상한을 넘으면 **생성 전에 멈춘다.** 자동으로 줄이지 않는다 (§93).
 */
export const HIGH_DETAIL_MAX_PATCHES = 2500
export const IMAGE_TOKEN_MULTIPLIER = 1.2

export function imageTokenUpperBound(patchCount: number): number {
  return Math.ceil(patchCount * IMAGE_TOKEN_MULTIPLIER)
}

export function checkImageWithinHighDetail(v: ImageSizeVerdict): { ok: boolean; code: string | null } {
  if (!v.ok || v.patchCount === null) return { ok: false, code: v.code ?? 'image_size_unknown' }
  if (v.patchCount > HIGH_DETAIL_MAX_PATCHES) return { ok: false, code: 'image_patches_exceeded' }
  return { ok: true, code: null }
}
