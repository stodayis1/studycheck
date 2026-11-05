// 월간 리포트가 나간 뒤 **담당 선생님께 보내는 문자** (원장님 2026-11-05
// 「월간보고서 담당 선생님께 보내기 기능도 만들어줘」).
//
// 왜 문자인가
//   · 알림톡(알리고)은 승인된 템플릿과 **글자 단위로** 같아야 나간다. 선생님께 가는 글은
//     그때그때 학생 이름·수가 달라 템플릿으로 만들 수 없다(lib/opsSms.ts 에 같은 설명).
//   · 선생님 번호와 문자 발송은 **이미 돌아가는 길**이 있다(수학OPS · 솔라피).
//     당직 알림(teacher_reminder)이 그 길로 나간다.
//
// ★ 키움쌤·채움쌤 **둘 다** 받는다 — 둘 다 그 학생을 맡은 분이다.
// ★ 문자는 길면 끊긴다. 한 통에 **여덟 명까지**만 담고 넘치면 나눠 보낸다.

/** 한 통에 담을 학생 수 — 링크가 한 줄에 60자쯤이라 여덟이면 600자 안쪽이다 */
export const PER_SMS = 8

export interface SentReport {
  studentId: string
  name: string
  url: string
  /** 그 학생을 맡은 선생님들(키움쌤·채움쌤) */
  teachers: string[]
}

/** 선생님 한 분이 받을 문자들 (여덟 명이 넘으면 여러 통) */
export interface TeacherSms {
  teacher: string
  text: string
  count: number
}

/**
 * 보낸 리포트를 **선생님별로** 묶어 문자 문구를 만든다.
 *
 * ★ 학생이 한 명도 없는 선생님에게는 만들지 않는다 — 빈 문자를 보내면 안 된다.
 */
export function buildTeacherSms(period: string, sent: SentReport[]): TeacherSms[] {
  const 묶음 = new Map<string, SentReport[]>()
  for (const r of sent ?? []) {
    for (const t of r?.teachers ?? []) {
      const 이름 = String(t ?? '').trim()
      if (!이름) continue
      if (!묶음.has(이름)) 묶음.set(이름, [])
      묶음.get(이름)!.push(r)
    }
  }

  const out: TeacherSms[] = []
  for (const [teacher, list] of 묶음) {
    for (let i = 0; i < list.length; i += PER_SMS) {
      const 조각 = list.slice(i, i + PER_SMS)
      const 쪽 = list.length > PER_SMS ? ` (${Math.floor(i / PER_SMS) + 1}/${Math.ceil(list.length / PER_SMS)})` : ''
      const 머리 = `[수학의지혜] ${period} 월간 리포트가 학부모님께 나갔습니다${쪽}.\n`
        + `${teacher} 선생님 담당 ${list.length}명입니다. 아래에서 보신 그대로 나갔어요.\n`
      out.push({
        teacher,
        count: 조각.length,
        text: 머리 + 조각.map((r) => `\n· ${r.name}\n${r.url}`).join(''),
      })
    }
  }
  return out
}
