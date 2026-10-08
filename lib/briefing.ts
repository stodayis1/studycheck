// 카톡 수업 브리핑 — 알림톡 본문을 만드는 자리.
//
// 왜 길이를 코드가 지키는가
//   알림톡 본문은 **변수를 끼운 뒤** 1,000자를 넘으면 카카오가 발송을 거부한다
//   (강조표기·아이템리스트·부가정보까지 모두 합산).
//   실데이터 최악값을 재 보면 진도 365 + 과제쪽 276 + 학습지범위 274 + 알림장 893 + 메모 418
//   = 2,226자다. 평소엔 250자쯤이라 눈으로 보면 멀쩡해 보이지만, 긴 알림장을 쓴 날
//   그 학생만 조용히 발송 실패한다. 그래서 **칸마다 상한을 두고 전체를 한 번 더 조인다.**
//   scripts/briefing-check.mjs 가 실데이터 전량으로 1,000자 초과가 0건인지 확인한다.
//
// 사진은 왜 본문에 없는가
//   알림톡은 **템플릿당 고정 이미지 1장**만 되고 그 이미지엔 링크도 못 건다.
//   학생마다 다른 사진은 애초에 실을 수 없어서, 사진은 「알림장·사진」 버튼 뒤 페이지로 보낸다.

export const BODY_LIMIT = 1000
// 1,000자에 딱 붙이면 카카오 쪽 계산이 우리와 1~2자 달라도 터진다. 950자에서 멈춘다.
export const BODY_BUDGET = 950

// 원장님이 Solapi 콘솔에 등록하실 **본문 원문**. 여기 글자 하나라도 다르면 심사받은 것과
// 달라져 발송이 거부되므로, docs/카톡브리핑.md 와 길이 검사 모두 이 상수를 쓴다.
export const BRIEFING_TEMPLATE = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}
▶ 지난 학습지  #{학습지결과}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

▶ 선생님 알림장
#{알림장}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

/**
 * 알림장이 **없는 날**에 쓰는 판.
 *
 * 왜 따로 두나 — 「▶ 선생님 알림장」 머리글이 승인된 골격에 박혀 있어서, 알림장이 없으면
 * 「오늘은 따로 남긴 말씀이 없어요」 같은 빈말을 채워 넣을 수밖에 없었다.
 * 원장님 말씀 — "성의 없어 보인다. 알림장을 남겼을 때만 생기면 된다."
 *
 * 승인된 템플릿의 글자는 못 바꾸므로(바꾸면 재심사) **알림장 칸이 아예 없는 판을 하나 더**
 * 등록해서, 그날 알림장이 있으면 원래 판, 없으면 이 판으로 보낸다.
 * 기존 템플릿은 건드리지 않으니 지금 나가는 것에는 영향이 없다.
 */
export const BRIEFING_TEMPLATE_NONOTE = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}
▶ 지난 학습지  #{학습지결과}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

// 칸마다의 상한. 합이 넉넉히 950 안에 들어오게 잡았다(골격 약 150자 + 아래 합 774자).
const CAP = {
  학생명: 20,
  날짜: 14,
  출결: 12,
  과제달성률: 14,
  학습지결과: 34,
  진도: 350,
  과제배부: 250,
  알림장: 300,
} as const
type VarName = keyof typeof CAP

/** 띄어쓰기 차이를 무시하고 "같은 글인가" 를 본다. */
const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * 선생님이 **같은 글을 진도 칸과 알림장에 둘 다** 쓰시는 일이 흔하다(실데이터로 확인).
 * 그대로 두면 학부모가 같은 문단을 한 메시지에서 두 번 읽는다.
 * 앞 30자가 겹치면 같은 글로 보고 알림장 쪽에서 뺀다 — 진도 칸이 그 글의 제자리다.
 */
function sameText(a: string, b: string) {
  const [x, y] = [norm(a), norm(b)]
  if (!x || !y) return false
  return x === y || x.startsWith(y.slice(0, 30)) || y.startsWith(x.slice(0, 30))
}

