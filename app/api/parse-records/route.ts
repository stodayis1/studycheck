import { NextRequest, NextResponse } from 'next/server'
import { AI_VISION_MODEL, textOf, wasCut } from '@/lib/aiModels'
import Anthropic from '@anthropic-ai/sdk'
import { denyIfNotStaff } from '@/lib/apiAuth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  // 이미지를 Claude로 보내므로 generate-feedback과 같은 이유로 직원 인증이 필요하다.
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  try {
    const { image, mimeType } = await req.json()

    const message = await client.messages.create({
      model: AI_VISION_MODEL,
      // ★ Sonnet 5.5 는 생각하기를 끌 수 없다(400). 생각도 max_tokens 를 쓰므로 넉넉히 준다.
      max_tokens: 6000,
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

    // ★ content[0] 을 믿지 않는다 — 글 블록을 찾아서 꺼낸다 (lib/aiModels.ts)
    const text = textOf(message)
    if (wasCut(message)) throw new Error('사진에서 읽은 글이 잘렸어요 (max_tokens).')
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('파싱 오류:', error)
    return NextResponse.json({ records: [], studentName: null }, { status: 500 })
  }
}
