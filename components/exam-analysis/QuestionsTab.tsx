'use client'
// 시험지 분석 — 기출문제 입력 탭.
// 타이핑한 문항을 저장하고(선생님), 원장이 「문제은행 반영」을 누르면 학습지 단 폭(87mm) 200dpi 그림으로
// 구워 problems 에 넣는다. 그 뒤로는 교재 문항과 똑같이 학습지 출제·QR 채점·재출제에 쓰인다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { supabase } from '@/lib/supabase'
import { CIRCLES, Q_TYPES, noLabel, normNo, parseBulk, sourceKey } from '@/lib/examAnalysis'
import { MathInput } from '@/components/grade/MathInput'
import { QuestionRender, SolutionRender, captureNode, expectedWidthPx } from './QuestionRender'
import { Card, Field, GREEN, INPUT, post } from './ui'

const BLANK = {
  id: null as string | null, question_no: '', q_type: '객관식', body: '', choices: ['', '', '', '', ''],
  answer: '', solution: '', unit_name: '', sub_unit_name: '', type_code: '', level: '' as any, difficulty: '',
  is_discriminating: false, source_memo: '', is_public: false, figure_path: null as string | null,
  figure_url: null as string | null, figure_is_whole: false, bank_status: '미반영', problem_id: null as number | null,
}

const STATUS_STYLE: Record<string, any> = {
  미반영: { background: '#f3f4f6', color: '#6b7280' },
  반영요청: { background: '#FEF3C7', color: '#92400E' },
  반영완료: { background: '#E1F5EE', color: GREEN },
}

const BULK_SAMPLE = `[문항 1]
유형: 객관식
단원:
세부단원:
난이도:
문제:
보기:
①
②
③
④
⑤
정답:
해설:

[문항 2]
유형: 서술형
단원:
세부단원:
난이도:
문제:
정답:
해설:`