/** 상한을 넘으면 말줄임표로 끊는다. 끊긴 뒷부분은 버튼 뒤 페이지에서 다 보인다. */
function clip(s: string, cap: number) {
  const t = (s ?? '').replace(/\s+\n/g, '\n').trim()
  return t.length <= cap ? t : t.slice(0, cap - 1).trimEnd() + '…'
}

export interface BriefingSession {
  session_date: string
  progress_content?: string | null
  today_textbook_name?: string | null
  today_chapter?: string | null
  daily_test_unit?: string | null
  daily_test_score?: number | null
  hw_textbook_name?: string | null
  hw_textbook_page?: string | null
  hw_worksheet_range?: string | null
}

export interface BriefingNote {
  attendance?: string | null
  worksheet_submitted?: boolean | null
  worksheet_score?: number | null
  worksheet_unit?: string | null
  worksheet_level?: string | null
  textbook_submitted?: boolean | null
  workbook_done?: boolean | null
  achievement_pct?: number | null
  memo?: string | null
  makeup_note?: string | null
}

export interface BriefingFeedback {
  content?: string | null
  ai_message?: string | null   // 글이 아니라 {"images":[...]} 다
  teacher_name?: string | null
}

/** 알림장의 ai_message 칸은 글이 아니라 사진 URL을 담은 JSON이다. */
export function fbImages(aiMessage?: string | null): string[] {
  if (!aiMessage) return []
  try {
    const parsed = JSON.parse(aiMessage)
    if (parsed && Array.isArray(parsed.images)) return parsed.images.filter((u: any) => typeof u === 'string')
  } catch {}
  return []
}

/** 과제 배부 — 「교재 · 페이지」 조각을 교재 이름과 짝지어 읽는다. app/parent/dashboard 와 같은 규칙. */
export function hwLines(ses: BriefingSession): string[] {
  const pageParts = (ses.hw_textbook_page ?? '').split(' / ')
  const out: string[] = []
  for (const raw of (ses.hw_textbook_name ?? '').split(',')) {
    const name = raw.trim()
    if (!name) continue
    const entry = pageParts.find((p) => p.includes(name))
    // ★ 같은 페이지가 두 번 적힌 자리가 있다("디딤돌 연산 · 94-97 · 94-97") — 마지막 칸만 쓴다.
    const page = entry ? entry.split('·').slice(-1)[0]?.trim() : null
    out.push(page && page !== name ? `· ${name} ${page}` : `· ${name}`)
  }
  const ws = (ses.hw_worksheet_range ?? '').trim()
  if (ws) out.push(`· 학습지 ${ws}`)
  // 교재를 안 고르고 메모만 남긴 과제는 "📝 ..." 조각으로 들어 있다.
  const memo = pageParts.find((p) => p.trim().startsWith('📝 '))
  if (memo) out.push(`· ${memo.slice(2).trim()}`)
  return out
}

/** 그 결석에 대한 보강. OPS(makeups)에서 온다 — lib/opsMakeups.ts */
export interface BriefingMakeup {
  state: 'done' | 'planned' | 'noshow' | 'waiting' | 'cancelled'
  makeupDate: string | null
  makeupTime: string | null
  teacherName: string | null
}

