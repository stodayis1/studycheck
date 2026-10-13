'use client'

import { useState } from 'react'

// 부별 안내 — 초등부 · 중등부 · 고등부.
//
// 메뉴와 버튼은 세 부가 같다. 다른 것은 **과정이 어떻게 짜여 있고, 무엇으로 평가하고,
// 무슨 교재를 고를 수 있는가**다. 새로 오신 선생님이 그걸 먼저 알아야 해서 따로 묶었다
// (원장님 2026-10-12, 고등부 선생님 합류).
//
// ★ 여기 적힌 과정·교재는 **실제 DB 를 보고 적은 것**이다(2026-10-12 기준).
//   과정이나 교재를 늘리면 이 글도 같이 고칠 것.

type Level = '초등부' | '중등부' | '고등부'

const GUIDE: Record<Level, {
  course: string
  courseNote: string
  books: { type: string; names: string }[]
  eval: string[]
  watch: string[]
}> = {
  '초등부': {
    course: '초1 ~ 초6 · 학기별(1학기 · 2학기)',
    courseNote: '진도표가 학기별로 나뉘고 회독수도 학기별로 따로 셉니다. 1학기에서 2권을 끝내도 2학기는 따로 셉니다.',
    books: [
      { type: '개념서', names: '개념+유형파워 · 개념+유형라이트 · 교과서 개념잡기 · 리피트 · EBS만점왕 · 수력충전 등' },
      { type: '유형서', names: '쎈 · 쎈B · 베이직쎈 · 라이트쎈 · 디딤돌 응용 · 디딤돌 문제유형 · 수학리더 등' },
      { type: '연산서', names: '쎈연산 · 초능력연산 · 큐브연산 · 원리셈 · 기탄수학 · 디딤돌 연산 등' },
      { type: '심화서', names: '최상위 · 최상위S · 최고수준 · 왕수학최상위' },
    ],
    eval: [
      '레벨학습지로 봅니다. 70점 미만이면 같은 단원을 다시 봅니다.',
      '연산서는 개념 체크가 아니라 **달성률(%)** 로만 관리합니다.',
    ],
    watch: [
      '한 학기에 같은 종류의 교재를 두 권 쓰는 일이 흔합니다. 배정할 때 **학년·학기를 꼭 맞춰** 주세요.',
    ],
  },
  '중등부': {
    course: '중1 ~ 중3 · 학기별(1학기 · 2학기)',
    courseNote: '학교 시험이 있어 내신 일정이 과정을 좌우합니다. 시험일정이 들어오면 시험대비 교재(이너프원)가 따로 배정됩니다.',
    books: [
      { type: '개념서', names: '개념+유형파워 · 개념+유형라이트 · 개념리피트 · 베이직쎈 · 개념원리 등' },
      { type: '유형서', names: '쎈 · 쎈B · RPM · 베이직쎈 · 라이트쎈 · 유형 해결의 법칙 · 모의고사 1·2부 등' },
      { type: '연산서', names: '쎈 개념연산 · 디딤돌 연산 · 기탄수학' },
      { type: '심화서', names: '최상위 · 최상위S · 일품 · 블랙라벨 · RPMpro · 고쟁이 · 쎈(C단계)' },
    ],
    eval: [
      '레벨학습지 + 시험대비(이너프원). 시험 전에는 학교별 시험일정에 맞춰 배정합니다.',
      '시험기간에 못 나온 날은 출결을 「시험기간 결석」으로 찍어 주세요 — 결석으로 안 세고 브리핑도 안 나갑니다.',
    ],
    watch: [
      '학교 이름은 「신원중」처럼 짧게 넣으면 자동으로 맞춰집니다. 학교가 비어 있으면 시험대비 배정이 안 걸립니다.',
    ],
  },
  '고등부': {
    course: '과목 단위 — 공통수학1 · 공통수학2 · 대수 · 미적분1 · 확률과통계 · 기하',
    courseNote: '고등은 **학기 구분이 없습니다.** 과목 하나가 곧 한 학기 분량이라, 진도표도 과목 단위로 하나입니다. 교재를 배정할 때 학년이 아니라 **과목**을 고르세요.',
    books: [
      { type: '개념서', names: '개념원리 · 개념+유형 · 라이트수학 · 짤강' },
      { type: '유형서', names: '쎈 · 쎈B · RPM · 만렙유형 · 마플교과서 · 풍산자 라이트유형 · 자이스토리 · 수능특강' },
      { type: '연산서', names: '풍산자 반복수학' },
      { type: '심화서', names: '일품 · 블랙라벨 · 고쟁이 · 킬러문항' },
    ],
    eval: [
      '매 수업 **데일리테스트**가 중심입니다. 학습지보다 데일리테스트 기록이 더 중요해요.',
      '내신 시험일정은 **같은 학교면 1·2·3학년이 모두 같습니다** — 한 번 넣으면 세 학년이 함께 들어갑니다.',
    ],
    watch: [
      '진도표가 과목별이라, 교재 배정에서 학년(「고1」)을 고르면 진도표가 안 뜹니다. 반드시 과목으로 넣어 주세요.',
    ],
  },
}