export function QuestionsTab({ paper, questions, isAdmin, reload }: { paper: any; questions: any[]; isAdmin: boolean; reload: () => void }) {
  const [q, setQ] = useState<any>(null)            // 지금 고치는 문항
  const [types, setTypes] = useState<any[]>([])
  const [busy, setBusy] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [mathOpen, setMathOpen] = useState(false)
  const [latex, setLatex] = useState('')
  const qRef = useRef<HTMLDivElement | null>(null)
  const sRef = useRef<HTMLDivElement | null>(null)
  // 「수식 넣기」가 글자를 끼워 넣을 자리 (마지막으로 누른 칸)
  const focus = useRef<{ key: string; idx?: number; pos: number }>({ key: 'body', pos: 0 })

  useEffect(() => {
    apiFetch(`/api/exam-analysis?types=1&grade=${encodeURIComponent(paper.grade)}`)
      .then((r) => r.json()).then((j) => setTypes(j.types ?? [])).catch(() => {})
  }, [paper.grade])

  // 소단원별로 묶은 유형 목록
  const typeGroups = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const t of types) {
      const k = `${paper.grade}-${t.semester} ${t.sub_chapter_no}. ${t.sub_chapter_title}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    return Array.from(m.entries())
  }, [types, paper.grade])

  const open = (row: any) =>
    setQ({ ...BLANK, ...row, choices: [0, 1, 2, 3, 4].map((i) => row.choices?.[i] ?? ''), level: row.level ?? '', difficulty: row.difficulty ?? '', type_code: row.type_code ?? '' })
  const set = (k: string, v: any) => setQ((x: any) => ({ ...x, [k]: v }))
  const bulk = useMemo(() => (bulkText.trim() ? parseBulk(bulkText) : null), [bulkText])

  const payload = (x: any) => ({
    id: x.id, question_no: x.question_no, q_type: x.q_type, body: x.body,
    choices: x.q_type === '객관식' ? x.choices : [],
    answer: x.answer, solution: x.solution, unit_name: x.unit_name, sub_unit_name: x.sub_unit_name,
    type_code: x.type_code || null, level: x.level ? Number(x.level) : null, difficulty: x.difficulty || null,
    is_discriminating: !!x.is_discriminating, source_memo: x.source_memo, is_public: !!x.is_public,
    figure_path: x.figure_path, figure_is_whole: !!x.figure_is_whole,
  })

  // 저장. 같은 번호가 이미 있으면 물어보고 덮어쓴다
  const saveMany = async (items: any[]) => {
    let r = await post({ action: 'saveQuestions', paperId: paper.id, questions: items })
    if (r.status === 409) {
      if (!confirm(`${r.error}\n\n같은 문항(출처 열쇠가 같은 문항)이 이미 있습니다. 새 내용으로 덮어쓸까요?`)) return null
      r = await post({ action: 'saveQuestions', paperId: paper.id, questions: items, overwrite: true })
    }
    if (!r.ok) { alert(r.error ?? '저장하지 못했습니다.'); return null }
    return (r.ids ?? []) as string[]
  }
  const save = async () => {
    if (!normNo(q.question_no)) { alert('문항번호를 적어 주세요.'); return false }
    setBusy('저장 중…')
    const ids = await saveMany([payload(q)])
    setBusy('')
    if (!ids) return false
    // 새 문항이면 방금 생긴 id 를 붙여 둔다 (안 그러면 다시 저장할 때 또 「이미 있어요」가 뜬다)
    setQ((x: any) => ({ ...x, id: ids[0] ?? x.id, question_no: normNo(x.question_no) }))
    reload()
    return true
  }
  const saveBulk = async () => {
    if (!bulk?.questions.length) return
    setBusy('저장 중…')
    const ok = await saveMany(bulk.questions.map((x) => ({ ...x, choices: x.q_type === '객관식' ? x.choices : [] })))
    setBusy('')
    if (ok) { setBulkText(''); setBulkOpen(false); reload() }
  }

  const remove = async () => {
    if (!q?.id || !confirm(`${noLabel(q.question_no)} 문항을 지울까요? 되돌릴 수 없습니다.`)) return
    const r = await post({ action: 'deleteQuestion', id: q.id })
    if (!r.ok) { alert(r.error); return }
    setQ(null)
    reload()
  }

  // 문항 그림 올리기
  const uploadFigure = async (file: File | undefined) => {
    if (!file) return
    setBusy('그림 올리는 중…')
    const u = await post({ action: 'uploadUrl', paperId: paper.id, fileName: file.name })
    if (!u.ok) { setBusy(''); alert(u.error); return }
    const { error } = await supabase.storage.from('exam-analysis').uploadToSignedUrl(u.path, u.token, file, { contentType: file.type })
    setBusy('')
    if (error) { alert(`올리지 못했습니다: ${error.message}`); return }
    setQ((x: any) => ({ ...x, figure_path: u.path, figure_url: URL.createObjectURL(file) }))
  }

  // 수식 끼워 넣기
  const insertMath = () => {
    if (!latex.trim()) { setMathOpen(false); return }
    const f = focus.current
    const piece = `$${latex}$`
    setQ((x: any) => {
      const cur: string = f.key === 'choices' ? x.choices[f.idx ?? 0] : x[f.key] ?? ''
      const pos = Math.min(f.pos, cur.length)
      const next = cur.slice(0, pos) + piece + cur.slice(pos)
      if (f.key === 'choices') { const c = [...x.choices]; c[f.idx ?? 0] = next; return { ...x, choices: c } }
      return { ...x, [f.key]: next }
    })
    setLatex('')
    setMathOpen(false)
  }
  const track = (key: string, idx?: number) => ({
    onSelect: (e: any) => { focus.current = { key, idx, pos: e.target.selectionStart ?? 0 } },
    onFocus: (e: any) => { focus.current = { key, idx, pos: e.target.selectionStart ?? 0 } },
  })

  const requestReflect = async (on: boolean) => {
    if (!(await save())) return
    const r = await post({ action: 'requestReflect', id: q.id, on })
    if (!r.ok) { alert(r.error); return }
    setQ((x: any) => ({ ...x, bank_status: on ? '반영요청' : '미반영' }))
    reload()
  }

  // 원장: 문제은행 반영 — 먼저 저장하고, 미리보기를 그림으로 구워 보낸다
  const reflect = async () => {
    if (!q?.id) { alert('먼저 저장해 주세요.'); return }
    if (!q.type_code) { alert('유형을 골라 주세요. 유형이 있어야 학습지 출제에서 뽑힙니다.'); return }
    if (!q.level) { alert('레벨(1~6)을 골라 주세요.'); return }
    if (!q.figure_is_whole && !String(q.body ?? '').trim()) { alert('문제 본문이 비어 있습니다.'); return }
    if (/^\[.*입력 예정\]$/.test(String(q.body ?? '').trim())) { alert('본문이 아직 자리표시(입력 예정)입니다. 실제 문제를 넣은 뒤 반영해 주세요.'); return }
    const again = q.bank_status === '반영완료'
    if (!confirm(again
      ? `${noLabel(q.question_no)} 문항은 이미 문제은행에 있습니다. 지금 내용으로 고쳐 넣을까요?\n(새로 추가되지 않고 같은 문항이 바뀝니다)`
      : `${noLabel(q.question_no)} 문항을 문제은행에 넣을까요?\n넣은 뒤에는 학습지 자동 출제에도 뽑힙니다.`)) return
    if (!(await saveMany([payload(q)]))) return
    setBusy('문제 그림 만드는 중…')
    try {
      await new Promise((r) => setTimeout(r, 300))            // 방금 고친 내용이 미리보기에 그려질 틈
      const shot = await captureNode(qRef.current!)
      if (shot.width !== expectedWidthPx()) throw new Error(`그림 폭이 맞지 않습니다 (${shot.width}px, 기준 ${expectedWidthPx()}px).`)
      if (shot.clipped) throw new Error('문제가 너무 길어 그림 아래가 잘렸습니다. 본문을 줄이거나 둘로 나눠 주세요.')
      const sol = String(q.solution ?? '').trim() && sRef.current ? await captureNode(sRef.current) : null
      setBusy('문제은행에 넣는 중…')
      const r = await post({ action: 'reflect', id: q.id, image: shot.dataUrl, solutionImage: sol?.dataUrl ?? null })
      if (!r.ok) throw new Error(r.error ?? '반영하지 못했습니다.')
      alert(r.updated ? '문제은행의 같은 문항을 고쳤습니다.' : '문제은행에 넣었습니다.')
      setQ((x: any) => ({ ...x, bank_status: '반영완료', problem_id: r.problemId }))
      reload()
    } catch (e: any) {
      alert(e.message)
    }
    setBusy('')
  }

  const pickType = (code: string) => {
    const t = types.find((x) => x.code === code)
    setQ((x: any) => ({
      ...x, type_code: code,
      unit_name: x.unit_name || t?.chapter_title || '',
      sub_unit_name: x.sub_unit_name || t?.sub_chapter_title || '',
    }))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* 문항 목록 */}
      <Card title={`기출문항 ${questions.length}개`}>
        <div className="mb-3 flex gap-2">
          <button onClick={() => setQ({ ...BLANK })} className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white" style={{ background: GREEN }}>+ 문항 추가</button>
          <button onClick={() => setBulkOpen((v) => !v)} className="flex-1 rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: GREEN, color: GREEN }}>한꺼번에 붙여넣기</button>
        </div>
        <ul className="space-y-1 text-sm">
          {questions.map((row) => (
            <li key={row.id}>
              <button onClick={() => open(row)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-gray-50"
                style={q?.id === row.id ? { background: '#E1F5EE' } : undefined}>
                <span className="w-14 shrink-0 font-bold" style={{ color: GREEN }}>{noLabel(row.question_no)}</span>
                <span className="text-xs text-gray-500">{row.q_type}</span>
                {row.is_discriminating && <span className="rounded bg-red-50 px-1 text-[10px] font-bold text-red-600">변별</span>}
                <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold" style={STATUS_STYLE[row.bank_status]}>{row.bank_status}</span>
              </button>
            </li>
          ))}
          {!questions.length && <li className="py-6 text-center text-xs text-gray-400">아직 입력한 문항이 없습니다.</li>}
        </ul>
      </Card>

      <div className="space-y-4">
        {/* 한꺼번에 붙여넣기 */}
        {bulkOpen && (
          <Card title="한꺼번에 붙여넣기" right={<button onClick={() => setBulkText(BULK_SAMPLE)} className="text-xs underline text-gray-500">양식 넣기</button>}>
            <p className="mb-2 text-xs text-gray-500">「[문항 1]」 로 시작하는 양식 그대로 붙여 넣으면 문항별로 나눠 저장합니다. 수식은 <code>$x^2$</code> 처럼 달러 기호 사이에 적습니다.</p>
            <textarea className={INPUT + ' font-mono'} rows={12} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={BULK_SAMPLE} />
            {bulk && (
              <div className="mt-2 text-xs">
                <p className="font-semibold" style={{ color: GREEN }}>{bulk.questions.length}문항을 읽었습니다: {bulk.questions.map((x) => noLabel(x.question_no)).join(', ')}</p>
                {bulk.warnings.map((w, i) => <p key={i} className="text-amber-700">· {w}</p>)}
              </div>
            )}
            <div className="mt-3 text-right">
              <button onClick={saveBulk} disabled={!bulk?.questions.length || !!busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
                {bulk?.questions.length ?? 0}문항 저장
              </button>
            </div>
          </Card>
        )}

        {/* 문항 한 개 고치기 */}
        {q && (
          <Card title={q.id ? `${noLabel(q.question_no)} 문항` : '새 문항'}
            right={<span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={STATUS_STYLE[q.bank_status]}>{q.bank_status}{q.problem_id ? ` · 문제은행 #${q.problem_id}` : ''}</span>}>
            <p className="mb-3 text-xs text-gray-500">
              {paper.school_name} · {paper.grade} · {paper.exam_name} · {paper.exam_year}년 {paper.term}학기 {paper.exam_type}
              {normNo(q.question_no) && <> · 출처 열쇠 <code>{sourceKey(paper, q.question_no)}</code></>}
            </p>
            <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
              <div className="grid grid-cols-2 gap-3 text-sm content-start">
                <Field label="문항번호"><input className={INPUT} value={q.question_no} onChange={(e) => set('question_no', e.target.value)} placeholder="18 / 서술형2" /></Field>
                <Field label="문항유형">
                  <select className={INPUT} value={q.q_type} onChange={(e) => set('q_type', e.target.value)}>{Q_TYPES.map((x) => <option key={x}>{x}</option>)}</select>
                </Field>
                <Field label="문제 본문" wide>
                  <textarea className={INPUT} rows={5} value={q.body ?? ''} onChange={(e) => set('body', e.target.value)} {...track('body')} disabled={q.figure_is_whole} />
                </Field>
                {q.q_type === '객관식' && !q.figure_is_whole && (
                  <Field label="보기" wide>
                    <div className="space-y-1.5">
                      {CIRCLES.map((c, i) => (
                        <div key={c} className="flex items-center gap-2">
                          <span className="w-5 text-center">{c}</span>
                          <input className={INPUT} value={q.choices[i]} {...track('choices', i)}
                            onChange={(e) => { const cs = [...q.choices]; cs[i] = e.target.value; set('choices', cs) }} />
                        </div>
                      ))}
                    </div>
                  </Field>
                )}
                <div className="col-span-full flex flex-wrap items-center gap-3 text-xs">
                  <button onClick={() => setMathOpen(true)} className="rounded-lg border px-3 py-1.5 font-semibold" style={{ borderColor: GREEN, color: GREEN }}>
                    <i className="ti ti-math-function mr-1" />수식 넣기
                  </button>
                  <label className="cursor-pointer rounded-lg border px-3 py-1.5 font-semibold" style={{ borderColor: GREEN, color: GREEN }}>
                    <i className="ti ti-photo mr-1" />그림 넣기
                    <input type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={(e) => { uploadFigure(e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                  {q.figure_path && (
                    <>
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" checked={!!q.figure_is_whole} onChange={(e) => set('figure_is_whole', e.target.checked)} />
                        이 그림이 문제 전체입니다 (본문 타이핑 대신 캡처 사용)
                      </label>
                      <button onClick={() => setQ((x: any) => ({ ...x, figure_path: null, figure_url: null, figure_is_whole: false }))} className="text-gray-400 underline">그림 빼기</button>
                    </>
                  )}
                </div>
                <Field label={q.q_type === '객관식' ? '정답 (예: ③ 또는 3)' : '정답'}><input className={INPUT} value={q.answer ?? ''} onChange={(e) => set('answer', e.target.value)} {...track('answer')} /></Field>
                <Field label="변별문항 · 공개">
                  <div className="flex items-center gap-4 py-2">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!q.is_discriminating} onChange={(e) => set('is_discriminating', e.target.checked)} />변별문항</label>
                    <label className="flex items-center gap-1.5" title="블로그 등 밖에 보여도 되는 문항"><input type="checkbox" checked={!!q.is_public} onChange={(e) => set('is_public', e.target.checked)} />공개 가능</label>
                  </div>
                </Field>
                <Field label="해설" wide><textarea className={INPUT} rows={4} value={q.solution ?? ''} onChange={(e) => set('solution', e.target.value)} {...track('solution')} /></Field>
                <Field label="문제은행 유형 (반영하려면 필요)" wide>
                  <select className={INPUT} value={q.type_code} onChange={(e) => pickType(e.target.value)}>
                    <option value="">고르기</option>
                    {typeGroups.map(([g, list]) => (
                      <optgroup key={g} label={g}>
                        {list.map((t) => <option key={t.code} value={t.code}>{t.type_no}. {t.type_title}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
                <Field label="단원명"><input className={INPUT} value={q.unit_name ?? ''} onChange={(e) => set('unit_name', e.target.value)} /></Field>
                <Field label="세부단원명"><input className={INPUT} value={q.sub_unit_name ?? ''} onChange={(e) => set('sub_unit_name', e.target.value)} /></Field>
                <Field label="레벨 (학원 공통 1~6)">
                  <select className={INPUT} value={q.level} onChange={(e) => set('level', e.target.value)}>
                    <option value="">고르기</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="난이도">
                  <select className={INPUT} value={q.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
                    <option value="">없음</option>{['하', '중', '상'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="출처 메모" wide><input className={INPUT} value={q.source_memo ?? ''} onChange={(e) => set('source_memo', e.target.value)} /></Field>
              </div>

              {/* 미리보기 = 학습지에 찍힐 모양 그대로 (이걸 그림으로 굽는다) */}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-gray-500">학습지에 찍힐 모양 (한 단 87mm)</p>
                <div className="inline-block rounded-lg border border-dashed border-gray-300 bg-white p-2">
                  <QuestionRender ref={qRef} q={q} />
                </div>
                {String(q.solution ?? '').trim() && (
                  <>
                    <p className="mb-1.5 mt-3 text-xs font-semibold text-gray-500">해설 (답지·해설지)</p>
                    <div className="inline-block rounded-lg border border-dashed border-gray-300 bg-white p-2">
                      <SolutionRender ref={sRef} text={q.solution} />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
              {busy && <span className="text-xs text-gray-400">{busy}</span>}
              {q.id && q.bank_status !== '반영완료' && (
                <button onClick={remove} className="text-xs text-gray-400 underline hover:text-red-600">문항 지우기</button>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={save} disabled={!!busy} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ borderColor: GREEN, color: GREEN }}>저장</button>
                {!isAdmin && q.bank_status !== '반영완료' && (
                  <button onClick={() => requestReflect(q.bank_status !== '반영요청')} disabled={!!busy || !q.id}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#B45309' }}>
                    {q.bank_status === '반영요청' ? '반영 요청 취소' : '문제은행 반영 요청'}
                  </button>
                )}
                {isAdmin && (
                  <button onClick={reflect} disabled={!!busy || !q.id} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
                    {q.bank_status === '반영완료' ? '문제은행 다시 반영' : '문제은행 반영'}
                  </button>
                )}
              </div>
            </div>
            {!isAdmin && <p className="mt-2 text-right text-[11px] text-gray-400">문제은행에 실제로 넣는 것은 원장님(윤T)이 합니다.</p>}
          </Card>
        )}
        {!q && !bulkOpen && <p className="rounded-xl border bg-white p-10 text-center text-sm text-gray-400">왼쪽에서 문항을 고르거나 「+ 문항 추가」를 눌러 주세요.</p>}
      </div>

      {/* 수식 넣기 */}
      {mathOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setMathOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-bold" style={{ color: GREEN }}>수식 넣기</p>
            <p className="mb-2 text-xs text-gray-500">수식을 만든 뒤 「넣기」를 누르면 마지막으로 누른 칸의 커서 자리에 들어갑니다.</p>
            <MathInput value={latex} onChange={setLatex} />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setMathOpen(false)} className="rounded-lg border px-4 py-2 text-sm">닫기</button>
              <button onClick={insertMath} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: GREEN }}>넣기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
