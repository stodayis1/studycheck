import { AccessGate } from '@/components/teacher/AccessGate'

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <AccessGate>{children}</AccessGate>
}