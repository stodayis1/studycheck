// 시험지 분석 — AI 적중 대조 (원장 전용)
//
// 기출 문항 그림과 이너프원 문항 그림을 Claude 가 직접 보고 「쌍둥이 / 매우 유사 / 유형 유사 / 참고」를 매긴다.
// 한 번에 다 하면 서버 시간 제한에 걸리므로 화면이 세 단계로 나눠 부른다 (components/exam-analysis/AutoMatch.tsx).
//   plan   : 기출 문항 전체 + 교재의 세트 목록 → 어느 문항을 어느 세트에서 찾을지 묶음을 나눈다
//   scan   : 묶음 하나(기출 몇 문항 + 묶음 그림 몇 장) → 후보를 찾는다
//   verify : 후보를 문항 그림 한 장씩 놓고 다시 본 뒤 exam_enough_matches 에 넣는다
// 묶음 그림은 exam-analysis 보관함 enough-one/2026-2/sheets/<교재>/<NNN>.png (scripts/enough-one/upload.mjs sheets).
// 이미 있는 매칭은 지우지 않는다 — 같은 (기출 번호 · 이너프원 문항)만 건너뛴다.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { staffOrDeny } from '@/lib/apiAuth'
import { MATCH_LEVELS, normNo } from '@/lib/examAnalysis'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL = 'claude-opus-5-5'
const EDITION = '2026-2학기'
const FILE_BUCKET = 'exam-analysis'
const PROBLEM_BUCKET = 'problem-images'
const SHEET_SIZE = 10            // 묶음 그림 한 장의 문항 수
const SHEETS_PER_CALL = 10       // scan 한 번에 보는 묶음 그림 수
const AI_NAME = 'AI 적중 대조'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const LEVEL_RULES = `매칭 정도는 아래 넷 중 하나만 쓴다. 엄격하게, 부풀리지 말 것.
- "쌍둥이": 같은 문제. 숫자·기호만 다르다 (같은 그림, 같은 물음).
- "매우 유사": 같은 그림·상황이고 풀이 길도 같다. 묻는 것이 조금 다르거나 한 단계가 더 있다.
- "유형 유사": 같은 유형·핵심 아이디어지만 그림이나 설정이 다르다. 약하면 memo 를 "약함."으로 시작한다.
- "참고": 단원만 같고 아이디어가 다르다. 더 나은 것이 없을 때만.
기출 문항에 맞는 것이 없으면 억지로 만들지 말고 비워 둔다.`

type Img = Anthropic.ImageBlockParam
const img = (buf: Buffer): Img => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: buf.toString('base64') } })
const txt = (text: string): Anthropic.TextBlockParam => ({ type: 'text', text })

async function download(supabase: any, bucket: string, path: string): Promise<Buffer | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

async function askJson(content: Anthropic.ContentBlockParam[], system: string): Promise<any> {
  const client = new Anthropic()
  const stream = client.messages.stream({ model: MODEL, max_tokens: 16000, system, messages: [{ role: 'user', content }] })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('AI 가 이 요청을 처리하지 않았습니다.')
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('')
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s < 0 || e <= s) throw new Error('AI 응답을 읽지 못했습니다.')
  return { json: JSON.parse(text.slice(s, e + 1)), usage: msg.usage }
}

// 이 시험이 볼 이너프원 교재 (학교·학년별). 교재가 늘면 여기에 더한다
function bookFilter(paper: any): string | null {
  if (paper.grade === '중2') return '이너프원 중2%'
  if (paper.grade === '중3') return paper.school_name === '신원중' ? '이너프원 신원중3%' : '이너프원 타학교 중3%'
  // 고1 은 고양일고 학생만 이너프원(공수2 S반 시험대비교재)을 쓴다 (원장님 2026-10-10)
  if (paper.grade === '고1' && /고양일고/.test(paper.school_name)) return '이너프원 고1 공수2 S반%'
  // 신원고(미래엔) · 동산고(천재(전))는 교과서 출판사 평가문제를 풀린다. 2026 2학기 중간은 범위가 같아 두 출판사 것을 다 풀렸다
  if (paper.grade === '고1' && /신원고|동산고/.test(paper.school_name)) return '교과서 평가문제%'
  return null
}

