// 모의고사 기출 해설 API — 선생님 전용
//   GET /api/mock-exams               회차 목록 (해설이 올라와 있는지까지)
//   GET /api/mock-exams?slug=<slug>   그 회차의 문항 해설 + 문항 그림 서명 주소
//
// 문항 그림·해설은 보관함 exam-analysis 의 mock/<slug>/ 에 있다 (scripts/mock-exam/upload.mjs 가 올린다).
// 학생·학부모 화면에서는 쓰지 않는다 — 직원 확인을 꼭 거친다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { MOCK_EXAMS, sortExams, type MockData, type MockExam } from '@/lib/mockExams'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'exam-analysis'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function readData(s: ReturnType<typeof db>, slug: string): Promise<MockData | null> {
  const { data, error } = await s.storage.from(BUCKET).download(`mock/${slug}/data.json`)
  if (error || !data) return null
  return JSON.parse(await data.text())
}

async function readIndex(s: ReturnType<typeof db>): Promise<(MockExam & { count?: number })[]> {
  const { data, error } = await s.storage.from(BUCKET).download('mock/index.json')
  if (error || !data) {
    return Promise.all(MOCK_EXAMS.map(async (m) => ({ ...m, count: (await readData(s, m.slug))?.questions.length ?? 0 })))
  }
  return JSON.parse(await data.text())
}

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const s = db()
  const slug = new URL(req.url).searchParams.get('slug')

  const index = await readIndex(s)
  if (!slug) {
    // index.json 에 문항 수(count)가 같이 적혀 있어 회차마다 data.json 을 열지 않는다
    return NextResponse.json({ exams: sortExams(index).map((m) => ({ ...m, ready: (m.count ?? 0) > 0, count: m.count ?? 0 })) })
  }

  const exam = index.find((m) => m.slug === slug)
  if (!exam) return NextResponse.json({ error: '없는 회차입니다.' }, { status: 404 })
  const d = await readData(s, slug)
  if (!d) return NextResponse.json({ error: '아직 해설이 올라오지 않았습니다.' }, { status: 404 })

  const paths = d.questions.map((q) => q.image)
  const { data: urls } = await s.storage.from(BUCKET).createSignedUrls(paths, 7200)
  const byPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]))
  const questions = d.questions.map((q) => ({ ...q, image: byPath.get(q.image) ?? '' }))
  return NextResponse.json({ exam, questions })
}
