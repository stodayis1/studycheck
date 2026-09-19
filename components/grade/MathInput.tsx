'use client'
// 수학 입력칸 (MathLive). 누르면 휴대폰에 수학 키패드가 올라온다.
// 값은 LaTeX 문자열로 주고받는다. 예) \frac{3}{2}, x^{2}-2x+1, \{1,2\}
import { createElement, useEffect, useRef, useState } from 'react'

let loaded: Promise<void> | null = null

// 학원에서 쓰는 기호 위주로 키패드를 두 장 만든다
const LAYOUTS = [
  {
    label: '수식',
    tooltip: '숫자·식',
    rows: [
      ['x', 'y', 'a', 'b', '[separator]', '7', '8', '9', { latex: '\\frac{#@}{#0}', label: '분수' }, '\\div'],
      [
        { latex: '#@^{2}', label: 'x²' },
        { latex: '#@^{#0}', label: 'xⁿ' },
        { latex: '\\sqrt{#0}', label: '√' },
        'i',
        '[separator]',
        '4', '5', '6', '\\times', '\\pm',
      ],
      ['(', ')', '=', ',', '[separator]', '1', '2', '3', '-', '+'],
      ['<', '>', '\\le', '\\ge', '[separator]', '0', '.', '[left]', '[right]', '[backspace]'],
    ],
  },
  {
    label: '기호',
    tooltip: '집합·행렬·경우의 수',
    rows: [
      [
        { latex: '\\{#0\\}', label: '{ }' },
        '\\in', '\\notin', '\\subset', '\\cup', '\\cap', '\\emptyset',
        { latex: '|#0|', label: '|x|' },
      ],
      [
        { latex: '\\overline{#0}', label: 'z̄' },
        '\\alpha', '\\beta', '\\omega', '\\pi', '\\infty', '!',
        { latex: '\\neq', label: '≠' },
      ],
      [
        { latex: '\\begin{pmatrix}#0 & #0\\\\#0 & #0\\end{pmatrix}', label: '행렬' },
        { latex: '{}_{#0}\\mathrm{P}_{#0}', label: 'ₙPᵣ' },
        { latex: '{}_{#0}\\mathrm{C}_{#0}', label: 'ₙCᵣ' },
        'n', 'r', 'k', 'm', 'z',
      ],
      [
        { latex: '\\text{ 또는 }', label: '또는' },
        { latex: '\\text{ 이고 }', label: '이고' },
        { latex: '\\text{해는 없다}', label: '해 없음' },
        '[separator]', '[left]', '[right]', '[backspace]',
      ],
    ],
  },
]

function loadMathLive() {
  if (!loaded) {
    loaded = import('mathlive').then((m) => {
      m.MathfieldElement.fontsDirectory = '/mathlive/fonts'
      m.MathfieldElement.soundsDirectory = null
      const kb: any = (window as any).mathVirtualKeyboard
      if (kb) kb.layouts = LAYOUTS
    })
  }
  return loaded
}

export function MathInput({
  value,
  onChange,
  readOnly = false,
  placeholder,
}: {
  value: string
  onChange?: (latex: string) => void
  readOnly?: boolean
  placeholder?: string
}) {
  const ref = useRef<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadMathLive().then(() => setReady(true))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!ready || !el) return
    if (el.value !== value) el.value = value
    if (readOnly) return
    const onInput = () => onChange?.(el.value)
    el.addEventListener('input', onInput)
    return () => el.removeEventListener('input', onInput)
  }, [ready, value, readOnly, onChange])

  if (!ready) {
    return <div className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-slate-50" />
  }

  return createElement('math-field', {
    ref,
    'read-only': readOnly ? '' : undefined,
    'math-virtual-keyboard-policy': 'auto',
    placeholder: placeholder ? `\\text{${placeholder}}` : undefined,
    style: {
      width: '100%',
      minHeight: readOnly ? undefined : 48,
      fontSize: 20,
      padding: readOnly ? 0 : '6px 10px',
      border: readOnly ? 'none' : '1px solid #cbd5e1',
      borderRadius: 8,
      background: readOnly ? 'transparent' : '#fff',
    },
  })
}
