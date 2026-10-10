// 수학OPS 에 있는 선생님 연락처를 읽어 온다.
//
// 왜: 스터디체크 users 에는 전화번호 칸이 없다(이름·이메일·역할뿐). 선생님께 카톡을
// 보내려면 번호가 필요한데, 그건 OPS profiles 에 있다. 한 곳에만 두고 OPS 를 읽는다 —
// 같은 번호를 두 DB 에 복사해 두면 한쪽이 바뀔 때 조용히 어긋난다.
import { createClient } from '@supabase/supabase-js'

/** 이름 → 휴대폰 번호(숫자만). OPS 를 못 읽으면 빈 Map. */
export async function fetchOpsTeacherPhones(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return out
  try {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data } = await db.from('profiles').select('name, phone').eq('active', true)
    for (const p of data ?? []) {
      const phone = String((p as any).phone ?? '').replace(/\D/g, '')
      const name = String((p as any).name ?? '').trim()
      if (name && phone) out.set(name, phone)
    }
  } catch {
    // 연락처를 못 읽어도 나머지 기능은 돌아가야 한다.
  }
  return out
}
