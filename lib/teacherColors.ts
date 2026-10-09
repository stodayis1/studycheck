// 주임모드에서 「누구 학생인지」를 색으로 가른다.
//
// 왜 필요한가 — 중등주임 선생님은 김은수·박경미·신애진 세 분의 학생을 함께 본다.
// 학년별 색만 있으면 어느 강사 학생인지 알 수 없어서 매번 이름을 눌러 확인해야 했다
// (원장님 지적 2026-10-09). 주임모드일 때만 **강사별 색**으로 바꾼다.
// 평소(강사모드)에는 학년별 색이 그대로다 — 본인 학생만 보니 강사색이 의미가 없다.
//
// 색은 **강사 이름을 가나다순으로 정렬해 앞에서부터** 가져간다.
//   · 강사가 바뀌어도 코드를 고칠 필요가 없다 (이름을 적어 두지 않는다)
//   · 같은 명단이면 색이 늘 같다 — 날마다 색이 바뀌면 외울 수 없다
//   · 2026-10-09 기준 8명이고 가나다순 앞 세 명이 중등 세 분이다
//     (김은수 → 파랑, 박경미 → 분홍, 신애진 → 초록)
//
// ★ 색만 보고 외우게 하면 안 된다. 쓰는 화면은 **반드시 범례**(강사 이름 + 색)를 같이 띄운다.

export type TeacherColor = { bg: string; border: string; text: string }

// 서로 뚜렷하게 구분되는 색만 고른다. 강사 8명(2026-10-09)에 여유 두 칸.
const PALETTE: TeacherColor[] = [
  { bg: '#E3F2FD', border: '#1E88E5', text: '#0D47A1' }, // 파랑
  { bg: '#FCE4EC', border: '#EC407A', text: '#AD1457' }, // 분홍
  { bg: '#E8F5E9', border: '#43A047', text: '#1B5E20' }, // 초록
  { bg: '#FFF3E0', border: '#FB8C00', text: '#E65100' }, // 주황
  { bg: '#EDE7F6', border: '#7E57C2', text: '#4527A0' }, // 보라
  { bg: '#E0F7FA', border: '#00ACC1', text: '#006064' }, // 청록
  { bg: '#FFFDE7', border: '#F9A825', text: '#F57F17' }, // 노랑
  { bg: '#EFEBE9', border: '#8D6E65', text: '#4E342E' }, // 갈색
  { bg: '#F1F8E9', border: '#7CB342', text: '#33691E' }, // 연두
  { bg: '#FBE9E7', border: '#FF7043', text: '#BF360C' }, // 주홍
]

/** 담당 강사가 없는 학생 */
const NO_TEACHER: TeacherColor = { bg: '#F5F5F5', border: '#BDBDBD', text: '#616161' }

/** 담당 강사가 여러 명 적힌 경우(「김은수, 박경미」)는 첫 사람을 대표로 본다. */
export function mainTeacher(teacherName?: string | null): string {
  return (teacherName ?? '').split(/[,，、]/)[0].trim()
}

/**
 * 학생 명단에서 강사별 색을 정한다.
 *
 * 범례를 그릴 때와 블록을 칠할 때 **같은 결과**를 써야 하므로 한 번 만들어 돌려 쓴다.
 * 넘기는 명단은 「그 사람이 볼 수 있는 학생 전체」가 좋다 — 오늘 수업 학생만 넘기면
 * 날마다 명단이 달라져 색이 흔들린다.
 */
export function buildTeacherColors(students: { teacher_name?: string | null }[]) {
  const names = [...new Set(students.map((s) => mainTeacher(s.teacher_name)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'))
  const map = new Map<string, TeacherColor>()
  names.forEach((n, i) => map.set(n, PALETTE[i % PALETTE.length]))
  return {
    /** 가나다순 강사 이름 — 범례를 이 순서로 그린다 */
    names,
    of: (teacherName?: string | null): TeacherColor =>
      map.get(mainTeacher(teacherName)) ?? NO_TEACHER,
  }
}
