import type {
  User, ClassGroup, Student, AssignmentSet,
  AssignmentItem, Submission, StudentAssignmentItem,
  AssignmentSummary, SubmissionRow, ChildWeeklySummary,
} from '@/types'

export const MOCK_TEACHER: User = {
  id: 'teacher-001', name: '김선생', email: 'teacher@test.com', role: 'teacher',
  created_at: '2025-03-01T00:00:00Z', updated_at: '2025-03-01T00:00:00Z',
}

export const MOCK_STUDENTS_USERS: User[] = [
  { id: 'student-user-001', name: '이지수', email: 'student1@test.com', role: 'student', created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
  { id: 'student-user-002', name: '박민준', email: 'student2@test.com', role: 'student', created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
  { id: 'student-user-003', name: '최서연', email: 'student3@test.com', role: 'student', created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
  { id: 'student-user-004', name: '정도윤', email: 'student4@test.com', role: 'student', created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
  { id: 'student-user-005', name: '한수민', email: 'student5@test.com', role: 'student', created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
]

export const MOCK_PARENT_USER: User = {
  id: 'parent-user-001', name: '이지수 엄마', email: 'parent1@test.com', role: 'parent',
  created_at: '2025-03-06T00:00:00Z', updated_at: '2025-03-06T00:00:00Z',
}

export const MOCK_CLASSES: ClassGroup[] = [
  { id: 'class-001', name: '2025 수학1 화목반', teacher_id: 'teacher-001', description: '고2 수학1 심화 / 화목 오후 6시', created_at: '2025-03-01T00:00:00Z', updated_at: '2025-03-01T00:00:00Z' },
  { id: 'class-002', name: '2025 수학1 월수반', teacher_id: 'teacher-001', description: '고2 수학1 기본 / 월수 오후 4시', created_at: '2025-03-01T00:00:00Z', updated_at: '2025-03-01T00:00:00Z' },
]

export const MOCK_STUDENTS: Student[] = [
  { id: 'student-001', user_id: 'student-user-001', name: '이지수', school: '한국고등학교', grade: 2, class_group_id: 'class-001', parent_user_id: 'parent-user-001', created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
  { id: 'student-002', user_id: 'student-user-002', name: '박민준', school: '서울고등학교', grade: 2, class_group_id: 'class-001', parent_user_id: 'parent-user-002', created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
  { id: 'student-003', user_id: 'student-user-003', name: '최서연', school: '강남고등학교', grade: 2, class_group_id: 'class-001', parent_user_id: undefined, created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
  { id: 'student-004', user_id: 'student-user-004', name: '정도윤', school: '한국고등학교', grade: 2, class_group_id: 'class-001', parent_user_id: undefined, created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
  { id: 'student-005', user_id: 'student-user-005', name: '한수민', school: '강남고등학교', grade: 1, class_group_id: 'class-002', parent_user_id: undefined, created_at: '2025-03-05T00:00:00Z', updated_at: '2025-03-05T00:00:00Z' },
]

const now = new Date()
const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
const in3Days = new Date(now); in3Days.setDate(now.getDate() + 3)
const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)

export const MOCK_ASSIGNMENT_SETS: AssignmentSet[] = [
  { id: 'aset-001', title: '5월 14일 지수법칙 과제', description: '지수법칙 개념 이해 및 문제 풀이', class_group_id: 'class-001', due_date: tomorrow.toISOString(), created_by: 'teacher-001', created_at: '2025-05-12T10:00:00Z', updated_at: '2025-05-12T10:00:00Z' },
  { id: 'aset-002', title: '5월 16일 로그함수 과제', description: '로그의 정의와 기본 성질', class_group_id: 'class-001', due_date: in3Days.toISOString(), created_by: 'teacher-001', created_at: '2025-05-12T10:30:00Z', updated_at: '2025-05-12T10:30:00Z' },
  { id: 'aset-003', title: '5월 10일 수열 과제', description: '등차수열, 등비수열 개념', class_group_id: 'class-001', due_date: yesterday.toISOString(), created_by: 'teacher-001', created_at: '2025-05-08T10:00:00Z', updated_at: '2025-05-08T10:00:00Z' },
]

export const MOCK_ASSIGNMENT_ITEMS: AssignmentItem[] = [
  { id: 'item-001', assignment_set_id: 'aset-001', type: 'video', title: '지수법칙 개념 영상', description: '지수법칙 핵심 개념 15분 정리 영상을 보고 한 줄 요약을 작성하세요.', video_url: 'https://youtu.be/example_exp', created_at: '2025-05-12T10:00:00Z' },
  { id: 'item-002', assignment_set_id: 'aset-001', type: 'textbook', title: 'RPM 수학Ⅰ 교재 풀기', description: '지수법칙 관련 문제를 모두 풀어오세요.', textbook_name: 'RPM 수학Ⅰ', page_range: 'p.32~35', problem_range: '1~18번', created_at: '2025-05-12T10:00:00Z' },
  { id: 'item-003', assignment_set_id: 'aset-001', type: 'worksheet', title: '지수법칙 학습지', description: '학습지를 다운로드하여 풀고, 사진 또는 PDF로 업로드하세요.', file_url: '/worksheets/exponent_law.pdf', created_at: '2025-05-12T10:00:00Z' },
  { id: 'item-004', assignment_set_id: 'aset-002', type: 'video', title: '로그함수 개념 영상', description: '로그의 정의와 성질 강의입니다.', video_url: 'https://youtu.be/example_log', created_at: '2025-05-12T10:30:00Z' },
  { id: 'item-005', assignment_set_id: 'aset-002', type: 'textbook', title: 'RPM 수학Ⅰ 교재 풀기', description: '로그 기본 문제입니다.', textbook_name: 'RPM 수학Ⅰ', page_range: 'p.40~42', problem_range: '1~12번', created_at: '2025-05-12T10:30:00Z' },
  { id: 'item-006', assignment_set_id: 'aset-003', type: 'video', title: '수열 개념 영상', video_url: 'https://youtu.be/example_seq', created_at: '2025-05-08T10:00:00Z' },
  { id: 'item-007', assignment_set_id: 'aset-003', type: 'textbook', title: 'RPM 수열 파트', textbook_name: 'RPM 수학Ⅰ', page_range: 'p.60~65', problem_range: '1~20번', created_at: '2025-05-08T10:00:00Z' },
  { id: 'item-008', assignment_set_id: 'aset-003', type: 'worksheet', title: '수열 학습지', file_url: '/worksheets/sequence.pdf', created_at: '2025-05-08T10:00:00Z' },
]

export const MOCK_SUBMISSIONS: Submission[] = [
  { id: 'sub-001', assignment_set_id: 'aset-001', student_id: 'student-001', video_status: 'submitted', textbook_status: 'submitted', worksheet_status: 'submitted', final_status: 'checked', video_summary: '지수법칙은 밑이 같을 때 지수를 더하거나 빼는 규칙이다.', difficult_problems: '15, 17번', uploaded_file_url: '/submissions/jisu.pdf', teacher_feedback: '영상 요약이 핵심을 잘 짚었어요. 15번은 나눗셈 파트를 다시 확인해보세요.', submitted_at: new Date(now.getTime() - 3*60*60*1000).toISOString(), checked_at: new Date(now.getTime() - 1*60*60*1000).toISOString(), created_at: new Date(now.getTime() - 3*60*60*1000).toISOString(), updated_at: new Date(now.getTime() - 1*60*60*1000).toISOString() },
  { id: 'sub-002', assignment_set_id: 'aset-001', student_id: 'student-002', video_status: 'submitted', textbook_status: 'in_progress', worksheet_status: 'not_started', final_status: 'in_progress', video_summary: '지수법칙: a^m × a^n = a^(m+n)', submitted_at: undefined, created_at: new Date(now.getTime() - 2*60*60*1000).toISOString(), updated_at: new Date(now.getTime() - 30*60*1000).toISOString() },
  { id: 'sub-003', assignment_set_id: 'aset-001', student_id: 'student-003', video_status: 'not_started', textbook_status: 'not_started', worksheet_status: 'not_started', final_status: 'not_started', created_at: now.toISOString(), updated_at: now.toISOString() },
  { id: 'sub-004', assignment_set_id: 'aset-002', student_id: 'student-001', video_status: 'not_started', textbook_status: 'not_started', worksheet_status: 'not_started', final_status: 'not_started', created_at: now.toISOString(), updated_at: now.toISOString() },
  { id: 'sub-005', assignment_set_id: 'aset-003', student_id: 'student-001', video_status: 'late', textbook_status: 'late', worksheet_status: 'submitted', final_status: 'late', video_summary: '수열은 규칙적으로 나열된 수의 열이다.', difficult_problems: '18, 19번', uploaded_file_url: '/submissions/jisu_seq.pdf', teacher_feedback: '마감 이후 제출했지만 내용은 충실합니다.', submitted_at: new Date(yesterday.getTime() + 2*60*60*1000).toISOString(), created_at: yesterday.toISOString(), updated_at: yesterday.toISOString() },
]

export function getMockStudentAssignments(studentId: string): StudentAssignmentItem[] {
  return MOCK_ASSIGNMENT_SETS.map((aset) => {
    const items = MOCK_ASSIGNMENT_ITEMS.filter((i) => i.assignment_set_id === aset.id)
    const submission = MOCK_SUBMISSIONS.find((s) => s.assignment_set_id === aset.id && s.student_id === studentId) ?? null
    const is_overdue = new Date(aset.due_date) < new Date() && submission?.final_status !== 'submitted' && submission?.final_status !== 'checked'
    return { assignment_set: aset, items, submission, is_overdue }
  })
}

export function getMockAssignmentSummaries(): AssignmentSummary[] {
  const classStudents = MOCK_STUDENTS.filter((s) => s.class_group_id === 'class-001')
  const total = classStudents.length
  return MOCK_ASSIGNMENT_SETS.map((aset) => {
    const subs = MOCK_SUBMISSIONS.filter((s) => s.assignment_set_id === aset.id)
    const submitted = subs.filter((s) => ['submitted','checked','late'].includes(s.final_status)).length
    const checked = subs.filter((s) => s.final_status === 'checked').length
    const not_started = total - subs.length + subs.filter((s) => s.final_status === 'not_started').length
    return { assignment_set: aset, total_assigned: total, submitted_count: submitted, checked_count: checked, not_started_count: not_started, completion_rate: total > 0 ? Math.round((submitted/total)*100) : 0 }
  })
}

export function getMockSubmissionRows(assignmentSetId: string): SubmissionRow[] {
  const classStudents = MOCK_STUDENTS.filter((s) => s.class_group_id === 'class-001')
  const aset = MOCK_ASSIGNMENT_SETS.find((a) => a.id === assignmentSetId)!
  return classStudents.map((student) => ({
    student,
    submission: MOCK_SUBMISSIONS.find((s) => s.assignment_set_id === assignmentSetId && s.student_id === student.id) ?? null,
    assignment_set: aset,
  }))
}

export function getMockChildWeeklySummary(parentUserId: string): ChildWeeklySummary | null {
  const student = MOCK_STUDENTS.find((s) => s.parent_user_id === parentUserId)
  if (!student) return null
  const assignments = getMockStudentAssignments(student.id)
  const completed = assignments.filter((a) => ['submitted','checked','late'].includes(a.submission?.final_status ?? '')).length
  const late = assignments.filter((a) => a.submission?.final_status === 'late').length
  const feedbacks = assignments.filter((a) => a.submission?.teacher_feedback).length
  return {
    student,
    total_assignments: assignments.length,
    completed_count: completed,
    not_started_count: assignments.filter((a) => !a.submission || a.submission.final_status === 'not_started').length,
    late_count: late,
    completion_rate: assignments.length > 0 ? Math.round((completed/assignments.length)*100) : 0,
    feedback_count: feedbacks,
    assignments,
  }
}