// 교재별 세트 목록 (세트 번호 순). 묶음 그림 NNN 번째 장 = 그 교재의 (NNN-1)×10+1 ~ NNN×10 번째 문항
async function loadBooks(supabase: any, like: string) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('enough_problems').select('id, book, set_no, unit, problem_no, image_path')
      .eq('edition', EDITION).like('book', like).order('book').order('set_no').order('problem_no').range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const books: Record<string, { code: string; sets: { set: number; unit: string; count: number; start: number }[]; rows: any[] }> = {}
  for (const r of rows) {
    const b = (books[r.book] ??= { code: String(r.image_path).split('/')[2], sets: [], rows: [] })
    b.rows.push(r)
    let s = b.sets.find((x) => x.set === r.set_no)
    if (!s) { s = { set: r.set_no, unit: r.unit || '', count: 0, start: 0 }; b.sets.push(s) }
    s.count++
  }
  for (const b of Object.values(books)) {
    let pos = 0, lastUnit = ''
    for (const s of b.sets) {
      s.start = pos; pos += s.count
      if (s.unit) lastUnit = s.unit.replace(/\s*\d회차$/, '')
      else s.unit = lastUnit ? `${lastUnit} (추가 문항)` : `세트 ${s.set}`      // 이름 없는 세트는 앞 세트의 추가 문항이다
    }
  }
  return books
}

async function loadQuestions(supabase: any, paperId: string) {
  const { data: qs } = await supabase.from('exam_questions').select('id, question_no, sort_order, problem_id').eq('paper_id', paperId).order('sort_order')
  const ids = (qs ?? []).map((q: any) => q.problem_id).filter(Boolean)
  const { data: ps } = ids.length ? await supabase.from('problems').select('id, image_path').in('id', ids) : { data: [] }
  const pathOf = new Map((ps ?? []).map((p: any) => [p.id, p.image_path]))
  return (qs ?? []).map((q: any) => ({ id: q.id, no: normNo(q.question_no), path: pathOf.get(q.problem_id) as string | undefined })).filter((q: any) => q.path)
}

