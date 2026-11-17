'use client'

/**
 * PDF 학습지 — 선생님이 가진 PDF 한 개를 올려 문제은행에 넣고, 수학의지혜 양식으로 인쇄하고,
 * 학생에게 배정하는 화면.
 *
 * 원장님 2026-11-17 「고등강사가 가지고 있는 pdf파일이 있어. 그걸 스터디체크 문제은행에 업로드하면
 *   바로 수학의지혜 양식으로 출력할 수 있도록 기능을 하나 만들자」
 *   「기출이 될수도 있고, 모의고사 일수도 있고, 오답이 될수도 있지. 아니면 이전에 있던 학원에서
 *    만들어둔 자료일수도 있고. 강사가 pdf파일을 올리면 제목을 공통수학-단원명-난이도 상중하로
 *    적게해서 어느 학생에게 배정했는지를 기록하게 하면 될듯. 그래서 그 학생의 학습지 기록에 남길수 있도록」
 *   같은 날 바로잡음 「기출은 기출모음에 넣기로 했잖아」 → **학교 기출은 여기가 아니다.**
 *    기출 모음 현황판의 「기출 파일 올리기」(기출모음)로 간다 — 적중률·블로그·연도별 찾기가 거기 달려 있다.
 *
 * 왜 「기출 모음」이 아닌가 — 그 길은 학교·연도·학기·중간/기말이 있는 **학교 시험지** 전용이다.
 *   강사가 가진 PDF 는 그 네 칸을 채울 수 없는 것이 보통이라 아예 들어가지 못했다.
 *
 * 누가 보나: 고등 커리큘럼과 같은 사람 (원장님 + 고등 담당 선생님).
 *   원장님 2026-11-17 「고등 강사까지 열기」. 판단은 DB 함수 can_see_high_curriculum() 한 곳에만 있고,
 *   진짜 차단은 서버 API(app/api/pdf-worksheets, lib/apiAuth.ts 의 highOrDeny)가 한다.
 *
 * ★ 넣은 문항은 **자동 출제에 섞이지 않는다** (type_code · level 을 붙이지 않는다 — lib/tutorWorksheet.ts).
 */

import { useEffect, useState } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import PdfWorksheetBuilder from '@/components/pdf-worksheets/PdfWorksheetBuilder'
import AssignModal from '@/components/pdf-worksheets/AssignModal'

const GREEN = '#0f7b6c'

type Sheet = {
  code: string; title: string; course: string | null; createdAt: string
  by: string | null; mine: boolean; pdfName: string | null; kind: string | null
  problems: number; targets: number; solved: number
}