const LEVELS: Level[] = ['초등부', '중등부', '고등부']

export function LevelGuide({ initial = '초등부' }: { initial?: Level }) {
  const [level, setLevel] = useState<Level>(initial)
  const g = GUIDE[level]

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <i className="ti ti-stairs" style={{ fontSize: 16, color: '#993C1D' }} />
        <h2 className="text-sm font-bold text-gray-800">부별 안내</h2>
        <span className="text-[11px] text-gray-400">메뉴는 같고, 과정·교재·평가가 다릅니다</span>
      </div>

      <div className="flex gap-1.5 mb-3">
        {LEVELS.map((l) => (
          <button key={l} onClick={() => setLevel(l)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={level === l ? { background: '#085041', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl p-3" style={{ background: '#F0FBF7' }}>
          <p className="text-[11px] font-bold mb-0.5" style={{ color: '#085041' }}>과정</p>
          <p className="text-xs font-bold text-gray-800">{g.course}</p>
          <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{g.courseNote}</p>
        </div>

        <div>
          <p className="text-[11px] font-bold text-gray-500 mb-1.5">고를 수 있는 교재</p>
          <div className="space-y-1">
            {g.books.map((b) => (
              <div key={b.type} className="flex gap-2 text-[11px]">
                <span className="font-bold text-gray-700 shrink-0 w-12">{b.type}</span>
                <span className="text-gray-500 leading-relaxed">{b.names}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-gray-500 mb-1.5">평가는 이렇게</p>
          <ul className="space-y-1">
            {g.eval.map((t, i) => (
              <li key={i} className="text-[11px] text-gray-600 leading-relaxed flex gap-1.5">
                <span className="text-gray-300">·</span><span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl p-3" style={{ background: '#FFF5F2' }}>
          <p className="text-[11px] font-bold mb-1" style={{ color: '#993C1D' }}>이건 꼭</p>
          <ul className="space-y-1">
            {g.watch.map((t, i) => (
              <li key={i} className="text-[11px] leading-relaxed" style={{ color: '#712B13' }}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** 교재·과정을 늘려 달라고 말할 수 있는 자리가 있다는 안내. */
export function IdeaInvite() {
  return (
    <section className="rounded-2xl p-4" style={{ background: '#FFFDF0', border: '1px solid #F5DF4D' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <i className="ti ti-bulb" style={{ fontSize: 16, color: '#633806' }} />
        <h2 className="text-sm font-bold" style={{ color: '#3C1E1E' }}>필요한 교재·과정이 있으면 말씀해 주세요</h2>
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: '#633806' }}>
        스터디체크는 초등·중등에서 먼저 자리를 잡았고, <b>고등 과정은 지금 맞춰 가는 중</b>입니다.
        쓰시다가 <b>없는 교재</b>, <b>없는 과목·단원</b>, <b>이 방식이 고등에는 안 맞는다</b> 싶은 것이
        보이면 언제든 알려 주세요. 과정도 교재도 얼마든지 늘릴 수 있습니다.
      </p>
      <p className="text-[11px] leading-relaxed mt-2" style={{ color: '#633806' }}>
        「이렇게 되면 좋겠다」 정도여도 괜찮습니다 — 쓰는 분이 불편한 자리가 고쳐야 할 자리입니다.
        원장님께 말씀 주시거나, 수업일지의 <b>「전달사항 남기기」</b>로 적어 주셔도 됩니다.
      </p>
    </section>
  )
}
