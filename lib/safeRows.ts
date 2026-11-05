// 「못 읽어도 화면이 멈추면 안 되는」 조회 한 가지 규칙.
//
// 왜 (2026-11-04 · 2026-11-05)
//   새 표(video_photo_requests · core_test_ranges)는 **원장님이 손으로 SQL 을 실행**하신다.
//   배포가 먼저 올라가는 일이 있는데, 그때 없는 표를 읽으면 `select` 하나가 실패하면서
//   **그 화면이 통째로 빈다.** 그래서 못 읽으면 「그런 줄이 없다」로 보고 지나간다.
//
// ★ 쓰는 쪽(선생님이 켜고 끄는 자리)에는 쓰지 않는다 — 못 쓰면 **알려야** 한다.
//   조용히 성공한 척하면 선생님이 켠 줄 알고 넘어간다.

export async function safeRows<T = any>(q: PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  try {
    const { data, error } = await q
    if (error) return []
    return (data ?? []) as T[]
  } catch {
    return []
  }
}
