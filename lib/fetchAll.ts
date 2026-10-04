// Supabase 는 한 번에 1000행까지만 준다 — 끝까지 가져오는 공용 함수.
//
// 왜 여기 모아 두나
//   예전에는 라우트마다 같은 코드를 복사해 두고 **1000행씩 차례대로** 기다렸다.
//   문항이 27,000개면 28번을 줄줄이 기다려 학습지 화면이 6초씩 걸렸다(2026-10-03).
//   같은 실수가 다시 복사되지 않게 한 군데로 모은다.
//
// ★ make 안에서 반드시 .order(...) 로 순서를 못박을 것.
//   순서가 없으면 쪽마다 줄 순서가 달라져 **같은 줄이 두 번 오거나 빠진다.**
//   (scripts 쪽에서 실제로 라이트쎈 중2-1 이 898행인데 1253 으로 세어진 적이 있다)

const PAGE = 1000
const BATCH = 8 // 한 번에 몇 쪽씩 같이 읽을지

export async function fetchAll<T = any>(
  make: (from: number, to: number) => any
): Promise<T[]> {
  const out: T[] = []
  for (let base = 0; ; base += PAGE * BATCH) {
    const res = await Promise.all(
      Array.from({ length: BATCH }, (_, k) =>
        make(base + k * PAGE, base + k * PAGE + PAGE - 1)
      )
    )
    let last = false
    for (const { data, error } of res) {
      if (error) throw new Error(error.message)
      const d = (data ?? []) as T[]
      out.push(...d)
      if (d.length < PAGE) last = true
    }
    if (last) return out
  }
}
