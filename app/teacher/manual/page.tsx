'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'

// 선생님용 사용 매뉴얼. 원장님이 매번 가서 알려주지 않아도 되도록 메뉴별로 "무엇을 하는 곳인지 /
// 주로 누르는 버튼 / 주의할 점"을 모아둔다. 묶음은 사이드바(components/teacher/Sidebar.tsx)와 같게 유지할 것.
// 화면이 바뀌면 여기 문구도 같이 고쳐야 한다.

type ManualItem = {
  href: string
  label: string
  icon: string
  summary: string
  steps: string[]
  notes?: string[]
  adminOnly?: boolean
}
type ManualGroup = { key: string; title: string; icon: string; items: ManualItem[] }

const GROUPS: ManualGroup[] = [
  {
    key: 'home', title: '기본', icon: 'ti-home',
    items: [
      {
        href: '/teacher/dashboard', label: '대시보드', icon: 'ti-layout-dashboard',
        summary: '로그인하면 처음 보이는 화면. 오늘 해야 할 일이 모여 있어요.',
        steps: [
          '「오늘 할 일」에서 수업일지 미입력 · 채점 대기 · 학부모 공유 대기 · 채점 후 처리 필요 · 미제출 학습지(배정 후 5일 초과) · 상담 필요(90일 초과)를 확인해요.',
          '다른 선생님이 남긴 「학생 전달사항」을 읽고 「확인」을 눌러요.',
          '첫수업 알림장을 아직 안 쓴 학생(경고 표시)을 챙겨요.',
          '할 일이 다 끝나면 "오늘 모든 업무 완료!"가 떠요.',
        ],
        notes: ['결석한 학생은 "학부모 공유 대기"에 세지 않아요.'],
      },
      {
        href: '/teacher/announcements', label: '공지사항', icon: 'ti-speakerphone',
        summary: '학원 공지. 학생·학부모·선생님 대시보드에 같이 보여요.',
        steps: ['선생님은 읽기만 할 수 있어요. 작성·수정은 원장님/직원이 해요.'],
        notes: ['새 공지가 올라오면 학부모·학생·선생님 모두에게 앱 알림이 가요.'],
      },
    ],
  },
  {
    key: 'class', title: '수업', icon: 'ti-notebook',
    items: [
      {
        href: '/teacher/learning-notes', label: '학습관리', icon: 'ti-notebook',
        summary: '매일 쓰는 수업일지(진도·출결·과제)와 학부모 알림장. 가장 많이 쓰는 화면이에요.',
        steps: [
          '오늘 수업 학생 옆 「입력」 → 진도 개념 체크, 출결, 과제 달성률, 과제(교재·학습지·영상·시험대비)를 넣고 「수업일지 저장」.',
          '안 온 학생은 「결석」 한 번으로 처리해요.',
          '「알림장」 → 문장 버튼이나 직접 입력, 사진(최대 5장) → 「알림장 저장」.',
          '대타 수업을 했다면 「전달사항 남기기」로 담당 선생님께 알려요.',
          '「시간표 관리」 탭에서 요일·시간을 등록해요.',
        ],
        notes: [
          '「과제 달성률」(숙제를 얼마나 해왔나)과 「과제 성취도」(얼마나 맞았나)는 직접 골라야 저장돼요. 다 해왔으면 100을 눌러주세요.',
          '수정·삭제는 수업 당일과 그 학생의 다음 수업일 오후 2시까지만 돼요. 그 뒤로는 원장님께 문의해주세요.',
          '결석으로 저장하면 과제 항목은 기록되지 않아요.',
        ],
      },
      {
        href: '/teacher/weekly', label: '학습현황', icon: 'ti-calendar-week',
        summary: '담당 학생 × 요일 표로 한 주의 학습 기록을 색깔 배지로 봐요.',
        steps: [
          '「‹ 이번 주 ›」로 주를 옮겨요.',
          '배지를 누르면 그날 점수·기록이 보여요. 「과제 달성」은 수업일지의 과제 달성률, 「과제 성취」는 과제 성취도예요 (학습지관리의 레벨학습지 점수가 아니에요).',
          'QR로 채점한 시험지는 그 자리에서 「틀린 문제」 「쌍둥이」 「유사 문제」로 다시 낼 수 있어요.',
        ],
      },
      {
        href: '/teacher/my-records', label: '내 기록', icon: 'ti-history',
        summary: '내가 쓴 알림장과 수업일지를 기간별로 모아 봐요.',
        steps: ['「알림장」 탭에서 알림장을 고치거나 삭제해요.', '「수업일지」 탭은 보기 전용이에요. 수정은 학습관리에서 해요.'],
      },
      {
        href: '/teacher/bulk-progress', label: '진도일괄입력', icon: 'ti-list-check',
        summary: '교재 단원을 한꺼번에 완료 처리해요. 원장님이 켜 뒀을 때만 메뉴가 보여요.',
        steps: ['학생 → 교재를 고르고, 개념이나 대단원 버튼을 눌러 한 번에 체크/해제해요.'],
      },
    ],
  },
  {
    key: 'student', title: '학생', icon: 'ti-users',
    items: [
      {
        href: '/teacher/students', label: '학생관리', icon: 'ti-users',
        summary: '학생 등록, 학생 정보와 수업 시간표 관리.',
        steps: [
          '「+ 학생 등록」 → 교재 등급(A 하루 3개 / B 2개 / C 1개), 이름·학교·학년·담임강사·보호자 연락처, 시간표 → 「등록하기」.',
          '「수정」으로 정보나 시간표를 바꿔요.',
          'NEW 배지는 새로 배정된 학생이에요. 눌러서 확인 처리해요.',
        ],
        notes: [
          '학생 로그인 비밀번호는 보호자 전화번호 뒷 4자리예요.',
          '학생 삭제는 원장님만 할 수 있어요.',
        ],
      },
      {
        href: '/teacher/curriculum', label: '과정관리', icon: 'ti-books',
        summary: '학생에게 교재를 배정하고, 개념별 진도표(회독 수)를 관리해요.',
        steps: [
          '「교재배정」 → 「+ 교재 배정」: 과정 → 학기 → 교재 종류 → 교재명.',
          '「진도표」에서 개념 칸을 누를 때마다 회독 +1 (1회독 파랑 · 2회독 초록 · 3회독 빨강). 「✕」는 미진도로 되돌려요.',
          '교재를 다 끝내면 「완료」, 잠시 멈추면 「중단」/「재개」.',
        ],
        notes: ['잘못 배정한 교재는 「삭제요청」을 눌러요. 실제 삭제는 원장님이 해요.'],
      },
      {
        href: '/teacher/consultations', label: '상담내역', icon: 'ti-message-circle',
        summary: '학부모 상담 기록. 마지막 상담 후 90일이 넘은 학생을 알려줘요.',
        steps: [
          '학생을 눌러 「상담기록 추가」 → 「표준 양식 넣기」(성적·학습상담 / 학부모 건의 / 안내사항) → 「기록 추가」.',
          '「초과만 보기」로 상담이 밀린 학생만 봐요.',
        ],
      },
    ],
  },
  {
    key: 'task', title: '과제 · 평가', icon: 'ti-file-text',
    items: [
      {
        href: '/teacher/assignments', label: '학습지관리', icon: 'ti-file-text',
        summary: '레벨학습지·쌍둥이학습지 배정, 제출 확인, 점수 입력, 다음 단계 처리. 초등 70점 규칙은 위 안내를 꼭 봐주세요.',
        steps: [
          '「+ 학습지 배정」 → 레벨학습지 / 쌍둥이학습지, 개별 배정 / 일괄 배정.',
          '학생이 내면 「제출확인」 → 「점수입력」 → 다음 단계 버튼을 눌러요.',
          '잘못 눌렀으면 「최근 24시간 완료 처리」에서 「되돌리기」.',
          '「레벨 현황판」: 학년별 학생 × 단원 표. ✓ 통과, 빨간 테두리는 70점 못 넘기고 멈춘 단원.',
          '「병행교재」 탭에서 병행교재 과제를 배정·채점해요.',
        ],
      },
      {
        href: '/teacher/exams', label: '평가관리', icon: 'ti-clipboard-check',
        summary: '입학테스트 · 진단평가 · 코어테스트 · 학교시험 점수를 기록해요. 초등 단원평가는 위 파란 안내를 꼭 봐주세요.',
        steps: [
          '「+ 평가 등록」 → 날짜, 시험 종류, 범위, 레벨·점수.',
          '코어테스트는 「+ 코어테스트 일괄입력」으로 한 번에. 날짜가 다른 학생은 「이 학생만 다른 날짜였어요」.',
          '「학교시험」 탭 — 중·고등은 중간·기말고사, 초등은 학교 단원평가를 넣어요 (학기+단원을 고르면 단원명이 자동으로 채워져요).',
          '「단원평가 현황판」: 학년별 담당 학생 × 1~8단원 점수 표. 빈칸을 누르면 그 자리에서 바로 입력돼요.',
        ],
        notes: [
          '입학테스트는 신규 학생에게만 1회 등록하면 돼요.',
          '초등은 중간·기말고사가 없어요. 단원평가가 곧 학교 성적이라 볼 때마다 기록해주세요.',
        ],
      },
      {
        href: '/teacher/exam-prep', label: '시험배정', icon: 'ti-target',
        summary: '중·고등 내신 대비 교재 배정과 학교 시험 일정 관리.',
        steps: [
          '「+ 배정」 → 학생, 시험 범위, 반(S 상위 / B 기본), 단원, 시험 날짜.',
          '「학생별 진도」에서 단원별 점수·성취도를 넣어요.',
          '「시험 일정」은 원장·직원·주임만 추가할 수 있어요. 저장하면 학생·학부모에게 알림이 가요.',
        ],
      },
    ],
  },
  {
    key: 'report', title: '보고', icon: 'ti-chart-bar',
    items: [
      {
        href: '/teacher/reports', label: '보고서', icon: 'ti-chart-bar',
        summary: '학습 보고서 · 월간 보고서 · 성적표를 만들어 카카오톡용 이미지로 저장해요.',
        steps: [
          '「월간 보고서」 → 학생·연·월 → 「불러오기」 → 한 줄 평 작성(또는 「AI 자동생성」) → 「이미지 저장」.',
          '「성적표」 → 학생 → 「이미지 저장」.',
        ],
        notes: ['"학습일지 미입력 N건"이 뜨면 결석인지, 기록을 빠뜨린 건지 확인한 뒤 보내주세요.'],
      },
      {
        href: '/teacher/import-records', label: '학습기록가져오기', icon: 'ti-file-import',
        summary: '다른 프로그램의 학습기록 화면을 캡처해 올리면 AI가 읽어서 저장해요.',
        steps: ['이미지 업로드 → 학생이 맞는지 확인(틀리면 「변경」) → 항목 선택 → 「N건 StudyCheck에 저장」.'],
      },
    ],
  },
  {
    key: 'admin', title: '원장 전용', icon: 'ti-crown',
    items: [
      { href: '/teacher/worksheets', label: '학습지출제', icon: 'ti-file-plus', adminOnly: true,
        summary: '문제은행으로 학습지를 만들고 QR 시험지로 인쇄해요.',
        steps: ['교재 연계 / 문제은행(유형별·단원별) / 목적별 중 고르기 → 조건 선택 → 인쇄 화면.',
          '교재 연계 → 시중교재에서 학기 칸 아래 「문항 직접 고르기」를 누르면, 교재를 펴듯 쪽(또는 번호 구간)에서 문항을 골라 학습지를 만들 수 있어요. 고른 문항에 쌍둥이·유사 문제를 1~3개씩 붙일 수 있습니다.',
          '문항 그림에는 교재 원래 번호가 안 나와요(학습지는 1, 2, 3…으로 다시 매깁니다). 원래 몇 쪽 몇 번인지는 인쇄 화면 정답표의 「출처」에 「라이트쎈 중2-2 53쪽 0232번」처럼 나옵니다.'] },
      { href: '/teacher/gradings', label: '채점결과', icon: 'ti-checkbox', adminOnly: true,
        summary: '학생이 QR로 스스로 채점한 결과를 시험지별로 봐요.',
        steps: ['학생별 「틀린 문제 그대로」 「쌍둥이 문제」 「같은 유형 다른 문제」로 재출제.', '서술형은 「풀이 사진 보기」로 ○ / ✗.'] },
      { href: '/teacher/work-status', label: '업무현황', icon: 'ti-briefcase', adminOnly: true,
        summary: '강사별 수업일지 작성 여부, 미처리 학습지, 주간 작성률.',
        steps: ['「오늘 현황」 「미처리 학습지」 「주간 작성률」 탭.'] },
      { href: '/teacher/settings', label: '설정', icon: 'ti-settings', adminOnly: true,
        summary: '선생님 계정 추가·수정, 주임 지정, 진도일괄입력 메뉴 켜기/끄기.',
        steps: ['「+ 계정 추가」 → 이름·이메일·초기 비밀번호·역할.'] },
    ],
  },
]