export async function POST(req: Request) {
  const me = await staffOrDeny(req, { adminOnly: true })
  if (me.deny) return me.deny
  if (!process.env.ANTHROPIC_API_KEY) return bad('AI 키(ANTHROPIC_API_KEY)가 설정돼 있지 않습니다.', 500)
  const b = await req.json().catch(() => ({}))
  const supabase = admin()
  try {
    const { data: paper } = await supabase.from('exam_papers').select('*').eq('id', b.paperId).maybeSingle()
    if (!paper) return bad('시험지를 찾을 수 없습니다.', 404)
    const like = bookFilter(paper)
    if (!like) return bad(`${paper.grade} 이너프원 교재가 아직 등록돼 있지 않습니다.`)
    const books = await loadBooks(supabase, like)
    if (!Object.keys(books).length) return bad('이 학년의 이너프원 문항이 등록돼 있지 않습니다.')
    const questions = await loadQuestions(supabase, paper.id)
    if (!questions.length) return bad('먼저 「기본 · 파일」에서 PDF 의 「문항 넣기」를 해 주세요. (문항 그림이 있어야 대조할 수 있습니다)')
    const qImages = async (nos: string[]) => {
      const out: Anthropic.ContentBlockParam[] = []
      for (const q of questions.filter((x: any) => nos.includes(x.no))) {
        const buf = await download(supabase, PROBLEM_BUCKET, q.path!)
        if (buf) out.push(txt(`■ 기출 ${q.no}번`), img(buf))
      }
      return out
    }

    // ── 1) 묶음 나누기
    if (b.action === 'plan') {
      const list = Object.entries(books).map(([name, bk]) =>
        `【${name}】\n` + bk.sets.map((s) => `  세트 ${s.set}: ${s.unit} (${s.count}문항)`).join('\n')).join('\n')
      const content = [
        ...(await qImages(questions.map((q: any) => q.no))),
        txt(`위는 ${paper.school_name} ${paper.grade} ${paper.exam_year}년 ${paper.term}학기 ${paper.exam_type} 수학 기출 ${questions.length}문항이다.
아래는 학원 내신 교재 「이너프원」의 세트 목록이다.

${list}

기출 문항마다 비슷한 문제가 들어 있을 세트를 골라, 단원별 묶음으로 나눠라.
- 모든 기출 번호가 적어도 한 묶음에 들어가야 한다. 두 단원에 걸친 문항은 두 묶음에 넣어도 된다.
- 한 묶음에는 같은 단원의 세트를 교재마다 빠짐없이 넣는다 (1회차·2회차·3회차·추가 문항 모두).
- 시험 범위가 아닌 단원의 세트는 넣지 않는다.
- 묶음은 6개를 넘기지 않는다.

JSON 만 답한다:
{"groups":[{"label":"단원 이름","nos":["1","2"],"sets":[{"book":"교재 이름 그대로","set":1}]}]}`),
      ]
      const { json, usage } = await askJson(content, '너는 중학교 수학 내신 기출과 교재를 대조하는 수학 강사다. 요청한 JSON 만 출력한다.')
      const allNos = new Set(questions.map((q: any) => q.no))
      const jobs: any[] = []
      const groups: any[] = []
      for (const g of json.groups ?? []) {
        const nos = (g.nos ?? []).map((n: any) => normNo(String(n))).filter((n: string) => allNos.has(n))
        if (!nos.length) continue
        groups.push({ label: g.label, nos })
        for (const [name, bk] of Object.entries(books)) {
          const sheets = new Set<number>()
          for (const s of (g.sets ?? []).filter((x: any) => x.book === name)) {
            const st = bk.sets.find((x) => x.set === Number(s.set))
            if (!st) continue
            for (let k = Math.floor(st.start / SHEET_SIZE); k <= Math.floor((st.start + st.count - 1) / SHEET_SIZE); k++) sheets.add(k + 1)
          }
          const arr = Array.from(sheets).sort((a, c) => a - c)
          for (let i = 0; i < arr.length; i += SHEETS_PER_CALL) jobs.push({ label: g.label, nos, book: name, sheets: arr.slice(i, i + SHEETS_PER_CALL) })
        }
      }
      const missing = Array.from(allNos).filter((n) => !groups.some((g) => g.nos.includes(n)))
      return NextResponse.json({ ok: true, groups, jobs, missing, questions: questions.length, usage })
    }

    // ── 2) 묶음 하나에서 후보 찾기
    if (b.action === 'scan') {
      const bk = books[b.book]
      if (!bk) return bad('교재를 찾을 수 없습니다.')
      const nos: string[] = (b.nos ?? []).map((n: any) => normNo(String(n)))
      const content: Anthropic.ContentBlockParam[] = [txt('【기출 문항】'), ...(await qImages(nos)), txt(`【교재 ${b.book} 묶음 그림】 칸마다 빨간 글씨 [S세트-번호] 가 붙어 있다 (예: [S04-12] = 세트 4의 12번).`)]
      let n = 0
      for (const k of (b.sheets ?? []).slice(0, SHEETS_PER_CALL + 2)) {
        const buf = await download(supabase, FILE_BUCKET, `enough-one/2026-2/sheets/${bk.code}/${String(k).padStart(3, '0')}.png`)
        if (buf) { content.push(img(buf)); n++ }
      }
      if (!n) return bad('묶음 그림을 찾지 못했습니다. (scripts/enough-one/upload.mjs sheets 를 먼저 돌려야 합니다)', 500)
      content.push(txt(`기출 문항 ${nos.join(', ')}번 각각에 대해, 위 묶음 그림 안에서 맞는 교재 문항을 찾아라. 그림을 실제로 보고 판단한다.
${LEVEL_RULES}
기출 문항 하나에 많아야 3개, 정도가 높은 것부터.

JSON 만 답한다:
{"matches":[{"no":"3","set":4,"pno":12,"level":"매우 유사","memo":"무엇이 같고 무엇이 다른지 한국어 한 문장"}]}`))
      const { json, usage } = await askJson(content, '너는 중학교 수학 내신 기출과 교재를 대조하는 수학 강사다. 요청한 JSON 만 출력한다.')
      const valid = (json.matches ?? []).filter((m: any) =>
        nos.includes(normNo(String(m.no))) && MATCH_LEVELS.includes(m.level) &&
        bk.rows.some((r) => r.set_no === Number(m.set) && r.problem_no === Number(m.pno)))
        .map((m: any) => ({ no: normNo(String(m.no)), book: b.book, set: Number(m.set), pno: Number(m.pno), level: m.level, memo: String(m.memo ?? '') }))
      return NextResponse.json({ ok: true, matches: valid, usage })
    }

    // ── 3) 후보를 한 장씩 다시 보고 넣기
    if (b.action === 'verify') {
      const items: { no: string; cands: any[] }[] = (b.items ?? []).map((x: any) => ({ no: normNo(String(x.no)), cands: (x.cands ?? []).slice(0, 4) }))
      const content: Anthropic.ContentBlockParam[] = []
      const index: Record<string, any> = {}
      let c = 0
      for (const it of items) {
        const qi = await qImages([it.no])
        if (!qi.length) continue
        content.push(...qi)
        for (const cand of it.cands) {
          const row = books[cand.book]?.rows.find((r) => r.set_no === Number(cand.set) && r.problem_no === Number(cand.pno))
          const buf = row ? await download(supabase, FILE_BUCKET, row.image_path) : null
          if (!buf) continue
          const key = `C${++c}`
          index[key] = { no: it.no, cand, row }
          content.push(txt(`후보 ${key} (기출 ${it.no}번과 비교 · 1차 판단: ${cand.level})`), img(buf))
        }
      }
      if (!c) return NextResponse.json({ ok: true, added: 0, results: [] })
      content.push(txt(`후보마다 바로 위 기출 문항과 다시 비교해 매칭 정도를 확정하라. 1차 판단이 틀렸으면 고친다.
${LEVEL_RULES}
전혀 관련이 없으면 "level":"없음".

JSON 만 답한다:
{"results":[{"key":"C1","level":"매우 유사","memo":"무엇이 같고 무엇이 다른지 한국어 한 문장"}]}`))
      const { json, usage } = await askJson(content, '너는 중학교 수학 내신 기출과 교재를 대조하는 수학 강사다. 요청한 JSON 만 출력한다.')
      const { data: had } = await supabase.from('exam_enough_matches').select('question_no, enough_problem_id').eq('paper_id', paper.id)
      const seen = new Set((had ?? []).map((h: any) => `${normNo(h.question_no ?? '')}|${h.enough_problem_id}`))
      const qid = new Map(questions.map((q: any) => [q.no, q.id]))
      const results: any[] = []
      let added = 0
      for (const r of json.results ?? []) {
        const x = index[r.key]
        if (!x || !MATCH_LEVELS.includes(r.level)) continue
        results.push({ no: x.no, level: r.level })
        if (seen.has(`${x.no}|${x.row.id}`)) continue
        // 「참고」는 그 문항에 더 나은 것이 없을 때 하나만 남긴다
        if (r.level === '참고' && (json.results ?? []).some((o: any) => index[o.key]?.no === x.no && o.key !== r.key && MATCH_LEVELS.includes(o.level) && (o.level !== '참고' || o.key < r.key))) continue
        const { error } = await supabase.from('exam_enough_matches').insert({
          paper_id: paper.id, question_id: qid.get(x.no) ?? null, question_no: x.no,
          enough_book: x.cand.book, enough_unit: x.row.unit || `세트 ${x.row.set_no}`, enough_problem_no: String(x.row.problem_no),
          enough_problem_id: x.row.id, match_level: r.level, memo: String(r.memo ?? x.cand.memo ?? ''), created_by: AI_NAME,
        })
        if (error) throw new Error(error.message)
        seen.add(`${x.no}|${x.row.id}`)
        added++
      }
      return NextResponse.json({ ok: true, added, results, usage })
    }

    return bad('알 수 없는 요청입니다.')
  } catch (e: any) {
    if (e instanceof Anthropic.AuthenticationError) return bad('AI 키가 맞지 않습니다. (ANTHROPIC_API_KEY)', 500)
    if (e instanceof Anthropic.RateLimitError) return bad('AI 사용 한도에 걸렸습니다. 잠시 뒤 다시 눌러 주세요.', 429)
    if (e instanceof Anthropic.APIError) return bad(`AI 호출 실패 (${e.status}): ${e.message}`, 502)
    return bad(e?.message ?? '적중 대조를 하지 못했습니다.', 500)
  }
}
