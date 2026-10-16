// 본수업에 **이어서** 한 추가수업은, 스터디체크 학습일지를 수학OPS 에 그대로 옮겨 적는다.
//
// 왜 (원장님 2026-10-16)
//   추가수업을 본수업 바로 뒤에 이어서 하면 선생님은 스터디체크에 일지를 한 번 쓴다.
//   그런데 OPS 의 추가수업 칸은 따로 비어 있어서 같은 내용을 또 적어야 했다.
//   「여기에 또 입력하긴 너무 일이 많다」 — 같은 날 같은 학생이고 내용도 같으니 옮겨 적는다.
//
//   10/16 에 임지원·최다빈·안준혁·오현승·유정환·홍채은 여섯 명이 그랬다. 여섯 명 모두
//   스터디체크에는 진도와 학습지 점수가 들어 있고 OPS 쪽은 비어 있었다.
//
// 무엇을 옮기나 — **그날 배운 교재 한 가지만** 옮긴다 (원장님 2026-10-16).
//   · 메모 — 안 옮긴다. 스터디체크는 진도 칸과 교재 칸에 같은 글이 들어가 있어서 두 번 적힌다.
//   · 학습지·점수 — 안 옮긴다. 그 점수는 **지난번에 내준 과제를 그날 걷은** 것이라
//     추가수업에서 한 것이 아니다. 게다가 어느 학습지인지가 안 적혀 있어서, 이름 없이
//     점수만 넘어가면 OPS 에서 「무슨 학습지 90점인가」가 된다.
//
// 지키는 선
//   · **이미 적혀 있으면 건드리지 않는다.** 보강 선생님이 직접 쓰신 글을 덮으면 안 된다.
//   · 그날 **출석한** 경우에만 옮긴다(결석·시험기간 결석이면 한 수업이 아니다).
//   · 취소된 건은 건너뛴다.
//   · OPS 를 못 읽거나 못 써도 **던지지 않는다.** 곁들이는 일이라 발송을 막으면 안 된다.
import { createClient } from '@supabase/supabase-js'

export interface FilledRow {
  name: string
  classType: 'extra' | 'substitute'
  textbook: string | null
  worksheet: string | null
  score: number | null
  note: string | null
  ok: boolean
  skip?: string
}

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/** 결석·시험기간 결석이면 그날 수업을 한 것이 아니다. */
const CAME = (a?: string | null) => !!a && !/결석/.test(a)

export async function fillOpsExtraFromNotes(
  db: { from: (t: string) => any },
  date: string,
  opts: { dryRun?: boolean } = {},
): Promise<{ date: string; filled: number; rows: FilledRow[]; note?: string }> {
  const ops = opsClient()
  if (!ops) return { date, filled: 0, rows: [], note: 'OPS 키가 없어요.' }

  try {
    const { data: extras } = await ops.from('extra_classes')
      .select('id, student_id, status, class_type, lesson_textbook, lesson_worksheet, lesson_score, lesson_note')
      .eq('scheduled_date', date)
    if (!extras?.length) return { date, filled: 0, rows: [] }

    const live = extras.filter((e: any) => e.status !== 'cancelled' && e.status !== 'canceled')
    if (!live.length) return { date, filled: 0, rows: [] }

    const { data: students } = await db.from('students')
      .select('id, name, grade, ops_student_id')
      .in('ops_student_id', live.map((e: any) => e.student_id))
    const byOps = new Map((students ?? []).map((s: any) => [s.ops_student_id, s]))
    const ids = (students ?? []).map((s: any) => s.id)
    if (!ids.length) return { date, filled: 0, rows: [] }

    const { data: sessions } = await db.from('class_sessions')
      .select('id, student_id, session_type, progress_content, today_textbook_name, hw_worksheet_range')
      .eq('session_date', date).in('student_id', ids)
    const { data: notes } = await db.from('learning_notes')
      .select('session_id, attendance, worksheet_score, worksheet_unit')
      .in('session_id', (sessions ?? []).map((s: any) => s.id))
    const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))

    const rows: FilledRow[] = []
    let filled = 0

    for (const e of live) {
      const st: any = byOps.get(e.student_id)
      if (!st) continue
      const kind: 'extra' | 'substitute' = e.class_type === 'substitute' ? 'substitute' : 'extra'
      const base = { name: st.name, classType: kind, textbook: null, worksheet: null, score: null, note: null, ok: false }

      // 이미 적혀 있으면 손대지 않는다
      if ([e.lesson_textbook, e.lesson_worksheet, e.lesson_note].some(Boolean)) {
        rows.push({ ...base, skip: '이미 적혀 있어요' }); continue
      }

      // 그날 **정규** 수업 일지를 본다 — 본수업에 이어서 한 것이라 거기 다 적혀 있다.
      const ses: any = (sessions ?? []).find((s: any) =>
        s.student_id === st.id && (!s.session_type || s.session_type === '정규'))
      if (!ses) { rows.push({ ...base, skip: '그날 본수업 기록이 없어요' }); continue }
      const n: any = noteBy.get(ses.id)
      if (!CAME(n?.attendance)) { rows.push({ ...base, skip: `출결이 ${n?.attendance ?? '비어 있음'}` }); continue }

      const row: FilledRow = {
        ...base,
        textbook: ses.today_textbook_name ?? ses.progress_content ?? null,
        worksheet: null,
        score: null,
        note: null,
      }
      if (!row.textbook) {
        rows.push({ ...row, skip: '그날 배운 교재가 안 적혀 있어요' }); continue
      }

      if (!opts.dryRun) {
        const { error } = await ops.from('extra_classes').update({
          lesson_textbook: row.textbook,
          status: 'completed',
        }).eq('id', e.id)
        row.ok = !error
        if (error) row.skip = error.message
      } else {
        row.ok = true
      }
      if (row.ok) filled++
      rows.push(row)
    }

    return { date, filled, rows }
  } catch (e: any) {
    return { date, filled: 0, rows: [], note: e?.message ?? '옮기지 못했어요.' }
  }
}