const DAILY_FLOW = [
  { icon: 'ti-layout-dashboard', title: '출근하면 대시보드', desc: '오늘 할 일 · 전달사항 확인' },
  { icon: 'ti-notebook', title: '수업 후 학습관리', desc: '수업일지 저장 + 알림장' },
  { icon: 'ti-file-text', title: '학습지관리', desc: '제출확인 → 점수입력 → 다음 단계' },
  { icon: 'ti-circle-check', title: '대시보드 다시 확인', desc: '"오늘 모든 업무 완료!" 뜨면 끝' },
]

export default function TeacherManualPage() {
  const { isAdmin } = useAuth()
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const admin = isAdmin()

  const q = query.trim()
  const groups = GROUPS
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => (admin || !i.adminOnly) && (!q ||
        [i.label, i.summary, ...i.steps, ...(i.notes ?? [])].some((t) => t.includes(q)))),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header title="사용 매뉴얼" subtitle="처음이거나 헷갈릴 때 여기부터 보세요" />

      <div className="px-4 py-4 space-y-4 md:px-6 max-w-3xl">
        {/* 하루 흐름 */}
        <section className="rounded-2xl p-4" style={{ background: '#F0FBF7', border: '1px solid #9FE1CB' }}>
          <h2 className="text-sm font-bold mb-3 flex items-center gap-1.5" style={{ color: '#085041' }}>
            <i className="ti ti-route" style={{ fontSize: 16 }} />하루 업무 흐름
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {DAILY_FLOW.map((s, i) => (
              <div key={s.title} className="rounded-xl bg-white p-3" style={{ border: '1px solid #d1f0e4' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: '#085041', color: 'white' }}>{i + 1}</span>
                  <i className={`ti ${s.icon}`} style={{ fontSize: 15, color: '#0F6E56' }} />
                </div>
                <p className="text-xs font-bold text-gray-800">{s.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 초등 레벨학습지 규칙 - 가장 중요 */}
        <section className="rounded-2xl p-4 space-y-3" style={{ background: '#fef2f2', border: '1px solid #fca5a5' }}>
          <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#991b1b' }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 16 }} />초등 레벨학습지 규칙 (꼭 읽어주세요)
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: '#7f1d1d' }}>
            초등 레벨학습지는 <b>학교 단원평가 대비용</b>이에요. 학교는 진도 순서대로 단원평가를 보기 때문에,
            단원을 제대로 통과하지 못한 채 다음 단원으로 넘어가면 그 단원평가를 준비 없이 보게 돼요.
          </p>

          <div className="grid md:grid-cols-2 gap-2">
            <div className="rounded-xl bg-white p-3" style={{ border: '1px solid #bbf7d0' }}>
              <p className="text-xs font-bold" style={{ color: '#166534' }}>
                <i className="ti ti-circle-check" style={{ fontSize: 13 }} /> 70점 이상
              </p>
              <p className="text-[11px] text-gray-600 mt-1">「레벨업↑」 또는 「완료」 (85점 이상이면 레벨업 추천)</p>
            </div>
            <div className="rounded-xl bg-white p-3" style={{ border: '1px solid #fca5a5' }}>
              <p className="text-xs font-bold" style={{ color: '#991b1b' }}>
                <i className="ti ti-circle-x" style={{ fontSize: 13 }} /> 70점 미만 — 아래 중 하나만 가능
              </p>
              <ul className="text-[11px] text-gray-600 mt-1 space-y-0.5">
                <li>• 「재도전」 같은 단원 · 같은 레벨 다시</li>
                <li>• 「레벨↓ 재도전」 0.5레벨 낮춰서 같은 단원 다시</li>
                <li>• 「오답유사」 → 채점하면 <b>같은 레벨 재도전이 자동 배정</b></li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl bg-white p-3 space-y-1.5 text-[11px] text-gray-700 leading-relaxed">
            <p><b>오답 풀이는 꼭 해주세요.</b> 재도전 전에 틀린 문제를 학생과 같이 풀어봐야 다음 점수가 올라가요. "고쳐와"로 끝내면 안 돼요.</p>
            <p><b>혼자 힘으로 어려운 학생</b>은 「레벨↓ 재도전」으로 닿을 수 있는 레벨에서 단원을 통과시켜 주세요.</p>
            <p><b>그래도 안 될 때</b>(레벨을 낮춰도 3차 이상 실패, 긴 결석 등)만 「예외요청」에 사유를 적어 보내면 원장님이 승인해요.</p>
            <p>학습지 옆 <span className="px-1 rounded font-bold" style={{ background: '#fee2e2', color: '#991b1b' }}>2차</span>{' '}
              <span className="px-1 rounded font-bold" style={{ background: '#991b1b', color: 'white' }}>3차</span>는
              같은 레벨을 몇 번째 푸는지예요. 3차가 보이면 풀이 방법을 바꾸거나 레벨을 낮춰주세요.</p>
            <p>「학습지 배정」 탭 맨 위 <b>"70점 못 넘기고 멈춘 단원"</b>은 단원평가 전에 다시 풀려야 하는 학생이에요. 「재도전 배정」을 눌러주세요.</p>
          </div>
        </section>

        {/* 초등 학교시험 = 단원평가 - 초등 담당 선생님이 자주 놓치는 부분 */}
        <section className="rounded-2xl p-4 space-y-3" style={{ background: '#EFF6FF', border: '1px solid #93c5fd' }}>
          <h2 className="text-sm font-bold flex items-center gap-1.5" style={{ color: '#1e3a5f' }}>
            <i className="ti ti-school" style={{ fontSize: 16 }} />초등 학교시험은 「단원평가」예요 (초등 담당 선생님 꼭 읽어주세요)
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: '#1e40af' }}>
            평가관리의 <b>「학교시험」</b> 탭에 중·고등은 <b>중간·기말고사</b>를 넣지만,
            초등은 학교에서 보는 <b>단원평가</b> 점수를 넣어요. 초등은 중간·기말고사가 없으니
            단원평가가 곧 학교 성적이에요. <b>단원평가를 본 날마다 점수를 기록해주세요.</b>
          </p>

          <div className="grid md:grid-cols-2 gap-2">
            <div className="rounded-xl bg-white p-3" style={{ border: '1px solid #bfdbfe' }}>
              <p className="text-xs font-bold" style={{ color: '#1e3a5f' }}>
                <i className="ti ti-pencil-plus" style={{ fontSize: 13 }} /> 넣는 방법
              </p>
              <ul className="text-[11px] text-gray-600 mt-1 space-y-0.5">
                <li>• 평가관리 → <b>「학교시험」</b> 탭 → 「+ 평가 등록」</li>
                <li>• 시험 종류에서 <b>「단원평가」</b> 선택</li>
                <li>• <b>학기 + 몇 단원</b>만 고르면 단원명은 자동으로 채워져요</li>
                <li>• 점수를 넣고 저장</li>
              </ul>
            </div>
            <div className="rounded-xl bg-white p-3" style={{ border: '1px solid #bfdbfe' }}>
              <p className="text-xs font-bold" style={{ color: '#1e3a5f' }}>
                <i className="ti ti-table" style={{ fontSize: 13 }} /> 한눈에 보는 방법
              </p>
              <ul className="text-[11px] text-gray-600 mt-1 space-y-0.5">
                <li>• 「학교시험」 탭의 <b>「단원평가 현황판」</b>을 누르면</li>
                <li>• 학년별로 <b>담당 학생 전체 × 1~8단원</b> 점수가 한 표에 나와요</li>
                <li>• 빈칸(<b>–</b>)을 누르면 <b>그 학생 그 단원 입력창</b>이 바로 열려요</li>
                <li>• 점수가 있는 칸을 누르면 고칠 수 있어요</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl bg-white p-3 space-y-1.5 text-[11px] text-gray-700 leading-relaxed">
            <p><b>맨 위 빨간 글씨</b>로 <b>"이번 학기 1단원 점수가 아직 없는 학생"</b>이 이름으로 떠요.
              이름을 누르면 바로 입력창이 열립니다. 학교는 진도 순서대로 보니까 1단원은 대부분 이미 끝났어요.</p>
            <p>학기를 잘못 고르면 다른 학기 칸에 들어가요. <b>1학기 · 2학기</b> 버튼을 먼저 확인해주세요.</p>
            <p>단원평가 점수는 <b>학부모·학생 앱과 월간보고서</b>에도 그대로 나가요. 밀리면 학부모가 볼 기록이 비어 보입니다.</p>
            <p>초등 레벨학습지가 바로 이 <b>단원평가 대비용</b>이에요 — 위 빨간 안내와 같이 봐주세요.</p>
          </div>
        </section>

        {/* 검색 */}
        <div className="relative">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2" style={{ fontSize: 15, color: '#9ca3af' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="찾는 기능 검색 (예: 결석, 알림장, 교재 배정)"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
        </div>

        {/* 메뉴별 설명 */}
        {groups.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-6">"{q}"에 해당하는 내용이 없어요</p>
        )}
        {groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2 className="text-[11px] font-bold tracking-wider px-1 flex items-center gap-1.5" style={{ color: '#6b7280' }}>
              <i className={`ti ${g.icon}`} style={{ fontSize: 13 }} />{g.title}
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {g.items.map((item) => {
                const isOpen = open === item.href || !!q
                return (
                  <div key={item.href}>
                    <button onClick={() => setOpen(open === item.href ? null : item.href)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left">
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: '#F0FBF7', color: '#0F6E56' }}>
                        <i className={`ti ${item.icon}`} style={{ fontSize: 17 }} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-gray-800">{item.label}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{item.summary}</span>
                      </span>
                      <i className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'} mt-1`} style={{ fontSize: 14, color: '#9ca3af' }} />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 space-y-2" style={{ paddingLeft: 60 }}>
                        <ol className="space-y-1">
                          {item.steps.map((s, i) => (
                            <li key={i} className="text-xs text-gray-700 leading-relaxed flex gap-2">
                              <span className="font-bold shrink-0" style={{ color: '#0F6E56' }}>{i + 1}.</span>{s}
                            </li>
                          ))}
                        </ol>
                        {item.notes?.map((n, i) => (
                          <p key={i} className="text-[11px] rounded-lg px-2.5 py-1.5 leading-relaxed"
                            style={{ background: '#FFFBEB', color: '#92400e' }}>
                            <i className="ti ti-info-circle" style={{ fontSize: 12 }} /> {n}
                          </p>
                        ))}
                        <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#0F6E56' }}>
                          {item.label} 바로가기 <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {/* 권한 */}
        <section className="rounded-2xl p-4 text-xs text-gray-600 space-y-1 leading-relaxed" style={{ background: '#f9fafb' }}>
          <p className="font-bold text-gray-700 mb-1">누가 무엇을 볼 수 있나요?</p>
          <p>• <b>강사</b>: 본인 담당 학생만 보고 다뤄요.</p>
          <p>• <b>주임</b>: 「주임 모드」를 켜면 담당 학년 전체를 <b>볼 수만</b> 있어요 (수정은 본인 담당만).</p>
          <p>• <b>직원 · 원장</b>: 전체 학생을 봐요. 원장님 전용 메뉴는 「관리자 모드」일 때만 보여요.</p>
        </section>
      </div>
    </div>
  )
}
