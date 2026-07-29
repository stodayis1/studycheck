import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SolapiMessageService } from 'solapi'
import { randomBytes } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 학부모에게 보낼 링크가 가리키는 공개 사이트 주소 (배포된 실제 주소로 고정)
const APP_URL = 'https://studycheck-five.vercel.app'

export async function POST(req: NextRequest) {
  try {
    const { sessionId, testPhone } = (await req.json()) as { sessionId?: string; testPhone?: string }
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId는 필수입니다.' }, { status: 400 })
    }

    const { data: session } = await supabase.from('class_sessions').select('*').eq('id', sessionId).single()
    if (!session) return NextResponse.json({ error: '수업 기록을 찾을 수 없어요.' }, { status: 404 })

    const { data: note } = await supabase.from('learning_notes').select('*').eq('session_id', sessionId).maybeSingle()
    const { data: student } = await supabase.from('students').select('*').eq('id', session.student_id).single()
    if (!student) return NextResponse.json({ error: '학생을 찾을 수 없어요.' }, { status: 404 })
    if (!testPhone && !student.parent_phone) {
      return NextResponse.json({ error: '보호자 전화번호가 등록되어 있지 않아요.' }, { status: 400 })
    }

    // 학습지 결과 - 그날 채점된 학습지 점수가 없으면 데일리테스트 점수로 대체 (고등부는 학습지보다 데일리테스트 위주라)
    const worksheetResult = note?.worksheet_score != null
      ? `${note.worksheet_score}점`
      : session.daily_test_score != null
        ? `${session.daily_test_score}점(데일리테스트)`
        : '-'

    // 과제 달성률 - 결석이면 결석으로, 아니면 제출/완료 여부를 텍스트로
    const achievementText = note?.attendance === '결석'
      ? '결석'
      : note?.workbook_done ? '완료'
        : note?.worksheet_submitted ? '제출완료' : '미제출'

    const progressText = session.progress_content ?? session.today_textbook_name ?? '-'

    // 알림톡 "자세히 보기" 링크용 - 그날 하루치 요약만 보여주는 공개 페이지를 하나 생성
    const token = randomBytes(16).toString('hex')
    const { error: linkError } = await supabase.from('report_links').insert({
      student_id: student.id,
      report_type: 'daily',
      period_label: session.session_date,
      period_start: session.session_date,
      period_end: session.session_date,
      data: {
        studentName: student.name,
        studentGrade: student.grade,
        sessionDate: session.session_date,
        attendance: note?.attendance ?? '미입력',
        progressContent: progressText,
        hwTextbookName: session.hw_textbook_name,
        hwTextbookPage: session.hw_textbook_page,
        hwWorksheetRange: session.hw_worksheet_range,
        videoUrl: session.video_url,
        dailyTestUnit: session.daily_test_unit,
        dailyTestScore: session.daily_test_score,
        worksheetScore: note?.worksheet_score ?? null,
        memo: note?.memo ?? null,
      },
      token,
    })
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

    const link = `${APP_URL}/report/${token}`

    const apiKey = process.env.SOLAPI_API_KEY
    const apiSecret = process.env.SOLAPI_API_SECRET
    const pfId = process.env.SOLAPI_PF_ID
    const templateId = process.env.SOLAPI_TEMPLATE_ID
    const senderPhone = process.env.SOLAPI_SENDER_PHONE
    if (!apiKey || !apiSecret || !pfId || !templateId || !senderPhone) {
      return NextResponse.json({ error: 'Solapi 설정값(SOLAPI_API_KEY 등)이 아직 Vercel에 등록되지 않았어요.' }, { status: 500 })
    }

    const messageService = new SolapiMessageService(apiKey, apiSecret)
    await messageService.send({
      to: (testPhone || student.parent_phone).replace(/-/g, ''),
      from: senderPhone.replace(/-/g, ''),
      kakaoOptions: {
        pfId,
        templateId,
        variables: {
          '#{학생명}': student.name,
          '#{출석상태}': note?.attendance ?? '미입력',
          '#{진도내용}': progressText,
          '#{과제달성률}': achievementText,
          '#{학습지점수}': worksheetResult,
          '#{링크}': link,
        },
      },
    })

    return NextResponse.json({ ok: true, link })
  } catch (error: any) {
    console.error('카톡 발송 오류:', error)
    return NextResponse.json({ error: error?.message ?? '카톡 발송에 실패했어요.' }, { status: 500 })
  }
}
