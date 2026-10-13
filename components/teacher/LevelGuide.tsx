'use client'

// 부별 안내 — 초등부 · 중등부 · 고등부.
//
// 메뉴와 버튼은 세 부가 같다. 다른 것은 **과정이 어떻게 짜여 있고, 무엇으로 평가하고,
// 무슨 교재를 고를 수 있고, 수업을 어떻게 운영하는가**다.
//
// ★ 부를 고르면 **그 부 내용만** 보여야 한다. 아래쪽에 초등 전용 안내가 늘 떠 있어서
//   「고등부를 눌렀는데 초등 내용이 뜬다」는 지적을 받았다(원장님 2026-10-12).
//   그래서 고른 값을 페이지가 들고 있고(app/teacher/manual), 부 전용 안내도 같이 갈린다.
//
// ★ 과정·교재는 **실제 DB 를 보고 적은 것**이다(2026-10-12 기준). 늘리면 여기도 고칠 것.
// ★ 운영 규칙(출결·휴대폰·쉬는시간·채점)은 원장님이 정해 주신 것이다(2026-10-12).

export type Level = '초등부' | '중등부' | '고등부'
export const LEVELS: Level[] = ['초등부', '중등부', '고등부']

const GUIDE: Record<Level, {
  course: string
  courseNote: string
  books: { type: string; names: string }[]
  eval: string[]
  teach?: string[]
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
      '학교시험은 중간·기말이 없고 **단원평가**가 곧 학교 성적입니다 — 볼 때마다 기록해 주세요.',
      '연산서는 개념 체크가 아니라 **달성률(%)** 로만 관리합니다.',
    ],
    watch: [
      '한 학기에 같은 종류의 교재를 두 권 쓰는 일이 흔합니다. 배정할 때 **학년·학기를 꼭 맞춰** 주세요.',
    ],
  },
  '중등부': {
    course: '중1 ~ 중3 · 학기별(1학기 · 2학기)',
    courseNote: '학교 시험이 과정을 좌우합니다. 시험일정이 들어오면 시험대비 교재(이너프원)가 따로 배정됩니다.',
    books: [
      { type: '개념서', names: '개념+유형파워 · 개념+유형라이트 · 개념리피트 · 베이직쎈 · 개념원리 등' },
      { type: '유형서', names: '쎈 · 쎈B · RPM · 베이직쎈 · 라이트쎈 · 유형 해결의 법칙 · 모의고사 1·2부 등' },
      { type: '연산서', names: '쎈 개념연산 · 디딤돌 연산 · 기탄수학' },
      { type: '심화서', names: '최상위 · 최상위S · 일품 · 블랙라벨 · RPMpro · 고쟁이 · 쎈(C단계)' },
    ],
    eval: [
      '레벨학습지 + 시험대비(이너프원). 시험 전에는 학교별 시험일정에 맞춰 배정합니다.',
      '학교시험은 **중간·기말고사**를 넣습니다.',
      '시험기간에 못 나온 날은 출결을 「시험기간 결석」으로 찍어 주세요 — 결석으로 안 세고 브리핑도 안 나갑니다.',
    ],
    watch: [
      '학교 이름은 「신원중」처럼 짧게 넣으면 자동으로 맞춰집니다. 학교가 비어 있으면 시험대비 배정이 안 걸립니다.',
    ],
  },
  '고등부': {
    course: '과목 단위 — 공통수학1 · 공통수학2 · 대수 · 미적분1 · 확률과통계 · 기하',
    courseNote: '고등은 **학기 구분이 없습니다.** 과목 하나가 곧 한 학기 분량이라 진도표도 과목 단위로 하나입니다. 교재를 배정할 때 학년이 아니라 **과목**을 고르세요.',
    books: [
      { type: '개념서', names: '개념원리 · 개념+유형 · 라이트수학 · 짤강' },
      { type: '유형서', names: '쎈 · 쎈B · RPM · 만렙유형 · 마플교과서 · 풍산자 라이트유형 · 자이스토리 · 수능특강' },
      { type: '연산서', names: '풍산자 반복수학' },
      { type: '심화서', names: '일품 · 블랙라벨 · 고쟁이 · 킬러문항' },
    ],
    eval: [
      '**학습지와 진단평가가 중요합니다.** 데일리테스트도 매 수업 함께 봅니다.',
      '평가는 **수업 전**에 보거나 **수업 후반부**에 봅니다 — 선생님이 정하시면 됩니다.',
      '**30분 안에** 치를 수 있는 분량으로 내 주세요.',
      '보고 나면 반드시 ① 기록 → ② 오답 확인 → ③ 오답 다시 풀기 → ④ 오답유사 풀기까지 갑니다.',
      '내신 시험일정은 **같은 학교면 1·2·3학년이 모두 같습니다** — 한 번 넣으면 세 학년이 함께 들어갑니다.',
    ],
    teach: [
      '**첨삭은 개별첨삭**으로, **진도는 판서진도**로 맞춥니다.',
      '**반은 레벨별로 나눕니다.** 같은 학년이라도 수준이 섞이면 판서진도를 맞출 수 없습니다.',
      '학습지는 주로 **과제로 배부**합니다.',
    ],
    watch: [
      '교재 배정에서 학년(「고1」)을 고르면 진도표가 안 뜹니다. 반드시 **과목**으로 넣어 주세요.',
    ],
  },
}

