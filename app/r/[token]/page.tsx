'use client'

// 학생부 로드맵 소식 — 문자로 받은 개인 링크. /r/<token>  (로그인 없이 연다)
//
// 원장님 2026-11-07 「각 계열로 도움이 될 만한 박람회, 컨퍼런스, 설명회 … 2주에 한 번 해당 학부모·학생에게」
// 원장님이 승인한 행사 중 이 학생의 관심 계열·학년에 맞는 것만 보인다.
// 색은 대표 썸네일과 같은 파스텔 (원장님 「짙은 초록색 말고 파스텔 핑크·오렌지 계열로 세련되게」).

import { use, useEffect, useState } from 'react'
import { roadmapSerif, RoadmapSerifLink } from '@/lib/roadmapFont'
import { fmtWhen, COMMON, type CareerEvent } from '@/lib/careerEvents'

const BG = '#FBEFF2'
const PINK = '#F7C6D0'
const INK = '#26161C'
const SUB = '#5C3440'
const LINE = '#EBC9D2'

type Data = {
  name: string; grade: string | null; role: 'student' | 'parent'
  fields: string[]; answered: boolean; events: CareerEvent[]; surveyUrl: string | null
}

export default function RoadmapNewsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/career/news/${encodeURIComponent(token)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error ?? '열지 못했어요. 잠시 뒤 다시 눌러 주세요.'); else setD(j)
    }).catch(() => setErr('인터넷 연결을 확인하고 다시 눌러 주세요.'))
  }, [token])

  if (err) return <div className="min-h-screen grid place-items-center px-6 text-sm text-gray-500" style={{ background: BG }}>{err}</div>
  if (!d) return <div className="min-h-screen grid place-items-center text-sm text-gray-400" style={{ background: BG }}>불러오는 중…</div>

  const who = d.role === 'parent' ? `${d.name} 학생 어머님·아버님` : `${d.name} 학생`
  return (
    <div className="min-h-screen" style={{ background: BG, color: INK }}>
      <RoadmapSerifLink />
      <div className="mx-auto max-w-lg">
        <header className="px-6 pt-8 pb-6" style={{ background: PINK }}>
          <p className="text-[11px] tracking-[0.2em]" style={{ color: SUB }}>수학의지혜 수학학원 · STUDENT ROADMAP</p>
          <h1 className="mt-3 text-[34px] leading-[1.15]" style={{ fontFamily: roadmapSerif.style.fontFamily, fontWeight: 300 }}>
            학생부 로드맵<br />소식
          </h1>
          <p className="mt-3 text-[13px]" style={{ color: SUB }}>{who}, 관심 계열에 맞춰 골랐어요.</p>
          {d.fields.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {d.fields.map((f) => (
                <span key={f} className="px-2.5 py-1 rounded-full text-[11.5px]" style={{ border: `1px solid ${SUB}`, color: SUB }}>{f}</span>
              ))}
            </div>
          )}
        </header>

        <main className="px-5 py-6 space-y-4">
          {!d.answered && d.surveyUrl && (
            <a href={d.surveyUrl} className="block rounded-2xl px-4 py-3.5 text-[13px]" style={{ background: '#fff', border: `1px solid ${LINE}` }}>
              아직 <b>학생부 로드맵 질문지</b>를 안 내셨어요. 관심 계열을 알려 주시면 그 계열 행사를 골라 드려요. <u>질문지 하러 가기 →</u>
            </a>
          )}

          {d.events.length === 0 && (
            <p className="py-10 text-center text-sm" style={{ color: SUB }}>지금은 맞는 행사가 없어요. 다음 소식에서 챙겨 드릴게요.</p>
          )}

          {d.events.map((e) => (
            <article key={e.id} className="rounded-2xl bg-white px-5 py-4" style={{ border: `1px solid ${LINE}` }}>
              <div className="flex items-center gap-2 text-[11px]" style={{ color: SUB }}>
                <span className="px-2 py-0.5 rounded-full" style={{ background: PINK }}>{e.kind}</span>
                <span>{e.fields.includes(COMMON) ? '모든 계열' : e.fields.join(' · ')}</span>
              </div>
              <h2 className="mt-2 text-[17px] font-bold leading-snug">{e.title}</h2>
              {e.host && <p className="text-[12.5px] mt-0.5" style={{ color: SUB }}>{e.host}</p>}
              <dl className="mt-3 space-y-1 text-[13px]">
                <Row k="언제">{fmtWhen(e)}</Row>
                <Row k="어디서">{e.online ? `온라인${e.place ? ` · ${e.place}` : ''}` : e.place ?? '-'}</Row>
                {e.grades.length > 0 && <Row k="대상">{e.grades.join(' · ')}</Row>}
                {e.fee && <Row k="참가비">{e.fee}</Row>}
                {e.apply_deadline && <Row k="신청 마감"><b>{fmtWhen({ starts_on: e.apply_deadline, ends_on: null, time_text: null })}</b></Row>}
              </dl>
              {e.summary && <p className="mt-3 text-[13px] leading-relaxed text-gray-700 whitespace-pre-line">{e.summary}</p>}
              <div className="mt-4 flex gap-2">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center rounded-xl py-2.5 text-[13px] font-semibold" style={{ border: `1px solid ${INK}` }}>안내 보기</a>
                {e.apply_url && <a href={e.apply_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center rounded-xl py-2.5 text-[13px] font-semibold text-white" style={{ background: INK }}>신청하기</a>}
              </div>
            </article>
          ))}

          <p className="pt-4 pb-10 text-center text-[11.5px]" style={{ color: SUB }}>
            수학의지혜 수학학원 · 2주에 한 번 골라 보내 드려요<br />행사 내용은 주최 측 안내가 바뀔 수 있으니 「안내 보기」에서 한 번 더 확인해 주세요
          </p>
        </main>
      </div>
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0" style={{ color: SUB }}>{k}</dt>
      <dd className="flex-1 min-w-0">{children}</dd>
    </div>
  )
}
