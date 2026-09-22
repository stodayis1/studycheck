'use client'

// 특정 기능키를 막는다. 원장님 요청(F10, F12).
//
// ⚠️ 한계를 알고 쓸 것 — 이건 "장벽"이 아니라 "문턱"이다.
//   - 브라우저마다 다르다. 크롬·엣지는 F12를 브라우저가 먼저 가로채기 때문에 페이지에서
//     preventDefault를 해도 개발자도구가 열릴 수 있다.
//   - 막아도 우회 경로가 그대로 남아 있다: Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C,
//     우클릭 → 검사, 브라우저 메뉴 → 도구 더보기 → 개발자도구, Ctrl+U(소스보기),
//     주소창의 view-source:, 자바스크립트 끄기, 모바일에서는 PC 연결 디버깅.
//   - 따라서 "브라우저로 내려간 데이터"를 지키는 수단으로는 쓸 수 없다.
//     정말 감춰야 하는 값은 애초에 브라우저로 내려보내지 않는 것이 유일한 방법이다.
//     (docs/보안.md 참고)
//
// 여기에 키를 추가하면 같이 막힌다. 조합키를 막으려면 아래 handler에 조건을 더한다.
const BLOCKED_KEYS = new Set(['F10', 'F12'])

import { useEffect } from 'react'

export default function KeyGuard(): null {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!BLOCKED_KEYS.has(e.key)) return
      e.preventDefault()
      e.stopPropagation()
    }
    // capture 단계에서 잡아야 화면 안쪽 컴포넌트보다 먼저 처리된다
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return null
}
