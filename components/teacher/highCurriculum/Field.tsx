'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/* ---------- 칸 하나: 적는 동안은 내 글자를 지키고, 벗어날 때만 저장 ---------- */
export function Field({ value, onCommit, placeholder, disabled, className = '', color, plain, singleLine, input }: {
  value?: string; onCommit: (v: string) => void; placeholder?: string; disabled?: boolean
  className?: string; color?: string; plain?: boolean; singleLine?: boolean; input?: boolean
}) {
  const [v, setV] = useState(value ?? '')
  const focused = useRef(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (!focused.current) setV(value ?? '') }, [value])
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }, [v])
  const commit = () => {
    focused.current = false
    const out = singleLine || input ? v.replace(/\s*\n\s*/g, ' ').trim() : v.trim()
    if (out !== v) setV(out)
    if (out !== (value ?? '')) onCommit(out)
  }
  const base = plain
    ? 'w-full bg-transparent border border-dashed border-transparent hover:border-gray-300 focus:bg-white focus:outline-2 focus:outline-[#2f4bb5] rounded px-1.5 py-0.5 -mx-1.5'
    : 'w-full bg-white border border-gray-200 focus:outline-2 focus:outline-[#2f4bb5] rounded-md px-2 py-1.5 text-sm disabled:bg-transparent disabled:border-dashed'
  if (input) return (
    <input value={v} placeholder={placeholder} disabled={disabled} className={`${base} ${className} placeholder:text-gray-300`}
      onFocus={() => { focused.current = true }} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) (e.target as HTMLInputElement).blur() }} />
  )
  return (
    <textarea ref={ref} rows={1} value={v} placeholder={placeholder} disabled={disabled}
      className={`${base} ${className} block resize-none overflow-hidden leading-snug placeholder:text-gray-300 placeholder:font-normal`}
      style={color ? { color } : undefined}
      onFocus={() => { focused.current = true }} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (singleLine && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } }} />
  )
}
