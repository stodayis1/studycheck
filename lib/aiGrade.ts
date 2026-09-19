// 서술형·식 답안 AI 채점. 정답(그림) + 학생 답(수식 글자 / 풀이 사진)을 Claude에게 보여주고
// 맞음/틀림과 짧은 이유를 받는다. 서버(app/api/grade)에서만 부른다.
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'

const client = new Anthropic()

const RESULT = jsonSchemaOutputFormat({
  type: 'object',
  properties: {
    correct: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['correct', 'reason'],
  additionalProperties: false,
} as const)

const SYSTEM = `당신은 한국 고등학교 수학 학원의 채점 선생님입니다.
정답 그림(교재의 정답)과 학생의 답을 비교해 맞았는지 판정합니다.

판정 기준
- 최종 답이 수학적으로 같으면 맞음입니다. 표기 차이(항의 순서, 약분·유리화 여부, x=1 또는 x=2 와 x=1, 2, 괄호·띄어쓰기)는 틀린 것으로 보지 않습니다.
- 답이 여러 개인 문제는 모두 맞아야 맞음입니다. 소문항 ⑴⑵가 있으면 모두 맞아야 맞음입니다.
- 풀이 사진이 있으면 사진에서 학생의 최종 답을 찾아 판정합니다. 풀이 과정은 참고만 하고, 최종 답이 맞으면 맞음입니다.
- 학생의 수식 답과 풀이 사진이 서로 다르면 수식 답을 기준으로 합니다.
- 답을 알아볼 수 없거나 비어 있으면 틀림입니다.

reason 에는 학생이 읽을 한두 문장을 한국어로 씁니다. 틀렸으면 어디가 다른지 짧게 알려 주되, 정답 전체를 길게 풀어 쓰지는 않습니다.`

export type AiGradeResult = { correct: boolean; reason: string; ok: boolean }

export async function aiGrade(input: {
  answerImageUrl: string | null
  answerText: string | null
  studentLatex: string | null
  studentPhotoUrl: string | null
}): Promise<AiGradeResult> {
  const content: Anthropic.ContentBlockParam[] = []

  if (input.answerImageUrl) {
    content.push({ type: 'text', text: '【교재 정답】' })
    content.push({ type: 'image', source: { type: 'url', url: input.answerImageUrl } })
  } else if (input.answerText) {
    content.push({ type: 'text', text: `【교재 정답】 ${input.answerText}` })
  }

  content.push({
    type: 'text',
    text: `【학생이 입력한 답 (LaTeX)】 ${input.studentLatex?.trim() || '(입력 없음)'}`,
  })

  if (input.studentPhotoUrl) {
    content.push({ type: 'text', text: '【학생 풀이 사진】' })
    content.push({ type: 'image', source: { type: 'url', url: input.studentPhotoUrl } })
  }

  content.push({ type: 'text', text: '학생의 답이 맞았는지 판정하세요.' })

  try {
    const res = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 4000,
      output_config: { effort: 'medium', format: RESULT },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    })
    if (res.stop_reason === 'refusal' || !res.parsed_output) {
      return { ok: false, correct: false, reason: 'AI가 판정하지 못했습니다. 선생님이 확인합니다.' }
    }
    return { ok: true, correct: res.parsed_output.correct, reason: res.parsed_output.reason }
  } catch (e) {
    console.error('aiGrade failed', e)
    return { ok: false, correct: false, reason: 'AI 채점 중 오류가 났습니다. 선생님이 확인합니다.' }
  }
}
