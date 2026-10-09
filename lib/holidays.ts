/**
 * 공휴일 — 화면마다 박아두지 말고 DB(holidays 표) 한 곳만 본다.
 * 수학OPS 쪽에도 같은 표가 있고 같은 내용을 넣는다(두 앱 DB가 분리돼 있어서 복사본을 둔다).
 *
 * 읽기는 누구나(학생·학부모 화면 달력에도 보여야 한다), 쓰기는 직원만 — RLS 로 막아둔다.
 */
import { supabase } from '@/lib/supabase'

export interface Holiday {
  date: string      // 'YYYY-MM-DD'
  name: string
  kind: string      // public | substitute | temporary
}

let cache: Map<string, Holiday> | null = null
let inflight: Promise<Map<string, Holiday>> | null = null

export async function loadHolidays(): Promise<Map<string, Holiday>> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    const { data } = await supabase.from('holidays').select('date, name, kind').order('date')
    const map = new Map<string, Holiday>()
    for (const h of (data || []) as Holiday[]) map.set(h.date, h)
    cache = map
    inflight = null
    return map
  })()
  return inflight
}

export function clearHolidayCache() { cache = null }

/** 'YYYY-MM-DD' 문자열로 만들기 — new Date().toISOString()은 UTC라 한국에서 하루 밀린다 */
export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 달력 숫자 색 — 공휴일·일요일 빨강, 토요일 파랑, 나머지는 기본값 */
export function dayColor(d: Date | string, holidays: Map<string, Holiday>, normal = '#334155') {
  const key = typeof d === 'string' ? d : dateKey(d)
  const dow = new Date(key + 'T00:00:00').getDay()
  if (holidays.has(key) || dow === 0) return '#DC2626'
  if (dow === 6) return '#2563EB'
  return normal
}

export function holidayName(d: Date | string, holidays: Map<string, Holiday>) {
  const key = typeof d === 'string' ? d : dateKey(d)
  return holidays.get(key)?.name
}
