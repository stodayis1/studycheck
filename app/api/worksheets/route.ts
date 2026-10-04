// 출제한 학습지 목록 API
//  GET  /api/worksheets?limit=200            -> 학습지 목록 + 문항 수 + 응시 학생 수 · 평균
//  GET  /api/worksheets?sheet=<id>           -> 그 학습지를 푼 학생별 점수
//
// exam_sheet_problems 는 한 번에 1000행만 오므로 lib/fetchAll 로 끝까지 읽는다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { fetchAll } from '@/lib/fetchAll'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const url = new URL(req.url)
  const s = db()

  // ── 한 학습지의 학생별 점수
  const sheetId = url.searchParams.get('sheet')
  if (sheetId) {
    const { data: gs } = await s
      .from('gradings')
      .select('id, student_id, student_name, score, total, submitted_at')
      .eq('sheet_id', sheetId)
      .order('submitted_at', { ascending: false })
      .limit(2000)
    return NextResponse.json({ gradings: gs ?? [] })
  }

  // ── 목록
  const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 500)
  const { data: sheets } = await s
    .from('exam_sheets')
    .select('id, code, title, grade, semester, note, created_at, kind')
    .order('created_at', { ascending: false })
    .limit(limit)
  const list = sheets ?? []
  if (!list.length) return NextResponse.json({ sheets: [] })

  const ids = list.map((x) => x.id)
  const [items, gradings] = await Promise.all([
    // 쪽을 나눠 읽으므로 순서를 못박는다 (exam_sheet_problems 에는 id 칸이 없다)
    fetchAll((f, t) =>
      s.from('exam_sheet_problems').select('sheet_id').in('sheet_id', ids)
        .order('sheet_id').order('no').range(f, t)),
    fetchAll((f, t) =>
      s.from('gradings').select('sheet_id, student_name, score, total').in('sheet_id', ids)
        .order('id').range(f, t)),
  ])

  const nProblems: Record<string, number> = {}
  for (const it of items) nProblems[it.sheet_id] = (nProblems[it.sheet_id] ?? 0) + 1

  const agg: Record<string, { n: number; sum: number; names: string[] }> = {}
  for (const g of gradings) {
    const a = (agg[g.sheet_id] ??= { n: 0, sum: 0, names: [] })
    a.n += 1
    a.sum += g.total ? Math.round(((g.score ?? 0) / g.total) * 100) : 0
    if (g.student_name && !a.names.includes(g.student_name)) a.names.push(g.student_name)
  }

  return NextResponse.json({
    sheets: list.map((x) => ({
      ...x,
      problemCount: nProblems[x.id] ?? 0,
      takenCount: agg[x.id]?.n ?? 0,
      avgScore: agg[x.id]?.n ? Math.round(agg[x.id].sum / agg[x.id].n) : null,
      students: agg[x.id]?.names.slice(0, 6) ?? [],
    })),
  })
}
