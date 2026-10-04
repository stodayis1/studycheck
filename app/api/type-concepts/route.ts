// 유형 ↔ 대표개념 연결 (자기주도학습용)
//
//   GET  /api/type-concepts?grade=중1&semester=2
//        → 그 과정의 유형 목록(문항 수 포함) · 지금 걸린 대표개념 · 고를 수 있는 개념 목록
//   POST /api/type-concepts
//        → { typeCode, conceptId, videoUrl, startSeconds, endSeconds, problemId }
//          conceptId 와 videoUrl 이 둘 다 비면 연결을 지운다
//
// 문항은 유형코드로 묶여 있으므로 **유형에 한 번 걸면 그 유형의 모든 문항이 따라온다.**

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
  const supabase = db()
  const q = new URL(req.url).searchParams
  const grade = q.get('grade')
  const semester = Number(q.get('semester'))
  if (!grade || !semester)
    return NextResponse.json({ error: '과정을 골라 주세요.' }, { status: 400 })

  const [types, probs, concepts, assets] = await Promise.all([
    fetchAll<any>((f, t) =>
      supabase.from('standard_types')
        .select('code, chapter_no, chapter_title, sub_chapter_no, sub_chapter_title, type_no, type_title')
        .eq('grade', grade).eq('semester', semester)
        .order('chapter_no').order('sub_chapter_no').order('type_no').order('code')
        .range(f, t)),
    fetchAll<any>((f, t) =>
      supabase.from('problems').select('type_code')
        .eq('grade', grade).eq('semester', semester)
        .not('type_code', 'is', null).order('id').range(f, t)),
    fetchAll<any>((f, t) =>
      supabase.from('concepts')
        .select('id, chapter, sub_chapter, concept_name, concept_order')
        .eq('grade', grade).eq('semester', semester)
        .order('chapter').order('concept_order').range(f, t)),
    fetchAll<any>((f, t) =>
      supabase.from('type_learning_assets')
        .select('type_code, concept_id, video_url, start_seconds, end_seconds, problem_id, title')
        .eq('asset_type', 'concept').order('type_code').range(f, t)),
  ])

  const count = new Map<string, number>()
  for (const p of probs) count.set(p.type_code, (count.get(p.type_code) ?? 0) + 1)
  const linked = new Map<string, any>()
  for (const a of assets) linked.set(a.type_code, a)

  const rows = types.map((t) => {
    const a = linked.get(t.code)
    return {
      code: t.code,
      chapterNo: t.chapter_no, chapterTitle: t.chapter_title,
      subNo: t.sub_chapter_no, subTitle: t.sub_chapter_title,
      typeNo: t.type_no, typeTitle: t.type_title,
      problems: count.get(t.code) ?? 0,
      conceptId: a?.concept_id ?? null,
      videoUrl: a?.video_url ?? null,
      startSeconds: a?.start_seconds ?? null,
      endSeconds: a?.end_seconds ?? null,
      problemId: a?.problem_id ?? null,
    }
  })
  const doneTypes = rows.filter((r) => r.conceptId || r.videoUrl)
  return NextResponse.json({
    types: rows,
    concepts: concepts.map((c) => ({
      id: c.id, chapter: c.chapter, subChapter: c.sub_chapter, name: c.concept_name,
    })),
    // 「몇 개 걸었나」보다 「문항 몇 개가 덮였나」가 중요하다
    summary: {
      types: rows.length,
      linkedTypes: doneTypes.length,
      problems: rows.reduce((s, r) => s + r.problems, 0),
      linkedProblems: doneTypes.reduce((s, r) => s + r.problems, 0),
    },
  })
}

export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const supabase = db()
  const b = await req.json().catch((): any => null)
  if (!b?.typeCode) return NextResponse.json({ error: '유형을 골라 주세요.' }, { status: 400 })

  const conceptId = b.conceptId || null
  const videoUrl = (b.videoUrl || '').trim() || null

  if (!conceptId && !videoUrl) {
    const { error } = await supabase.from('type_learning_assets')
      .delete().eq('type_code', b.typeCode).eq('asset_type', 'concept')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, cleared: true })
  }

  const row = {
    type_code: b.typeCode,
    asset_type: 'concept',
    concept_id: conceptId,
    video_url: videoUrl,
    start_seconds: b.startSeconds ?? null,
    end_seconds: b.endSeconds ?? null,
    problem_id: b.problemId ?? null,
    title: (b.title || '').trim() || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('type_learning_assets')
    .upsert(row, { onConflict: 'type_code', ignoreDuplicates: false })
  if (error) {
    // 부분 고유색인(asset_type='concept')이라 onConflict 가 안 먹는 경우 — 지우고 넣는다
    await supabase.from('type_learning_assets')
      .delete().eq('type_code', b.typeCode).eq('asset_type', 'concept')
    const { error: e2 } = await supabase.from('type_learning_assets').insert(row)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
