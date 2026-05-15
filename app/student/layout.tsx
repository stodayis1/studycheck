import { BottomNav, STUDENT_NAV_ITEMS } from '@/components/common/BottomNav'

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-lg mx-auto pb-20">
        {children}
      </main>
      <BottomNav items={STUDENT_NAV_ITEMS} />
    </div>
  )
}