export default function PdfWorksheetsPage() {
  const { currentUser } = useAuth()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [building, setBuilding] = useState(false)
  const [assign, setAssign] = useState<{ code: string; title: string } | null>(null)
  const [busy, setBusy] = useState('')          // 지우는 중인 자료의 코드
  const [note, setNote] = useState('')          // 지운 뒤 알림

  useEffect(() => {
    if (!currentUser) return
    let alive = true
    supabase.rpc('can_see_high_curriculum').then(({ data }) => { if (alive) setAllowed(data === true) })
    return () => { alive = false }
  }, [currentUser])

  useEffect(() => { if (allowed) load() }, [allowed])

  /**
   * 원장만: 올린 자료를 통째로 지운다 (원장님 2026-11-17 「목록 삭제 할수 잇는 기능 넣어줘 관리자한테만」).
   *
   * ★ 되돌릴 수 없다. 그래서 **무엇이 같이 지워지는지 숫자로 적어** 확인받는다.
   * ★ 학생이 푼 기록이 있으면 서버가 거절한다 — exam_sheets 를 지우면 gradings 가 CASCADE 로 같이 날아간다.
   *   (화면에서도 「푼 사람」이 있으면 단추를 막아 두지만, 진짜 막는 것은 서버다)
   */
  async function remove(s: Sheet) {
    if (s.solved) { alert(`「${s.title}」 은 학생이 푼 기록이 ${s.solved}건 있어 지울 수 없습니다.`); return }
    const 적을말 = [
      `「${s.title}」 을 지웁니다.`,
      '',
      `· 문제은행 문항 ${s.problems}개 (다른 학습지에도 쓰인 문항은 남습니다)`,
      `· 학생 배정 ${s.targets}명`,
      '· 잘라 둔 문항 그림',
      '',
      '되돌릴 수 없습니다. 지울까요?',
    ].join('\n')
    if (!confirm(적을말)) return
    setErr('')
    setBusy(s.code)
    try {
      const r = await apiFetch('/api/pdf-worksheets', { method: 'POST', body: JSON.stringify({ action: 'delete', code: s.code }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? '지우지 못했습니다.')
      setNote(`「${s.title}」 을 지웠습니다 — 문항 ${j.deleted}개 지움`
        + (j.kept ? ` · ${j.kept}개는 다른 곳에도 쓰여 남겼습니다` : ''))
      await load()
    } catch (e: any) {
      setErr(e?.message ?? '지우지 못했습니다.')
    }
    setBusy('')
  }

  async function load() {
    setLoading(true)
    try {
      const r = await apiFetch('/api/pdf-worksheets?list=1')
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? '읽지 못했어요')
      setSheets(j.sheets ?? [])
      setIsAdmin(!!j.me?.isAdmin)
      setErr('')
    } catch (e: any) {
      setErr(e?.message ?? '읽지 못했어요')
    }
    setLoading(false)
  }

  if (allowed === null)
    return <><Header title="PDF 학습지" /><p className="p-10 text-center text-sm text-gray-400">확인하는 중…</p></>
  if (!allowed)
    return <><Header title="PDF 학습지" /><p className="p-10 text-center text-sm text-gray-500">원장님과 고등 담당 선생님만 볼 수 있어요.</p></>

  return (
    <>
      <Header title="PDF 학습지" subtitle="PDF 한 개 → 문제은행 → 수학의지혜 양식 인쇄 → 학생 배정" />
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-3">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            {isAdmin ? '모든 선생님이 올린 자료가 보입니다.' : '내가 올린 자료만 보입니다.'}
          </p>
          <button onClick={() => setBuilding(true)}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: GREEN }}>
            <i className="ti ti-file-plus mr-1.5" />PDF 올리기
          </button>
        </div>

        <div className="mb-5 rounded-xl bg-emerald-50/60 p-4 text-xs leading-relaxed text-gray-700">
          <b style={{ color: GREEN }}>어떻게 진행되는지</b>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
            <li><b>PDF 올리기</b> — 모의고사 · 오답 모음 · 이전 학원에서 만든 자료.</li>
            <li>한글 2단 작업본이면 문항을 <b>자동</b>으로 찾고, 아니면 쪽 그림 위에 <b>네모를 그려</b> 문항을 만듭니다.</li>
            <li>제목을 <b>과정 - 단원명 - 학습지 종류 - 난이도</b>로 적습니다. 예) <b>공통수학2-집합과 명제-교과서-중</b>
              <br />종류는 <b>적는 칸</b>입니다 — 교과서 · 단계별 학습지처럼 쓰시는 말을 그대로 적거나 비워 두셔도 됩니다.</li>
            <li><b>인쇄</b>는 수학의지혜 시험지 양식(A4 2단)입니다.</li>
            <li><b>배정</b>하면 그 학생 앱 「할 일」에 뜨고, 학생의 <b>학습지 기록</b>에 남습니다.</li>
          </ol>
          <p className="mt-2 font-semibold text-amber-700">
            <i className="ti ti-alert-triangle mr-1" />
            <b>학교 기출 시험지는 여기가 아닙니다</b> — 「기출 모음」 현황판의 <b>「기출 파일 올리기」</b>로 올려 주세요.
            적중률 · 블로그 · 연도별 찾기가 거기에 달려 있습니다.
          </p>
          <p className="mt-2 text-gray-500">
            넣은 문항은 <b>자동 출제에 섞이지 않습니다</b>(유형 · 레벨을 붙이지 않습니다).
            <b>지우기는 원장님만</b> 할 수 있고 <b>되돌릴 수 없습니다</b>. 학생이 푼 기록이 있으면 지워지지 않습니다
            (지우면 그 기록도 같이 사라지기 때문입니다). 다른 학습지에도 쓰인 문항은 남습니다.
          </p>
        </div>

        {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><i className="ti ti-alert-triangle mr-1" />{err}</p>}
        {note && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm" style={{ color: GREEN }}><i className="ti ti-circle-check mr-1" />{note}</p>}

        {loading ? <p className="p-10 text-center text-sm text-gray-400"><i className="ti ti-loader-2 mr-1 animate-spin" />불러오는 중…</p>
          : !sheets.length ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-gray-500">
              아직 올린 자료가 없습니다. 위 <b>「PDF 올리기」</b>를 눌러 시작하세요.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">제목</th>
                    <th className="px-3 py-2">문항</th>
                    <th className="px-3 py-2">배정</th>
                    <th className="px-3 py-2">푼 사람</th>
                    <th className="px-3 py-2 text-left">올린 사람 · 날짜</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((s) => (
                    <tr key={s.code} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-semibold" style={{ color: GREEN }}>{s.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-400">
                          {s.kind && <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium" style={{ color: GREEN }}>{s.kind}</span>}
                          <span>코드 {s.code}{s.pdfName ? ` · ${s.pdfName}` : ''}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">{s.problems}</td>
                      <td className="px-3 py-2 text-center">{s.targets || '-'}</td>
                      <td className="px-3 py-2 text-center">{s.solved || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {s.by ?? '기록 없음'}<br />{s.createdAt?.slice(0, 10)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <a href={`/teacher/pdf-worksheets/print?code=${s.code}`} target="_blank" rel="noreferrer"
                          className="mr-1 rounded-lg border px-2.5 py-1.5 text-xs">
                          <i className="ti ti-printer mr-1" />인쇄
                        </a>
                        <button onClick={() => setAssign({ code: s.code, title: s.title })}
                          className="rounded-lg border px-2.5 py-1.5 text-xs">
                          <i className="ti ti-send mr-1" />배정
                        </button>
                        {/* 지우기는 **원장님만** (원장님 2026-11-17 「관리자한테만」).
                            푼 사람이 있으면 막는다 — 지우면 채점 기록이 같이 사라진다. 진짜 차단은 서버. */}
                        {isAdmin && (
                          <button onClick={() => remove(s)} disabled={!!busy || !!s.solved}
                            title={s.solved ? `학생이 푼 기록이 ${s.solved}건 있어 지울 수 없습니다` : '되돌릴 수 없습니다'}
                            className="ml-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 disabled:opacity-40">
                            <i className={`ti mr-1 ${busy === s.code ? 'ti-loader-2 animate-spin' : 'ti-trash'}`} />
                            {busy === s.code ? '지우는 중' : '지우기'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {building && <PdfWorksheetBuilder onClose={() => { setBuilding(false); load() }} onDone={() => load()} />}
      {assign && <AssignModal code={assign.code} title={assign.title} onClose={() => setAssign(null)} onSaved={load} />}
    </>
  )
}
