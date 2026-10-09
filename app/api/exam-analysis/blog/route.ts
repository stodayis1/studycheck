// 시험지 분석 — 블로그 카드뉴스의 글(analysis) 만들기 · 보관
//
// 카드 그림은 화면이 굽는다 (components/exam-analysis/BlogCards.tsx ← lib/examBlogCards.mjs).
// 여기는 그 카드에 들어갈 글과 숫자(analysis)를 만든다:
//   load     : 보관해 둔 analysis + 카드에 넣을 그림 주소(변별문항 문제 · 손풀이) + 빠진 재료
//   generate : (원장) Claude 가 문항 그림 · 손풀이 · 선생님 총평을 보고 글을 쓴다. 숫자는 서버가 DB 에서 채운다
//   save     : (원장) 화면에서 고친 analysis 를 보관
// 보관 위치: exam-analysis 보관함 blog/<시험지 id>/analysis.json (표를 늘리지 않으려고 파일로 둔다)
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { staffOrDeny } from '@/lib/apiAuth'
import { FILE_BUCKET, blogAdmin as admin, blogKeyOf as keyOf, download, gather, generateBlogAnalysis, imageUrls } from '@/lib/examBlogAnalysis'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  const me = await staffOrDeny(req, { adminOnly: b.action !== 'load' })
  if (me.deny) return me.deny
  const supabase = admin()
  try {
    const g = await gather(supabase, b.paperId)
    if (!g) return bad('시험지를 찾을 수 없습니다.', 404)
    const { paper } = g

    if (b.action === 'load') {
      const buf = await download(supabase, FILE_BUCKET, keyOf(paper.id))
      let analysis: any = null
      try { analysis = buf ? JSON.parse(buf.toString('utf8')) : null } catch { analysis = null }
      return NextResponse.json({ ok: true, analysis, images: await imageUrls(supabase, g), missing: g.missing, killers: g.killers })
    }

    if (b.action === 'save') {
      if (!b.analysis || typeof b.analysis !== 'object') return bad('보관할 내용이 없습니다.')
      const up = await supabase.storage.from(FILE_BUCKET).upload(keyOf(paper.id), Buffer.from(JSON.stringify(b.analysis)), { contentType: 'application/octet-stream', upsert: true })
      if (up.error) return bad(up.error.message, 500)
      return NextResponse.json({ ok: true })
    }

    if (b.action === 'generate') {
      const { analysis, usage } = await generateBlogAnalysis(supabase, g, me.name)
      const up = await supabase.storage.from(FILE_BUCKET).upload(keyOf(paper.id), Buffer.from(JSON.stringify(analysis)), { contentType: 'application/octet-stream', upsert: true })
      if (up.error) return bad(`보관 실패: ${up.error.message}`, 500)
      return NextResponse.json({ ok: true, analysis, images: await imageUrls(supabase, g), usage })
    }
    return bad('알 수 없는 요청입니다.')
  } catch (e: any) {
    if (e instanceof Anthropic.AuthenticationError) return bad('AI 키가 맞지 않습니다. (ANTHROPIC_API_KEY)', 500)
    if (e instanceof Anthropic.RateLimitError) return bad('AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 눌러 주세요.', 429)
    if (e instanceof Anthropic.APIError) return bad(`AI 호출 실패 (${e.status}): ${e.message}`, 502)
    return bad(e?.message ?? '카드뉴스 글을 만들지 못했습니다.', 500)
  }
}
