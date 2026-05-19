import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      studentName, studentGrade, date,
      textbookName, chapter, attendance,
      worksheetSubmitted, worksheetScore,
      textbookSubmitted, textbookPage,
      workbookDone, videoCompleted, videoStarted,
      teacherMemo, recentSubmitRate, recentSessions,
    } = body

    const prompt = `당신은 수학 학원 선생님이 학부모님께 보내는 알림장을 작성하는 전문가입니다.
아래 정보를 바탕으로 따뜻하고 전문적인 알림장을 4문장으로 작성해주세요.

[학생 정보]
- 이름: ${studentName}
- 학년: ${studentGrade}
- 수업 날짜: ${date}

[오늘 수업 내용]
- 교재: ${textbookName || '미기록'}
- 단원: ${chapter || '미기록'}

[오늘 과제 수행 현황]
- 출석: ${attendance || '미기록'}
- 학습지: ${worksheetSubmitted ? `제출 완료${worksheetScore != null ? ` (${worksheetScore}점)` : ''}` : '미제출'}
- 교재: ${textbookSubmitted ? `제출 완료${textbookPage ? ` (p.${textbookPage})` : ''}` : '미제출'}
- 연산서: ${workbookDone ? '완료' : '미완료'}
- 영상 과제: ${videoCompleted ? '시청 완료' : videoStarted ? '시청 중' : '미시청'}

[최근 ${recentSessions}회 수업 과제 제출률] ${recentSubmitRate}%

[선생님 메모] "${teacherMemo}"

작성 규칙:
1. 오늘 수업 내용과 진도 (1문장)
2. 오늘 과제 수행 현황 - 좋은 점 강조, 부족한 부분은 부드럽게 (1문장)
3. 선생님 메모를 자연스럽게 녹인 코멘트나 조언 (1문장)
4. 다음 수업을 위한 당부나 격려 (1문장)

- "안녕하세요" 같은 인사 없이 바로 내용으로 시작
- 학부모님이 읽기 편하게 따뜻하고 전문적인 톤
- 4문장을 한 단락으로 이어서 작성`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Anthropic API error:', data)
      return NextResponse.json({ error: '알림장 생성에 실패했어요.' }, { status: 500 })
    }

    const text = data.content?.[0]?.text ?? '알림장 생성에 실패했어요.'
    return NextResponse.json({ message: text })
  } catch (error) {
    console.error('AI feedback generation error:', error)
    return NextResponse.json({ error: '알림장 생성에 실패했어요.' }, { status: 500 })
  }
}

