// 공지사항 등에서 쓰는 아주 가벼운 서식 문법.
// 굳이 진짜 HTML(rich text)을 그대로 저장하지 않는 이유: 저장되는 문자열을 앱이 직접 정의한
// 토큰([b]..[/b], [c:색][/c], [sz:크기][/sz], [f:폰트][/f], [img]...[/img])만 해석해서 렌더링하므로,
// 누가 이상한 HTML/스크립트를 붙여넣어도 화면에 그대로 실행되지 않는다(항상 우리가 만든 안전한 태그로만 변환됨).
// 기존에 저장된 순수 텍스트 공지는 토큰이 하나도 없으니 그대로 텍스트로 보여진다 - 호환성 문제 없음.
// 태그는 중첩 가능 (예: [b][c:red]굵고 빨간 글씨[/c][/b]).

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

export interface SizeOption {
  key: string
  label: string
  px: number
}

export const SIZE_PALETTE: SizeOption[] = [
  { key: 'sm', label: '작게', px: 11 },
  { key: 'lg', label: '크게', px: 17 },
  { key: 'xl', label: '아주크게', px: 22 },
]
export const SIZE_MAP: Record<string, string> = Object.fromEntries(SIZE_PALETTE.map((s) => [s.key, `${s.px}px`]))

export interface FontOption {
  key: string
  label: string
  stack: string
}

// 별도 폰트 파일을 새로 불러오지 않고(사이트 전체에 영향 줄 수 있어서) 기기에 이미 깔려있는
// 글꼴만 사용한다 - 한글 고딕/명조/손글씨 계열은 대부분 윈도우·맥·모바일에 기본 내장돼 있음.
export const FONT_PALETTE: FontOption[] = [
  { key: 'gothic', label: '고딕체', stack: "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif" },
  { key: 'myeongjo', label: '명조체', stack: "'Nanum Myeongjo', 'Batang', 'BatangChe', serif" },
  { key: 'pen', label: '손글씨체', stack: "'HYGungSo-Bold', 'Segoe Print', 'Nanum Pen Script', cursive" },
]
export const FONT_MAP: Record<string, string> = Object.fromEntries(FONT_PALETTE.map((f) => [f.key, f.stack]))

export const EMOJI_PICKS = [
  '📢', '🔔', '⚠️', '❗', '📌', '✅', '📝', '📅',
  '🎉', '🏖️', '📚', '✏️', '😊', '👍', '💪', '🙏',
  '🎓', '⏰', '📖', '🔥', '💡', '🌟', '🚫', '❌',
]

interface StyleState {
  bold?: boolean
  color?: string
  size?: string
  font?: string
}

// [태그] / [태그:파라미터] / [/태그] 하나를 찾는 정규식. img는 내부에 다른 태그가 없는 순수 URL이라 별도 처리.
const TAG_RE = /\[(\/?)(b|c|sz|f|img)(?::(\w+))?\]/g

// content 문자열 안의 태그들을 순서대로 해석해서 React 노드 배열로 변환.
// 태그는 중첩될 수 있어서(굵게+색상 등) 스타일을 스택으로 누적하며 처리한다.
// 줄바꿈은 컨테이너에 whiteSpace: pre-wrap을 적용하는 걸 전제로 그대로 문자열에 남겨둔다.
export function renderRichContent(content: string): React.ReactNode[] {
  if (!content) return []

  const runs: { text?: string; img?: string; style: StyleState }[] = []
  const styleStack: StyleState[] = [{}]
  const currentStyle = () => styleStack[styleStack.length - 1]

  TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  let lastEnd = 0

  while ((match = TAG_RE.exec(content)) !== null) {
    const [, closing, tag, param] = match
    if (match.index > lastEnd) {
      runs.push({ text: content.slice(lastEnd, match.index), style: { ...currentStyle() } })
    }

    if (tag === 'img' && !closing) {
      const closeIdx = content.indexOf('[/img]', TAG_RE.lastIndex)
      const url = closeIdx >= 0 ? content.slice(TAG_RE.lastIndex, closeIdx) : ''
      runs.push({ img: url.trim(), style: {} })
      lastEnd = closeIdx >= 0 ? closeIdx + '[/img]'.length : TAG_RE.lastIndex
      TAG_RE.lastIndex = lastEnd
      continue
    }

    if (!closing) {
      const next: StyleState = { ...currentStyle() }
      if (tag === 'b') next.bold = true
      if (tag === 'c') next.color = param
      if (tag === 'sz') next.size = param
      if (tag === 'f') next.font = param
      styleStack.push(next)
    } else if (styleStack.length > 1) {
      styleStack.pop()
    }
    lastEnd = TAG_RE.lastIndex
  }
  if (lastEnd < content.length) {
    runs.push({ text: content.slice(lastEnd), style: { ...currentStyle() } })
  }

  return runs.map((r, i) => {
    if (r.img !== undefined) {
      if (!r.img) return null
      return (
        <img key={`img-${i}`} src={r.img} alt="공지 이미지"
          className="rounded-xl mt-2 max-w-full"
          style={{ maxHeight: 260, objectFit: 'cover' }} />
      )
    }
    const style: React.CSSProperties = {}
    if (r.style.bold) style.fontWeight = 800
    if (r.style.color && COLOR_MAP[r.style.color]) style.color = COLOR_MAP[r.style.color]
    if (r.style.size && SIZE_MAP[r.style.size]) style.fontSize = SIZE_MAP[r.style.size]
    if (r.style.font && FONT_MAP[r.style.font]) style.fontFamily = FONT_MAP[r.style.font]
    return <span key={`t-${i}`} style={style}>{r.text}</span>
  }).filter((n): n is React.ReactElement => n !== null)
}

// 목록/배너처럼 한 줄 미리보기가 필요한 곳에서 태그를 모두 제거하고 순수 텍스트만 뽑아낼 때 사용.
export function stripRichTokens(content: string): string {
  if (!content) return ''
  return content
    .replace(/\[(?:b|c(?::\w+)?|sz:\w+|f:\w+)\]/g, '')
    .replace(/\[\/(?:b|c|sz|f)\]/g, '')
    .replace(/\[img\][\s\S]*?\[\/img\]/g, '📷 사진')
    .trim()
}
