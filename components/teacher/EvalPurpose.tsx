'use client'

import { useState } from 'react'

// 평가 세 가지를 **무엇에 쓰는지**로 나눠 적는다 (원장님 2026-10-13).
//
// 「언제 보나」만 적어 두면 새로 오신 선생님이 셋을 섞어 쓴다. 쓰임이 다르다 —
//   진단평가   단원을 끝내고 다음 단원으로 넘어갈 때
//   학습지     과제. **레벨을 올려 가는 것**이 핵심
//   데일리테스트 지난 시간을 기억하는지 / 오늘 배운 것을 아는지. 선생님 자율
//
// 세 부가 같아서 부와 상관없이 늘 보인다.

// 2026-10-13 새 판으로 바꿨다. 레벨 1·2·6 설명이 단계마다 다르게 적혔고, 아래 네 칸의
// 오타(「처음만 접수가」·「수학자 연습」·「최상화」)가 고쳐졌다.
// ★ 같은 경로에 덮어쓰지 않고 새 경로를 쓴다 — 덮어쓰면 CDN 이 옛 그림을 한참 더 내보낸다.
const LEVEL_GUIDE_IMAGE =
  'https://cggskjxsyrvuhsldgkoj.supabase.co/storage/v1/object/public/feedback-images/manual/level-worksheet-guide-v2.webp'

const PURPOSES = [
  {
    icon: 'ti-stethoscope',
    name: '진단평가',
    when: '한 단원을 끝내고 다음 단원으로 넘어갈 때',
    body: [
      '단원을 끊는 단위는 선생님이 정하시면 됩니다 — **소단원**으로 끊어도, **중단원**으로 끊어도, **대단원**으로 끊어도 괜찮습니다.',
      '점수는 **평가관리 → 「진단평가」 탭**에 기록합니다.',
    ],
    color: '#0f3460', bg: '#F2F8FD', border: '#cfe3f5',
  },
  {
    icon: 'ti-file-text',
    name: '학습지',
    when: '주로 과제로 배부',
    body: [
      '**레벨이 가장 중요합니다.** 레벨별 **도장깨기**처럼 한 단계씩 올라가게 해 주세요.',
      '아래 「레벨학습지 가이드」를 보고 지금 아이가 어느 단계인지, 다음은 어디인지 잡으시면 됩니다.',
      '채점은 행정팀이 밖에서 해 드립니다 — 선생님은 **오답 확인과 다시 풀리기**에 시간을 쓰세요.',
    ],
    color: '#27500A', bg: '#EAF3DE', border: '#cfe3b5',
  },
  {
    icon: 'ti-bolt',
    name: '데일리테스트',
    when: '매 수업',
    body: [
      '**지난 시간 내용을 기억하는지** 보거나, **오늘 배운 것을 아는지** 보는 용도입니다.',
      '둘 중 무엇으로 쓰실지는 **선생님 자율**입니다.',
    ],
    color: '#633806', bg: '#FAEEDA', border: '#f0d9b0',
  },
]

const LEVELS = [
  { lv: 'Lv.1', title: '기초 개념 단계', desc: '개념 학습 · 개념확인 문제' },
  { lv: 'Lv.2', title: '기본 학습 단계', desc: '확인유형 문제' },
  { lv: 'Lv.2.5', title: '징검다리', desc: '2레벨과 3레벨을 5:5로 섞은 문제. 개념을 어느 정도 이해했다면 3레벨로 무난하게 넘어갈 수 있습니다.', bridge: true },
  { lv: 'Lv.3', title: '기본 완성 단계', desc: '개념서 단원마무리 · 쎈 B단계 수준' },
  { lv: 'Lv.3.5', title: '징검다리', desc: '3레벨과 4레벨을 섞은 단계. 심화 유형에 적용하도록 도와주는 징검다리입니다.', bridge: true },
  { lv: 'Lv.4', title: '심화 도전 단계', desc: '쎈 B단계 · 상난이도 · 쎈 C단계 수준' },
  { lv: 'Lv.5', title: '심화 강화 단계', desc: '심화 난이도 · 쎈 C 상난이도 · 내신고쟁이 · 최상위 문제 · 일품 최상위 문제' },
  { lv: 'Lv.6', title: '최상위 도전 단계', desc: '최심화 난이도 · 경시대비 문제 등' },
]

