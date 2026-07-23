'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface CampStudent {
  id: string
  name: string
  school: string | null
  is_active: boolean
  sort_order: number
}

interface CampProgress {
  id: string
  student_id: string
  session_no: number
  watched: boolean
  retried: boolean
  worksheet: boolean
}

export const SESSIONS = [
  { no: 1, date: '7/22(수)', title: '다항식의 연산' },
  { no: 2, date: '7/24(금)', title: '나머지정리' },
  { no: 3, date: '7/27(월)', title: '인수분해' },
  { no: 4, date: '7/29(수)', title: '복소수' },
  { no: 5, date: '7/31(금)', title: '이차방정식' },
  { no: 6, date: '8/3(월)', title: '이차방정식과 이차함수' },
  { no: 7, date: '8/5(수)', title: '고차방정식' },
  { no: 8, date: '8/7(금)', title: '연립방정식·일차부등식' },
  { no: 9, date: '8/10(월)', title: '이차부등식' },
  { no: 10, date: '8/12(수)', title: '전범위 총정리' },
  { no: 11, date: '8/14(금)', title: '전범위 총정리' },
]

const TOTAL = SESSIONS.length

// 진행률에 따라 표정/포즈가 바뀌는 캐릭터
function CampCharacter({ percent, allClear }: { percent: number; allClear: boolean }) {
  const stage = allClear ? 4 : percent >= 60 ? 3 : percent >= 25 ? 2 : percent > 0 ? 1 : 0
  const bodyColor = allClear ? '#ffd76a' : stage >= 2 ? '#fb923c' : '#38bdf8'
  return (
    <div className="camp-char" style={{ animation: allClear ? 'campBounceBig 0.7s ease-in-out infinite' : 'campBounce 2.2s ease-in-out infinite' }}>
      <svg width="40" height="46" viewBox="0 0 48 52">
        {allClear && (
          <>
            <polygon points="24,2 15,16 33,16" fill="#f97316" />
            <circle cx="24" cy="2" r="3" fill="#fff" />
          </>
        )}
        {stage >= 3 && (
          <>
            <rect x="2" y="20" width="6" height="15" rx="3" fill={bodyColor} transform="rotate(-35 5 27)" />
            <rect x="40" y="20" width="6" height="15" rx="3" fill={bodyColor} transform="rotate(35 43 27)" />
          </>
        )}
        <circle cx="24" cy="30" r="20" fill={bodyColor} />
        <ellipse cx="17" cy="22" rx="5" ry="3" fill="#fff" opacity="0.25" />
        {stage >= 1 && (
          <>
            <circle cx="12" cy="33" r="3.2" fill="#ff9eb0" opacity="0.6" />
            <circle cx="36" cy="33" r="3.2" fill="#ff9eb0" opacity="0.6" />
          </>
        )}
        {stage === 0 ? (
          <>
            <path d="M14 27 h6" stroke="#2d1b4e" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M28 27 h6" stroke="#2d1b4e" strokeWidth="2.2" strokeLinecap="round" />
          </>
        ) : stage >= 4 ? (
          <>
            <path d="M13 28 q4 -5 8 0" stroke="#2d1b4e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M27 28 q4 -5 8 0" stroke="#2d1b4e" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="17" cy="27" r="2.5" fill="#2d1b4e" />
            <circle cx="31" cy="27" r="2.5" fill="#2d1b4e" />
            {stage >= 3 && (
              <>
                <circle cx="18" cy="26" r="0.9" fill="#fff" />
                <circle cx="32" cy="26" r="0.9" fill="#fff" />
              </>
            )}
          </>
        )}
        {stage === 0 ? (
          <path d="M20 36 q4 1 8 0" stroke="#2d1b4e" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : stage === 1 ? (
          <path d="M18 35 q6 4 12 0" stroke="#2d1b4e" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : stage === 2 ? (
          <path d="M16 34 q8 8 16 0" stroke="#2d1b4e" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M15 33 q9 11 18 0 q-9 4 -18 0 z" fill="#712B13" />
        )}
      </svg>
      {allClear && <div className="camp-sparkle">✨</div>}
    </div>
  )
}

export default function CampBoardPage() {
  const [students, setStudents] = useState<CampStudent[]>([])
  const [progress, setProgress] = useState<CampProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [{ data: sData }, { data: pData }] = await Promise.all([
        supabase.from('camp_students').select('*').eq('is_active', true).order('sort_order').order('created_at'),
        supabase.from('camp_progress').select('*'),
      ])
      if (sData) setStudents(sData)
      if (pData) setProgress(pData)
      setLoading(false)
    }
    fetchData()
  }, [])

  function statForStudent(studentId: string) {
    const rows = progress.filter((p) => p.student_id === studentId)
    // 완전히 클리어한 회차 수 (짤강+오답재도전+학습지 모두 완료)
    let cleared = 0
    let partialSum = 0
    SESSIONS.forEach((s) => {
      const r = rows.find((x) => x.session_no === s.no)
      const checks = r ? [r.watched, r.retried, r.worksheet].filter(Boolean).length : 0
      partialSum += checks
      if (checks === 3) cleared++
    })
    const percent = Math.round((partialSum / (TOTAL * 3)) * 100)
    return { cleared, percent, rows }
  }

  const ranked = [...students]
    .map((s) => ({ student: s, stat: statForStudent(s.id) }))
    .sort((a, b) => b.stat.percent - a.stat.percent)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#1a1033 0%,#2d1b4e 40%,#1a1033 100%)' }}>
      <style>{`
        @keyframes campBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes campBounceBig { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-8px) rotate(4deg); } }
        @keyframes campSpin { 0% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.3); } 100% { transform: rotate(360deg) scale(1); } }
        .camp-char { position: relative; }
        .camp-sparkle { position: absolute; top: -4px; right: -6px; font-size: 12px; animation: campSpin 1.6s linear infinite; }
      `}</style>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <p className="text-[13px] font-bold tracking-wide" style={{ color: '#ffd76a' }}>공통수학1 · 짤강 방학특강</p>
          <h1 className="text-2xl font-black text-white mt-1">🏆 완주 챌린지</h1>
          <div className="mt-3 mx-auto max-w-md bg-white/10 backdrop-blur rounded-2xl px-4 py-3 border border-white/10">
            <p className="text-[12px] text-white/80 leading-relaxed">
              짤강 <b className="text-white">모든 문제(오답 재도전까지)</b> + <b className="text-white">학습지 완독</b>을 11회차 모두 클리어하면
            </p>
            <p className="text-[15px] font-black mt-1" style={{ color: '#ffd76a' }}>🎁 5만원 페이백!</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <span className="w-7 h-7 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
          </div>
        ) : students.length === 0 ? (
          <div className="bg-white/10 rounded-2xl p-8 text-center text-white/60 text-sm">
            아직 등록된 수강생이 없어요
          </div>
        ) : (
          <div className="space-y-3">
            {ranked.map(({ student, stat }, idx) => {
              const isOpen = openId === student.id
              const allClear = stat.cleared === TOTAL
              return (
                <div key={student.id}
                  className="rounded-2xl overflow-hidden border transition-all"
                  style={{
                    background: allClear ? 'linear-gradient(135deg,#3a2b12,#4a3410)' : 'rgba(255,255,255,0.06)',
                    borderColor: allClear ? '#ffd76a' : 'rgba(255,255,255,0.1)',
                  }}>
                  <button onClick={() => setOpenId(isOpen ? null : student.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                    <div className="w-6 text-center shrink-0">
                      {idx === 0 && stat.percent > 0 ? (
                        <span className="text-base">🥇</span>
                      ) : idx === 1 && stat.percent > 0 ? (
                        <span className="text-base">🥈</span>
                      ) : idx === 2 && stat.percent > 0 ? (
                        <span className="text-base">🥉</span>
                      ) : (
                        <span className="text-[11px] font-bold text-white/30">{idx + 1}</span>
                      )}
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0 text-white"
                      style={{ background: allClear ? '#ffd76a' : '#38bdf8', color: allClear ? '#3a2b12' : 'white' }}>
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-white">{student.name}</p>
                        {allClear && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#ffd76a', color: '#3a2b12' }}>완주!</span>}
                      </div>
                      <p className="text-[11px] text-white/50 mt-0.5">{stat.cleared} / {TOTAL}회차 클리어</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black" style={{ color: allClear ? '#ffd76a' : 'white' }}>{stat.percent}%</p>
                    </div>
                  </button>

                  {/* 진행 트랙 + 캐릭터 */}
                  <div className="px-4 pb-3">
                    <div className="relative" style={{ height: 40 }}>
                      <div className="absolute"
                        style={{
                          left: `${Math.min(96, Math.max(4, stat.percent))}%`,
                          bottom: 4,
                          transform: 'translateX(-50%)',
                          transition: 'left 0.5s ease',
                        }}>
                        <CampCharacter percent={stat.percent} allClear={allClear} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {SESSIONS.map((s) => {
                        const r = stat.rows.find((x) => x.session_no === s.no)
                        const checks = r ? [r.watched, r.retried, r.worksheet].filter(Boolean).length : 0
                        const bg = checks === 3 ? '#ffd76a' : checks === 0 ? 'rgba(255,255,255,0.1)' : '#fb923c'
                        const opacity = checks === 0 ? 1 : checks === 1 ? 0.5 : checks === 2 ? 0.75 : 1
                        return (
                          <div key={s.no} className="flex-1 h-1.5 rounded-full" style={{ background: bg, opacity }} />
                        )
                      })}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 space-y-1.5 border-t border-white/10 mt-1">
                      {SESSIONS.map((s) => {
                        const r = stat.rows.find((x) => x.session_no === s.no)
                        const checks = r ? [r.watched, r.retried, r.worksheet].filter(Boolean).length : 0
                        return (
                          <div key={s.no} className="flex items-center gap-2 py-1.5">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{ background: checks === 3 ? '#ffd76a' : 'rgba(255,255,255,0.15)', color: checks === 3 ? '#3a2b12' : 'white' }}>
                              {checks === 3 ? '✓' : s.no}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-white/90 truncate">{s.no}회 · {s.title}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <span className={cx('text-[9px] px-1.5 py-0.5 rounded-full font-semibold', r?.watched ? 'bg-[#ffd76a] text-[#3a2b12]' : 'bg-white/10 text-white/40')}>짤강</span>
                              <span className={cx('text-[9px] px-1.5 py-0.5 rounded-full font-semibold', r?.retried ? 'bg-[#ffd76a] text-[#3a2b12]' : 'bg-white/10 text-white/40')}>오답</span>
                              <span className={cx('text-[9px] px-1.5 py-0.5 rounded-full font-semibold', r?.worksheet ? 'bg-[#ffd76a] text-[#3a2b12]' : 'bg-white/10 text-white/40')}>학습지</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="text-center mt-8">
          <Link href="/camp/admin" className="text-[11px] text-white/25">관리자</Link>
        </div>
      </div>
    </div>
  )
}
