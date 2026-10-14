'use client'

// 변경 기록 — 학생·시간표를 **누가 언제 어떻게** 바꿨는지 본다. 원장 전용.
//
// 왜 만들었나 (원장님 2026-10-14)
//   이도윤 학생 계정이 둘이 된 일을 조사할 때, 누가 만들었는지 알아내려고 Supabase 접속
//   기록을 뒤져야 했다. 그 기록은 **24시간만** 남는다 — 하루만 지났어도 못 찾았다.
//   이제 트리거가 audit_log 에 영구히 남기고, 이 화면에서 바로 본다.

import { useEffect, useState } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Row {
  id: number
  at: string
  actor_name: string | null
  table_name: string
  op: string
  row_label: string | null
  changed: Record<string, any> | null
}

const OP_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  insert: { text: '새로 만듦', color: '#27500A', bg: '#EAF3DE' },
  update: { text: '고침', color: '#0f3460', bg: '#F2F8FD' },
  delete: { text: '지움', color: '#991b1b', bg: '#FAECE7' },
}

const TABLE_LABEL: Record<string, string> = { students: '학생', schedules: '시간표' }

/** 칸 이름을 사람 말로 */
const FIELD: Record<string, string> = {
  name: '이름', school: '학교', grade: '학년', teacher_name: '담당강사',
  parent_name: '보호자', parent_phone: '보호자 번호', class_time: '수업시간',
  is_active: '재원', on_leave: '휴원', leave_start_date: '휴원 시작',
  leave_end_date: '휴원 끝', leave_reason: '휴원 사유', login_id: '로그인 아이디',
  textbook_grade: '교재단계', wise_step: '지혜단계', ops_student_id: 'OPS 연결',
  day_of_week: '요일', start_time: '시작시각', periods: '교시', student_id: '학생',
  intake_notes: '상담메모', assigned_seen: '배정 확인',
}

const show = (v: any) =>
  v === null || v === undefined || v === '' ? '(빈칸)'
    : v === true ? '예' : v === false ? '아니오' : String(v)

export default function ChangeLogPage() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [who, setWho] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    supabase.from('audit_log')
      .select('id, at, actor_name, table_name, op, row_label, changed')
      .order('at', { ascending: false }).limit(500)
      .then(({ data }) => { setRows((data ?? []) as Row[]); setLoading(false) })
  }, [])

  if (!isAdmin()) {
    return (
      <div style={{ background: '#fff', minHeight: '100vh' }}>
        <Header title="변경 기록" />
        <p className="p-6 text-sm text-gray-500">원장님만 보실 수 있어요.</p>
      </div>
    )
  }

  const people = [...new Set(rows.map((r) => r.actor_name).filter(Boolean))] as string[]
  const shown = rows.filter((r) =>
    (!who || r.actor_name === who) &&
    (!q || (r.row_label ?? '').includes(q.trim())))

  const kst = (t: string) =>
    new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false,
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <Header title="변경 기록" />
      <div className="p-4 max-w-4xl mx-auto">
        <p className="text-[11px] text-gray-500 leading-relaxed mb-3">
          학생 정보와 시간표가 바뀔 때마다 <b>누가 언제 무엇을</b> 바꿨는지 남습니다.
          화면에서 고치든 스크립트로 고치든 빠짐없이 기록됩니다. 최근 500건을 보여 드려요.
        </p>

        <div className="flex gap-2 flex-wrap mb-3">
          <select value={who} onChange={(e) => setWho(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700">
            <option value="">선생님 전체</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학생 이름"
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg flex-1 min-w-[120px]" />
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 py-10 text-center">불러오는 중...</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">
            {rows.length === 0 ? '아직 기록이 없어요. 이제부터 쌓입니다.' : '해당하는 기록이 없어요'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {shown.map((r) => {
              const op = OP_LABEL[r.op] ?? { text: r.op, color: '#444', bg: '#eee' }
              const fields = r.op === 'update' ? Object.entries(r.changed ?? {}) : []
              return (
                <div key={r.id} className="rounded-xl border border-gray-100 px-3 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className="text-gray-400 font-mono">{kst(r.at)}</span>
                    <span className="font-bold text-gray-800">{r.actor_name ?? '(알 수 없음)'}</span>
                    <span className="px-1.5 py-0.5 rounded-md font-bold"
                      style={{ background: op.bg, color: op.color }}>{op.text}</span>
                    <span className="text-gray-500">{TABLE_LABEL[r.table_name] ?? r.table_name}</span>
                    {r.row_label && <span className="font-semibold text-gray-700">{r.row_label}</span>}
                  </div>
                  {fields.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {fields.map(([k, v]: [string, any]) => (
                        <div key={k} className="text-[11px] flex gap-2 flex-wrap">
                          <span className="text-gray-500 w-20 shrink-0">{FIELD[k] ?? k}</span>
                          <span className="text-gray-400 line-through">{show(v?.before)}</span>
                          <span className="text-gray-300">→</span>
                          <span className="font-semibold" style={{ color: '#993C1D' }}>{show(v?.after)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
