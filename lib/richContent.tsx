// 공지사항 등에서 쓰는 아주 가벼운 서식 문법.
// 굳이 진짜 HTML(rich text)을 그대로 저장하지 않는 이유: 저장되는 문자열을 앱이 직접 정의한
// 토큰([c:색][/c], [img]...[/img])만 해석해서 렌더링하므로, 누가 이상한 HTML/스크립트를 붙여넣어도
// 화면에 그대로 실행되지 않는다(항상 우리가 만든 안전한 태그로만 변환됨).
// 기존에 저장된 순수 텍스트 공지는 토큰이 하나도 없으니 그대로 텍스트로 보여진다 - 호환성 문제 없음.

export interface ColorOption {
  key: string
  label: string
  hex: string
}

export const COLOR_PALETTE: ColorOption[] = [
  { key: 'red', label: '빨강', hex: '#ef4444' },
  { key: 'orange', label: '주황', hex: '#f97316' },
  { key: 'green', label: '초록', hex: '#22c55e' },
  { key: 'blue', label: '파랑', hex: '#3b82f6' },
  { key: 'purple', label: '보라', hex: '#a855f5' },
]

export const COLOR_MAP: Record<string, string> = Object.fromEntries(COLOR_PALETTE.map((c) => [c.key, c.hex]))

export const EMOJI_PICKS = [
  '📢', '🔔', '⚠️', '❗', '📌', '✅', '📝', '📅',
  '🎉', '🏖️', '📚', '✏️', '😊', '👍', '💪', '🙏',
  '🎓', '⏰', '📖', '🔥', '💡', '🌟', '🚫', '❌',
]

// content 문자열 안의 [c:key]...[/c], [img]url[/img] 토큰을 찾아서 React 노드 배열로 변환.
// 줄바꿈은 컨테이너에 whiteSpace: pre-wrap을 적용하는 걸 전제로 그대로 문자열에 남겨둔다.
export function renderRichContent(content: string): React.ReactNode[] {
  if (!content) return []
  const tokenRegex = /\[c:(\w+)\]([\s\S]*?)\[\/c\]|\[img\]([\s\S]*?)\[\/img\]/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = tokenRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index))
    }
    if (match[1] !== undefined) {
      // 색상 토큰: [c:red]텍스트[/c]
      const hex = COLOR_MAP[match[1]] ?? undefined
      nodes.push(
        <span key={`c-${key++}`} style={hex ? { color: hex, fontWeight: 700 } : undefined}>
          {match[2]}
        </span>
      )
    } else if (match[3] !== undefined) {
      // 이미지 토큰: [img]url[/img]
      const url = match[3].trim()
      if (url) {
        nodes.push(
          <img key={`img-${key++}`} src={url} alt="공지 이미지"
            className="rounded-xl mt-2 max-w-full"
            style={{ maxHeight: 260, objectFit: 'cover' }} />
        )
      }
    }
    lastIndex = tokenRegex.lastIndex
  }
  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex))
  }
  return nodes
}

// 목록/배너처럼 한 줄 미리보기가 필요한 곳에서 토큰을 제거하고 순수 텍스트만 뽑아낼 때 사용.
export function stripRichTokens(content: string): string {
  if (!content) return ''
  return content
    .replace(/\[c:\w+\]([\s\S]*?)\[\/c\]/g, '$1')
    .replace(/\[img\][\s\S]*?\[\/img\]/g, '📷 사진')
    .trim()
}
