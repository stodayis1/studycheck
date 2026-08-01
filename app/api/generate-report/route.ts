import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { randomBytes } from 'crypto'
import { computeCurriculumProgressGroups } from '@/lib/curriculumProgress'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function pad(n: number) { return String(n).padStart(2, '0') }

function quarterRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const start = `${year}-${pad(startMonth)}-01`
  const endDate = new Date(year, endMonth, 0)
  const end = `${year}-${pad(endMonth)}-${pad(endDate.getDate())}`
  return { start, end, label: `${year}년 ${Math.ceil(startMonth / 3)}분기 (${startMonth}~${endMonth}월)` }
}

function monthRange(year: number, month: number) {
  const start = `${year}-${pad(month)}-01`
  const endDate = new Date(year, month, 0)
  const end = `${year}-${pad(month)}-${pad(endDate.getDate())}`
  return { start, end, label: `${year}년 ${month}월` }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { studentId, type, year, month, quarter } = body as {
      studentId: string
      type: 'monthly' | 'quarterly'
      year: number
      month?: number
      quarter?: number
    }

    if (!studentId || !type || !year) {
      return NextResponse.json({ error: 'studentId, type, year는 필수입니다.' }, { status: 400 })
    }

    const range = type === 'monthly'
      ? monthRange(year, month!)
      : quarterRange(year, quarter!)

    const { data: student } = await supabase.from('students').select('*').eq('id', studentId).single()
    if (!student) return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })

    const [{ data: sessionsData }, { data: notesData }, { data: wsData }, { data: examData }, { data: tbData }, { data: pcData }, { data: conceptsData }, { data: schedulesData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', studentId).gte('session_date', range.start).lte('session_date', range.end),
      supabase.from('learning_notes').select('*').limit(5000),
      supabase.from('student_worksheets').select('*').eq('student_id', studentId),
      supabase.from('exams').select('*').eq('student_id', studentId).gte('exam_date', range.start).lte('exam_date', range.end),
      supabase.from('student_textbooks').select('*').eq('student_id', studentId),
      supabase.from('progress_checks').select('*').limit(10000).eq('student_id', studentId),
      supabase.from('concepts').select('*'),
      supabase.from('schedules').select('*').eq('student_id', studentId).eq('is_active', true),
    ])

    const sessions = sessionsData ?? []
    const sessionIds = sessions.map((s: any) => s.id)
    const notes = (notesData ?? []).filter((n: any) => sessionIds.includes(n.session_id))
    const concepts = conceptsData ?? []

    const attendance = { 정시: 0, 지각: 0, 결석: 0 }
    notes.forEach((n: any) => {
      if (n.attendance === '정시') attendance.정시++
      else if (n.attendance === '지각') attendance.지각++
      else if (n.attendance === '결석') attendance.결석++
    })
    const totalSessions = sessions.length

    // 결석/미입력 상세 - 정규 시간표 기준 이번 기간 수업 예정일과 실제 출결 비교
    const dayMap: Record<number, string> = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' }
    const scheduleDays = new Set((schedulesData ?? []).map((s: any) => s.day_of_week))
    const todayStr = new Date().toISOString().slice(0, 10)
    const attendanceDetail: { date: string; dow: string; status: string }[] = []
    if (scheduleDays.size > 0) {
      const cursor = new Date(range.start + 'T00:00:00')
      const endD = new Date(range.end + 'T00:00:00')
      while (cursor <= endD) {
        const dateStr = cursor.toISOString().slice(0, 10)
        if (dateStr > todayStr) break
        const dow = dayMap[cursor.getDay()]
        if (scheduleDays.has(dow)) {
          const session = sessions.find((s: any) => s.session_date === dateStr)
          const note = session ? notes.find((n: any) => n.session_id === session.id) : null
          attendanceDetail.push({ date: dateStr, dow, status: note?.attendance ?? '미입력' })
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    }

    const hwNotes = notes.filter((n: any) => n.attendance !== '결석')
    const hwDone = hwNotes.filter((n: any) => n.workbook_done || n.worksheet_submitted).length
    const hwRate = hwNotes.length > 0 ? Math.round(hwDone / hwNotes.length * 100) : 0

    // 데일리테스트 (고등부는 학습지보다 매 수업 데일리테스트 위주라 이 항목이 훨씬 중요함)
    const dailyTests = sessions
      .filter((s: any) => s.daily_test_score != null)
      .sort((a: any, b: any) => a.session_date.localeCompare(b.session_date))
      .map((s: any) => ({ date: s.session_date, unit: s.daily_test_unit, score: s.daily_test_score }))
    const avgDailyTest = dailyTests.length > 0
      ? Math.round(dailyTests.reduce((s: number, t: any) => s + t.score, 0) / dailyTests.length) : null

    const periodWS = (wsData ?? []).filter((w: any) => w.assigned_at && w.assigned_at.slice(0, 10) >= range.start && w.assigned_at.slice(0, 10) <= range.end)
    const scoredWS = periodWS.filter((w: any) => w.score != null)
    const avgScore = scoredWS.length > 0 ? Math.round(scoredWS.reduce((s: number, w: any) => s + w.score, 0) / scoredWS.length) : null
    const passedWS = periodWS.filter((w: any) => w.status === 'passed').length
    const passRate = periodWS.length > 0 ? Math.round(passedWS / periodWS.length * 100) : 0

    const WS_STATUS_LABEL: Record<string, string> = {
      assigned: '진행중', submitted: '채점대기', similar_assigned: '오답유사중',
      similar_submitted: '오답유사채점', scored: '결과대기', passed: '완료', retry: '재도전',
    }
    const worksheetDetail = [...periodWS]
      .sort((a: any, b: any) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
      .map((w: any) => ({
        unit: `${w.grade_level} ${w.unit}${w.unit_name ? ' ' + w.unit_name : ''}`.trim(),
        level: w.current_level,
        score: w.score,
        status: WS_STATUS_LABEL[w.status] ?? w.status,
        isSimilar: w.worksheet_type === 'similar',
        assignedAt: w.assigned_at,
      }))

    // 진도표(과정관리)와 동일한 기준으로, 기록이 있는 학년+학기만 회차/진행률로 압축해서 보여준다.
    // (배정만 되고 체크 기록이 없는 과정은 보고서에 넣을 필요가 없어서 자동으로 제외됨)
    const curriculumProgress = computeCurriculumProgressGroups(concepts, pcData ?? [])
    const calcProgress = (tbData ?? [])
      .filter((t: any) => t.textbook_type === '연산서')
      .map((tb: any) => ({ name: tb.textbook_name, percent: tb.progress_percent ?? 0, grade: tb.grade, semester: tb.semester }))

    const reportData = {
      totalSessions, attendance, hwRate, avgScore, passRate,
      periodCount: periodWS.length, curriculumProgress, calcProgress, worksheetDetail,
      exams: examData ?? [], studentName: student.name, studentGrade: student.grade,
      attendanceDetail, dailyTests, avgDailyTest,
    }

    // AI 한 줄평 생성
    let aiComment = ''
    try {
      const prompt = `다음은 수학 학원 학생의 ${type === 'monthly' ? '한 달' : '한 분기'} 학습 데이터입니다. 학부모에게 보내는 따뜻하고 전문적인 한 줄 평(2~3문장)을 작성해주세요. 이모지 사용 금지. 학생 이름: ${student.name}, 학년: ${student.grade}, 수업 횟수: ${totalSessions}회, 출결: 정시 ${attendance.정시}회/지각 ${attendance.지각}회/결석 ${attendance.결석}회, 과제달성률: ${hwRate}%, 학습지 평균: ${avgScore ?? '미채점'}점, 통과율: ${passRate}%, 교재진도: ${curriculumProgress.map((g) => `${g.grade} ${g.semester}학기 ${g.round}회독 ${g.rate}%`).join(', ')}`
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      })
      aiComment = message.content[0].type === 'text' ? message.content[0].text : ''
    } catch (e) {
      console.error('AI 코멘트 생성 실패:', e)
    }

    const token = randomBytes(16).toString('hex')

    const { data: link, error: insertError } = await supabase.from('report_links').insert({
      student_id: studentId,
      report_type: type,
      period_label: range.label,
      period_start: range.start,
      period_end: range.end,
      data: reportData,
      ai_comment: aiComment,
      token,
    }).select().single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ token, id: link.id, periodLabel: range.label, reportData, aiComment })
  } catch (error: any) {
    console.error('리포트 생성 오류:', error)
    return NextResponse.json({ error: error.message ?? '리포트 생성 실패' }, { status: 500 })
  }
}
