// 「출처」 문구: 교재 · 학기 · 쪽 · 번호 (쪽이 없으면 생략)
export function sourceLabel(p: {
  book?: string | null
  grade?: string | null
  semester?: number | null
  sub_chapter_title?: string | null
  page_no?: number | null
  local_no?: string | number | null
} | null | undefined): string | null {
  if (!p?.book) return null
  const bits = [p.book]
  if (p.grade && p.semester) bits.push(`${p.grade}-${p.semester}`)
  if (p.sub_chapter_title) bits.push(p.sub_chapter_title)
  if (p.page_no) bits.push(`${p.page_no}쪽`)
  if (p.local_no != null && p.local_no !== '') bits.push(`${p.local_no}번`)
  return bits.join(' ')
}
