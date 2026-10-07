'use client'
// 지난 기출 파일 한꺼번에 올리기.
// 파일명을 맞출 필요가 없다 — 파일을 고르면 이름에서 연도 · 학기 · 시험 · 학교 · 학년 · 종류를 짐작해
// 칸을 채워 보여 주고, 틀린 칸만 고쳐서 올린다. 보관할 때의 파일명은 앱이 규칙대로 붙인다.
import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { EXAM_TYPES, SCHOOLS, guessExamFile, standardFileName } from '@/lib/examAnalysis'
import { GREEN, post } from './ui'

const KINDS = ['문제', '원본', '정답', '해설', '문제정답해설']
const ALL_GRADES = ['중1', '중2', '중3', '고1', '고2', '고3']
const CELL = 'rounded border px-1.5 py-1 text-xs'

type Row = { file: File; exam_year: string; term: string; exam_type: string; school_name: string; grade: string; kind: string; state: string }

export function BulkUploadDialog({ files, schools, onClose, onDone }: { files: File[]; schools: string[]; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => files.map((file) => {
    const g = guessExamFile(file.name)
    return { file, exam_year: g.exam_year ? String(g.exam_year) : '', term: g.term ? String(g.term) : '', exam_type: g.exam_type, school_name: g.school_name, grade: g.grade, kind: g.kind, state: '' }
  }))
  const [busy, setBusy] = useState(false)
  const schoolList = useMemo(() => Array.from(new Set([...SCHOOLS, ...schools])), [schools])
  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  // 위 줄의 값을 아래 빈칸에 채운다 (같은 시험 파일을 여러 개 올릴 때)
  const fillDown = () => setRows((rs) => rs.map((r, i) => {
    if (!i) return r
    const p = rs[0]
    return { ...r, exam_year: r.exam_year || p.exam_year, term: r.term || p.term, exam_type: r.exam_type || p.exam_type, school_name: r.school_name || p.school_name, grade: r.grade || p.grade }
  }))
  const missing = (r: Row) => !r.exam_year || !r.term || !r.exam_type || !r.school_name.trim() || !r.grade
  const nMissing = rows.filter((r) => r.state !== '올림' && missing(r)).length
  const nameOf = (r: Row) => missing(r) ? '' : standardFileName(
    { exam_year: Number(r.exam_year), term: Number(r.term), exam_type: r.exam_type, school_name: r.school_name.trim(), grade: r.grade }, r.kind, r.file.name)

  const run = async () => {
    setBusy(true)
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (r.state === '올림' || missing(r)) continue
      set(i, 'state', '올리는 중…')
      const key = { exam_year: Number(r.exam_year), term: Number(r.term), exam_type: r.exam_type, school_name: r.school_name.trim(), grade: r.grade }
      const made = await post({ action: 'createPaper', paper: key })          // 이미 있으면 409 와 함께 id 를 준다
      if (!made.id) { set(i, 'state', `실패: ${made.error ?? '시험 칸을 만들지 못함'}`); continue }
      const u = await post({ action: 'uploadUrl', paperId: made.id, fileName: r.file.name, kind: r.kind })
      if (!u.ok) { set(i, 'state', `실패: ${u.error}`); continue }
      const type = ['application/pdf', 'image/png', 'image/jpeg'].includes(r.file.type) ? r.file.type : 'application/octet-stream'
      const { error } = await supabase.storage.from('exam-analysis').uploadToSignedUrl(u.path, u.token, r.file, { contentType: type })
      if (error) { set(i, 'state', `실패: ${error.message}`); continue }
      const a = await post({ action: 'addFile', paperId: made.id, kind: r.kind, path: u.path, fileName: r.file.name, autoName: true, mimeType: type, fileSize: r.file.size })
      set(i, 'state', a.ok ? '올림' : `실패: ${a.error}`)
    }
    setBusy(false)
    onDone()
  }

  const allDone = rows.every((r) => r.state === '올림')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5">
        <div className="mb-1 flex items-center">
          <h2 className="text-base font-bold" style={{ color: GREEN }}>기출 파일 올리기 — {rows.length}개</h2>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700"><i className="ti ti-x text-lg" /></button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-gray-500">
          <b>파일명은 맞추지 않아도 됩니다.</b> 이름에서 읽은 내용을 아래 칸에 채웠습니다. 빨간 칸(못 읽은 곳)과 틀린 칸만 고쳐 주세요.
          보관할 때의 파일명은 규칙대로 자동으로 붙습니다. 없는 시험은 자동으로 만들어집니다.<br />
          종류 — <b>문제</b>: 한글로 작업한 시험지 PDF (인쇄 · 문제은행용) · <b>원본</b>: 학교 시험지 스캔본, 한글(HWP) 파일 (원장님만 열람)
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[11px] text-gray-500">
              {['올릴 파일', '연도', '학기', '시험', '학교', '학년', '종류', '보관될 이름', ''].map((h) => <th key={h} className="px-1.5 py-1.5 font-semibold whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const red = (v: string) => (v ? {} : { borderColor: '#dc2626', background: '#FEF2F2' })
                const lock = busy || r.state === '올림'
                return (
                  <tr key={i} className="border-t align-middle">
                    <td className="max-w-[220px] truncate px-1.5 py-1.5" title={r.file.name}>{r.file.name}</td>
                    <td className="px-1 py-1"><input disabled={lock} className={CELL + ' w-16'} style={red(r.exam_year)} value={r.exam_year} onChange={(e) => set(i, 'exam_year', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2026" /></td>
                    <td className="px-1 py-1">
                      <select disabled={lock} className={CELL} style={red(r.term)} value={r.term} onChange={(e) => set(i, 'term', e.target.value)}>
                        <option value="">?</option><option value="1">1학기</option><option value="2">2학기</option>
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select disabled={lock} className={CELL} style={red(r.exam_type)} value={r.exam_type} onChange={(e) => set(i, 'exam_type', e.target.value)}>
                        <option value="">?</option>{EXAM_TYPES.map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input disabled={lock} list="bulk-schools" className={CELL + ' w-24'} style={red(r.school_name)} value={r.school_name} onChange={(e) => set(i, 'school_name', e.target.value)} placeholder="도래울중" />
                    </td>
                    <td className="px-1 py-1">
                      <select disabled={lock} className={CELL} style={red(r.grade)} value={r.grade} onChange={(e) => set(i, 'grade', e.target.value)}>
                        <option value="">?</option>{ALL_GRADES.map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select disabled={lock} className={CELL} value={r.kind} onChange={(e) => set(i, 'kind', e.target.value)}>
                        {KINDS.filter((k) => k === '원본' || /\.pdf$/i.test(r.file.name)).map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </td>
                    <td className="max-w-[230px] truncate px-1.5 py-1.5 text-gray-500" title={nameOf(r)}>{nameOf(r) || <span className="text-red-600">빈칸을 채워 주세요</span>}</td>
                    <td className="whitespace-nowrap px-1.5 py-1.5 font-semibold" style={{ color: r.state === '올림' ? GREEN : r.state.startsWith('실패') ? '#dc2626' : '#6b7280' }}>{r.state}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <datalist id="bulk-schools">{schoolList.map((s) => <option key={s} value={s} />)}</datalist>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {rows.length > 1 && <button onClick={fillDown} disabled={busy} className="rounded-lg border px-3 py-2 text-xs font-semibold text-gray-600">빈칸을 첫 줄과 같게 채우기</button>}
          {nMissing > 0 && <span className="text-xs text-red-600">빈칸이 있는 {nMissing}개는 올라가지 않습니다</span>}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">{allDone ? '닫기' : '취소'}</button>
            {!allDone && (
              <button onClick={run} disabled={busy || rows.every((r) => r.state === '올림' || missing(r))}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
                {busy ? '올리는 중…' : `${rows.filter((r) => r.state !== '올림' && !missing(r)).length}개 올리기`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
