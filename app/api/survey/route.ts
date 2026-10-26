/**
 * 학부모 설문 — 받기(POST, 로그인 없음) · 보기(GET, 직원만)
 *
 * 원장님 2026-10-24 「설문조사로 앱으로 만들어서 학부모님한테 보내서 링크 통해 후기 받는게」
 *
 * ★ POST 는 **일부러 로그인 없이 열어 둔다.** 학부모님은 링크만 받고 들어오신다
 *   (app/api/grade/[code] 와 같은 자리). 대신 아래로 막는다:
 *     · 서버가 service_role 로 **직접 넣는다** — 표의 RLS 는 insert 를 아무에게도 안 연다
 *     · 칸마다 길이를 자른다 — 긴 글을 밀어 넣어 표를 불리지 못하게
 *     · 같은 사람이 짧은 사이에 여러 번 내면 막는다 (1분에 3건)
 *   읽기(GET)는 직원만이다. 답에는 연락처가 들어 있다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'

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

export async function POST(req: NextRequest) {
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const name = text(b.student_name, 20)
  const phone = text(b.phone, 20)
  // 학생 이름은 꼭 받는다 — 누가 쓰신 건지 모르면 상담도 못 잡는다.
  if (!name) return NextResponse.json({ error: '학생 이름을 적어 주세요.' }, { status: 400 })

  const supabase = db()

  // 같은 학생 이름으로 1분 안에 세 번 넘게 들어오면 막는다 (실수로 두 번 누르는 것과 장난을 가른다)
  const { count } = await supabase.from('survey_responses')
    .select('id', { count: 'exact', head: true })
    .eq('student_name', name)
    .gte('created_at', new Date(Date.now() - 60_000).toISOString())
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: '조금 뒤에 다시 보내 주세요.' }, { status: 429 })
  }

  const row = {
    survey_key: text(b.survey_key, 40) ?? '설명회',
    student_name: name,
    grade: text(b.grade, 12),
    school: text(b.school, 30),
    guardian_name: text(b.guardian_name, 20),
    phone,
    study_now: text(b.study_now, 60),
    rating: RATINGS.includes(String(b.rating)) ? String(b.rating) : null,
    helpful: text(b.helpful, 300),
    want_more: text(b.want_more, 300),
    consult: b.consult === true,
    consult_times: pick(b.consult_times, TIMES),
    consult_how: pick(b.consult_how, HOWS),
    wish: text(b.wish, 1000),
    courses: pick(b.courses, COURSES),
    courses_etc: text(b.courses_etc, 200),
    agree_public: b.agree_public === true,
    source: 'link',
  }

  const { error } = await supabase.from('survey_responses').insert(row)
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
