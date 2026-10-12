// 「그날 수업일지가 덜 됐다」를 판정하는 **한 가지** 규칙.
//
// 왜 한 곳에 두나 — 원장님 화면의 「학습일지 미작성 보기」와 강사에게 보내는 알림이
// 서로 다른 기준을 쓰면, 원장님 화면엔 3건인데 선생님껜 5건이 간다. 그런 어긋남이
// 이 저장소에서 여러 번 사고로 이어졌다(주임모드 범위·학교 이름 등).
//
// 판정 순서 — 앞에서 걸리면 거기서 끝낸다.
//   1. 수업일지 자체가 없다
//   2. 출결을 안 골랐다
//   3. 결석·시험기간 결석이면 진도·과제를 안 쓰는 것이 **정상**이라 통과
//   4. 진도(진도내용/교재)가 비었다
//   5. 과제(교재·쪽수·학습지 범위)가 비었다

export interface MissingNote {
  studentId: string
  name: string
  grade: string
  teacher: string | null
  why: string
}

type Session = {
  id: string; student_id: string; session_type?: string | null
  progress_content?: string | null; today_textbook_name?: string | null
  hw_textbook_name?: string | null; hw_textbook_page?: string | null; hw_worksheet_range?: string | null
}
type Note = { session_id: string; attendance?: string | null }
type Student = { id: string; name: string; grade: string; teacher_name?: string | null }

/** 결석·시험기간 결석 — 진도·과제가 비어 있는 것이 정상인 출결 */
const NO_WORK = new Set(['결석', '시험기간 결석', '시험기간'])

export function findMissingNotes(a: {
  sessions: Session[]; notes: Note[]; students: Student[]
}): MissingNote[] {
  const noteBy = new Map(a.notes.map((n) => [n.session_id, n]))
  const stuBy = new Map(a.students.map((s) => [s.id, s]))
  const out: MissingNote[] = []

  for (const ses of a.sessions) {
    // ★ 보강·추가수업·대체수업은 **수학OPS 가 만든 수업**이다. 담당 강사가 쓸 일지가 아니다.
    //   빼지 않으면 「과제 비었음」으로 잡혀서 엉뚱한 선생님께 알림이 간다
    //   (2026-10-12 확인: 10/10 미완료 8건 중 3건이 추가수업이었다).
    if (ses.session_type && ses.session_type !== '정규') continue
    const st = stuBy.get(ses.student_id)
    if (!st) continue
    const base = { studentId: st.id, name: st.name, grade: st.grade, teacher: st.teacher_name ?? null }
    const n = noteBy.get(ses.id)

    if (!n) { out.push({ ...base, why: '수업일지 없음' }); continue }
    if (!n.attendance) { out.push({ ...base, why: '출결 미입력' }); continue }
    if (NO_WORK.has(n.attendance)) continue

    const hasContent = !!(ses.progress_content || ses.today_textbook_name)
    const hasHw = !!(ses.hw_textbook_name || ses.hw_worksheet_range || ses.hw_textbook_page)
    if (!hasContent && !hasHw) out.push({ ...base, why: '진도·과제 비었음' })
    else if (!hasContent) out.push({ ...base, why: '진도 비었음' })
    else if (!hasHw) out.push({ ...base, why: '과제 비었음' })
  }

  out.sort((x, y) => (x.teacher ?? '').localeCompare(y.teacher ?? '', 'ko') || x.name.localeCompare(y.name, 'ko'))
  return out
}

/** 담당 강사 칸에 여러 명이 적힌 경우(「김은수, 박경미」) 첫 사람이 대표다. */
export function mainTeacherOf(teacher?: string | null) {
  return String(teacher ?? '').split(/[,，、]/)[0].trim()
}
