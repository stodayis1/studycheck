/**
 * 학부모 설문 — 받기(POST, 로그인 없음) · 보기(GET, 직원만)
 *
 * 원장님 2026-10-24 「설문조사로 앱으로 만들어서 학부모님한테 보내서 링크 통해 후기 받는게」
 * 원장님 2026-11-06 「스터디체크에 학부모 설문 만들어 달라니까」 (11/21 부모학교 — 행사별 설문)
 *
 * ★ POST 는 **일부러 로그인 없이 열어 둔다.** 학부모님은 링크만 받고 들어오신다
 *   (app/api/grade/[code] 와 같은 자리). 대신 아래로 막는다:
 *     · 서버가 service_role 로 **직접 넣는다** — 표의 RLS 는 insert 를 아무에게도 안 연다
 *     · 칸마다 길이를 자른다 — 긴 글을 밀어 넣어 표를 불리지 못하게
 *     · 같은 사람이 짧은 사이에 여러 번 내면 막는다 (1분에 3건)
 *     · 고르는 칸은 **그 행사에 적힌 보기 안에 있는 것만** 받는다 (lib/surveyEvents.ts)
 *   읽기(GET)는 직원만이다. 답에는 연락처가 들어 있다.
 *
 * ★ 행사별 설문(별점 꼭지)은 answers(jsonb) 칸에 담는다.
 *   그 칸이 아직 없어도 **답을 버리지 않는다** — 42703(칸 없음)이면 글로 적어 wish 뒤에 붙여 다시 넣는다.
 *   별점을 숫자로 집계하려면 docs/sql/설문_행사별답_칸추가.sql 을 한 번 실행해야 한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { findEventByKey, type SurveyEvent } from '@/lib/surveyEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

/** 글자 칸 — 길면 자른다. 없으면 null (빈 글자를 넣으면 「썼는데 비었다」와 구별이 안 된다). */
const text = (v: unknown, max: number) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}
/** 고른 것들 — 미리 정해 둔 보기 안에 있는 것만 받는다. */
const pick = (v: unknown, allowed: string[], max = 30) =>
  Array.isArray(v) ? [...new Set(v.map(String))].filter((x) => allowed.includes(x)).slice(0, max) : []
/** 별점 — 0.5 ~ 5, 0.5 칸. 그 밖은 null */
const star = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0.5 && n <= 5 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9
    ? Math.round(n * 2) / 2 : null
}

const RATINGS = ['아주 좋았어요', '좋았어요', '보통이에요', '아쉬웠어요']
const TIMES = ['평일 오전', '평일 오후', '평일 저녁', '토요일']
const HOWS = ['방문 상담', '전화 상담']
export const COURSES = [
  '초등 연산 집중', '초등 사고력·심화', '초등 단원평가 대비',
  '중등 내신 집중', '중등 심화·경시', '중등 고등 과정 선행',
  '고등 공통수학1', '고등 공통수학2', '고등 대수', '고등 미적분Ⅰ', '고등 확률과 통계',
  '고등 기하', '고등 내신 집중', '고등 수능·모의고사', '고3 파이널',
  '서술형 대비', '1:1 클리닉', '주말반', '방학 특강', '학부모 공부방',
]

/** 행사 설문(별점 꼴) 한 건을 읽는다. 빠진 것이 있으면 사람 말로 알려 준다. */
function readEventAnswers(ev: SurveyEvent, b: any): { error: string } | { answers: Record<string, any> } {
  // 알게 된 경로 — 보기에서 고른 것 + 직접 적은 것. 둘 다 비면 묻는다 (어느 홍보가 닿았는지가 이 질문의 목적이다)
  const found = pick(b?.found, ev.found.options)
  const foundEtc = text(b?.found_etc, 60)
  if (!found.length && !foundEtc) return { error: `${ev.found.ask} 하나라도 골라 주세요.` }

  const stars: Record<string, number> = {}
  for (let i = 0; i < ev.topics.length; i++) {
    const s = star(b?.stars?.[i] ?? b?.stars?.[String(i)])
    if (s === null) return { error: `「${ev.topics[i].title}」 만족도를 별로 골라 주세요.` }
    stars[String(i)] = s
  }
  const recommend = star(b?.recommend)
  if (recommend === null) return { error: '추천 여부를 별로 골라 주세요.' }
  if (b?.agree_notice !== true) return { error: '자료를 유포하지 않겠다는 동의가 필요합니다.' }
  if (b?.agree_privacy !== true) return { error: '개인정보 수집·이용 동의가 필요합니다.' }

  return {
    answers: {
      event: ev.key,
      found,
      found_etc: foundEtc,
      stars,
      recommend,
      consult_new: pick(b?.consult_new, ev.newFamily),
      consult_now: pick(b?.consult_now, ev.current),
      agree_notice: true,
      agree_privacy: true,
    },
  }
}

