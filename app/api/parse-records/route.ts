import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { image, mimeType } = await req.json()

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: image },
          },
          {
            type: 'text',
            text: `이 이미지는 학원 학습 관리 프로그램의 학생 학습 기록 화면입니다.
이미지에서 다음 정보를 추출해주세요:

1. 학생 이름 (studentName)
2. 각 학습 기록 항목들 (records 배열):
   - date: 날짜 (YYYY-MM-DD 형식, 연도가 없으면 현재 연도 사용)
   - type: 종류 (학습지/진단평가/월간평가/코어테스트/오답유사/주간평가 중 하나, 이미지의 배지/태그 텍스트 기준)
   - subject: 과목명 또는 교재명 (예: 중등 1-1 (2022 개정))
   - title: 시험지/학습지 제목 또는 단원명
   - score: 획득 점수 (숫자만, 없으면 null)
   - totalScore: 만점 (숫자만, 없으면 null)

반드시 JSON 형식으로만 응답하세요. 다른 텍스트 없이:
{
  "studentName": "홍길동",
  "records": [
    {
      "date": "2026-06-19",
      "type": "월간평가",
      "subject": "중등 1-1 (2022 개정)",
      "title": "제4회 TOMA 수학경시대회 연습2회",
      "score": 24,
      "totalScore": 25
    }
  ]
}`
          }
        ]
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('파싱 오류:', error)
    return NextResponse.json({ records: [], studentName: null }, { status: 500 })
  }
}
