'use client'
// 대시보드 맨 위에 뜨는 기출분석 알림. 중 · 고등 선생님(과 원장)에게 자기 학교급 시험만 보인다.
// 올라온 시험지마다 무엇이 남았는지(변별 · 손풀이 · 총평 · 다음 시험 대비) 한 줄씩 보여 준다.
// 정답은 선생님 일이 아니다 — 원장이 한글 파일에 넣어 올린다 (루트 · 분수를 앱에 칠 수 없어서. 2026-10-08)
// 전부 「완료」로 체크되면 사라진다.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiFetch'

const GREEN = '#085041'
export const ORDER_PDF = '/docs/exam-analysis-order-2026-2.pdf'

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={ok ? { background: '#E1F5EE', color: GREEN } : { background: '#FEE2E2', color: '#B91C1C' }}>
      <i className={`ti ${ok ? 'ti-check' : 'ti-x'}`} style={{ fontSize: 10 }} />{label}
    </span>
  )
}

export function ExamAnalysisNotice() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    apiFetch('/api/exam-analysis?todo=1')
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {})
  }, [])

  if (!data?.show || !data.papers?.length) return null
  const ready = data.papers.filter((p: any) => p.uploaded)
  const waiting = data.papers.filter((p: any) => !p.uploaded)

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${GREEN}`, background: '#fff' }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: GREEN, color: '#fff' }}>
        <i className="ti ti-file-analytics" style={{ fontSize: 15 }} />
        <span className="text-sm font-bold">기출분석 — 노션에서 스터디체크로 옮겼습니다</span>
        {data.due && <span className="ml-auto text-[11px] font-semibold opacity-90">마감 {data.due.slice(5).replace('-', '/')}</span>}
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-gray-600 leading-relaxed">
          시험지는 윤T가 올립니다. 올라온 학교는 <b>바로</b> 변별문항 손풀이 · 총평 · 다음 시험 대비를 채워 주세요.
          손풀이는 <b>태블릿 원본 크기</b>로 올려 주세요 (블로그에 그대로 실립니다).
        </p>

        {!!ready.length && (
          <ul className="mt-2.5 space-y-1.5">
            {ready.map((p: any) => (
              <li key={p.id}>
                <Link href={`/teacher/exam-analysis/${p.id}`} className="flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-2 hover:bg-gray-50" style={{ border: '1px solid #e5e7eb' }}>
                  <span className="text-sm font-bold" style={{ color: GREEN }}>{p.school_name} {p.grade}</span>
                  {p.assignee && <span className="text-[11px] text-gray-500">{p.assignee}</span>}
                  <span className="ml-auto flex flex-wrap gap-1">
                    <Dot ok={p.disc >= 2} label="변별" />
                    <Dot ok={p.handsolve >= Math.max(p.disc, 1)} label="손풀이" />
                    <Dot ok={p.review} label="총평" />
                    <Dot ok={p.next} label="다음 시험" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!!waiting.length && (
          <p className="mt-2 text-[11px] text-gray-400">시험지 올라오기 전: {waiting.map((p: any) => `${p.school_name} ${p.grade}`).join(' · ')}</p>
        )}

        <div className="mt-3 flex gap-2">
          <Link href="/teacher/exam-analysis" className="flex-1 rounded-xl px-3 py-2 text-center text-xs font-semibold text-white" style={{ background: GREEN }}>
            시험지 분석 열기
          </Link>
          <a href={ORDER_PDF} target="_blank" rel="noreferrer" className="flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold" style={{ borderColor: GREEN, color: GREEN }}>
            업무지시 보기 (PDF)
          </a>
        </div>
      </div>
    </div>
  )
}
