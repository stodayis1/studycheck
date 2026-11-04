// **오늘 결석**인 학생을 수학OPS 에서 읽어 온다.
//
// 왜 (원장님 2026-11-04)
//   「결석인 친구들은 아무리 미리 이야기해놔도 당일 되면 까먹기 마련이거든. 담당 선생님
//   전달사항에 학생결석도 뜨게 해줄래. 그래야 이중으로 또 연락이 안가지.」
//
//   결석은 **미리** OPS 에 들어온다(여행·개인사정 등). 그런데 그걸 보려면 OPS 를 따로
//   열어야 해서, 당일 아침에는 아무도 모른다. 그래서 학부모께 「오늘 왜 안 오셨나요」
//   연락이 또 간다.
//
// ★ 스터디체크가 **스스로 적은 결석은 뺀다.** 선생님이 학습일지에 결석을 찍으면 그게
//   OPS 로 넘어가 같은 표에 쌓인다(사유: 「스터디체크 학습일지 결석 체크」).
//   그건 이미 아는 결석이라 다시 알릴 일이 아니다 — 여기 띄우면 날마다 지저분해진다.
import { createClient } from '@supabase/supabase-js'

/** 스터디체크가 되쏘아 만든 사유 — 이건 「미리 들은 결석」이 아니다 */
export const FROM_STUDYCHECK = ['스터디체크 학습일지 결석 체크', '학교 시험기간 결석 (보강 안 함)']

export interface OpsAbsence {
  /** 스터디체크 학생 id (연결이 없는 학생은 안 온다) */
  studentId: string
  date: string
  reason: string | null
  /** 개인 사정(여행 등) — 보강을 안 하는 결석 */
  personalLeave: boolean
  makeupRequired: boolean
}

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/** 미리 들은 결석만 남긴다 — 우리가 적은 것은 뺀다 */
export function isPreTold(reason: string | null | undefined): boolean {
  return !FROM_STUDYCHECK.includes(String(reason ?? '').trim())
}

/**
 * 그날 결석. OPS 를 못 읽으면 **빈 목록**을 돌려준다 — 화면이 멈추면 안 된다.
 */
export async function fetchOpsAbsences(date: string): Promise<OpsAbsence[]> {
  const ops = opsClient()
  if (!ops) return []
  try {
    const { data, error } = await ops.from('attendances')
      .select('absent_date, absence_reason, is_personal_leave, makeup_required, students!inner(studycheck_student_id)')
      .eq('absent_date', date)
    if (error) return []
    return (data ?? []).flatMap((r: any) => {
      const sid = r.students?.studycheck_student_id
      if (!sid || !isPreTold(r.absence_reason)) return []
      return [{
        studentId: String(sid),
        date: String(r.absent_date),
        reason: r.absence_reason ?? null,
        personalLeave: !!r.is_personal_leave,
        makeupRequired: !!r.makeup_required,
      }]
    })
  } catch {
    return []
  }
}

/**
 * 「오늘은 ○○ 학생 결석입니다」 — 한 줄로.
 *
 * ★ **보강 여부는 적지 않는다** (원장님 2026-11-04 「여행 개인사정 다 보강해.
 *   보강안함은 안띄워도됨. 보강을 안하는 경우는 장기여행(일주일 이상)의 경우 원비
 *   차감했을 때야」).
 *   거의 모두 보강 대상이라 딱지가 알려 주는 것이 없고, OPS 의 makeup_required 가
 *   여행·개인사정을 「보강 안 함」으로 들고 있는 줄이 있어서 **틀린 것을 알려 주게 된다.**
 *   진짜 보강 안 하는 건(원비 차감한 장기여행)은 드물다.
 */
export function absenceLine(name: string, grade: string | null, a: { reason: string | null }): string {
  const 뒤 = a.reason?.trim() || ''
  return `${name}${grade ? `(${grade})` : ''} 학생 결석${뒤 ? ` — ${뒤}` : ''}`
}
