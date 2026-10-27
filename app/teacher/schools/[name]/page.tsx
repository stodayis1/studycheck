'use client'

// 학교 자료집 한 장.
// 상담 중에 띄워 놓고 그대로 읽어 드릴 수 있게, 설명 문장까지 화면에 적어 둔다.
//
// ※ Next.js 16 — 클라이언트 쪽 params 는 Promise 라 use() 로 푼다.

import { use, useEffect, useState } from 'react'
import { Header } from '@/components/common/Header'
import { apiFetch } from '@/lib/apiFetch'
import type { SchoolProfile, MathYear, Achievement } from '@/lib/schoolProfile'
import { subjectLabel, schoolinfoLink } from '@/lib/schoolProfile'

export default function SchoolProfilePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params)
  const school = decodeURIComponent(name)

  const [profile, setProfile] = useState<SchoolProfile | null>(null)
  // ★ 인원수·이름은 받지 않는다 — 상담 때 보여 드리는 화면이다
  const [hasStudents, setHasStudents] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState('')

  useEffect(() => { load() }, [school])

  async function load() {
    setLoading(true)
    const res = await apiFetch(`/api/school-profiles?school=${encodeURIComponent(school)}`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setError(json.error ?? '불러오지 못했어요.'); setLoading(false); return }
    setProfile(json.profile)
    setHasStudents(!!json.hasStudents)
    setLoading(false)
  }

  // 학교알리미에서 숫자(학생수·교원·신입생·동아리)만 다시 받는다. 편제·시험·메모·성취도는 그대로 둔다.
  async function refresh() {
    setRefreshing(true); setRefreshMsg('')
    const res = await apiFetch('/api/school-profiles/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ school_name: school }),
    })
    const json = await res.json().catch(() => ({}))
    setRefreshing(false)
    setRefreshMsg(res.ok ? '새로 받았어요.' : (json.error ?? '받지 못했어요.'))
    if (res.ok) load()
  }

  if (loading) return <Shell school={school}><p style={{ color: '#0F6E56' }}>불러오는 중…</p></Shell>
  if (error || !profile) return <Shell school={school}><p style={{ color: '#0F6E56' }}>{error}</p></Shell>

  const s = profile.stats ?? {}
  const info = schoolinfoLink(profile)

  return (
    <Shell school={school} subtitle={[profile.foundation, profile.school_type, profile.coed].filter(Boolean).join(' · ')}>

      {/* 머리 */}
      <Card>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold" style={{ color: '#085041' }}>
              {profile.official_name || profile.school_name}
            </h2>
            <p className="text-sm mt-1" style={{ color: '#5A8E7E' }}>
              {[profile.region, profile.office].filter(Boolean).join(' · ')}
            </p>
          </div>
          {hasStudents && (
            <span className="text-sm font-bold px-3 py-1.5 rounded-xl"
              style={{ background: '#E6F7F0', color: '#0F6E56' }}>
              재원생 있음
            </span>
          )}
        </div>

        {/* 성취도는 학교알리미 「교과별 학업성취사항」에 있다 — 여기 정리 안 된 학교도 바로 가 볼 수 있게 */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <a href={info.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-xl"
            style={{ background: '#0F6E56', color: '#fff' }}>
            <i className="ti ti-chart-bar" /> 학교알리미에서 성취도 보기 <i className="ti ti-external-link" />
          </a>
          {/* 학교알리미는 성취도 표 앞에 자동입력 방지 숫자를 묻는다 — 표까지 바로 여는 주소는 없다 */}
          <span className="text-xs" style={{ color: '#5A8E7E' }}>
            {info.direct
              ? '열린 화면에서 「학업성취사항」 → 「교과별 학업성취 사항」 → 보이는 숫자 입력'
              : `「${profile.official_name || profile.school_name}」 검색 → 공시정보 → 학업성취사항`}
          </span>
          {s.schoolinfo && (
            <button onClick={refresh} disabled={refreshing}
              className="ml-auto inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl"
              style={{ background: '#fff', color: '#0F6E56', border: '1px solid #9FE1CB' }}>
              <i className="ti ti-refresh" /> {refreshing ? '받는 중…' : '학교알리미에서 숫자 새로 받기'}
            </button>
          )}
        </div>
        {refreshMsg && <p className="text-xs mt-2" style={{ color: '#5A8E7E' }}>{refreshMsg}</p>}

        {/* ★ 재원생 이름 칩이 여기 있었다. 상담 때 학부모님께 보여 드리는 화면이라
            다른 집 아이 이름이 보이면 안 된다. 2026-10-27 원장님 지시로 뺐다.
            어느 학생인지는 학생 관리·시험대비 화면에서 본다. */}
      </Card>

      {/* 한눈에 */}
      {(s.total != null || s.byGrade?.length) && (
        <Card title="한눈에">
          <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
            <Stat label="전교생" value={s.total} unit="명" />
            <Stat label="학급당" value={s.perClass} unit="명" />
            <Stat label="교원" value={s.teachers} unit="명" />
            <Stat label="수업교원 1인당" value={s.studentsPerTeacher} unit="명" />
          </div>

          {!!s.byGrade?.length && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <Th>구분</Th>
                    {s.byGrade.map(g => <Th key={g.grade}>{g.grade}</Th>)}
                    {s.special && <Th>특수학급</Th>}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td lead>학생수</Td>
                    {s.byGrade.map(g => <Td key={g.grade}>{g.students}명</Td>)}
                    {s.special && <Td>{s.special.students}명</Td>}
                  </tr>
                  <tr>
                    <Td lead>학급수</Td>
                    {s.byGrade.map(g => <Td key={g.grade}>{g.classes}학급</Td>)}
                    {s.special && <Td>{s.special.classes}학급</Td>}
                  </tr>
                  <tr>
                    <Td lead>학급당</Td>
                    {s.byGrade.map(g => <Td key={g.grade}>{g.perClass ?? '-'}명</Td>)}
                    {s.special && <Td>{s.special.perClass ?? '-'}명</Td>}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 수학 */}
      {!!profile.math_curriculum?.length && (
        <Card title="수학은 이렇게 배웁니다">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {profile.math_curriculum.map((y: MathYear) => (
              <div key={y.grade} className="rounded-xl overflow-hidden" style={{ border: '1px solid #D6F0E6' }}>
                <div className="px-3 py-2 flex items-baseline justify-between"
                  style={{ background: '#0F6E56', color: '#fff' }}>
                  <span className="font-bold">{y.grade}</span>
                  {y.revision && <span className="text-xs" style={{ color: '#9FE1CB' }}>{y.revision}</span>}
                </div>
                <div className="p-3">
                  {y.terms.map((t, i) => (
                    <div key={i} className="flex gap-2 items-start mb-1.5">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: '#E6F7F0', color: '#0F6E56' }}>{t.term}</span>
                      <span className="text-sm font-semibold" style={{ color: '#085041' }}>
                        {subjectLabel(t)}
                      </span>
                    </div>
                  ))}
                  {y.picks?.map((p, i) => (
                    <div key={i} className="mt-2 pt-2" style={{ borderTop: '1px dashed #D6F0E6' }}>
                      <div className="text-xs font-bold" style={{ color: '#0F6E56' }}>
                        {p.label}{p.term ? ` · ${p.term}` : ''}
                      </div>
                      <div className="text-xs mt-1 leading-relaxed" style={{ color: '#5A8E7E' }}>
                        {p.options.join(' · ')}
                      </div>
                    </div>
                  ))}
                  {y.note && (
                    <p className="text-xs mt-2 leading-relaxed" style={{ color: '#5A8E7E' }}>{y.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 학교 추가로 막 만든 한 장 — 사람이 읽어야 하는 칸이 비어 있다고 알려 준다 */}
      {!profile.math_curriculum?.length && (
        <Card title="아직 정리 전이에요">
          <p className="text-sm leading-relaxed" style={{ color: '#0F6E56' }}>
            수학 편제와 정기시험 날짜는 학교마다 모양이 다른 공시 첨부라 사람이 읽어 정리해요.
            Claude에게 「{profile.school_name} 편제 정리해줘」라고 하면 채워져요.
            성취도는 위 버튼으로 학교알리미 표를 연 뒤, 표를 복사해 Claude에게 붙여넣으면 돼요.
          </p>
        </Card>
      )}

      {/* 성취도 */}
      {!!s.achievement?.rows?.length && <AchievementCard a={s.achievement} />}

      {/* 시험 */}
      {!!profile.exam_calendar?.rounds?.length && (
        <Card title={`${profile.source_year} 정기시험`}>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {profile.exam_calendar.rounds!.map((r, i) => (
              <div key={i} className="rounded-xl p-3"
                style={{ background: '#fff', border: '1px solid #D6F0E6', borderLeft: '4px solid #0F6E56' }}>
                <div className="text-xs font-bold" style={{ color: '#5A8E7E' }}>{r.label}</div>
                <div className="text-base font-bold mt-0.5" style={{ color: '#085041' }}>{r.dates}</div>
                {r.note && <div className="text-xs mt-0.5" style={{ color: '#5A8E7E' }}>{r.note}</div>}
              </div>
            ))}
          </div>
          {(profile.exam_calendar.mock?.length || profile.exam_calendar.terms?.length || profile.exam_calendar.note) && (
            <div className="mt-3 rounded-xl p-3 text-sm leading-relaxed"
              style={{ background: '#F0FBF7', border: '1px solid #D6F0E6', color: '#0F6E56' }}>
              {profile.exam_calendar.mock?.map((m, i) => <div key={i}>학력평가 · {m}</div>)}
              {profile.exam_calendar.terms?.map((t, i) => <div key={i}>{t}</div>)}
              {profile.exam_calendar.note && <div className="mt-1">{profile.exam_calendar.note}</div>}
            </div>
          )}
        </Card>
      )}

      {/* 그 밖에 */}
      {!!profile.highlights?.length && (
        <Card title="그 밖에">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {profile.highlights.map((h, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: '#F0FBF7', border: '1px solid #D6F0E6' }}>
                <div className="text-xs" style={{ color: '#5A8E7E' }}>{h.label}</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: '#085041' }}>{h.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {profile.notes && (
        <Card title="메모">
          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#0F6E56' }}>{profile.notes}</p>
        </Card>
      )}

      {/* 출처 — 공공누리 출처표시 의무가 있다. 지우지 말 것. */}
      <div className="text-xs leading-relaxed px-1 pb-8" style={{ color: '#8FB8AA' }}>
        출처: {profile.sources?.map(x => x.name).join(' · ') || '학교알리미'} ({profile.source_year}년 공시)<br />
        본 저작물은 공공누리 제1유형(출처표시)에 따라 교육부 학교알리미의 공공저작물을 이용하였습니다.
        내용은 학교 사정에 따라 바뀔 수 있습니다.
      </div>

    </Shell>
  )
}

// 성취도 A~E — 진한 색이 A. 3단계 과목(A~C)도 같은 색 순서를 쓴다.
const GRADE_COLORS = ['#085041', '#0F6E56', '#5DCAA5', '#9FE1CB', '#D6F0E6']
const GRADE_LABELS = ['A', 'B', 'C', 'D', 'E']

function AchievementCard({ a }: { a: Achievement }) {
  return (
    <Card title={`${a.year}학년도 교과 성취도`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse', minWidth: 520 }}>
          <thead>
            <tr>
              <Th>학년·학기</Th><Th>과목</Th><Th>평균</Th><Th>표준편차</Th><Th>성취도 비율</Th>
            </tr>
          </thead>
          <tbody>
            {a.rows.map((r, i) => (
              <tr key={i}>
                <Td lead>{r.grade} {r.term}</Td>
                <Td>{r.subject}{r.students != null && <span className="text-xs ml-1" style={{ color: '#8FB8AA' }}>{r.students}명</span>}</Td>
                <Td>{r.avg ?? '-'}</Td>
                <Td>{r.sd ?? '-'}</Td>
                <td className="px-2 py-2" style={{ border: '1px solid #D6F0E6', minWidth: 220 }}>
                  {r.dist?.length ? <DistBar dist={r.dist} /> : <span style={{ color: '#8FB8AA' }}>-</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.note && <p className="text-xs mt-2 leading-relaxed" style={{ color: '#5A8E7E' }}>{a.note}</p>}
    </Card>
  )
}

function DistBar({ dist }: { dist: number[] }) {
  return (
    <div>
      <div className="flex h-3 rounded overflow-hidden" style={{ background: '#F0FBF7' }}>
        {dist.map((v, i) => (
          <div key={i} style={{ width: `${v}%`, background: GRADE_COLORS[i] }} title={`${GRADE_LABELS[i]} ${v}%`} />
        ))}
      </div>
      <div className="flex gap-2 mt-1 text-xs" style={{ color: '#5A8E7E' }}>
        {dist.map((v, i) => <span key={i}><b style={{ color: '#085041' }}>{GRADE_LABELS[i]}</b> {v}%</span>)}
      </div>
    </div>
  )
}

function Shell({ school, subtitle, children }: { school: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#F0FBF7' }}>
      <Header title={school} subtitle={subtitle} showBack />
      <div className="p-4 max-w-4xl mx-auto flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid #9FE1CB' }}>
      {title && <h3 className="font-bold mb-3" style={{ color: '#085041' }}>{title}</h3>}
      {children}
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value?: number | null; unit: string }) {
  if (value == null) return null
  return (
    <div className="rounded-xl p-3" style={{ background: '#F0FBF7', border: '1px solid #D6F0E6' }}>
      <div className="text-xs" style={{ color: '#5A8E7E' }}>{label}</div>
      <div className="text-xl font-bold mt-0.5" style={{ color: '#085041' }}>
        {value}<span className="text-xs font-semibold ml-0.5" style={{ color: '#5A8E7E' }}>{unit}</span>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-xs font-bold px-2 py-2"
    style={{ background: '#0F6E56', color: '#fff', border: '1px solid #D6F0E6' }}>{children}</th>
}

function Td({ children, lead }: { children: React.ReactNode; lead?: boolean }) {
  return <td className="text-center px-2 py-2"
    style={{
      border: '1px solid #D6F0E6',
      background: lead ? '#F0FBF7' : '#fff',
      color: '#085041',
      fontWeight: lead ? 700 : 500,
    }}>{children}</td>
}