/** answers 칸이 아직 없을 때 — 같은 내용을 사람이 읽을 글로 적는다 (답을 버리지 않기 위해) */
function answersAsText(ev: SurveyEvent, a: Record<string, any>) {
  const lines = ev.topics.map((t, i) => `· ${t.title} ${a.stars?.[String(i)] ?? '-'}점`)
  lines.push(`· 추천 ${a.recommend ?? '-'}점`)
  const found = [...(a.found ?? []), a.found_etc].filter(Boolean)
  if (found.length) lines.push(`· 알게 된 경로: ${found.join(', ')}`)
  if (a.consult_new?.length) lines.push(`· 비재원생 상담: ${a.consult_new.join(', ')}`)
  if (a.consult_now?.length) lines.push(`· 재원생 상담: ${a.consult_now.join(', ')}`)
  lines.push('· 자료 유포 금지 동의 · 개인정보 동의')
  return `[${ev.name} 별점]\n${lines.join('\n')}`
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const key = text(b.survey_key, 40) ?? '설명회'
  const ev = findEventByKey(key)

  const name = text(b.student_name, 20)
  const phone = text(b.phone, 20)
  // 학생 이름은 꼭 받는다 — 누가 쓰신 건지 모르면 상담도 못 잡는다.
  if (!name) return NextResponse.json({ error: '자녀 이름을 적어 주세요.' }, { status: 400 })
  // 행사 설문은 연락처도 꼭 받는다 — 자료를 보내 드려야 한다.
  if (ev && !phone) return NextResponse.json({ error: '연락처를 적어 주세요.' }, { status: 400 })

  let answers: Record<string, any> = {}
  const wish = text(b.wish, 1000)
  if (ev) {
    if (!wish) return NextResponse.json({ error: '한 줄이라도 좋으니 적어 주세요.' }, { status: 400 })
    const read = readEventAnswers(ev, b)
    if ('error' in read) return NextResponse.json({ error: read.error }, { status: 400 })
    answers = read.answers
  }

  const supabase = db()

  // 같은 학생 이름으로 1분 안에 세 번 넘게 들어오면 막는다 (실수로 두 번 누르는 것과 장난을 가른다)
  const { count } = await supabase.from('survey_responses')
    .select('id', { count: 'exact', head: true })
    .eq('student_name', name)
    .gte('created_at', new Date(Date.now() - 60_000).toISOString())
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: '조금 뒤에 다시 보내 주세요.' }, { status: 429 })
  }

  const base = {
    survey_key: key,
    student_name: name,
    grade: text(b.grade, 12),
    school: text(b.school, 30),
    guardian_name: text(b.guardian_name, 20),
    phone,
    study_now: text(b.study_now, 60),
    rating: RATINGS.includes(String(b.rating)) ? String(b.rating) : null,
    helpful: text(b.helpful, 300),
    want_more: text(b.want_more, 300),
    // 행사 설문은 상담 보기를 하나라도 고르면 「상담 신청」으로 센다 (「추가 희망 없음」은 뺀다)
    consult: ev
      ? [...answers.consult_new, ...answers.consult_now].some((x: string) => x !== '추가 희망 없음')
      : b.consult === true,
    consult_times: pick(b.consult_times, TIMES),
    consult_how: pick(b.consult_how, HOWS),
    wish,
    courses: pick(b.courses, COURSES),
    courses_etc: text(b.courses_etc, 200),
    agree_public: b.agree_public === true,
    source: 'link',
  }

  let { error } = await supabase.from('survey_responses').insert({ ...base, answers })
  // answers 칸이 아직 없다 → 글로 적어 다시 넣는다. 답을 버리지 않는다.
  if (error && (error.code === '42703' || /answers/.test(error.message ?? ''))) {
    console.error('설문 answers 칸 없음 — 글로 적어 넣습니다. docs/sql/설문_행사별답_칸추가.sql 실행 필요')
    const merged = ev
      ? `${base.wish ?? ''}\n\n${answersAsText(ev, answers)}`.trim().slice(0, 1000)
      : base.wish
    const retry = await supabase.from('survey_responses').insert({ ...base, wish: merged })
    error = retry.error
  }
  if (error) {
    console.error('설문 저장 오류:', error)
    return NextResponse.json({ error: '저장하지 못했어요. 잠시 후 다시 보내 주세요.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/** 받은 답 보기 — 직원만. 연락처가 들어 있다. */
export async function GET(req: NextRequest) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const q = new URL(req.url).searchParams
  const key = q.get('key') ?? '설명회'
  const { data, error } = await db().from('survey_responses')
    .select('*').eq('survey_key', key).order('created_at', { ascending: false }).limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data ?? [], courses: COURSES })
}
