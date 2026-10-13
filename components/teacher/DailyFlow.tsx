'use client'

import Link from 'next/link'

// 하루 업무 흐름.
//
// 매뉴얼 안에만 있던 것을 **출근해서 처음 보는 화면(대시보드)** 에도 띄운다
// (원장님 2026-10-12). 새로 오신 선생님이 매뉴얼을 찾아 들어가지 않아도
// 「오늘 뭘 어떤 순서로 하면 되는지」가 눈에 들어와야 한다.
//
// 두 곳이 **같은 내용**을 쓰도록 여기 한 곳에 둔다 — 매뉴얼과 대시보드가 갈리면
// 어느 쪽이 맞는지 알 수 없다.

export const DAILY_FLOW = [
  { icon: 'ti-layout-dashboard', title: '출근하면 대시보드', desc: '오늘 할 일 · 전달사항 확인', href: '/teacher/dashboard' },
  { icon: 'ti-notebook', title: '수업 후 학습관리', desc: '수업일지 저장 + 알림장', href: '/teacher/learning-notes' },
  { icon: 'ti-file-text', title: '학습지관리', desc: '제출확인 → 점수입력 → 다음 단계', href: '/teacher/assignments' },
  { icon: 'ti-circle-check', title: '대시보드 다시 확인', desc: '「오늘 모든 업무 완료!」 뜨면 끝', href: '/teacher/dashboard' },
]

export function DailyFlow({ withManualLink = false }: { withManualLink?: boolean }) {
  return (
    <section className="rounded-2xl p-4" style={{ background: '#F0FBF7', border: '1px solid #9FE1CB' }}>
      <div className="flex items-center gap-1.5 mb-3">
        <i className="ti ti-route" style={{ fontSize: 16, color: '#085041' }} />
        <h2 className="text-sm font-bold" style={{ color: '#085041' }}>하루 업무 흐름</h2>
        {withManualLink && (
          <Link href="/teacher/manual"
            className="ml-auto text-[11px] font-bold px-2 py-1 rounded-lg"
            style={{ background: 'white', color: '#085041', border: '1px solid #9FE1CB' }}>
            사용 매뉴얼 보기
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {DAILY_FLOW.map((s, i) => (
          <Link key={s.title} href={s.href} className="rounded-xl bg-white p-3 block hover:opacity-80 transition-opacity"
            style={{ border: '1px solid #d1f0e4' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: '#085041', color: 'white' }}>{i + 1}</span>
              <i className={`ti ${s.icon}`} style={{ fontSize: 15, color: '#0F6E56' }} />
            </div>
            <p className="text-xs font-bold text-gray-800">{s.title}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{s.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
