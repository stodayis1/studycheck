// 학생부 로드맵 소식 — 행사(박람회·설명회 …)와 학생을 잇는 규칙. 화면·서버가 같이 쓴다.
//
// 원장님 2026-11-07 「각 계열로 도움이 될 만한 박람회, 컨퍼런스, 설명회 등의 정보를 지속적으로 …
//   일주일 또는 이주일에 한 번 해당 학부모·학생에게 정보를 공유」
//   정한 것: 원장님 확인 후 발송 · 2주에 한 번 · 문자 + 개인 페이지(/r/<token>) · 질문지 낸 학생·학부모

import { CAREER_FIELDS } from '@/lib/careerSurvey'

export const EVENT_KINDS = ['박람회', '설명회', '컨퍼런스', '캠프', '체험', '특강', '대회', '기타']
/** 모든 계열에 맞는 행사 (대입 박람회처럼) */
export const COMMON = '공통'
export const EVENT_FIELDS = [COMMON, ...CAREER_FIELDS.filter((f) => f !== '아직 모름')]

export type CareerEvent = {
  id: string; title: string; host: string | null; kind: string
  fields: string[]; grades: string[]
  starts_on: string | null; ends_on: string | null; time_text: string | null
  place: string | null; online: boolean; url: string; apply_url: string | null
  apply_deadline: string | null; fee: string | null; summary: string | null
  source_note?: string | null; status?: string; found_by?: string | null
  approved_by?: string | null; approved_at?: string | null; created_at?: string
}

/** 오늘(서울) yyyy-mm-dd */
export function todaySeoul() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 아직 안 끝난 행사인가 — 끝나는 날(없으면 시작일)이 오늘 이후 */
export const isUpcoming = (e: Pick<CareerEvent, 'starts_on' | 'ends_on'>, today = todaySeoul()) =>
  (e.ends_on ?? e.starts_on ?? '9999-12-31') >= today

/**
 * 이 학생에게 맞는 행사인가
 *   · 계열: 행사가 「공통」이거나, 학생이 고른 계열과 하나라도 겹치면. 학생이 「아직 모름」뿐이면 공통만
 *   · 학년: 행사 대상 학년이 비어 있거나, 학생 학년이 들어 있으면
 */
export function matches(e: Pick<CareerEvent, 'fields' | 'grades'>, fields: string[], grade: string | null) {
  const fOk = e.fields.includes(COMMON) || e.fields.some((f) => fields.includes(f))
  const gOk = !e.grades.length || (grade ? e.grades.includes(grade) : true)
  return fOk && gOk
}

/** 날짜를 「11/21(토)」·「11/21(토)~11/23(월)」 꼴로 */
export function fmtWhen(e: Pick<CareerEvent, 'starts_on' | 'ends_on' | 'time_text'>) {
  const one = (s: string) => {
    const d = new Date(s + 'T00:00:00+09:00')
    return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})`
  }
  if (!e.starts_on) return e.time_text ?? '날짜 미정'
  const span = e.ends_on && e.ends_on !== e.starts_on ? `${one(e.starts_on)}~${one(e.ends_on)}` : one(e.starts_on)
  return e.time_text ? `${span} ${e.time_text}` : span
}

/** 학생·학부모에게 보여도 되는 칸만 (검토 메모·승인자 등은 뺀다) */
export const PUBLIC_COLS = 'id, title, host, kind, fields, grades, starts_on, ends_on, time_text, place, online, url, apply_url, apply_deadline, fee, summary'
