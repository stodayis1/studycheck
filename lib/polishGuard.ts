// 자동 교정 안전장치.
//
// 원장님이 보고 고르시던 것을 **밤 8시에 사람 없이** 적용하게 되면서 생긴 장치다
// (2026-10-12). AI 가 내놓은 교정을 그대로 믿지 않고, **기계로 검사해서 통과한 것만**
// 자동 반영한다. 통과 못 한 것은 손대지 않고 그대로 둔다 — 선생님이 쓴 글이 그냥 나가는
// 것이 잘못 고쳐져 나가는 것보다 낫다.
//
// 막아야 하는 것
//   · 숫자가 바뀌는 것 — 쪽수·점수·단원 번호가 틀어지면 학부모가 엉뚱한 것을 본다
//   · 교재 이름이 바뀌는 것 — 「쎈B」를 「쎈 B」로, 「개념+유형라이트」를 「개념유형 라이트」로
//     바꾸는 식. 오타처럼 보여도 정확한 표기다
//   · 글이 확 길어지거나 짧아지는 것 — 없는 말을 보탰거나 통째로 날린 것이다

/** 교재·교재류 이름. 글에 있었으면 고친 뒤에도 **글자 그대로** 있어야 한다. */
const PROTECTED = [
  '쎈B', '쎈C', '쎈연산', '베이직쎈', '쎈',
  '개념+유형라이트', '개념유형라이트', '개념+유형', '개념유형',
  '리피트', '초능력연산', '디딤돌 문제유형', '디딤돌',
  '이너프원', '코어테스트', '일품', 'RPM', '최상위', '수학의힘', '우공비',
]

/** 숫자 덩어리를 순서대로 뽑는다. 「쎈B 86-97」 → ['86','97'] */
function digitRuns(s: string): string[] {
  return (s.match(/\d+/g) ?? [])
}

export interface PolishCheck {
  ok: boolean
  reason?: string
}

/**
 * 이 교정을 자동으로 반영해도 되나.
 *
 * 통과하지 못하면 자동으로는 안 고친다. 원장님이 「오타·문장 점검」에서 직접 보시고
 * 고르실 수는 있다 — 사람이 보면 판단할 수 있기 때문이다.
 */
export function checkPolish(before: string, after: string): PolishCheck {
  const a = (before ?? '').trim()
  const b = (after ?? '').trim()
  if (!b) return { ok: false, reason: '고친 글이 비어 있어요' }
  if (a === b) return { ok: false, reason: '바뀐 것이 없어요' }

  // ① 숫자는 **순서까지** 그대로여야 한다
  const da = digitRuns(a)
  const db = digitRuns(b)
  if (da.length !== db.length || da.some((v, i) => v !== db[i])) {
    return { ok: false, reason: `숫자가 바뀌었어요 (${da.join(',') || '없음'} → ${db.join(',') || '없음'})` }
  }

  // ② 교재 이름은 글자 그대로 남아 있어야 한다
  for (const name of PROTECTED) {
    const inA = a.split(name).length - 1
    if (inA === 0) continue
    const inB = b.split(name).length - 1
    if (inB < inA) return { ok: false, reason: `교재 이름이 바뀌었어요 (${name})` }
  }

  // ③ 길이 — 1.3배를 넘기거나 절반 아래로 줄면 내용이 달라진 것이다
  if (b.length > a.length * 1.3 + 10) return { ok: false, reason: '글이 너무 길어졌어요' }
  if (b.length < a.length * 0.5) return { ok: false, reason: '글이 너무 짧아졌어요' }

  return { ok: true }
}
