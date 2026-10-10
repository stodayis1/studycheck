'use client'

// 시험지 분석 — 학교별 상세.
// 탭: 기본·파일 / 정답·변별·손풀이 / 총평 / 기출문제(→문제은행) / 이너프원 매칭 / 블로그
// 자료는 전부 서버(app/api/exam-analysis)를 거친다. 「문제은행 반영」과 「블로그」 결정은 원장만.

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'
import {
  FILE_KINDS, MATCH_LEVELS, REVIEW_DIFFICULTIES, TASKS,
  HIT_LEVELS, checkFileName, guessExamFile, kindOfFile, expectedPaperFileName, handsolveLabel, hitSummary, noLabel, normNo,
} from '@/lib/examAnalysis'
import { QuestionsTab } from '@/components/exam-analysis/QuestionsTab'
import PdfImportDialog from '@/components/exam-analysis/PdfImportDialog'
import ClaudeRequest from '@/components/exam-analysis/ClaudeRequest'
import BlogCards from '@/components/exam-analysis/BlogCards'
import { Card, Field, GREEN, INPUT, openPrint, post } from '@/components/exam-analysis/ui'

// 손풀이 그림의 긴 쪽이 이보다 작으면 블로그에서 글씨가 흐리다 (태블릿 원본 내보내기는 보통 2000px 을 넘는다)
const HANDSOLVE_MIN_PX = 2000

// 그림 파일의 가로·세로 px (못 읽으면 null)
function imageSize(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); ok({ w: img.naturalWidth, h: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); ok(null) }
    img.src = url
  })
}

const TABS = ['기본 · 파일', '정답 · 변별 · 손풀이', '총평', '기출문제', '이너프원 매칭', '블로그']


