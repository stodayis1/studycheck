// 시험분석 블로그 카드뉴스의 글(analysis) 만들기 — 서버 전용.
// app/api/exam-analysis/blog/route.ts 가 부른다. 재료 모으기(gather)와 Claude 호출(generateBlogAnalysis)을 여기 둔다.
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { hitSummary, normNo } from '@/lib/examAnalysis'

const MODEL = 'claude-opus-5-5'
export const FILE_BUCKET = 'exam-analysis'
const PROBLEM_BUCKET = 'problem-images'
const PHONE = '010.9730.2589'
const UNIT_COLORS = ['#ff5722', '#ff8a5c', '#1a1a1a', '#55524c', '#a8a39a', '#c9c5bc']

export const blogAdmin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
export const blogKeyOf = (paperId: string) => `blog/${paperId}/analysis.json`
const img = (buf: Buffer, type = 'image/png'): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: type as any, data: buf.toString('base64') } })
const txt = (text: string): Anthropic.TextBlockParam => ({ type: 'text', text })

export async function download(supabase: any, bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

// 카드에 필요한 재료를 DB 에서 모은다
export async function gather(supabase: any, paperId: string) {
  const { data: paper } = await supabase.from('exam_papers').select('*').eq('id', paperId).maybeSingle()
  if (!paper) return null
  const [{ data: qs }, { data: files }, { data: matches }] = await Promise.all([
    supabase.from('exam_questions').select('id, question_no, sort_order, q_type, source_memo, is_discriminating, problem_id').eq('paper_id', paperId).order('sort_order'),
    supabase.from('exam_paper_files').select('kind, file_name, storage_path, mime_type, question_label').eq('paper_id', paperId).eq('kind', '손풀이'),
    supabase.from('exam_enough_matches').select('question_no, match_level, enough_book, enough_unit, enough_problem_no, enough_problem_id, use_in_blog').eq('paper_id', paperId),
  ])
  const ids = (qs ?? []).map((q: any) => q.problem_id).filter(Boolean)
  const { data: ps } = ids.length ? await supabase.from('problems').select('id, image_path').in('id', ids) : { data: [] }
  const pathOf = new Map((ps ?? []).map((p: any) => [p.id, p.image_path]))
  const questions = (qs ?? []).map((q: any) => ({
    no: normNo(q.question_no), essay: q.q_type === '서술형',
    pts: Number(String(q.source_memo ?? '').match(/배점\s*([\d.]+)/)?.[1] ?? 0) || 0,
    path: pathOf.get(q.problem_id) as string | undefined, disc: !!q.is_discriminating,
  }))
  const picked: string[] = (paper.discriminating_nos ?? []).length ? paper.discriminating_nos.map((n: string) => normNo(n)) : questions.filter((q: any) => q.disc).map((q: any) => q.no)
  const killers = Array.from(new Set(picked)).filter((no) => questions.some((q: any) => q.no === no))
  const solutions: Record<string, { path: string; type: string }> = {}
  for (const f of files ?? []) {
    const no = normNo(String(f.question_label || (String(f.file_name).match(/(\d+)\s*번/) ?? [])[1] || ''))
    if (no && !solutions[no]) solutions[no] = { path: f.storage_path, type: /png$/i.test(f.storage_path) ? 'image/png' : 'image/jpeg' }
  }
  const h = hitSummary(paper.answers_text, questions.map((q: any) => q.no), matches ?? [])
  // 매칭표: 문항마다 가장 높은 매칭 정도 하나 (없으면 null)
  const grid = questions.map((q: any) => ({ no: Number(q.no) || q.no, level: h.best[q.no] ?? null }))
  // 사진으로 실을 매칭: 원장이 「블로그 사용」에 체크한 것 가운데 정도가 높은 순으로, 문항마다 하나, 5개까지.
  // 체크한 것이 없으면 쌍둥이 · 매우 유사에서 고른다. 나머지는 매칭표로만 나간다
  const rank = (l: string) => ['쌍둥이', '매우 유사', '유형 유사', '참고'].indexOf(l)
  const usable = (matches ?? []).filter((m: any) => m.enough_problem_id && rank(m.match_level) >= 0 && rank(m.match_level) <= 2)
    .map((m: any) => ({ ...m, no: normNo(m.question_no ?? '') })).filter((m: any) => questions.some((q: any) => q.no === m.no && q.path))
  const checked = usable.filter((m: any) => m.use_in_blog)
  const pool = (checked.length ? checked : usable.filter((m: any) => rank(m.match_level) <= 1))
    .sort((a: any, b: any) => rank(a.match_level) - rank(b.match_level) || Number(a.no) - Number(b.no))
  const pairRows: any[] = []
  for (const m of pool) if (pairRows.length < 5 && !pairRows.some((p) => p.no === m.no)) pairRows.push(m)
  pairRows.sort((a, b) => Number(a.no) - Number(b.no))
  const epIds = pairRows.map((m) => m.enough_problem_id)
  const { data: eps } = epIds.length ? await supabase.from('enough_problems').select('id, image_path').in('id', epIds) : { data: [] }
  const epPath = new Map((eps ?? []).map((e: any) => [e.id, e.image_path]))
  const pairs = pairRows.filter((m) => epPath.get(m.enough_problem_id)).map((m) => ({
    no: Number(m.no) || m.no, level: m.match_level, exam: `q:${m.no}`, enough: `e:${m.no}`,
    source: `${String(m.enough_book).replace(/^이너프원\s*/, '')} · ${m.enough_unit} ${m.enough_problem_no}번`,
  }))
  const pairPaths: Record<string, string> = {}
  for (const m of pairRows) if (epPath.get(m.enough_problem_id)) pairPaths[m.no] = epPath.get(m.enough_problem_id) as string
  const hit = { rate: h.rate, hit: h.hit, total: h.total, twin: h.byLevel['쌍둥이'] ?? 0, very: h.byLevel['매우 유사'] ?? 0, type: h.byLevel['유형 유사'] ?? 0, grid, pairs }
  const missing: string[] = []
  if (!questions.some((q: any) => q.path)) missing.push('문항이 아직 없습니다 (「기본 · 파일」에서 PDF 의 「문항 넣기」)')
  if (!killers.length) missing.push('변별문항이 선정되지 않았습니다 (「정답 · 변별 · 손풀이」)')
  for (const no of killers) if (!solutions[no]) missing.push(`${no}번 손풀이가 없습니다`)
  if (!paper.review_difficulty) missing.push('총평의 전체 난이도가 비어 있습니다')
  if (!(paper.review_units || paper.review_hard_types || paper.review_mistakes || paper.review_blog_summary)) missing.push('총평 내용이 비어 있습니다')
  if (!paper.review_next_points) missing.push('다음 시험 대비 포인트가 비어 있습니다')
  if (!(matches ?? []).length) missing.push('이너프원 적중 대조가 아직 없습니다 (「이너프원 매칭」)')
  return { paper, questions, killers, solutions, hit, missing, pairPaths }
}

export async function imageUrls(supabase: any, g: NonNullable<Awaited<ReturnType<typeof gather>>>) {
  const out: Record<string, string> = {}
  for (const no of g.killers) {
    const q = g.questions.find((x: any) => x.no === no)
    if (q?.path) { const { data } = await supabase.storage.from(PROBLEM_BUCKET).createSignedUrl(q.path, 3600); if (data?.signedUrl) out[`q:${no}`] = data.signedUrl }
    const s = g.solutions[no]
    if (s) { const { data } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(s.path, 3600); if (data?.signedUrl) out[`s:${no}`] = data.signedUrl }
  }
  // 사진으로 실을 매칭: 기출 문항 그림(q:번호)과 이너프원 문항 그림(e:번호)
  for (const [no, path] of Object.entries(g.pairPaths)) {
    const q = g.questions.find((x: any) => x.no === no)
    if (q?.path && !out[`q:${no}`]) { const { data } = await supabase.storage.from(PROBLEM_BUCKET).createSignedUrl(q.path, 3600); if (data?.signedUrl) out[`q:${no}`] = data.signedUrl }
    const { data } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(path, 3600)
    if (data?.signedUrl) out[`e:${no}`] = data.signedUrl
  }
  return out
}

const SPEC = `JSON 만 답한다. 모양과 글자 수(카드 칸에 들어가야 한다)를 지킨다:
{
 "scope": "시험 범위 (20자 이내, 예: 삼각형의 성질 + 사각형의 성질)",
 "one_line": "이번 시험 전체 경향 한 문장 (70자 이내)",
 "tagline": "한 줄 표어 (28자 이내)",
 "message": "이 시험이 주는 메시지 (40자 이내)",
 "questions": [{"no": 1, "unit": "단원 이름(12자 이내, 전체 3~5종류)", "type": "유형 이름(14자 이내)", "diff": 1~5 정수}],
 "trends": ["출제 경향 4개, 각 48자 이내"],
 "strategy": ["다음 시험 전략 4개, 각 48자 이내"],
 "killers": [{"no": 6, "tag": "단원 · 유형 (22자 이내)", "title": "제목 (14자 이내)", "summary": "어떤 문제인지 (60자 이내)",
   "checks": ["풀이 핵심 4개, 각 16자 이내"],
   "steps": [{"t": "단계 이름(10자 이내)", "d": "그 단계의 풀이 (70자 이내, 식 포함)", "point": "짚을 점 (28자 이내)"}],
   "why": "이 문항이 어려웠던 이유 (95자 이내)", "comment": "선생님 한마디 (70자 이내)"}],
 "features": [{"t": "특징 이름(10자 이내)", "d": "설명(28자 이내)"}],
 "hard_reasons": [{"t": "이유(10자 이내)", "d": "설명(30자 이내)"}],
 "study_steps": [{"t": "단계(8자 이내)", "d": "설명(24자 이내)"}]
}
killers 는 지정한 변별문항만, 번호 순서대로. steps 는 문항마다 정확히 4개. features 3개, hard_reasons 3개, study_steps 5개.`

// Claude 가 문항 그림 · 손풀이 · 선생님 총평을 보고 글을 쓴다. 숫자와 이름은 DB 것으로 채운다. 못 만들면 Error 를 던진다
export async function generateBlogAnalysis(supabase: any, g: NonNullable<Awaited<ReturnType<typeof gather>>>, by: string) {
  const { paper } = g
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI 키(ANTHROPIC_API_KEY)가 설정돼 있지 않습니다.')
  // 지어내서 메우지 않는다 — 재료가 비면 만들지 않는다
  if (g.missing.length) throw new Error(`아직 채워지지 않은 것이 있어 만들지 않았습니다:\n· ${g.missing.join('\n· ')}`)
  const content: Anthropic.ContentBlockParam[] = [txt('【기출 문항 전체】')]
  for (const q of g.questions) {
    const buf = q.path ? await download(supabase, PROBLEM_BUCKET, q.path) : null
    if (buf) content.push(txt(`■ ${q.no}번 (${q.pts || '?'}점${q.essay ? ' · 서술형' : ''})`), img(buf))
  }
  content.push(txt(`【변별문항 ${g.killers.join(', ')}번의 선생님 손풀이】`))
  for (const no of g.killers) {
    const s = g.solutions[no]
    const buf = s ? await download(supabase, FILE_BUCKET, s.path) : null
    if (buf) content.push(txt(`■ ${no}번 손풀이`), img(buf, s.type))
  }
  content.push(txt(`【담당 선생님(${paper.assignee ?? ''})이 쓴 총평】
- 전체 난이도: ${paper.review_difficulty ?? ''}
- 주요 출제 단원: ${paper.review_units ?? ''}
- 까다로웠던 유형: ${paper.review_hard_types ?? ''}
- 실수하기 쉬운 부분: ${paper.review_mistakes ?? ''}
- 다음 시험 대비 포인트: ${paper.review_next_points ?? ''}
- 블로그용 요약: ${paper.review_blog_summary ?? ''}
- 시험 범위(적혀 있으면): ${paper.exam_scope ?? ''}

${paper.school_name} ${paper.grade} ${paper.exam_year}년 ${paper.term}학기 ${paper.exam_type} 수학 시험의 분석 카드뉴스에 들어갈 글을 쓴다. 읽는 사람은 학부모다.

지킬 것:
- 총평 · 경향 · 전략 · 어려웠던 이유 · 선생님 한마디는 **선생님이 쓴 내용을 다듬어** 쓴다. 선생님이 쓰지 않은 주장을 보태지 않는다.
- 예상 평균 점수, 등급컷, 정답률 같은 **근거 없는 숫자를 쓰지 않는다.** 다른 학원과 비교하지 않는다. "무조건", "1등" 같은 보장 표현을 쓰지 않는다.
- 변별문항의 steps 는 문제 그림과 손풀이를 직접 읽고 쓴다. 손풀이의 풀이 길을 따르고, 식과 답은 **검산해서 맞는 것만** 쓴다.
- 문항마다 unit · type · diff(1 쉬움 ~ 5 어려움)를 그림을 보고 매긴다. 변별문항은 4 이상.
- 짧고 분명한 문장. 꾸밈말을 줄인다. 강조 기호(*, ** 등)와 이모지를 쓰지 않는다.

${SPEC}`))
  const client = new Anthropic()
  const msg = await client.messages.stream({ model: MODEL, max_tokens: 16000, system: '너는 수학의지혜 학원의 중등 수학 강사다. 시험지를 분석해 학부모용 카드뉴스 글을 쓴다. 요청한 JSON 만 출력한다.', messages: [{ role: 'user', content }] }).finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('AI 가 이 요청을 처리하지 않았습니다.')
  const text = msg.content.filter((x): x is Anthropic.TextBlock => x.type === 'text').map((x) => x.text).join('')
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s < 0 || e <= s) throw new Error('AI 응답을 읽지 못했습니다. 다시 눌러 주세요.')
  const ai = JSON.parse(text.slice(s, e + 1))

  // 숫자와 이름은 AI 것이 아니라 DB 것을 쓴다
  const aiQ = new Map((ai.questions ?? []).map((q: any) => [normNo(String(q.no)), q]))
  const questions = g.questions.map((q: any) => {
    const a: any = aiQ.get(q.no) ?? {}
    return { no: Number(q.no) || q.no, pts: q.pts, unit: a.unit ?? '', type: a.type ?? '', diff: Math.min(5, Math.max(1, Math.round(Number(a.diff) || 3))), ...(q.essay ? { essay: true } : {}) }
  })
  const units: Record<string, number> = {}
  for (const q of questions) if (q.unit) units[q.unit] = (units[q.unit] ?? 0) + 1
  const aiK = new Map((ai.killers ?? []).map((k: any) => [normNo(String(k.no)), k]))
  const killers = g.killers.map((no) => {
    const k: any = aiK.get(no) ?? {}
    const q = g.questions.find((x: any) => x.no === no)
    return {
      no: Number(no) || no, pts: q?.pts ?? 0, image: `q:${no}`, solution: g.solutions[no] ? `s:${no}` : null,
      tag: k.tag ?? '', title: k.title ?? '', summary: k.summary ?? '', checks: (k.checks ?? []).slice(0, 4),
      steps: (k.steps ?? []).slice(0, 4), why: k.why ?? '', comment: k.comment ?? '',
    }
  })
  const gradeNo = String(paper.grade).replace(/[^0-9]/g, '')
  const analysis = {
    school: paper.school_name, grade: paper.grade, year: paper.exam_year, exam: `${paper.term}학기 ${paper.exam_type}`,
    scope: paper.exam_scope || ai.scope || '', teacher: paper.assignee ?? '', hit: g.hit,
    overall_difficulty: paper.review_difficulty, one_line: ai.one_line ?? '', tagline: ai.tagline ?? '',
    unit_groups: Object.entries(units).map(([name, count], i) => ({ name, count, color: UNIT_COLORS[i % UNIT_COLORS.length] })),
    questions, trends: (ai.trends ?? []).slice(0, 4), strategy: (ai.strategy ?? []).slice(0, 4), killers,
    features: (ai.features ?? []).slice(0, 3), hard_reasons: (ai.hard_reasons ?? []).slice(0, 3), study_steps: (ai.study_steps ?? []).slice(0, 5),
    message: ai.message ?? '',
    thumb: {
      kicker: '수학의지혜 기출분석',
      headline: g.hit.total ? [`${g.hit.total}문항 중`, `${g.hit.hit}문항`, '적중했어요'] : [paper.school_name, `${gradeNo}학년 수학`, '기출분석'],
      sub: `${paper.school_name} ${gradeNo}학년 ${paper.term}학기 ${paper.exam_type}`,
    },
    phone: PHONE, generated_at: new Date().toISOString(), generated_by: by,
  }
  return { analysis, usage: msg.usage }
}
