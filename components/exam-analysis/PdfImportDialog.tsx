'use client'
// 원장: 올린 시험지 PDF(한글 → PDF)를 그 자리에서 문항별로 잘라 문제은행에 넣는다.
//   자르기 = lib/examPdfCrop.ts (브라우저 안에서, AI 없이 규칙대로)
//   넣기   = /api/exam-analysis  importPdfQuestion(문항마다) → importPdfFinish(통째 인쇄용 학습지 · 정답표)
// 배점이 수식으로 찍혀 안 읽힌 문항만 여기서 숫자를 적는다. 같은 시험을 다시 넣으면 같은 번호를 고칠 뿐 새로 넣지 않는다.
import { useEffect, useRef, useState } from 'react'
import { cropExamPdf, toPngBase64, type CroppedProblem } from '@/lib/examPdfCrop'
import { GREEN, post } from './ui'

type Row = CroppedProblem & { pointsText: string; answerText: string; isEssay: boolean; url: string; answerUrl: string | null }

export default function PdfImportDialog({ paperId, source, existing, onClose, onDone }: {
  paperId: string
  source: { name: string; data?: ArrayBuffer; url?: string }
  existing: number                       // 이미 들어 있는 문항 수
  onClose: () => void
  onDone: () => void
}) {
  const [stage, setStage] = useState<'crop' | 'review' | 'save' | 'done' | 'error'>('crop')
  const [msg, setMsg] = useState('PDF 를 읽는 중…')
  const [rows, setRows] = useState<Row[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [pages, setPages] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        const data = source.data ?? await (await fetch(source.url!)).arrayBuffer()
        const r = await cropExamPdf(data, (p, n) => setMsg(`문항을 자르는 중… ${p} / ${n}쪽`))
        setPages(r.pages)
        setWarnings(r.warnings)
        setRows(r.problems.map((p) => ({
          ...p, pointsText: p.points ? String(p.points) : '', answerText: p.answer ?? '', isEssay: p.essay,
          url: p.image.toDataURL('image/png'), answerUrl: p.answerImage ? p.answerImage.toDataURL('image/png') : null,
        })))
        setStage(r.problems.length ? 'review' : 'error')
        if (!r.problems.length) setMsg(r.warnings[0] ?? '문항을 찾지 못했습니다.')
      } catch (e: any) {
        setStage('error'); setMsg(`PDF 를 읽지 못했습니다: ${e?.message ?? e}`)
      }
    })()
  }, [source])

  const total = rows.reduce((a, r) => a + (Number(r.pointsText) || 0), 0)
  const noPoints = rows.filter((r) => !(Number(r.pointsText) > 0)).map((r) => r.no)
  const noAnswer = rows.filter((r) => !r.answerText.trim()).map((r) => r.no)
  const set = (no: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.no === no ? { ...r, ...patch } : r)))

  const save = async () => {
    if (noPoints.length && !confirm(`배점이 비어 있는 문항이 있습니다: ${noPoints.join(', ')}번\n그대로 넣을까요? (나중에 다시 넣어 고칠 수 있습니다)`)) return
    setStage('save')
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      setMsg(`문제은행에 넣는 중… ${i + 1} / ${rows.length}`)
      const res = await post({
        action: 'importPdfQuestion', paperId, no: r.no, points: Number(r.pointsText) || null, essay: r.isEssay,
        answer: r.answerText.trim() || null, image: toPngBase64(r.image, true),
        answerImage: r.answerImage ? toPngBase64(r.answerImage) : null, pdfName: source.name,
      })
      if (!res.ok) { setStage('error'); setMsg(`${r.no}번에서 멈췄습니다: ${res.error ?? '알 수 없는 오류'}\n(앞 문항까지는 들어갔습니다. 다시 눌러도 겹치지 않습니다)`); return }
    }
    setMsg('마무리하는 중…')
    const fin = await post({ action: 'importPdfFinish', paperId })
    if (!fin.ok) { setStage('error'); setMsg(`문항은 들어갔지만 인쇄용 시험지를 만들지 못했습니다: ${fin.error}`); return }
    setStage('done')
    setMsg(`${rows.length}문항을 넣었습니다. 통째 인쇄와 적중 대조를 할 수 있습니다.`)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <div className="text-base font-bold" style={{ color: GREEN }}>PDF 에서 문항 넣기</div>
            <div className="text-xs text-gray-500">{source.name}</div>
          </div>
          {stage !== 'save' && <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><i className="ti ti-x text-xl" /></button>}
        </div>

        {(stage === 'crop' || stage === 'save') && <div className="px-5 py-16 text-center text-sm text-gray-600"><i className="ti ti-loader-2 mr-2 animate-spin" />{msg}<div className="mt-2 text-xs text-gray-400">이 창을 닫지 말고 잠시 기다려 주세요.</div></div>}
        {stage === 'error' && <div className="whitespace-pre-line px-5 py-12 text-center text-sm text-red-600">{msg}</div>}
        {stage === 'done' && (
          <div className="px-5 py-12 text-center">
            <div className="text-sm font-semibold" style={{ color: GREEN }}><i className="ti ti-circle-check mr-1" />{msg}</div>
            <button onClick={onClose} className="mt-5 rounded-lg px-5 py-2 text-sm font-semibold text-white" style={{ background: GREEN }}>닫기</button>
          </div>
        )}

        {stage === 'review' && (
          <>
            <div className="border-b px-5 py-3 text-sm">
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span><b>{rows.length}</b>문항 ({pages}쪽)</span>
                <span>배점 합계 <b className={total === 100 ? '' : 'text-red-600'}>{total}</b>점</span>
                <span>정답 <b>{rows.length - noAnswer.length}</b>개</span>
                <span>서술형 <b>{rows.filter((r) => r.isEssay).length}</b>개</span>
              </div>
              {warnings.map((w) => <div key={w} className="mt-1 text-xs font-semibold text-red-600"><i className="ti ti-alert-triangle mr-1" />{w}</div>)}
              {noPoints.length > 0 && <div className="mt-1 text-xs text-amber-700">배점을 읽지 못한 문항: <b>{noPoints.join(', ')}번</b> — 아래에서 숫자를 적어 주세요. (한글에서 배점을 수식으로 넣으면 글자로 안 읽힙니다)</div>}
              {noAnswer.length > 0 && <div className="mt-1 text-xs text-amber-700">정답이 없는 문항: {noAnswer.join(', ')}번 (PDF 마지막 쪽 정답표에 없습니다)</div>}
              {existing > 0 && <div className="mt-1 text-xs text-gray-500">이미 {existing}문항이 들어 있습니다. 같은 번호는 새로 넣지 않고 그림 · 정답 · 배점만 고칩니다.</div>}
            </div>
            <div className="flex-1 overflow-auto px-5 py-3">
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((r) => (
                  <div key={r.no} className="rounded-xl border p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <b className="w-9" style={{ color: GREEN }}>{r.no}번</b>
                      <label className="flex items-center gap-1 text-xs text-gray-600">배점
                        <input value={r.pointsText} onChange={(e) => set(r.no, { pointsText: e.target.value.replace(/[^\d.]/g, '') })}
                          className={`w-12 rounded border px-1.5 py-1 text-center text-sm ${Number(r.pointsText) > 0 ? '' : 'border-amber-400 bg-amber-50'}`} />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-600">정답
                        <input value={r.answerText} onChange={(e) => set(r.no, { answerText: e.target.value })}
                          className="w-28 rounded border px-1.5 py-1 text-sm" />
                      </label>
                      <label className="ml-auto flex items-center gap-1 text-xs text-gray-600">
                        <input type="checkbox" checked={r.isEssay} onChange={(e) => set(r.no, { isEssay: e.target.checked })} />서술형
                      </label>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt={`${r.no}번`} className="max-h-72 w-full rounded border object-contain object-top" />
                    {r.answerUrl && (
                      <div className="mt-2 rounded bg-gray-50 p-1.5">
                        <div className="text-[11px] text-gray-500">정답 그림 (수식이 빠지지 않게 그림으로도 넣습니다)</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.answerUrl} alt="정답" className="mt-1 w-full" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">취소</button>
              <button onClick={save} className="rounded-lg px-5 py-2 text-sm font-semibold text-white" style={{ background: GREEN }}>
                <i className="ti ti-database-import mr-1.5" />{rows.length}문항 문제은행에 넣기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
