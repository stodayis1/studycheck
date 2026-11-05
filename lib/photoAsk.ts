// 「이 영상은 직접 푼 풀이도 찍어 내라」 — 선생님이 배부하면서 켜 둔 것 (video_photo_requests)
//
// 왜 따로 두나 (원장님 2026-11-04)
//   증명·컨씨영상은 **종류만 보고** 저절로 사진을 냈다. 그 밖의 영상은 선생님이 켜야 한다.
//   켜고 끄는 것은 한 곳(이 파일)에서만 하고, 판단은 lib/lessonVideos.ts 의
//   photoKindOf · photoUrlsOf · photoLabelOf 가 한다.
//
// ★ **표가 아직 없어도 화면이 멈추면 안 된다.** SQL(docs/sql/영상과제_풀이사진_요청.sql)은
//   원장님이 손으로 실행하신다. 배포가 먼저 올라가는 일이 있으므로, 못 읽으면
//   「켜 둔 것이 하나도 없다」로 보고 지나간다 — 지금까지 돌던 증명·컨씨는 그대로 돈다.

import { safeRows } from './safeRows'

export type PhotoAskRow = { session_id: string; video_url: string }

/** 못 읽으면 빈 목록 (표가 아직 없거나 권한이 없을 때) — 규칙은 lib/safeRows.ts 한 곳에 */
export const safeAsks = (q: PromiseLike<{ data: any; error: any }>) => safeRows<PhotoAskRow>(q)

/** 한 수업의 것만 골라 낸다 */
export const asksOf = (rows: PhotoAskRow[] | null | undefined, sessionId: string) =>
  (rows ?? []).filter((r) => r?.session_id === sessionId)