export default function ExamPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { currentUser, loading } = useAuth()
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState(0)
  const [draft, setDraft] = useState<any>({})       // 아직 저장 안 한 글 칸
  const [busy, setBusy] = useState('')
  // 원장: PDF 에서 문항 넣기 창 (작업한 시험지 PDF 를 올리면 바로 뜬다)
  const [importSrc, setImportSrc] = useState<{ name: string; data?: ArrayBuffer; url?: string } | null>(null)

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/exam-analysis?id=${id}`)
    const j = await r.json()
    if (!r.ok) { setErr(j.error ?? '불러오지 못했습니다.'); return }
    setData(j)
  }, [id])
  useEffect(() => { if (!loading && currentUser) load() }, [loading, currentUser, load])

  if (err) return <Shell title="시험지 분석"><p className="p-10 text-center text-sm text-red-600">{err}</p></Shell>
  if (!data) return <Shell title="시험지 분석"><p className="p-10 text-center text-gray-400">불러오는 중…</p></Shell>

  const paper = data.paper
  const isAdmin = !!data.me?.isAdmin
  const val = (k: string) => (k in draft ? draft[k] : paper[k]) ?? ''
  const set = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }))
  const dirty = (keys: string[]) => keys.some((k) => k in draft)

  // 바로 저장 (체크·선택)
  const saveNow = async (patch: any) => {
    setData((d: any) => ({ ...d, paper: { ...d.paper, ...patch } }))
    const r = await post({ action: 'savePaper', id, patch })
    if (!r.ok) { alert(r.error ?? '저장하지 못했습니다.'); load() }
  }
  // 글 칸 묶음 저장
  const saveDraft = async (keys: string[]) => {
    const patch: any = {}
    keys.forEach((k) => { if (k in draft) patch[k] = draft[k] })
    if (!Object.keys(patch).length) return
    setBusy('save')
    const r = await post({ action: 'savePaper', id, patch })
    setBusy('')
    if (!r.ok) { alert(r.error ?? '저장하지 못했습니다.'); return }
    setData((d: any) => ({ ...d, paper: { ...d.paper, ...patch } }))
    setDraft((d: any) => { const n = { ...d }; keys.forEach((k) => delete n[k]); return n })
  }
  const saveBtn = (keys: string[]) => (
    <button onClick={() => saveDraft(keys)} disabled={!dirty(keys) || busy === 'save'}
      className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
      {dirty(keys) ? '저장' : '저장됨'}
    </button>
  )

  // ── 파일 올리기
  const upload = async (fileList: FileList | null, forced?: string) => {
    if (!fileList?.length) return
    for (const file of Array.from(fileList)) {
      // 시험지 칸에 올린 파일은 이름이 어떻든 받는다 (종류만 이름에서 짐작: 문제 · 정답 · 해설 · 원본)
      const named = kindOfFile(file.name)
      const kind = forced ?? (named === '기타' || named === '손풀이' ? guessExamFile(file.name).kind : named)
      const warn = kind === '손풀이' ? checkFileName(paper, kind, file.name) : null
      if (warn && !confirm(`${file.name}\n\n${warn}\n\n그래도 「${kind}」(으)로 올릴까요?`)) continue
      // 손풀이는 블로그에 그대로 실린다 → 해상도가 낮으면 글씨가 안 보인다. 올리기 전에 알려 준다
      if (kind === '손풀이') {
        const size = await imageSize(file)
        if (size && Math.max(size.w, size.h) < HANDSOLVE_MIN_PX &&
          !confirm(`${file.name}\n\n해상도가 낮습니다 (${size.w}×${size.h}).\n블로그에 올리면 글씨가 잘 안 보여요.\n\n태블릿에서 「원본 크기」로 내보낸 파일(긴 쪽 ${HANDSOLVE_MIN_PX}px 이상)로 다시 올려 주세요.\n그래도 이 파일을 올릴까요?`)) continue
      }
      setBusy(`올리는 중: ${file.name}`)
      const u = await post({ action: 'uploadUrl', paperId: id, fileName: file.name, kind })
      if (!u.ok) { alert(u.error); continue }
      // 한글(HWP) 파일은 브라우저가 종류를 모른다 → 일반 파일로 올린다
      const type = ['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) ? file.type : 'application/octet-stream'
      const { error } = await supabase.storage.from('exam-analysis').uploadToSignedUrl(u.path, u.token, file, { contentType: type })
      if (error) { alert(`올리지 못했습니다: ${error.message}`); continue }
      const a = await post({
        action: 'addFile', paperId: id, kind, path: u.path, fileName: file.name, autoName: true,
        mimeType: type, fileSize: file.size, questionLabel: handsolveLabel(file.name),
      })
      if (!a.ok) alert(a.error)
      // 원장이 작업한 시험지 PDF 를 올렸으면 그 자리에서 문항 자르기로 넘어간다
      else if (data?.me?.isAdmin && /\.pdf$/i.test(file.name) && (kind === '문제' || kind === '문제정답해설')) setImportSrc({ name: file.name, data: await file.arrayBuffer() })
    }
    setBusy('')
    load()
  }
  // 원장: 잘못 분류된 파일의 종류를 바꾼다 (스캔 원본이 「문제」로 들어간 것 등)
  const changeKind = async (f: any, kind: string) => {
    const r = await post({ action: 'setFileKind', id: f.id, kind })
    if (!r.ok) alert(r.error)
    load()
  }
  const removeFile = async (f: any) => {
    if (!confirm(`「${f.file_name}」 파일을 지울까요? 되돌릴 수 없습니다.`)) return
    const r = await post({ action: 'deleteFile', id: f.id })
    if (!r.ok) alert(r.error)
    load()
  }

  // 원장: 잘못 만든 빈 시험 줄 지우기 (파일 · 문항 · 매칭이 하나도 없을 때만)
  // 문항 · 매칭이 없으면 지울 수 있다. 올라간 파일이 있으면 같이 지운다 (한 번에)
  const isEmptyPaper = !data.questions.length && !data.matches.length && !data.sheetCode
  const nFiles = data.files.length
  const deletePaper = async () => {
    if (!confirm(`「${paper.school_name} ${paper.grade} · ${paper.exam_name ?? ''}」 줄을 지울까요?` +
      (nFiles ? `\n\n이 줄에 올라간 파일 ${nFiles}개도 같이 지워집니다.` : '') + '\n되돌릴 수 없습니다.')) return
    const r = await post({ action: 'deletePaper', id, withFiles: true })
    if (!r.ok) { alert(r.error); return }
    window.location.href = '/teacher/exam-analysis'
  }

  const tasks = paper.tasks ?? {}
  const paperFiles = data.files.filter((f: any) => f.kind !== '손풀이' && f.kind !== '원본')
  const originals = data.files.filter((f: any) => f.kind === '원본')      // 원장에게만 내려온다
  const handFiles = data.files.filter((f: any) => f.kind === '손풀이')
  const discNos: string[] = paper.discriminating_nos ?? []

  return (
    <Shell title={`${paper.school_name} ${paper.grade}`} subtitle={`${paper.exam_name ?? ''}${paper.exam_end_date ? ` · 시험 종료 ${paper.exam_end_date}` : ''}`}>
      {/* 선생님 체크리스트 — 어느 탭에서나 보인다 */}
      <div className="mb-4 rounded-xl border bg-white px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="text-xs font-bold" style={{ color: GREEN }}>할 일</span>
        {TASKS.map((t) => (
          <label key={t.key} className="flex items-center gap-1.5 cursor-pointer"
            style={t.key === 'needs_check' && tasks[t.key] ? { color: '#B45309', fontWeight: 600 } : undefined}>
            <input type="checkbox" checked={!!tasks[t.key]}
              onChange={(e) => saveNow({ tasks: { ...tasks, [t.key]: e.target.checked } })} />
            {t.label}
          </label>
        ))}
        {paper.work_due_date && <span className="ml-auto text-xs text-gray-400">작업 기한 {paper.work_due_date}</span>}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className="rounded-full px-3.5 py-1.5 text-xs font-semibold"
            style={tab === i ? { background: GREEN, color: '#fff' } : { background: '#fff', color: '#4b5563', border: '1px solid #e5e7eb' }}>
            {t}
          </button>
        ))}
        {busy && busy !== 'save' && <span className="self-center text-xs text-gray-400">{busy}</span>}
      </div>

      {/* ───────── 기본 · 파일 ───────── */}
      {tab === 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="시험 정보">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label="학교 · 학년"><div className="py-2 font-semibold">{paper.school_name} {paper.grade}</div></Field>
              <Field label="연도 · 학기 · 구분"><div className="py-2">{paper.exam_year}년 {paper.term}학기 {paper.exam_type}</div></Field>
              <Field label="시험명"><input className={INPUT} value={val('exam_name')} onChange={(e) => set('exam_name', e.target.value)} /></Field>
              <Field label="시험 종료일"><input type="date" className={INPUT} value={val('exam_end_date')} onChange={(e) => set('exam_end_date', e.target.value)} /></Field>
              <Field label="시험범위" wide><input className={INPUT} value={val('exam_scope')} onChange={(e) => set('exam_scope', e.target.value)} placeholder="예) 이차방정식 ~ 이차함수의 그래프" /></Field>
              <Field label="담당자"><input className={INPUT} value={val('assignee')} onChange={(e) => set('assignee', e.target.value)} /></Field>
              <Field label="작업 기한"><input type="date" className={INPUT} value={val('work_due_date')} onChange={(e) => set('work_due_date', e.target.value)} /></Field>
              <Field label="우선순위">
                <select className={INPUT} value={paper.priority} onChange={(e) => saveNow({ priority: e.target.value })}>
                  {['높음', '보통', '낮음'].map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="비고" wide><textarea className={INPUT} rows={2} value={val('note')} onChange={(e) => set('note', e.target.value)} /></Field>
            </div>
            <div className="mt-3 flex items-center">
              {isAdmin && isEmptyPaper && (
                <button onClick={deletePaper} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                  <i className="ti ti-trash mr-1" />이 시험 줄 지우기{nFiles ? ` (파일 ${nFiles}개 포함)` : ''}
                </button>
              )}
              <span className="ml-auto">{saveBtn(['exam_name', 'exam_end_date', 'exam_scope', 'assignee', 'work_due_date', 'note'])}</span>
            </div>
          </Card>

          <Card title="시험지 파일">
            <p className="mb-2 text-xs text-gray-500">
              작업한 시험지 PDF는 <b>원장님(윤T)이 올립니다.</b> 선생님이 올린 시험지는 <b>원본</b>으로 보관됩니다. 파일명은 맞추지 않아도 됩니다 —
              올리면 <b>{expectedPaperFileName(paper, '문제')}</b> 처럼 규칙대로 자동으로 붙습니다.
            </p>
            <FileDrop accept=".pdf,.png,.jpg,.jpeg" onFiles={(f) => upload(f)} label="작업한 시험지 PDF 올리기" />
            <FileList files={paperFiles} onRemove={removeFile} onKind={isAdmin ? changeKind : undefined} empty="아직 올린 시험지가 없습니다."
              onImport={isAdmin ? (f) => setImportSrc({ name: f.file_name, url: f.url }) : undefined} />
            {isAdmin && !data.sheetCode && paperFiles.some((f: any) => /\.pdf$/i.test(f.file_name) && (f.kind === '문제' || f.kind === '문제정답해설')) && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">PDF 는 올라와 있지만 아직 문항으로 넣지 않았습니다. 위 파일의 <b>「문항 넣기」</b>를 누르면 문항 · 정답 · 통째 인쇄가 채워집니다.</p>
            )}
            {data.sheetCode && (
              <button onClick={() => openPrint(id)} className="mt-3 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white" style={{ background: GREEN }}>
                <i className="ti ti-printer mr-1.5" />수학의지혜 시험지 양식으로 통째 인쇄
              </button>
            )}
            {data.sheetCode && (
              <button onClick={() => openPrint(id, 'qr')} className="mt-2 w-full rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: GREEN, color: GREEN }}>
                <i className="ti ti-qrcode mr-1.5" />QR 채점 학습지 양식으로 인쇄
              </button>
            )}
            {paperFiles.some((f: any) => f.kind === '문제' || f.kind === '문제정답해설') && (
              <button onClick={() => openPrint(id, 'raw')} className="mt-2 w-full rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: GREEN, color: GREEN }}>
                <i className="ti ti-file-type-pdf mr-1.5" />올린 PDF 그대로 인쇄
              </button>
            )}
            {!data.sheetCode && paperFiles.some((f: any) => f.kind === '문제' || f.kind === '문제정답해설') && (
              <p className="mt-2 text-xs text-gray-500">수학의지혜 시험지 양식 인쇄는 올린 PDF를 문항별로 잘라 넣은 뒤에 생깁니다.</p>
            )}
          </Card>

          <Card title="원본 보관 (원장님만 열람)">
            <p className="mb-2 text-xs text-gray-500">
              학교에서 받은 시험지 원본, 한글(HWP) 작업 원본을 따로 보관합니다. 올리는 것은 누구나 할 수 있지만
              <b> 올린 뒤에는 원장님만 열어 보고 지울 수 있습니다.</b> 파일명은 자동으로 붙습니다 (HWP · PDF · JPG).
            </p>
            <FileDrop accept=".pdf,.hwp,.hwpx,.png,.jpg,.jpeg" onFiles={(f) => upload(f, '원본')} label="원본 파일 올리기" />
            {isAdmin
              ? <FileList files={originals} onRemove={removeFile} onKind={changeKind} empty="아직 보관된 원본이 없습니다." />
              : <p className="mt-3 text-center text-xs text-gray-500">보관된 원본 {data.originalCount ?? 0}개 · 원장님만 열어 볼 수 있습니다.</p>}
          </Card>
        </div>
      )}

      {/* ───────── 정답 · 변별 · 손풀이 ───────── */}
      {tab === 1 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="정답">
            <p className="mb-2 rounded-lg px-3 py-2 text-xs" style={{ background: '#F0FBF7', color: GREEN }}>
              <b>정답은 여기에 적지 않아도 됩니다.</b> 원장님이 한글 파일에 정답을 넣어 올리면 문항과 QR 채점에 자동으로 들어갑니다.
              (루트 · 분수가 든 답은 여기에 칠 수 없어서 방식을 바꿨습니다)
            </p>
            <p className="mb-2 text-xs text-gray-400">꼭 필요할 때만: 한 줄에 「번호 정답」. 예) <code>1 ③</code> · <code>서술형2 12</code></p>
            <textarea className={INPUT + ' font-mono'} rows={14} value={val('answers_text')} onChange={(e) => set('answers_text', e.target.value)}
              placeholder={'1 ③\n2 ①\n…\n서술형1 12'} />
            <div className="mt-3 text-right">{saveBtn(['answers_text'])}</div>
          </Card>

          <div className="space-y-4">
            <Card title="변별문항 (2~3개)">
              <DiscEditor nos={discNos} onChange={(nos) => saveNow({ discriminating_nos: nos })} />
              {discNos.length > 3 && <p className="mt-2 text-xs text-amber-700">변별문항은 2~3개가 기준입니다.</p>}
            </Card>
            <Card title="손풀이 이미지">
              <p className="mb-2 text-xs text-gray-500">
                파일명 규칙: <b>{paper.school_name}_{paper.grade}_18번_손풀이_김T.png</b> (JPG·PNG). 여러 장을 한 번에 올릴 수 있습니다.
                <br /><b>태블릿으로 써서 원본 크기로 내보내 주세요.</b> 블로그에 그대로 실리므로 긴 쪽이 {HANDSOLVE_MIN_PX}px보다 작으면 글씨가 잘 안 보입니다.
                종이에 써서 찍은 사진, 카톡으로 받은 사진(자동으로 줄어듦)은 피해 주세요.
              </p>
              <FileDrop accept=".png,.jpg,.jpeg" onFiles={(f) => upload(f, '손풀이')} label="손풀이 이미지 올리기" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                {handFiles.map((f: any) => (
                  <div key={f.id} className="rounded-lg border p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {f.url && <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.file_name} className="h-36 w-full rounded object-contain bg-gray-50" /></a>}
                    <div className="mt-1.5 flex items-center gap-1 text-xs">
                      <span className="font-semibold" style={{ color: GREEN }}>{f.question_label ?? '번호 없음'}</span>
                      {!f.name_ok && <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700">파일명 확인</span>}
                      <span className="truncate text-gray-400">{f.uploaded_by}</span>
                      <button onClick={() => removeFile(f)} className="ml-auto text-gray-400 hover:text-red-600"><i className="ti ti-trash" /></button>
                    </div>
                  </div>
                ))}
              </div>
              {!handFiles.length && <p className="mt-3 text-center text-xs text-gray-400">아직 올린 손풀이가 없습니다.</p>}
              {discNos.filter((n) => !handFiles.some((f: any) => normNo(f.question_label ?? '') === normNo(n))).length > 0 && handFiles.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  손풀이가 아직 없는 변별문항: {discNos.filter((n) => !handFiles.some((f: any) => normNo(f.question_label ?? '') === normNo(n))).map(noLabel).join(', ')}
                </p>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ───────── 총평 ───────── */}
      {tab === 2 && (
        <Card title="시험 총평">
          <div className="grid gap-3 lg:grid-cols-2 text-sm">
            <Field label="전체 난이도">
              <select className={INPUT} value={paper.review_difficulty ?? ''} onChange={(e) => saveNow({ review_difficulty: e.target.value || null })}>
                <option value="">고르기</option>
                {REVIEW_DIFFICULTIES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="변별문항 번호"><div className="py-2">{discNos.length ? discNos.map(noLabel).join(', ') : <span className="text-gray-400">「정답 · 변별 · 손풀이」 탭에서 고릅니다</span>}</div></Field>
            <Field label="주요 출제 단원"><textarea className={INPUT} rows={3} value={val('review_units')} onChange={(e) => set('review_units', e.target.value)} /></Field>
            <Field label="까다로웠던 유형"><textarea className={INPUT} rows={3} value={val('review_hard_types')} onChange={(e) => set('review_hard_types', e.target.value)} /></Field>
            <Field label="학생들이 실수하기 쉬운 부분"><textarea className={INPUT} rows={3} value={val('review_mistakes')} onChange={(e) => set('review_mistakes', e.target.value)} /></Field>
            <Field label="다음 시험 대비 포인트"><textarea className={INPUT} rows={3} value={val('review_next_points')} onChange={(e) => set('review_next_points', e.target.value)} /></Field>
            <Field label="블로그용 요약문" wide><textarea className={INPUT} rows={5} value={val('review_blog_summary')} onChange={(e) => set('review_blog_summary', e.target.value)} /></Field>
          </div>
          <div className="mt-3 text-right">{saveBtn(['review_units', 'review_hard_types', 'review_mistakes', 'review_next_points', 'review_blog_summary'])}</div>
        </Card>
      )}

      {/* ───────── 기출문제 → 문제은행 ───────── */}
      {tab === 3 && <QuestionsTab paper={paper} questions={data.questions} isAdmin={isAdmin} reload={load} />}

      {/* ───────── 이너프원 매칭 ───────── */}
      {tab === 4 && (
        <MatchTab paper={paper} data={data} isAdmin={isAdmin} reload={load} onStatus={(s) => saveNow({ match_status: s })} />
      )}

      {/* ───────── 블로그 ───────── */}
      {tab === 5 && (
        <Card title="블로그 업로드">
          <BlogCards paperId={id} paperName={`${paper.school_name}_${paper.grade}`} isAdmin={isAdmin} tasks={tasks} onSaved={load} />
          {!isAdmin && <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">블로그 상태는 원장님(윤T)만 바꿀 수 있습니다.</p>}
          {/* 원장: 블로그 글 요청. 누르면 「작성중」이 되고 요청 시각이 남는다 → Claude 가 이 표시를 보고
              시험분석 카드(scripts/exam-blog)와 글을 만들어 네이버 블로그에 임시저장한다 */}
          {isAdmin && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: '#9FE1CB', background: '#F0FBF7' }}>
              <button
                onClick={() => {
                  if (!confirm('이 시험의 블로그 글 작성을 요청할까요?\n누른 뒤 Claude 에게 「블로그 요청 처리해줘」라고 하면\n시험분석 카드와 글을 만들어 네이버 블로그에 임시저장합니다. (발행은 원장님이 직접)')) return
                  saveNow({ blog_status: '작성중', tasks: { ...tasks, blog_requested_at: new Date().toISOString() } })
                }}
                disabled={paper.blog_status === '업로드완료'}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
                <i className="ti ti-pencil mr-1.5" />블로그 글 작성 요청
              </button>
              {(() => {
                const at = (ts: string) => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                const req = tasks.blog_requested_at, ok = tasks.blog_drafted_at, ng = tasks.blog_failed_at
                if (!req) return <span className="text-xs text-gray-600">변별문항 손풀이 · 총평이 채워진 뒤에 누르고, Claude 에게 「블로그 요청 처리해줘」라고 하세요.</span>
                if (ok && ok > req) return <span className="text-xs font-semibold" style={{ color: GREEN }}><i className="ti ti-circle-check mr-1" />{at(ok)} · {tasks.blog_auto_note || '네이버에 임시저장했습니다. 확인하고 발행해 주세요.'}</span>
                if (ng && ng > req) return <span className="text-xs font-semibold text-red-600"><i className="ti ti-alert-triangle mr-1" />{at(ng)} 못 썼습니다 — {tasks.blog_auto_note} (채운 뒤 다시 눌러 주세요)</span>
                return <span className="text-xs text-gray-600">요청함: {at(req)} · Claude 에게 「블로그 요청 처리해줘」라고 하면 임시저장까지 합니다</span>
              })()}
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2 text-sm">
            <Field label="상태">
              <select className={INPUT} disabled={!isAdmin} value={paper.blog_status} onChange={(e) => saveNow({ blog_status: e.target.value })}>
                {['대기', '작성중', '업로드완료'].map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="업로드 시작 예정"><input type="date" className={INPUT} disabled={!isAdmin} value={val('blog_from_date')} onChange={(e) => set('blog_from_date', e.target.value)} /></Field>
            <Field label="블로그 주소"><input className={INPUT} disabled={!isAdmin} value={val('blog_url')} onChange={(e) => set('blog_url', e.target.value)} placeholder="https://blog.naver.com/…" /></Field>
            <Field label="올린 날"><input type="date" className={INPUT} disabled={!isAdmin} value={val('blog_uploaded_on')} onChange={(e) => set('blog_uploaded_on', e.target.value)} /></Field>
            <Field label="메모" wide><textarea className={INPUT} rows={3} disabled={!isAdmin} value={val('blog_note')} onChange={(e) => set('blog_note', e.target.value)} /></Field>
          </div>
          {isAdmin && <div className="mt-3 text-right">{saveBtn(['blog_from_date', 'blog_url', 'blog_uploaded_on', 'blog_note'])}</div>}

          <div className="mt-5 border-t pt-4 text-sm">
            <p className="mb-2 text-xs font-bold" style={{ color: GREEN }}>블로그에 쓸 자료</p>
            <ul className="space-y-1 text-gray-600">
              <li>총평 요약문: {paper.review_blog_summary ? '작성됨' : <span className="text-gray-400">없음</span>}</li>
              <li>손풀이 이미지: {handFiles.length}장</li>
              <li>블로그에 쓰기로 한 이너프원 매칭: {data.matches.filter((m: any) => m.use_in_blog).length}건</li>
            </ul>
          </div>
        </Card>
      )}
      {importSrc && (
        <PdfImportDialog paperId={id} source={importSrc} existing={(data.questions ?? []).length}
          onClose={() => setImportSrc(null)} onDone={load} />
      )}
    </Shell>
  )
}

// ───────────────────────── 이너프원 매칭 ─────────────────────────
function MatchTab({ paper, data, isAdmin, reload, onStatus }: { paper: any; data: any; isAdmin: boolean; reload: () => void; onStatus: (s: string) => void }) {
  const blank = { question_no: '', enough_book: '', enough_unit: '', enough_problem_no: '', match_level: '유형 유사', memo: '' }
  const [m, setM] = useState<any>(blank)
  // 이너프원 진도표에 있는 이 학교·학년 교재의 단원 이름
  const units = useMemo(
    () => Array.from(new Set((data.enough ?? []).map((e: any) => [e.unit_name, e.sub_unit_name].filter(Boolean).join(' > ')))).filter(Boolean) as string[],
    [data.enough]
  )
  const books = useMemo(
    () => Array.from(new Set((data.enough ?? []).map((e: any) => `이너프원 ${paper.school_name} ${paper.grade} (${e.level})`))) as string[],
    [data.enough, paper]
  )
  const hit = useMemo(
    () => hitSummary(paper.answers_text, data.questions.map((x: any) => x.question_no), data.matches),
    [paper.answers_text, data.questions, data.matches]
  )
  const add = async () => {
    if (!m.question_no) { alert('기출 문항번호를 적어 주세요.'); return }
    const q = data.questions.find((x: any) => normNo(x.question_no) === normNo(m.question_no))
    const r = await post({ action: 'saveMatch', paperId: paper.id, match: { ...m, question_no: normNo(m.question_no), question_id: q?.id ?? null } })
    if (!r.ok) { alert(r.error); return }
    setM({ ...blank, enough_book: m.enough_book })
    reload()
  }
  const toggleBlog = async (row: any) => {
    const r = await post({ action: 'saveMatch', paperId: paper.id, match: { id: row.id, use_in_blog: !row.use_in_blog } })
    if (!r.ok) alert(r.error)
    reload()
  }
  // 원장: 「블로그 사용」을 한꺼번에 — 전체를 켜고 아닌 것만 끄는 쪽이 빠르다
  const bulkBlog = async (mode: 'all' | 'strong' | 'none') => {
    const r = await post({ action: 'bulkBlogUse', paperId: paper.id, mode })
    if (!r.ok) alert(r.error)
    reload()
  }
  const remove = async (row: any) => {
    if (!confirm('이 매칭 기록을 지울까요?')) return
    const r = await post({ action: 'deleteMatch', id: row.id })
    if (!r.ok) alert(r.error)
    reload()
  }
  return (
    <Card title="이너프원 교재 매칭"
      right={
        <select className="rounded-lg border px-2 py-1 text-xs" value={paper.match_status} onChange={(e) => onStatus(e.target.value)}>
          {['대기', '진행중', '완료'].map((x) => <option key={x}>{x}</option>)}
        </select>
      }>
      {/* 원장: 적중 대조는 Claude 에게 맡긴다 (서버가 AI 를 부르는 「AI 적중 대조」 버튼은 사용료 때문에 숨겼다 — components/exam-analysis/AutoMatch.tsx 는 남아 있다) */}
      {isAdmin && (
        <ClaudeRequest paperId={paper.id} tasks={paper.tasks} kind="match" label="적중 대조 요청" onSaved={reload}
          blocked={(data.questions ?? []).some((q: any) => q.problem_id) ? undefined : '먼저 「기본 · 파일」에서 PDF 의 「문항 넣기」를 해 주세요.'}
          hint="기출 문항을 이너프원 교재와 대조해 적중률을 채웁니다. 요청을 남기고 Claude 에게 「요청 처리해줘」라고 하세요." />
      )}
      {/* 적중률 — 유형 유사 이상이 있는 문항 ÷ 전체 문항 */}
      <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: '#F0FBF7' }}>
        {hit.total ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-2xl font-bold" style={{ color: GREEN }}>적중률 {hit.rate}%</span>
              <span className="text-gray-600">전체 {hit.total}문항 중 {hit.hit}문항 적중</span>
              <span className="text-xs text-gray-500">
                {MATCH_LEVELS.map((lv) => `${lv} ${hit.byLevel[lv] ?? 0}`).join(' · ')}
              </span>
              {paper.match_status !== '완료' && <span className="text-xs text-amber-700">대조 작업 중 — 끝나면 오른쪽 위를 「완료」로 바꿔 주세요</span>}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              적중 기준: {HIT_LEVELS.join(' · ')} (참고는 세지 않음). 한 문항에 여러 개를 적으면 가장 가까운 것 하나로 셉니다.
            </p>
            {!!hit.missNos.length && <p className="mt-1 text-xs text-gray-500">아직 적중이 없는 문항: {hit.missNos.map(noLabel).join(', ')}</p>}
            {!!hit.strayNos.length && <p className="mt-1 text-xs text-amber-700">정답표에 없는 번호로 적힌 매칭: {hit.strayNos.map(noLabel).join(', ')} (번호를 확인해 주세요)</p>}
          </>
        ) : (
          <p className="text-gray-500">전체 문항 수를 알 수 없어 적중률을 낼 수 없습니다. 「정답 · 변별 · 손풀이」 탭에 정답표를 넣으면 계산됩니다.</p>
        )}
      </div>

      <div className="mb-4 grid gap-2 text-sm lg:grid-cols-[90px_1fr_1fr_110px_120px_1fr_auto] items-end">
        <Field label="기출 문항"><input className={INPUT} value={m.question_no} onChange={(e) => setM({ ...m, question_no: e.target.value })} placeholder="18" /></Field>
        <Field label="이너프원 교재명">
          <input className={INPUT} list="ea-books" value={m.enough_book} onChange={(e) => setM({ ...m, enough_book: e.target.value })} />
          <datalist id="ea-books">{books.map((b) => <option key={b} value={b} />)}</datalist>
        </Field>
        <Field label="이너프원 단원명">
          <input className={INPUT} list="ea-units" value={m.enough_unit} onChange={(e) => setM({ ...m, enough_unit: e.target.value })} />
          <datalist id="ea-units">{units.map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <Field label="이너프원 문항번호"><input className={INPUT} value={m.enough_problem_no} onChange={(e) => setM({ ...m, enough_problem_no: e.target.value })} /></Field>
        <Field label="매칭 정도">
          <select className={INPUT} value={m.match_level} onChange={(e) => setM({ ...m, match_level: e.target.value })}>
            {MATCH_LEVELS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="분석 메모"><input className={INPUT} value={m.memo} onChange={(e) => setM({ ...m, memo: e.target.value })} /></Field>
        <button onClick={add} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: GREEN }}>추가</button>
      </div>

      {/* 기출 문항 ↔ 이너프원 문항을 그림으로 나란히 */}
      {!!data.matches.length && (
        <div className="mb-5 space-y-3">
          {Array.from(new Set(data.matches.map((x: any) => normNo(x.question_no ?? '')))).filter(Boolean)
            .sort((a: any, b: any) => (Number(a) || 999) - (Number(b) || 999) || String(a).localeCompare(String(b)))
            .map((no: any) => {
              const q = data.questions.find((x: any) => normNo(x.question_no) === no)
              const rows = data.matches.filter((x: any) => normNo(x.question_no ?? '') === no)
                .sort((a: any, b: any) => MATCH_LEVELS.indexOf(a.match_level) - MATCH_LEVELS.indexOf(b.match_level))
              const best = hit.best[no]
              return (
                <div key={no} className="rounded-xl border p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm">
                    <span className="font-bold" style={{ color: GREEN }}>기출 {noLabel(no)}</span>
                    <LevelChip level={best} />
                    {!HIT_LEVELS.includes(best) && <span className="text-xs text-gray-400">적중으로 세지 않음</span>}
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    <div className="w-[300px] shrink-0">
                      <p className="mb-1 text-[11px] font-semibold text-gray-500">기출 문항</p>
                      {q?.figure_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <a href={q.figure_url} target="_blank" rel="noreferrer"><img src={q.figure_url} alt={`기출 ${no}번`} className="w-full rounded border bg-white" /></a>
                        : <p className="rounded border bg-gray-50 p-4 text-center text-xs text-gray-400">기출 그림 없음</p>}
                    </div>
                    {rows.map((row: any) => (
                      <div key={row.id} className="w-[300px] shrink-0">
                        <div className="mb-1 flex items-center gap-1.5 text-[11px]">
                          <LevelChip level={row.match_level} />
                          <span className="min-w-0 truncate font-semibold text-gray-600" title={`${row.enough_book} · ${row.enough_unit} · ${row.enough_problem_no}번`}>
                            {row.enough_unit} {row.enough_problem_no}번
                          </span>
                          <label className="ml-auto flex shrink-0 items-center gap-1 text-gray-500" title={isAdmin ? '블로그에 쓸 문항' : '원장님만 정할 수 있습니다'}>
                            <input type="checkbox" checked={!!row.use_in_blog} disabled={!isAdmin} onChange={() => toggleBlog(row)} />블로그
                          </label>
                        </div>
                        {row.enough_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <a href={row.enough_url} target="_blank" rel="noreferrer"><img src={row.enough_url} alt={`이너프원 ${row.enough_problem_no}번`} className="w-full rounded border bg-white" /></a>
                          : <p className="rounded border bg-gray-50 p-4 text-center text-xs text-gray-400">이너프원 그림 없음<br />(교재명 · 단원 · 번호가 목록과 같아야 연결됩니다)</p>}
                        <p className="mt-1 text-[11px] leading-snug text-gray-500">
                          {row.enough_book}{row.enough_page ? ` · ${row.enough_page}쪽` : ''}{row.enough_twin ? ` · 쌍둥이 원본: ${row.enough_twin}` : ''}
                        </p>
                        {row.memo && <p className="mt-0.5 text-[11px] leading-snug text-gray-700">{row.memo}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {!data.matches.length ? <p className="py-6 text-center text-xs text-gray-400">아직 매칭 기록이 없습니다.</p> : (
        <div className="overflow-x-auto">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-gray-500">매칭 기록 전체 (표)</p>
            {isAdmin && (
              <span className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-gray-500">블로그 사용 {data.matches.filter((x: any) => x.use_in_blog).length} / {data.matches.length}건 ·</span>
                {([['all', '전체 선택'], ['strong', '쌍둥이 · 매우 유사만'], ['none', '모두 해제']] as const).map(([mode, label]) => (
                  <button key={mode} onClick={() => bulkBlog(mode)} className="rounded border px-2 py-0.5 font-semibold" style={{ borderColor: GREEN, color: GREEN }}>{label}</button>
                ))}
              </span>
            )}
          </div>
          {isAdmin && <p className="mb-1 text-[11px] text-gray-400">체크한 매칭 가운데 정도가 높은 5개까지 카드뉴스에 문항 사진으로 실립니다. 나머지는 매칭표(번호 칸)로만 나갑니다.</p>}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] text-gray-500">
              {['기출 문항', '이너프원 교재', '단원', '문항번호', '매칭 정도', '분석 메모'].map((h) => <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>)}
              <th className="px-2 py-2 font-semibold whitespace-nowrap">
                <label className="flex items-center gap-1">
                  {isAdmin && <input type="checkbox" title="전체 선택 / 해제"
                    checked={data.matches.length > 0 && data.matches.every((x: any) => x.use_in_blog)}
                    onChange={(e) => bulkBlog(e.target.checked ? 'all' : 'none')} />}
                  블로그 사용
                </label>
              </th>
              {['입력', ''].map((h) => <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {data.matches.map((row: any) => (
                <tr key={row.id} className="border-t">
                  <td className="px-2 py-2 font-semibold" style={{ color: GREEN }}>{noLabel(row.question_no ?? '')}{!row.question_id && <span className="ml-1 text-[10px] font-normal text-gray-400">(미입력 문항)</span>}</td>
                  <td className="px-2 py-2">{row.enough_book}</td>
                  <td className="px-2 py-2">{row.enough_unit}</td>
                  <td className="px-2 py-2">{row.enough_problem_no}</td>
                  <td className="px-2 py-2">{row.match_level}</td>
                  <td className="px-2 py-2 text-gray-600">{row.memo}</td>
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={!!row.use_in_blog} disabled={!isAdmin} onChange={() => toggleBlog(row)} title={isAdmin ? '' : '원장님만 정할 수 있습니다'} />
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-400">{row.created_by}</td>
                  <td className="px-2 py-2"><button onClick={() => remove(row)} className="text-gray-400 hover:text-red-600"><i className="ti ti-trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ───────────────────────── 작은 부품 ─────────────────────────
function LevelChip({ level }: { level?: string }) {
  const style: Record<string, any> = {
    쌍둥이: { background: '#085041', color: '#fff' },
    '매우 유사': { background: '#9FE1CB', color: '#085041' },
    '유형 유사': { background: '#E1F5EE', color: '#085041' },
    참고: { background: '#f3f4f6', color: '#6b7280' },
  }
  if (!level) return null
  return <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={style[level] ?? style['참고']}>{level}</span>
}

function DiscEditor({ nos, onChange }: { nos: string[]; onChange: (nos: string[]) => void }) {
  const [v, setV] = useState('')
  const add = () => {
    const n = normNo(v)
    if (!n || nos.includes(n)) { setV(''); return }
    onChange([...nos, n])
    setV('')
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {nos.map((n) => (
        <span key={n} className="flex items-center gap-1 rounded-full px-3 py-1 font-semibold" style={{ background: '#E1F5EE', color: GREEN }}>
          {noLabel(n)}
          <button onClick={() => onChange(nos.filter((x) => x !== n))} className="text-xs opacity-60 hover:opacity-100">✕</button>
        </span>
      ))}
      <input className="w-28 rounded-lg border px-2 py-1 text-sm" value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') add() }} placeholder="18 / 서술형2" />
      <button onClick={add} className="rounded-lg border px-3 py-1 text-xs font-semibold" style={{ borderColor: GREEN, color: GREEN }}>추가</button>
    </div>
  )
}

function FileDrop({ accept, onFiles, label }: { accept: string; onFiles: (f: FileList | null) => void; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <input ref={ref} type="file" multiple accept={accept} className="hidden"
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      <button onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files) }}
        className="w-full rounded-xl border-2 border-dashed px-4 py-5 text-sm font-semibold transition hover:bg-gray-50"
        style={{ borderColor: '#9FE1CB', color: GREEN }}>
        <i className="ti ti-upload mr-1.5" />{label} <span className="font-normal text-gray-400">(끌어다 놓아도 됩니다)</span>
      </button>
    </>
  )
}

// 내려받는 주소: 임시 주소 뒤에 download= 를 붙이면 화면에 보이는 한글 파일명 그대로 저장된다
const downloadUrl = (f: any) => (f.url ? `${f.url}&download=${encodeURIComponent(f.file_name)}` : '#')

function FileList({ files, onRemove, onKind, onImport, empty }: { files: any[]; onRemove: (f: any) => void; onKind?: (f: any, kind: string) => void; onImport?: (f: any) => void; empty: string }) {
  if (!files.length) return <p className="mt-3 text-center text-xs text-gray-400">{empty}</p>
  return (
    <ul className="mt-3 divide-y text-sm">
      {FILE_KINDS.flatMap((k) => files.filter((f) => f.kind === k)).map((f) => (
        <li key={f.id} className="flex items-center gap-2 py-2">
          <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: '#E1F5EE', color: GREEN }}>{f.kind}</span>
          <a href={f.url ?? '#'} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{f.file_name}</a>
          {!f.name_ok && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">파일명 확인</span>}
          <span className="text-xs text-gray-400">{f.uploaded_by}</span>
          {onKind && (
            <select value={f.kind} onChange={(e) => onKind(f, e.target.value)} title="종류 바꾸기 (원장님만)"
              className="rounded border px-1 py-0.5 text-[11px] text-gray-600">
              {['문제', '정답', '해설', '문제정답해설', '원본'].filter((k) => k === '원본' || /\.pdf$/i.test(f.file_name)).map((k) => <option key={k}>{k}</option>)}
            </select>
          )}
          {onImport && f.url && /\.pdf$/i.test(f.file_name) && (f.kind === '문제' || f.kind === '문제정답해설') && (
            <button onClick={() => onImport(f)} title="이 PDF 를 문항별로 잘라 문제은행에 넣습니다"
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-white" style={{ background: GREEN }}>
              <i className="ti ti-scissors" />문항 넣기
            </button>
          )}
          <a href={downloadUrl(f)} title="내려받기" className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold"
            style={{ borderColor: GREEN, color: GREEN }}>
            <i className="ti ti-download" />다운로드
          </a>
          <button onClick={() => onRemove(f)} className="text-gray-400 hover:text-red-600"><i className="ti ti-trash" /></button>
        </li>
      ))}
    </ul>
  )
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={title} subtitle={subtitle} showBack />
      <div className="max-w-[1400px] mx-auto px-4 py-5">{children}</div>
    </div>
  )
}
