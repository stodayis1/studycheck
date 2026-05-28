import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      studentName, studentGrade, date,
      textbookName, chapter, attendance,
      worksheetSubmitted, worksheetScore,
      textbookSubmitted, workbookDone,
      videoCompleted, videoStarted,
      teacherMemo, recentSubmitRate,
    } = body

    const prompt = `당신은 수학학원 선생님입니다. 학부모에게 보내는 따뜻하고 전문적인 알림장을 작성해주세요.

학생 정보:
- 이름: ${studentName}
- 학년: ${studentGrade}
- 수업 날짜: ${date}
- 교재: ${textbookName ?? '미입력'}
- 진도: ${chapter ?? '미입력'}
- 출결: ${attendance ?? '정시'}
- 과제 제출: ${worksheetSubmitted ? '완료' : '미완료'}
- 과제 점수: ${worksheetScore != null ? `${worksheetScore}점` : '미채점'}
- 영상 시청: ${videoCompleted ? '완료' : videoStarted ? '시청중' : '미시청'}
- 최근 과제 제출률: ${recentSubmitRate}%
- 선생님 메모: ${teacherMemo}

위 정보를 바탕으로 학부모님께 보내는 알림장을 3~4문장으로 작성해주세요.
- 따뜻하고 긍정적인 톤으로 작성
- 구체적인 수업 내용 언급
- 가정에서 도움줄 수 있는 내용 포함
- "안녕하세요" 인사로 시작하고 "감사합니다" 로 마무리
- 마크다운 없이 순수 텍스트로만 작성`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({ message: text })
  } catch (error) {
    console.error('AI 알림장 생성 오류:', error)
    return NextResponse.json({ message: null }, { status: 500 })
  }
}
