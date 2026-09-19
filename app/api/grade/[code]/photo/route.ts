// QR 채점 화면에서 학생이 찍은 풀이 사진을 받아 저장한다 (로그인 없음 - 시험지 코드로만 접근).
// 사진은 비공개 버킷 grading-photos 에 넣고, 경로만 돌려준다. AI 채점과 선생님 확인에 쓴다.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BUCKET = 'grading-photos'
const MAX_BYTES = 4 * 1024 * 1024

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = db()

  const { data: sheet } = await supabase.from('exam_sheets').select('id').eq('code', code).maybeSingle()
  if (!sheet) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('photo')
  const no = Number(form.get('no'))
  if (!(file instanceof Blob) || !no) return NextResponse.json({ error: '사진이 없습니다.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '사진이 너무 큽니다.' }, { status: 413 })
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return NextResponse.json({ error: '사진 형식이 아닙니다.' }, { status: 415 })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${code}/${no}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ path })
}
