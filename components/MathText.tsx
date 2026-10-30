'use client'

/**
 * 글 속의 `$…$` 를 **수식 모양**으로 그린다.
 *
 * 어디서 왔나
 *   `main:components/exam-analysis/QuestionRender.tsx` (SHA-256 `fd92517a8a18a1bde7be338e0c2cc204ad3f4327007963aae53097059704c602`)
 *   의 `MathText` 를 로직 그대로 올린 것이다. 새로 만든 규칙이 아니라 저장소가 이미 쓰는 규칙이다 —
 *   기출 타이핑 문항이 같은 `$…$` 문법으로 저장돼 있다.
 *
 * 왜 옮겼나
 *   원본은 `@/lib/examAnalysis` 의 `CIRCLES` 를 함께 import 하는 **시험지 분석 전용** 파일이다.
 *   학습 화면이 그 모듈을 통째로 끌어올 이유가 없어서, 수식 부분만 공용 자리로 올렸다.
 *   두 브랜치를 합칠 때 `QuestionRender.tsx` 가 **여기서 import 하도록** 바꾸면 한 벌이 된다.
 *   지금 두 벌인 것은 아직 합치지 않았기 때문이고, 로직은 같다.
 *
 * 글꼴
 *   MathLive 가 쓰는 수식 글꼴은 `public/mathlive/fonts` 에 이미 들어 있다 (명조 계열).
 *   `mathlive` 는 `package.json` 에 **이미 있는 의존성**이다 — 새로 깐 것이 없다.
 */
import { useEffect, useState } from 'react'
import 'mathlive/static.css'

let mathlive: Promise<any> | null = null
function loadMath() {
  if (!mathlive) mathlive = import('mathlive')
  return mathlive
}

export function MathText({ text }: { text: string | null | undefined }) {
  const [ml, setMl] = useState<any>(null)
  useEffect(() => { loadMath().then(setMl) }, [])
  const parts = String(text ?? '').split(/(\$[^$]+\$)/g)
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((s, i) => {
        if (s.length > 2 && s.startsWith('$') && s.endsWith('$')) {
          const latex = s.slice(1, -1)
          // 아직 안 불러왔으면 LaTeX 원문을 보여 준다. 빈 칸으로 두지 않는다
          if (!ml) return <span key={i}>{latex}</span>
          let html = ''
          try { html = ml.convertLatexToMarkup(latex) } catch {
            return <span key={i} style={{ color: '#dc2626' }}>{s}</span>
          }
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        }
        return <span key={i}>{s}</span>
      })}
    </span>
  )
}
