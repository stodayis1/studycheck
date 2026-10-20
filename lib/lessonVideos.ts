// 수지쌤 강의영상 (lesson_videos) — 학습일지에서 과제로 넣고, 학생은 스터디체크 안에서 본다
// 과제 자체는 지금처럼 class_sessions.video_url(줄바꿈 링크)에 들어간다. 여기는 링크 ↔ 강의 정보를 잇는 도우미.

export type LessonScene = { start: number; end: number; label: string; kind: string }

export type LessonVideo = {
  id: string
  grade: string
  kind: '개념' | '증명'
  concept_no: number
  order_label: string
  title: string
  chapter: string | null
  sub_chapter: string | null
  book: string | null
  book_pages: number[] | null
  youtube_id: string | null
  duration_seconds: number | null
  scenes: LessonScene[]
  type_codes: string[]
}

/** 유튜브 링크에서 영상 id (youtu.be/ID, watch?v=ID, embed/ID, shorts/ID). 아니면 null */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.trim().match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)
  return m ? m[1] : null
}

export const lessonUrl = (v: Pick<LessonVideo, 'youtube_id'>) => `https://youtu.be/${v.youtube_id}`

export function fmtDuration(sec: number | null | undefined): string {
  if (!sec && sec !== 0) return ''
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 「03-증명2 · 세 변을 …」처럼 목록에 쓰는 이름 */
export const lessonLabel = (v: Pick<LessonVideo, 'order_label' | 'title'>) => `${v.order_label} · ${v.title}`

// ── 시청 판정 ─────────────────────────────────────────────
/** 한 번이라도 재생된 구간을 합친다. [[0,95],[120,180]] */
export function mergeRanges(ranges: [number, number][]): [number, number][] {
  const r = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const [a, b] of r) {
    const last = out[out.length - 1]
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

export const coveredSeconds = (ranges: [number, number][]) =>
  Math.round(mergeRanges(ranges).reduce((s, [a, b]) => s + (b - a), 0))

/** 「제대로 들었다」 = 영상의 90% 이상을 실제로 재생 (건너뛴 곳은 안 셈) */
export const COMPLETE_PCT = 90
