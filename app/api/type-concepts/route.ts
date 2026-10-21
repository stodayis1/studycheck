// 유형 ↔ 대표개념 연결 (자기주도학습용)
//
//   GET  /api/type-concepts?grade=중1&semester=2
//        → 그 과정의 유형 목록(문항 수 포함) · 지금 걸린 대표개념 · 고를 수 있는 개념 목록
//   (저장은 없앴다 — 이제 보는 화면이다. 아래 주석 참고)
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
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  const supabase = db()
  const q = new URL(req.url).searchParams
  const grade = q.get('grade')
  const semester = Number(q.get('semester'))
  if (!grade || !semester)
    return NextResponse.json({ error: '과정을 골라 주세요.' }, { status: 400 })

  const [types, probs, assets, videos] = await Promise.all([
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
      supabase.from('type_learning_assets')
        .select('type_code, concept_id, video_url, start_seconds, end_seconds, problem_id, title')
        .eq('asset_type', 'concept').order('type_code').range(f, t)),
    // ★ 수지쌤 강의영상(lesson_videos)은 **이미 유형코드를 들고 있다**.
    //   개념영상 01번이 공수2-01-01~06 여섯 유형을 덮는 식이다 — 그게 그 개념의 대표예제들이다.
    //   여기서 따로 또 적지 않고 그대로 읽어 보여 준다. 두 곳에 적으면 반드시 어긋난다.
    //   lesson_videos 에는 학기 칸이 없다(과정 이름 자체가 공통수학2 처럼 한 학기다).
    fetchAll<any>((f, t) =>
      supabase.from('lesson_videos')
        .select('kind, order_label, title, youtube_id, duration_seconds, type_codes')
        .eq('grade', grade).eq('is_active', true).order('order_label').range(f, t)),
  ])

  const count = new Map<string, number>()
  for (const p of probs) count.set(p.type_code, (count.get(p.type_code) ?? 0) + 1)
  const linked = new Map<string, any>()
  for (const a of assets) linked.set(a.type_code, a)
  // 유형코드 → 그 유형을 덮는 강의영상들
  const vidsOf = new Map<string, any[]>()
  for (const v of videos) {
    for (const code of (v.type_codes ?? [])) {
      if (!vidsOf.has(code)) vidsOf.set(code, [])
      vidsOf.get(code)!.push({
        kind: v.kind, label: v.order_label, title: v.title,
        youtubeId: v.youtube_id, seconds: v.duration_seconds,
      })
    }
  }

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
      videos: vidsOf.get(t.code) ?? [],
    }
  })
  const has = (r: any, kind: string) => r.videos.some((v: any) => v.kind === kind)
  return NextResponse.json({
    types: rows,
    // 「몇 개 걸었나」보다 「문항 몇 개가 덮였나」가 중요하다.
    // 이제 「걸렸다」의 기준은 **강의영상이 붙었는가**다 — 손으로 고르던 것을 없앴다.
    summary: {
      types: rows.length,
      linkedTypes: rows.filter((r) => r.videos.length > 0).length,
      problems: rows.reduce((s, r) => s + r.problems, 0),
      linkedProblems: rows.filter((r) => r.videos.length > 0).reduce((s, r) => s + r.problems, 0),
      // 강의영상이 유형을 얼마나 덮었나 — 대표예제 영상을 어디까지 만들었는지 한눈에
      conceptVideoTypes: rows.filter((r) => has(r, '개념')).length,
      exampleVideoTypes: rows.filter((r) => has(r, '대표예제')).length,
    },
  })
}

// ★ 저장(POST)은 없앴다 (원장님 2026-10-21
//   「여기서 내가 대표개념을 고를 필요가 있나? 정해져있는건데?
//     그냥 대표개념-증명(있을경우)-관련 필수예제 이렇게 목록이 띄워져 있는게 낫지」).
//   유형마다 어떤 개념·증명·대표예제인지는 강의영상(lesson_videos.type_codes)이 이미 들고 있다.
//   같은 것을 손으로 또 고르면 두 벌이 되고, 두 벌은 반드시 어긋난다.
//   이 화면은 이제 **보는 화면**이다.
