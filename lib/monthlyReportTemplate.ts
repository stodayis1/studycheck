// 월간 학습 리포트 알림톡 — **등록할 원문**이자 **보낼 본문의 틀**.
//
// 원장님 2026-10-20 「이런식으로 나도 학생들 한달에 한번 리포트를 만들건데」
// 원장님 2026-10-24 「카톡 템플릿은 월간리포트에 대한거지?」 → 맞다. 이것.
//
// ★ 알리고는 변수를 채워 주지 않는다. 우리가 만든 본문이 **승인된 템플릿과 글자 단위로
//   같아야** 나가고, 안 맞으면 **에러도 없이 그냥 안 간다**. 그래서 원문을 여기 한 군데만
//   두고, 보낼 본문도 이 틀에서 만든다. 템플릿을 고치면 이 상수도 같이 고쳐야 한다.
//   (수업 브리핑과 같은 규칙 — docs/카톡브리핑.md)
//
// ★ 왜 본문이 짧은가
//   알림톡 본문은 1000자가 한도지만, 월간 리포트의 내용은 **링크 뒤 한 장**에 다 있다.
//   본문에는 「열어 볼 이유」만 담는다. 변수가 적을수록 심사도 수월하고, 글자 단위
//   대조가 어긋날 자리도 줄어든다.
import type { MonthlyReport } from './monthlyReport'

/** 알리고 콘솔에 **그대로** 넣을 원문. */
export const MONTHLY_TEMPLATE = `[수학의지혜 월간 학습 리포트]
#{학생명} 학생 · #{기간}

▶ 수업 출석  #{출석}
▶ 과제 달성률  #{과제달성률}
▶ 과제 성취도  #{과제성취도}
▶ 이번 달 오른 단원  #{오른단원}

▶ 담당 선생님 한마디
#{선생님한마디}

아래 버튼에서 이번 달 리포트를 보실 수 있어요.
단원별 도달 레벨, 시험대비 진행, 오답 재도전까지 한 장에 담았습니다.`

/** 버튼 — 웹링크 하나. 이름은 템플릿에 박히므로 달 이름을 넣을 수 없다. */
export const MONTHLY_BUTTON_NAME = '월간 학습 리포트 보기'

export const MONTHLY_BODY_LIMIT = 1000

// 칸마다의 상한. 골격이 약 170자라 넉넉하다. 선생님 한마디만 길어질 수 있어 거기에 몰아 준다.
const CAP = {
  학생명: 20,
  기간: 14,
  출석: 30,
  과제달성률: 14,
  과제성취도: 14,
  오른단원: 60,
  선생님한마디: 500,
}

/** 길면 자르고 말줄임표를 붙인다. 템플릿 골격은 건드리지 않는다. */
function cut(s: string, n: number) {
  const t = String(s ?? '').replace(/\s+$/g, '')
  return t.length <= n ? t : t.slice(0, n - 1) + '…'
}

export interface MonthlyMessage {
  subject: string
  body: string
  bodyLen: number
  overLimit: boolean
  /** 버튼에 넣을 주소 */
  url: string
}

/**
 * 스냅샷(buildMonthlyReport 결과)으로 보낼 본문을 만든다.
 * ★ 화면 미리보기와 실제 발송이 **이 함수 하나**를 같이 쓴다 — 따로 두면 어긋난다.
 */
export function buildMonthlyMessage(r: MonthlyReport, url: string): MonthlyMessage {
  // 출석 — 「18회 중 17회 (지각 1)」. 결석이 없으면 괄호를 안 붙인다.
  const 결석 = r.lessons.absent, 지각 = r.lessons.late
  const 꼬리 = [지각 ? `지각 ${지각}` : '', 결석 ? `결석 ${결석}` : ''].filter(Boolean).join(' · ')
  const 출석 = r.lessons.total
    ? `${r.lessons.total}회 중 ${r.lessons.onTime + 지각}회${꼬리 ? ` (${꼬리})` : ''}`
    : '기록 없음'

  // 이번 달에 레벨이 오른 단원 — 원장님이 가장 중요하다고 하신 값이다.
  const 오른 = r.unitLevels.filter((u) => u.gained > 0)
  const 오른단원 = 오른.length === 0
    ? '없음'
    : 오른.length === 1
      ? `${오른[0].name || 오른[0].unit} (${오른[0].level}레벨)`
      : `${오른.length}개 단원 — ${오른[0].name || 오른[0].unit} 외 ${오른.length - 1}개`

  // ★ 선생님이 **월간 리포트용으로 쓴 한 줄 평(comment)** 만 쓴다.
  //   teacherNote(그 달 마지막 알림장)로 떨어뜨리면 하루치 이야기가 월간 리포트에
  //   실린다 — 「오늘 15분 지각을 해서…」 같은 글이 한 달 총평 자리에 들어갔다
  //   (2026-10-24 이지훈·윤수지에서 확인). 안 쓰셨으면 무난한 문장으로 둔다.
  const 한마디 = (r.comment ?? '').trim()
    || `${r.period.month}월 한 달 기록을 정리했습니다. 단원별 도달 레벨을 함께 봐 주세요.`

  const body = MONTHLY_TEMPLATE
    .replace('#{학생명}', cut(r.student.grade ? `${r.student.name}(${r.student.grade})` : r.student.name, CAP.학생명))
    .replace('#{기간}', cut(r.period.label, CAP.기간))
    .replace('#{출석}', cut(출석, CAP.출석))
    .replace('#{과제달성률}', cut(r.homework.achievement != null ? `${r.homework.achievement}%` : '기록 없음', CAP.과제달성률))
    .replace('#{과제성취도}', cut(r.homework.score != null ? `${r.homework.score}%` : '기록 없음', CAP.과제성취도))
    .replace('#{오른단원}', cut(오른단원, CAP.오른단원))
    .replace('#{선생님한마디}', cut(한마디, CAP.선생님한마디))

  return {
    subject: `${r.period.label} 학습 리포트`,
    body,
    bodyLen: body.length,
    overLimit: body.length > MONTHLY_BODY_LIMIT,
    url,
  }
}
