// 원문 지문(fingerprint) 계산 (D-019 · GPT-EXEC-006 작업 C)
//
// 무엇에 쓰나
//   같은 원문으로 같은 프롬프트를 다시 돌렸을 때 **AI 를 또 부르지 않게** 하는 캐시 키다.
//   동시에 "원문이 바뀌었는지"를 감지하는 수단이기도 하다.
//
// 지켜야 하는 것
//   - 같은 원문은 **항상 같은 해시**여야 한다. null 표현을 고정하는 이유다
//   - 원문의 정답·유형·난이도·단계가 바뀌면 **반드시 다른 해시**가 나와야 한다
//   - 이미지 파일이 교체되면(경로가 같아도) 다른 해시가 나와야 한다.
//     그래서 Storage 의 `updated_at` 과 ETag 를 함께 넣는다
//   - **Storage 메타 조회가 실패하면 임의 해시로 진행하지 않고 그 원문을 실패 처리한다.**
//     조회에 실패했는데 대충 넘어가면, 바뀐 이미지를 안 바뀐 것으로 착각한다
//
// 로그와 오류에 정답 원문을 출력하지 않는다.

import { createHash } from 'node:crypto'

/** 이미지가 없는 원문에 쓰는 고정 표식. 빈 문자열과 구분된다. */
export const NO_IMAGE_MARKER = '<no-image>'
/** null 을 나타내는 고정 표식. 빈 문자열 답과 구분되지 않아도 무방한 자리에만 쓴다. */
const NULL_MARKER = ''

export type FingerprintSource = {
  id: number
  grade: string | null
  semester: number | null
  type_code: string | null
  step: string | null
  difficulty: string | null
  answer_kind: string
  answer_text: string
  image_path: string | null
}

/** Storage 객체 메타. 조회에 실패하면 이 값을 만들지 말고 실패를 던진다. */
export type StorageMeta = {
  updated_at: string
  etag: string
}

export class FingerprintError extends Error {
  constructor(public code: 'storage_meta_unavailable' | 'invalid_source', public sourceId: number) {
    // 정답·본문을 메시지에 넣지 않는다
    super(`fingerprint_error:${code}:source=${sourceId}`)
    this.name = 'FingerprintError'
  }
}

/**
 * 해시에 들어가는 값들을 **고정된 순서**로 만든다.
 *
 * 객체 키 순서에 의존하지 않도록 배열로 만든다. 입력 객체의 키 순서가 달라져도
 * 결과가 같아야 하기 때문이다.
 */
export function canonicalFingerprintInput(
  src: FingerprintSource,
  meta: StorageMeta | null,
): string[] {
  const hasImage = !!src.image_path && src.image_path.trim() !== ''

  return [
    `v1`,                                             // 계산 방식 버전
    `id=${src.id}`,
    `grade=${src.grade ?? NULL_MARKER}`,
    `semester=${src.semester == null ? NULL_MARKER : String(src.semester)}`,
    `type_code=${src.type_code ?? NULL_MARKER}`,
    `step=${src.step ?? NULL_MARKER}`,
    // difficulty 는 절반이 null 이다. 표현을 반드시 고정한다
    `difficulty=${src.difficulty ?? NULL_MARKER}`,
    `answer_kind=${src.answer_kind}`,
    `answer_text=${src.answer_text}`,
    `image_path=${hasImage ? src.image_path : NO_IMAGE_MARKER}`,
    `image_updated_at=${hasImage ? (meta?.updated_at ?? '') : NO_IMAGE_MARKER}`,
    `image_etag=${hasImage ? (meta?.etag ?? '') : NO_IMAGE_MARKER}`,
  ]
}

/**
 * 원문 지문을 계산한다.
 *
 * @throws FingerprintError 이미지가 있어야 하는데 메타를 못 받았을 때 (fail closed)
 */
export function computeSourceFingerprint(
  src: FingerprintSource,
  meta: StorageMeta | null,
): string {
  if (!src || typeof src.id !== 'number' || !Number.isFinite(src.id)) {
    throw new FingerprintError('invalid_source', src?.id ?? -1)
  }

  const hasImage = !!src.image_path && src.image_path.trim() !== ''
  if (hasImage && (!meta || !meta.updated_at || !meta.etag)) {
    // 임의 해시로 진행하지 않는다. 바뀐 이미지를 안 바뀐 것으로 볼 수 있기 때문이다
    throw new FingerprintError('storage_meta_unavailable', src.id)
  }

  const parts = canonicalFingerprintInput(src, meta)
  return createHash('sha256').update(parts.join('\n'), 'utf8').digest('hex')
}
