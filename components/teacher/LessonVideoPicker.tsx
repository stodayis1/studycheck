'use client'

// 학습일지 「영상 과제」에서 수지쌤 강의영상을 골라 넣는 창.
// 유튜브에 올라가 있는(주소가 있는) 영상만 보인다. 고르면 https://youtu.be/<id> 가 과제 링크 칸에 들어간다.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fmtDuration, lessonUrl, youtubeId, type LessonVideo } from '@/lib/lessonVideos'

export function LessonVideoPicker({ picked, onPick, onUnpick, onClose }: {
  picked: string[]                          // 이미 넣은 링크들 (표시용)
  onPick: (url: string) => void
  /** 이미 넣은 것을 다시 누르면 뺀다 (원장님 2026-10-23 「한번 클릭한 걸 취소할 수가 없네」) */
  onUnpick: (url: string) => void
  onClose: () => void
}) {
  const [all, setAll] = useState<LessonVideo[]>([])
  const [q, setQ] = useState('')
  const [grade, setGrade] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('lesson_videos').select('*').eq('is_active', true).not('youtube_id', 'is', null)
      .order('grade').order('order_label')
      .then(({ data }) => {
        const rows = (data || []) as LessonVideo[]
        setAll(rows); setGrade(rows[0]?.grade || ''); setLoading(false)
      })
  }, [])

  const grades = useMemo(() => [...new Set(all.map((v) => v.grade))], [all])
  const shown = all.filter((v) => (!grade || v.grade === grade) &&
    (!q.trim() || `${v.order_label} ${v.title} ${v.chapter} ${v.sub_chapter}`.includes(q.trim())))
  // ★ 주소 **끝**에서만 id 를 찾던 것을 공용 함수로 바꿨다. 뒤에 ?si=… 가 붙은 주소는
  //   예전 방식으로는 못 찾아서, 이미 넣은 영상이 「넣음」으로 안 보였다.
  const pickedIds = new Set(picked.map((u) => youtubeId(u)).filter(Boolean))

  // 대단원 › 소단원으로 묶는다 (개념 아래에 그 개념의 증명, 그다음 필수예제 풀이가 이어서 온다 — order_label 순)
  const groups: { head: string; items: LessonVideo[] }[] = []
  for (const v of shown) {
    const head = `${v.chapter ?? ''} › ${v.sub_chapter ?? ''}`
    if (groups[groups.length - 1]?.head !== head) groups.push({ head, items: [] })
    groups[groups.length - 1].items.push(v)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-sm font-bold text-gray-800">수지쌤 강의영상 고르기</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="px-5 pb-3 flex gap-2">
          {grades.length > 1 && (
            <select value={grade} onChange={(e) => setGrade(e.target.value)}
              className="px-2.5 py-2 rounded-xl border border-gray-200 text-sm">
              {grades.map((g) => <option key={g}>{g}</option>)}
            </select>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="개념 이름이나 번호로 찾기"
            className="flex-1 px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div className="overflow-y-auto px-5 pb-4 space-y-3">
          {loading && <p className="text-xs text-gray-400">불러오는 중…</p>}
          {!loading && !shown.length && (
            <p className="text-xs text-gray-400">유튜브에 올라간 강의가 없어요. (일부 공개로 올린 뒤 목록을 다시 읽어 와야 보여요)</p>
          )}
          {groups.map((g) => (
            <div key={g.head}>
              <p className="text-[11px] font-bold text-[#3B6D11] mb-1">{g.head}</p>
              <div className="space-y-1">
                {g.items.map((v) => {
                  const on = pickedIds.has(v.youtube_id!)
                  return (
                    // ★ 넣은 것을 **다시 누르면 뺀다.** 예전에는 눌린 줄이 disabled 라
                    //   잘못 고르면 창을 닫고 아래 링크 칸에서 지워야 했다
                    //   (원장님 2026-10-23 「그래야 잘못 골라도 다시 선택하지」).
                    <button key={v.id} title={on ? '다시 누르면 뺍니다' : undefined}
                      onClick={() => (on ? onUnpick(lessonUrl(v)) : onPick(lessonUrl(v)))}
                      className={`group w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl border text-sm transition-all ${
                        on ? 'border-green-300 bg-green-50 hover:border-red-300 hover:bg-red-50'
                           : 'border-gray-100 hover:border-green-300 hover:bg-green-50/40'}`}>
                      <span className={`shrink-0 text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                        v.kind === '증명' ? 'bg-amber-50 text-amber-700 ml-4'
                        : v.kind === '대표예제' ? 'bg-sky-50 text-sky-700 ml-4' : 'bg-green-50 text-green-700'}`}>
                        {v.kind === '증명' ? `증명 ${v.order_label.split('증명')[1]}`
                          : v.kind === '대표예제' ? `풀이 ${v.order_label.split('풀이')[1]}` : v.order_label}
                      </span>
                      <span className={`flex-1 min-w-0 truncate ${on ? 'text-gray-500' : 'text-gray-800'}`}>{v.title}</span>
                      <span className="shrink-0 text-[11px] text-gray-400 tabular-nums">{fmtDuration(v.duration_seconds)}</span>
                      {on && (
                        <span className="shrink-0 text-[11px] font-bold">
                          {/* 평소엔 「넣음」, 마우스를 올리면 「빼기」로 바뀐다 */}
                          <span className="text-green-600 group-hover:hidden">✓ 넣음</span>
                          <span className="hidden text-red-500 group-hover:inline">빼기</span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
