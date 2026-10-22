// 옛 주소 — 「출제한 학습지」는 이제 /teacher/worksheets 가 첫 화면이다 (탭 「내 학습지」).
// 예전에 붙여 둔 길이 끊기지 않게 그대로 넘겨 준다.
import { redirect } from 'next/navigation'

export default function Page() {
  redirect('/teacher/worksheets')
}
