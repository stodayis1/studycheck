// 수지쌤 강의영상 (lesson_videos) — 학습일지에서 과제로 넣고, 학생은 스터디체크 안에서 본다
// 과제 자체는 지금처럼 class_sessions.video_url(줄바꿈 링크)에 들어간다. 여기는 링크 ↔ 강의 정보를 잇는 도우미.

export type LessonScene = { start: number; end: number; label: string; kind: string }

export type LessonVideo = {
  id: string
  grade: string
  kind: '개념' | '증명' | '대표예제'          // 대표예제 = 필수예제 풀이 영상 (order_label 「01-풀이01」)
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
  quiz?: { answer: string; wrong: string[] } | null   // 풀이 영상 객관식 (lib/nameCalls.ts buildQuiz)
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

/** 컨씨영상 = 쎈 C단계 선별 문항을 강사가 직접 풀어 찍은 영상 (grade 「쎈C 중3-2」). AI 이름 부르기를 하지 않는다 (원장님 2026-11-03) */
export const isSsenC = (v: Pick<LessonVideo, 'grade'> | null | undefined) => !!v?.grade?.startsWith('쎈C')

/** 영상 **종류 때문에** 저절로 사진을 내는 것 — 증명(백지 증명)과 컨씨영상(직접 푼 풀이) */
export const needsPhoto = (v: Pick<LessonVideo, 'grade' | 'kind'> | null | undefined) => v?.kind === '증명' || isSsenC(v)

/**
 * 선생님이 **배부하면서 고른** 「이 영상은 직접 푼 풀이도 찍어 내라」 (video_photo_requests 한 줄).
 *
 * 왜 (원장님 2026-11-04)
 *   「영상과제를 배부하면서 증명이 아니라 직접 풀이한것도 찍어 올리라고 할거거든.
 *    직접풀이한거 찍어올릴수 있도록 창 만들어주려고」
 *
 * ★ 증명·컨씨는 **종류만 보고** 저절로 따라오던 것이고, 이건 그 밖의 영상(개념·대표예제·
 *   바깥 링크)에 선생님이 하나씩 켜는 것이다. 둘은 같은 칸(ProofSubmitBox)·같은
 *   보관함(proof-photos)·같은 표(proof_submissions)를 쓴다 — 길을 새로 내지 않는다.
 */
export type PhotoAsk = { video_url: string }

/** 링크 견주는 열쇠 — 같은 영상이라도 뒤에 `?si=…` 가 붙어 들어온 것이 있다 */
const urlKey = (u: string | null | undefined) => youtubeId(u) || String(u ?? '').trim()

export function askedSet(asks: PhotoAsk[] | null | undefined): Set<string> {
  return new Set((asks ?? []).map((a) => urlKey(a?.video_url)).filter(Boolean))
}

/** 이 영상이 **무슨 사진**을 내는 것인가 — 증명 / 풀이. 안 내면 null */
export function photoKindOf(
  url: string,
  lesson: Pick<LessonVideo, 'grade' | 'kind'> | null | undefined,
  asked?: Set<string> | null,
): '증명' | '풀이' | null {
  if (lesson?.kind === '증명') return '증명'
  if (isSsenC(lesson)) return '풀이'
  if (asked?.has(urlKey(url))) return '풀이'
  return null
}

/** 그 수업의 영상 과제 중 **사진을 내야 하는 링크**만 (낸 순서 그대로) */
export function photoUrlsOf(
  urls: string[],
  lessonOf: (url: string) => Pick<LessonVideo, 'grade' | 'kind'> | null | undefined,
  asks?: PhotoAsk[] | Set<string> | null,
): string[] {
  const asked = asks instanceof Set ? asks : askedSet(asks)
  return (urls ?? []).filter((u) => !!u && !!photoKindOf(u, lessonOf(u), asked))
}

/**
 * 학부모 브리핑의 「다음 시간까지 과제」에 적을 **사진 올리기** 안내 (원장님 2026-11-04).
 *
 * ★ 켜 놓고 브리핑에 안 적으면 **학부모님은 사진을 내야 하는 줄 모르신다.**
 *   세는 곳이 셋이다(카톡 발송 · 알림장 화면 · 학습일지 미리보기) — 셋 다 이걸 쓴다.
 */
export function photoBrief(
  urls: string[],
  lessonOf: (url: string) => Pick<LessonVideo, 'grade' | 'kind'> | null | undefined,
  asks?: PhotoAsk[] | Set<string> | null,
): { photo: number; photoWord: string } {
  const 낼것 = photoUrlsOf(urls, lessonOf, asks)
  const label = photoLabelOf(urls, lessonOf, asks)
  return { photo: 낼것.length, photoWord: label === '증명 제출' ? '증명' : label === '풀이 제출' ? '풀이 사진' : '사진' }
}

/** 제출 칩·배지 이름: 증명만이면 「증명 제출」, 풀이만이면 「풀이 제출」, 섞이면 「사진 제출」 */
export function photoLabelOf(
  urls: string[],
  lessonOf: (url: string) => Pick<LessonVideo, 'grade' | 'kind'> | null | undefined,
  asks?: PhotoAsk[] | Set<string> | null,
): string {
  const asked = asks instanceof Set ? asks : askedSet(asks)
  const kinds = (urls ?? []).map((u) => photoKindOf(u, lessonOf(u), asked)).filter(Boolean)
  if (!kinds.length) return '사진 제출'
  if (kinds.every((k) => k === '풀이')) return '풀이 제출'
  if (kinds.every((k) => k === '증명')) return '증명 제출'
  return '사진 제출'
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