/** 「10월 17일 12:00」 꼴로. */
function whenText(d?: string | null, t?: string | null) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일${t ? ` ${t}` : ''}`
}

/**
 * 보강 한 줄. 결석한 날 학부모가 가장 알고 싶은 것이 이것이다.
 * OPS 기록이 있으면 그걸 쓰고, 없으면 예전 글(makeup_note)로 보조한다.
 */
export function makeupLine(mk?: BriefingMakeup | null, fallback?: string | null) {
  if (mk) {
    const when = whenText(mk.makeupDate, mk.makeupTime)
    const who = mk.teacherName ? ` (${mk.teacherName} 선생님)` : ''
    switch (mk.state) {
      case 'done': return `보강 · ${when ?? ''} 완료${who}`.replace('  ', ' ').trim()
      case 'planned': return `보강 · ${when ?? ''} 예정${who}`.replace('  ', ' ').trim()
      case 'noshow': return `보강 · ${when ?? ''} 보강에 오지 못했습니다`.replace('  ', ' ').trim()
      case 'waiting': return '보강 · 날짜를 잡는 중입니다'
      default: return null
    }
  }
  const t = (fallback ?? '').trim()
  return t ? `보강 · ${t}` : null
}

export interface BriefingResult {
  vars: Record<string, string>
  body: string
  /** 알림장이 있으면 'full', 없으면 'nonote' — 보낼 때 템플릿 코드를 가른다 */
  template: 'full' | 'nonote'
  hasNotice: boolean
  bodyLen: number
  overLimit: boolean
  photoCount: number
}

export function buildBriefing(args: {
  studentName: string
  session: BriefingSession
  note?: BriefingNote | null
  feedbacks?: BriefingFeedback[]
  /** 그날이 결석이면 그 보강. OPS 에서 온다. */
  makeup?: BriefingMakeup | null
  /**
   * 「알림장 없는 판」 템플릿이 **심사를 통과해 쓸 수 있는가**.
   * ★ 이걸 모르고 없는 판으로 본문을 만들면, 승인된 템플릿과 안 맞아 **전송이 거부된다.**
   *   쓸 수 없으면 원래 판으로 만들고 알림장 자리에 한 줄을 채운다.
   */
  noNoteTemplate?: boolean
}): BriefingResult {
  const { studentName, session: ses, note } = args
  // ★ 결석한 날은 진도도 과제도 **안 적는 것이 정상**이다(10/7 결석 17명 전원 비어 있었다).
  //   그런데 「기록 없음」·「따로 낸 과제가 없어요」로 나가면 선생님이 안 적은 것처럼,
  //   학원이 과제를 안 낸 것처럼 읽힌다. 결석이면 결석이라고 말해 준다.
  const 결석 = note?.attendance === '결석'
  const feedbacks = args.feedbacks ?? []

  const d = ses.session_date
  const 날짜 = `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`

  const 출결 = note?.attendance ?? '기록 없음'

  // 결석이면 비율이 의미가 없다. 그 외엔 선생님이 적은 %를 쓰고, 옛 기록은 한 단어로 근사한다.
  const 과제달성률 =
    note?.attendance === '결석' ? '결석'
      : note?.achievement_pct != null ? `${note.achievement_pct}%`
        : note?.workbook_done ? '완료'
          : note?.worksheet_submitted ? '제출 완료'
            : note ? '미제출' : '기록 없음'

  // 고등부는 학습지보다 데일리테스트 위주라 학습지 점수가 없으면 그걸로 대신한다.
  const 학습지결과 =
    note?.worksheet_score != null
      ? [`${note.worksheet_score}점`, note.worksheet_unit, note.worksheet_level].filter(Boolean).join(' · ')
      : ses.daily_test_score != null
        ? `${ses.daily_test_score}점 (데일리테스트)`
        : '해당 없음'

  // 진도 — progress_content 와 today_textbook_name 이 거의 늘 같은 글이라 겹치면 한 번만.
  const 진도 = 결석
    ? '결석으로 수업에 참여하지 못했습니다.'
    : ([ses.progress_content, ses.today_textbook_name, ses.today_chapter]
        .map((t) => (t ?? '').trim())
        .filter((t, i, arr) => t && arr.indexOf(t) === i)
        .join(' / ') || '기록 없음')

  const hw = hwLines(ses)
  const 과제배부 = 결석
    ? '보강 때 함께 안내드립니다.'
    : (hw.length > 0 ? hw.join('\n') : '오늘은 따로 낸 과제가 없어요.')

  // 알림장 — 없으면 머리글만 덩그러니 남지 않게 한 줄을 채운다(심사에도 골격이 또렷한 편이 낫다).
  const photos = feedbacks.flatMap((f) => fbImages(f.ai_message))
  const noticeParts: string[] = []
  for (const raw of [...feedbacks.map((f) => f.content), note?.memo]) {
    const t = (raw ?? '').trim()
    // 진도 칸과 같은 글이거나 이미 넣은 것과 같은 글이면 건너뛴다.
    if (!t || sameText(t, 진도) || noticeParts.some((p) => sameText(p, t))) continue
    noticeParts.push(t)
  }
  // 보강은 OPS 기록을 먼저 쓰고, 없으면 예전 글로 보조한다.
  const mkLine = makeupLine(args.makeup, note?.makeup_note)
  if (mkLine) noticeParts.push(mkLine)
  else if (결석) noticeParts.push('보강 · 일정을 잡는 대로 안내드리겠습니다')
  // 알림장이 없으면 빈 채로 둔다 — 그 칸이 없는 판으로 나가므로 쓰이지 않는다.
  const 알림장 = noticeParts.join('\n')

  const vars: Record<VarName, string> = {
    학생명: clip(studentName, CAP.학생명),
    날짜: clip(날짜, CAP.날짜),
    출결: clip(출결, CAP.출결),
    과제달성률: clip(과제달성률, CAP.과제달성률),
    학습지결과: clip(학습지결과, CAP.학습지결과),
    진도: clip(진도, CAP.진도),
    과제배부: clip(과제배부, CAP.과제배부),
    알림장: clip(알림장, CAP.알림장),
  }

  // 사진은 본문에 실을 수 없으니(알림톡 제약) 몇 장 있는지만 알리고 버튼으로 보낸다.
  if (photos.length > 0) {
    const tail = `\n📷 사진 ${photos.length}장은 아래 「알림장·사진」 버튼에서 보실 수 있어요.`
    vars.알림장 = clip(vars.알림장, CAP.알림장 - tail.length) + tail
  }

  // ★ \w 는 한글을 못 잡는다. #{학생명} 같은 한글 변수가 그대로 남아 본문이 통째로
  //   골격 그대로 나가 버린다(실제로 그랬다 — scripts/briefing-check.ts 가 잡아냈다).
  // ★ 알림장이 하나도 없으면 그 칸이 **아예 없는 판**으로 보낸다.
  //   빈말("오늘은 따로 남긴 말씀이 없어요")을 채워 넣으면 성의 없어 보인다.
  const hasNotice = noticeParts.length > 0
  const useNoNote = !hasNotice && !!args.noNoteTemplate
  const tpl = useNoNote ? BRIEFING_TEMPLATE_NONOTE : BRIEFING_TEMPLATE
  // ★ \w 는 한글을 못 잡는다. #{학생명} 같은 한글 변수가 그대로 남아 본문이 통째로
  //   골격 그대로 나가 버린다(실제로 그랬다 — scripts/briefing-check.ts 가 잡아냈다).
  const render = (v: Record<string, string>) =>
    tpl.replace(/#\{([^}]+)\}/g, (_, k) => v[k] ?? '')

  // 알림장 없는 판이 아직 심사 전이라 원래 템플릿으로 나갈 수도 있다.
  // 그때는 머리글만 덩그러니 남으면 안 되니 한 줄을 채운다(버리는 값이 아니다).
  if (!useNoNote && !hasNotice) vars.알림장 = '오늘은 따로 남긴 말씀이 없어요.'

  let body = render(vars)
  // ★ 마지막 조임 — 칸별 상한을 다 지켰어도 골격이 바뀌면 합이 넘을 수 있다.
  //   긴 쪽(알림장 → 과제배부 → 진도) 순서로 줄여 950자 안으로 들인다.
  for (const k of ['알림장', '과제배부', '진도'] as VarName[]) {
    if (body.length <= BODY_BUDGET) break
    const over = body.length - BODY_BUDGET
    vars[k] = clip(vars[k], Math.max(20, vars[k].length - over))
    body = render(vars)
  }

  return {
    vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [`#{${k}}`, v])),
    body,
    bodyLen: body.length,
    overLimit: body.length > BODY_LIMIT,
    photoCount: photos.length,
    template: useNoNote ? 'nonote' : 'full',
    hasNotice,
  }
}