const LEVEL_NOTES = [
  { icon: 'ti-chart-bar', title: '왜 4레벨부터 점수가 떨어질까요?',
    body: '3레벨까지는 잘 풀다가도 4레벨 문제를 처음 만나면 점수가 크게 낮아지는 경우가 많습니다. 심화 난이도, 2차적인 사고가 필요한 문제 연습이 부족하기 때문입니다.' },
  { icon: 'ti-settings', title: '이렇게 준비해요',
    body: '3.5레벨부터 충분히 연습하면 어느덧 4레벨 문제도 도전해 볼 수 있습니다. 유형을 적용하는 연습이 중요합니다.' },
  { icon: 'ti-circle-check', title: '학교 시험과의 연관성',
    body: '어느 단원의 어떤 문제를 풀어도 3.5레벨에서 90점 이상이 나오면 학교 시험에서도 안정적으로 90점 이상을 기대할 수 있습니다. 다만 변별 문제 1~2개를 맞히려면 반드시 4레벨까지 연습해야 합니다.' },
  { icon: 'ti-arrow-up', title: '고등수학을 위한 준비',
    body: '4레벨 수준의 문제를 풀면서 이차적인 사고력, 추론적 사고를 키워야 합니다. 고등수학에서 요구되는 사고력의 기초가 됩니다.' },
]

const bold = (t: string) => ({ __html: t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') })

export function EvalPurpose() {
  const [openGuide, setOpenGuide] = useState(false)

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <i className="ti ti-clipboard-check" style={{ fontSize: 16, color: '#993C1D' }} />
        <h2 className="text-sm font-bold text-gray-800">평가 세 가지 — 무엇에 쓰나</h2>
        <span className="text-[11px] text-gray-400">모든 부 공통</span>
      </div>

      <div className="space-y-2">
        {PURPOSES.map((p) => (
          <div key={p.name} className="rounded-xl p-3" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <i className={`ti ${p.icon}`} style={{ fontSize: 15, color: p.color }} />
              <span className="text-xs font-bold" style={{ color: p.color }}>{p.name}</span>
              <span className="text-[11px] text-gray-500">— {p.when}</span>
            </div>
            <ul className="space-y-1">
              {p.body.map((t, i) => (
                <li key={i} className="text-[11px] text-gray-700 leading-relaxed flex gap-1.5">
                  <span className="text-gray-300">·</span>
                  <span dangerouslySetInnerHTML={bold(t)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 레벨학습지 가이드 */}
      <div className="mt-4">
        <button onClick={() => setOpenGuide((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold"
          style={{ background: '#1f2937', color: 'white' }}>
          <i className="ti ti-stairs-up" style={{ fontSize: 15 }} />
          레벨학습지 가이드 — Lv.1 ~ Lv.6
          <i className={`ti ${openGuide ? 'ti-chevron-up' : 'ti-chevron-down'} ml-auto`} style={{ fontSize: 15 }} />
        </button>

        {openGuide && (
          <div className="mt-2 space-y-3">
            <div className="space-y-1">
              {LEVELS.map((l) => (
                <div key={l.lv} className="flex gap-2 rounded-xl px-3 py-2"
                  style={{ background: l.bridge ? '#FFF5F2' : '#fafafa', border: `1px solid ${l.bridge ? '#f5d6cc' : '#f0f0f0'}` }}>
                  <span className="text-[11px] font-bold shrink-0 w-12"
                    style={{ color: l.bridge ? '#993C1D' : '#1f2937' }}>{l.lv}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-gray-800">{l.title}</p>
                    <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{l.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {LEVEL_NOTES.map((n) => (
                <div key={n.title} className="rounded-xl p-3" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <i className={`ti ${n.icon}`} style={{ fontSize: 14, color: '#993C1D' }} />
                    <p className="text-[11px] font-bold text-gray-800">{n.title}</p>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{n.body}</p>
                </div>
              ))}
            </div>

            {/* 학부모님께 보여 드리는 원본 안내 이미지 */}
            <div>
              <p className="text-[11px] text-gray-400 mb-1.5">학부모님께 나가는 안내 이미지 (원본)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LEVEL_GUIDE_IMAGE} alt="수지쌤이 알려주는 레벨학습지 가이드"
                className="w-full rounded-xl border border-gray-100" loading="lazy" />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
