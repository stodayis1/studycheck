/**
 * 학년별·월별 **정기 소식**을 `career_events` 에 올릴 꼴로 바꾼다.
 *
 * 판단만 하고 DB 는 보지 않는다 — 검사(`scripts/career-guide-check.ts`)가 가짜 달로 그대로
 * 돌려 보기 위해서다. 실제로 올리는 것은 `scripts/career-news-seed.ts`.
 *
 * 왜 (원장님 2026-11-10): 소식이 **찾아낸 행사**뿐이라 행사가 없는 달은 보낼 것이 없었다.
 * 「12월 — 학생부 기록·세특·출결·창체 최종 확인」처럼 달마다 챙길 것을 같이 올린다.
 */
import type { RoadmapItem } from './data/roadmapCalendar'

export interface SeedRow {
  title: string; host: string; kind: string; fields: string[]; grades: string[]
  starts_on: string; ends_on: string; url: string; summary: string; source_note: string
  status: string; found_by: string
}

const two = (n: number) => String(n).padStart(2, '0')
/** 그 달의 말일 — 2월은 28/29일이다 */
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

export function buildSeed(items: RoadmapItem[], year: number, month: number): SeedRow[] {
  const ym = `${year}-${two(month)}`
  return items
    .filter((it) => it.month === month)
    .map((it, i) => ({
      title: `${month}월 ${it.grade} — ${it.event}`,
      host: '수학의지혜 학생부 로드맵',
      kind: '정기 소식',
      fields: ['공통'],
      grades: [it.grade],
      starts_on: `${ym}-01`,
      ends_on: `${ym}-${two(lastDay(year, month))}`,
      // ★ 줄마다 **다른 주소**가 되게 꼬리를 붙인다 — career_events 는 unique (url, starts_on) 이라
      //   같은 공식 확인처를 쓰는 줄이 둘이면 뒤엣것이 조용히 안 들어간다.
      url: `${it.source || 'https://www.schoolinfo.go.kr/'}#roadmap-${ym}-${it.grade}-${i + 1}`,
      summary: [it.point, it.plan && `학원에서는: ${it.plan}`].filter(Boolean).join('\n'),
      source_note: `연간이슈캘린더 2026 · ${it.grade} ${month}월 ${it.when} · 갈래 ${it.type}`,
      status: '검토대기',
      found_by: 'claude(연간캘린더)',
    }))
}