export function LevelTabs({ level, onChange }: { level: Level; onChange: (l: Level) => void }) {
  return (
    <div className="flex gap-1.5">
      {LEVELS.map((l) => (
        <button key={l} onClick={() => onChange(l)}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
          style={level === l ? { background: '#085041', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function LevelGuide({ level }: { level: Level }) {
  const g = GUIDE[level]
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <i className="ti ti-stairs" style={{ fontSize: 16, color: '#993C1D' }} />
        <h2 className="text-sm font-bold text-gray-800">{level} 안내</h2>
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
                <span className="text-gray-300">·</span>
                <span dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
              </li>
            ))}
          </ul>
        </div>

        {g.teach && (
          <div>
            <p className="text-[11px] font-bold text-gray-500 mb-1.5">수업은 이렇게</p>
            <ul className="space-y-1">
              {g.teach.map((t, i) => (
                <li key={i} className="text-[11px] text-gray-600 leading-relaxed flex gap-1.5">
                  <span className="text-gray-300">·</span>
                  <span dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl p-3" style={{ background: '#FFF5F2' }}>
          <p className="text-[11px] font-bold mb-1" style={{ color: '#993C1D' }}>이건 꼭</p>
          <ul className="space-y-1">
            {g.watch.map((t, i) => (
              <li key={i} className="text-[11px] leading-relaxed" style={{ color: '#712B13' }}
                dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') }} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

/** 세 부가 똑같이 지키는 운영 규칙. 부를 바꿔도 늘 보인다. */
export function ClassRules() {
  return (
    <section className="rounded-2xl p-4" style={{ background: '#F2F8FD', border: '1px solid #cfe3f5' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <i className="ti ti-shield-check" style={{ fontSize: 16, color: '#0f3460' }} />
        <h2 className="text-sm font-bold" style={{ color: '#0f3460' }}>수업 운영 규칙 (모든 부 공통)</h2>
      </div>
      <ul className="space-y-1.5 text-[11px] leading-relaxed" style={{ color: '#374151' }}>
        <li>· 학생은 수업 전 <b>반드시 출석체크 → 휴대폰 제출</b> 후에 교실에 들어옵니다.</li>
        <li>· <b>강의실에 휴대폰을 가지고 들어가면 절대 안 됩니다.</b> 예외 없습니다.</li>
        <li>· 쉬는시간은 선생님이 자율로 5~10분 주시되, <b>매 정시 기준 55분~00분</b>에 주시면
          다른 학년과 맞아서 좋습니다.</li>
        <li>· <b>모든 과제는 행정팀이 밖에서 채점</b>해 드립니다. 선생님은 채점이 아니라
          오답 확인과 다시 풀리기에 시간을 쓰시면 됩니다.</li>
      </ul>
    </section>
  )
}

/** 문제은행(매쓰홀릭)과 오답관리. 고등은 아직 맞춰 가는 중이라 의견을 받는다. */
export function ProblemBankNote() {
  return (
    <section className="rounded-2xl p-4" style={{ background: '#FFFDF0', border: '1px solid #F5DF4D' }}>
      <div className="flex items-center gap-1.5 mb-2">
        <i className="ti ti-bulb" style={{ fontSize: 16, color: '#633806' }} />
        <h2 className="text-sm font-bold" style={{ color: '#3C1E1E' }}>문제은행과 오답관리 — 의견 주세요</h2>
      </div>
      <div className="space-y-2 text-[11px] leading-relaxed" style={{ color: '#633806' }}>
        <p>
          문제은행은 <b>매쓰홀릭</b>을 씁니다. 우리 학원이 가장 중요하게 보는 것은 <b>오답관리</b>예요.
          학습지를 매쓰홀릭에서 풀게 하면 <b>학생마다 틀린 문제가 모두 기록</b>되고, 그걸 다시 풀릴 수 있습니다.
          <b>오답문제만</b> 또는 <b>오답유사 문제만</b> 뽑아 출력할 수 있어요.
        </p>
        <p>
          오답유사가 100% 딱 맞아떨어지지는 않지만, <b>아이들 정답률을 관리하기 위한 오답관리</b>로는
          잘 되는 편입니다.
        </p>
        <p>
          다만 매쓰홀릭은 <b>지금으로서는 초·중등에 최적화</b>돼 있습니다.
          <b>고등부는 추가 의견을 주시면 적극 반영</b>하겠습니다 — 없는 교재, 없는 과목·단원,
          「이 방식은 고등에 안 맞는다」 싶은 것 모두 좋습니다.
        </p>
        <p>
          <b>매쓰플랫이 더 낫다고 보시면 프로그램도 언제든 바꿀 수 있습니다.</b>
          써 보시고 판단되는 대로 말씀해 주세요.
        </p>
        <p className="text-gray-500">
          말씀은 원장님께 직접 주시거나, 수업일지의 <b>「전달사항 남기기」</b>로 적어 주셔도 됩니다.
        </p>
      </div>
    </section>
  )
}
