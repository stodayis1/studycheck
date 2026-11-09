/**
 * 진로 설문 — 한 학생의 학생용·학부모용 링크 (선생님 화면 「링크 복사」·「테스트 학생 링크 열기」)
 *
 *   POST { studentId, testForm? }  →  { student, parent, newsStudent, newsParent, form }
 *     student·parent = 질문지 링크(/c/), newsStudent·newsParent = 학생부 로드맵 소식 링크(/r/, 같은 토큰)
 *
 * ★ 직원만(staffOrDeny). 링크가 없으면 만든다. 실제 문자는 보내지 않는다.
 *   카카오톡으로 직접 보내 주거나, 테스트 학생으로 직접 열어 보는 데 쓴다.
 */
import { NextResponse } from 'next/server'
import { staffOrDeny } from '@/lib/apiAuth'
import { serviceDb, ensureLink, linkUrl, formForSend, SITE } from '@/lib/careerServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const who = await staffOrDeny(req)
  if (who.deny) return who.deny
  const b = await req.json().catch((): any => null)
  const db = serviceDb()
  const { data: s } = await db.from('students').select('id, name, grade').eq('id', String(b?.studentId ?? '')).maybeSingle()
  if (!s) return NextResponse.json({ error: '학생을 찾지 못했어요.' }, { status: 404 })
  const form = formForSend(s, b?.testForm)
  if (!form) return NextResponse.json({ error: '학생부 로드맵 질문지 대상 학년(중3·고1)이 아니에요.' }, { status: 400 })
  const [st, pa] = [await ensureLink(db, s.id, 'student', form), await ensureLink(db, s.id, 'parent', form)]
  return NextResponse.json({
    form, student: linkUrl(st), parent: linkUrl(pa),
    // 소식 링크 — 원장님 2026-11-07 「링크를 어디서 따와야 하는 거지?」 (복사 단추가 질문지 것만 있었다)
    newsStudent: `${SITE}/r/${st}`, newsParent: `${SITE}/r/${pa}`,
  })
}
