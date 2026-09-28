'use client'

// 알림(푸시)·연동 요청이 실패했을 때 사람에게 알려주는 함수.
//
// 예전에는 화면마다 이렇게 돼 있었다:
//   apiFetch('/api/push/send', { ... }).catch(() => {})
// 결과를 통째로 버리니, 서버에 VAPID 키가 없어서 푸시가 **한 번도** 안 나가는 상태를
// 몇 달 동안 아무도 몰랐다(2026-09-28 발견). 실패는 눈에 보여야 한다.
//
// 알림을 켠 사람이 아무도 없어서 0명에게 간 경우는 정상이므로 조용히 넘어간다.
// 서버 설정 문제(skipped)나 발송 실패(failed)만 알린다.

export async function reportPushResult(res: Response, 무엇: string) {
  const data = await res.json().catch(() => null as any)
  if (!res.ok) {
    alert(`${무엇} 알림을 보내지 못했어요.\n\n${data?.error ?? `서버 응답 ${res.status}`}\n\n원장님께 알려주세요.`)
    return
  }
  if (data?.skipped) {
    // 예: "VAPID 키가 서버에 설정되지 않았어요." — 설정이 빠진 상태라 앞으로도 계속 실패한다
    alert(`${무엇} 알림이 발송되지 않았어요.\n\n${data.skipped}\n\n설정 문제라 계속 안 나갑니다. 원장님께 알려주세요.`)
    return
  }
  if ((data?.failed ?? 0) > 0 && (data?.sent ?? 0) === 0) {
    alert(`${무엇} 알림이 한 명에게도 도착하지 못했어요. (실패 ${data.failed}건)\n\n` +
      `학생·학부모가 앱에서 「알림 켜기」를 다시 눌러야 할 수 있어요.`)
  }
}

export function reportSendError(e: any, 무엇: string) {
  alert(`${무엇} 알림을 보내지 못했어요.\n\n${e?.message ?? '연결 실패'}\n\n원장님께 알려주세요.`)
}
