'use client'
// 시험 정보(학교 · 학년 · 연도 · 학기 · 구분) 바로잡기 — **원장님만** 보인다.
//
// 왜 (원장님 2026-11-09 「내가 수정할 수 있게도 해야지. 강사들은 말고, 관리자는 수정가능」)
//   올릴 때 파일 이름에서 짐작해 채운 값이 틀리면(「년고양중」) 고칠 길이 없었다.
//
// ★ 평소에는 **글자로만** 보이고, 「바로잡기」를 눌러야 칸이 열린다. 시험을 가리키는 열쇠라
//   무심코 바뀌면 안 된다 — 저장 전에 「무엇이 무엇으로」를 한 번 더 확인한다.
// ★ 파일 이름 · 문항 출처 · 문제은행 출처 · 인쇄 학습지 제목은 서버가 같이 고친다(movePaper).

import { useState } from 'react'
import { EXAM_TYPES, GRADES, SCHOOLS } from '@/lib/examAnalysis'
import { Field, GREEN, INPUT, post } from './ui'

export function PaperKeyEditor({ paper, onMoved }: { paper: any; onMoved: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [k, setK] = useState({
    school_name: paper.school_name ?? '', grade: paper.grade ?? '',
    exam_year: String(paper.exam_year ?? ''), term: String(paper.term ?? ''), exam_type: paper.exam_type ?? '',
  })
  const set = (key: keyof typeof k, v: string) => setK((x) => ({ ...x, [key]: v }))
  const was = `${paper.school_name} ${paper.grade} · ${paper.exam_year}년 ${paper.term}학기 ${paper.exam_type}`
  const now = `${k.school_name.trim()} ${k.grade} · ${k.exam_year}년 ${k.term}학기 ${k.exam_type}`
  const 모자람 = !k.school_name.trim() || !k.grade || !/^20\d{2}$/.test(k.exam_year) || !k.term || !k.exam_type
  const 낯선학교 = !!k.school_name.trim() && !SCHOOLS.includes(k.school_name.trim())

  const cancel = () => {
    setK({
      school_name: paper.school_name ?? '', grade: paper.grade ?? '',
      exam_year: String(paper.exam_year ?? ''), term: String(paper.term ?? ''), exam_type: paper.exam_type ?? '',
    })
    setOpen(false)
  }

  const save = async () => {
    if (모자람 || now === was) return
    if (!confirm(`시험 정보를 바꿉니다.\n\n지금  ${was}\n→      ${now}\n\n이 시험의 파일 이름 · 문항 출처 · 문제은행 출처 · 인쇄 학습지 제목도 같이 고쳐집니다.\n올린 파일 자체는 그대로입니다.`)) return
    setBusy(true)
    const r = await post({ action: 'movePaper', id: paper.id, key: { ...k, exam_year: Number(k.exam_year), term: Number(k.term), school_name: k.school_name.trim() } })
    setBusy(false)
    if (!r.ok) { alert(r.error ?? '고치지 못했습니다.'); return }
    const 같이 = [r.files ? `파일 이름 ${r.files}개` : '', r.questions ? `문항 출처 ${r.questions}개` : '',
      r.bank ? `문제은행 ${r.bank}개` : '', r.sheet ? '인쇄 학습지 제목' : ''].filter(Boolean).join(' · ')
    alert(`고쳤습니다.\n\n${now}${같이 ? `\n\n같이 고친 것: ${같이}` : ''}`)
    setOpen(false)
    onMoved()
  }

  if (!open) return (
    <>
      <Field label="학교 · 학년">
        <div className="flex items-center gap-2 py-2">
          <span className="font-semibold">{paper.school_name} {paper.grade}</span>
          <button onClick={() => setOpen(true)} className="rounded border px-1.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50" title="학교 · 학년 · 연도 · 학기 · 구분을 바로잡습니다 (원장님만)">
            <i className="ti ti-pencil mr-0.5" />바로잡기
          </button>
        </div>
      </Field>
      <Field label="연도 · 학기 · 구분"><div className="py-2">{paper.exam_year}년 {paper.term}학기 {paper.exam_type}</div></Field>
    </>
  )

  return (
    <div className="col-span-2 rounded-xl border p-3" style={{ borderColor: GREEN, background: '#F6FBF9' }}>
      <p className="mb-2 text-xs font-semibold" style={{ color: GREEN }}>시험 정보 바로잡기 — 원장님만 보이는 칸이에요</p>
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        <Field label="학교">
          <input className={INPUT} list="paper-key-schools" value={k.school_name} onChange={(e) => set('school_name', e.target.value)} placeholder="고양중" />
        </Field>
        <Field label="학년">
          <select className={INPUT} value={k.grade} onChange={(e) => set('grade', e.target.value)}>
            <option value="">?</option>{GRADES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="연도">
          <input className={INPUT} value={k.exam_year} onChange={(e) => set('exam_year', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2025" />
        </Field>
        <Field label="학기">
          <select className={INPUT} value={k.term} onChange={(e) => set('term', e.target.value)}>
            <option value="">?</option><option value="1">1학기</option><option value="2">2학기</option>
          </select>
        </Field>
        <Field label="구분">
          <select className={INPUT} value={k.exam_type} onChange={(e) => set('exam_type', e.target.value)}>
            <option value="">?</option>{EXAM_TYPES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <datalist id="paper-key-schools">{SCHOOLS.map((s) => <option key={s} value={s} />)}</datalist>
      {낯선학교 && <p className="mt-2 text-xs" style={{ color: '#b45309' }}>처음 보는 학교 이름이에요. 학생 정보에 적힌 이름과 <b>똑같이</b> 적어 주세요 — 한 글자만 달라도 시험대비 · 적중 대조에 안 걸려요.</p>}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-gray-500">{was}{now !== was && !모자람 ? ` → ${now}` : ''}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={cancel} disabled={busy} className="rounded-lg border px-3 py-2 text-sm">그만두기</button>
          <button onClick={save} disabled={busy || 모자람 || now === was}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
            {busy ? '고치는 중…' : '바로잡기'}
          </button>
        </div>
      </div>
    </div>
  )
}
