export type UserRole = 'teacher' | 'student' | 'parent'
export type AssignmentItemType = 'video' | 'textbook' | 'worksheet'
export type SubmissionStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'checked'
  | 'need_retry'
  | 'late'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  created_at: string
  updated_at: string
}

export interface ClassGroup {
  id: string
  name: string
  teacher_id: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  user_id: string
  name: string
  school?: string
  grade?: number
  class_group_id?: string
  parent_user_id?: string
  created_at: string
  updated_at: string
}

export interface AssignmentSet {
  id: string
  title: string
  description?: string
  class_group_id?: string
  due_date: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface AssignmentItem {
  id: string
  assignment_set_id: string
  type: AssignmentItemType
  title: string
  description?: string
  video_url?: string
  textbook_name?: string
  page_range?: string
  problem_range?: string
  file_url?: string
  created_at: string
}

export interface Submission {
  id: string
  assignment_set_id: string
  student_id: string
  video_status: SubmissionStatus
  textbook_status: SubmissionStatus
  worksheet_status: SubmissionStatus
  final_status: SubmissionStatus
  video_summary?: string
  difficult_problems?: string
  uploaded_file_url?: string
  student_memo?: string
  teacher_feedback?: string
  submitted_at?: string
  checked_at?: string
  created_at: string
  updated_at: string
}

export interface StudentAssignmentItem {
  assignment_set: AssignmentSet
  items: AssignmentItem[]
  submission: Submission | null
  is_overdue: boolean
}

export interface AssignmentSummary {
  assignment_set: AssignmentSet
  total_assigned: number
  submitted_count: number
  checked_count: number
  not_started_count: number
  completion_rate: number
}

export interface SubmissionRow {
  student: Student
  submission: Submission | null
  assignment_set: AssignmentSet
}

export interface ChildWeeklySummary {
  student: Student
  total_assignments: number
  completed_count: number
  not_started_count: number
  late_count: number
  completion_rate: number
  feedback_count: number
  assignments: StudentAssignmentItem[]
}

export const STATUS_CONFIG = {
  not_started: { label: '시작 안 함', color: 'bg-gray-100', textColor: 'text-gray-500', icon: '○' },
  in_progress: { label: '진행 중',   color: 'bg-blue-100', textColor: 'text-blue-600', icon: '◐' },
  submitted:   { label: '제출 완료', color: 'bg-green-100', textColor: 'text-green-600', icon: '✓' },
  checked:     { label: '확인 완료', color: 'bg-indigo-100', textColor: 'text-indigo-600', icon: '✓✓' },
  need_retry:  { label: '다시 하기', color: 'bg-orange-100', textColor: 'text-orange-600', icon: '↩' },
  late:        { label: '지각 제출', color: 'bg-red-100', textColor: 'text-red-500', icon: '!' },
} as const