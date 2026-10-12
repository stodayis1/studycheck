// 문자 보내기 — 수학OPS 를 거친다.
//
// 왜 알리고가 아니라 OPS 인가
//   · 알림톡(알리고)은 카카오 심사를 통과한 템플릿과 본문이 **글자 단위로 같아야** 나간다.
//     선생님께 보내는 알림은 그날 학생 이름이 매번 달라 템플릿으로 만들기 어렵다(심사 4~5일).
//   · 알리고 **문자** 는 호스트가 apis.aligo.in 으로 다른데, 우리 중계 RPC(aligo_call)는
//     알림톡 호스트(kakaoapi.aligo.in)로 고정돼 있다. 고정 IP 때문에 둔 중계라 함부로 넓히면
//     그 경로로 아무거나 쏠 수 있게 된다.
//   · 반면 OPS 에는 **이미 돌아가는** 문자 발송(솔라피)이 있다 — 발신번호·키·발송기록(sms_logs)·
//     테스트 모드까지. 한 곳만 쓰는 것이 맞다.
import { createHash } from 'crypto'

export interface SmsResult {
  ok: boolean
  dryRun?: boolean
  error?: string
}

/** OPS 주소 — 결석 연동이 쓰는 값에서 끌어 쓴다(둘이 어긋나면 안 된다). */
function opsBase() {
  const url = process.env.OPS_SYNC_URL ?? 'https://sumath-admin.vercel.app/api/absences/sync-from-studycheck'
  try {
    return new URL(url).origin
  } catch {
    return 'https://sumath-admin.vercel.app'
  }
}

export async function sendSmsViaOps(a: {
  to: string; text: string; refType?: string; refId?: string | null
}): Promise<SmsResult> {
  const secret = process.env.OPS_SYNC_SECRET
  if (!secret) return { ok: false, error: 'OPS_SYNC_SECRET 환경변수가 없어요 (Vercel 설정 확인)' }
  const to = String(a.to ?? '').replace(/\D/g, '')
  if (!to) return { ok: false, error: '받는 번호가 없어요' }

  try {
    const res = await fetch(`${opsBase()}/api/sms/send-from-studycheck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret },
      body: JSON.stringify({ receiver: to, msg: a.text, ref_type: a.refType ?? 'studycheck', ref_id: a.refId ?? null }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? `OPS 문자 발송 실패 (HTTP ${res.status})` }
    }
    return { ok: true, dryRun: !!data.dryRun }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'OPS 에 연결하지 못했어요' }
  }
}

/** 같은 내용을 두 번 보내지 않도록 쓰는 짧은 지문(로그 대조용). */
export function textFingerprint(text: string) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}
