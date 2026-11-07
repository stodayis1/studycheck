/**
 * 학습지 한 건을 **사람이 읽는 한 줄**로 만든다.
 *
 * 왜 따로 두는가 (원장님 2026-10-31)
 *   「안준혁 학생 <중1-1 전범위 Lv4> 학습지인데 전범위 전범위 Lv4로 나오고 점수는 안보여」.
 *
 *   student_worksheets 에는 단원이 **두 칸**으로 들어간다 — `unit`(대단원)과 `unit_name`(소단원).
 *   「2단원 / 소수의 나눗셈」처럼 다를 때는 둘을 이어 붙이면 자연스럽다. 그런데
 *   **쪼갤 것이 없는 제목**(전범위·복합·총정리)은 두 칸에 **같은 값**이 들어가고,
 *   그걸 이어 붙이면 「전범위 전범위」가 된다.
 *
 *   그런 화면이 한 곳이 아니었다 — 학습일지의 「최근 학습지」, 학습지관리 목록,
 *   학생·학부모 화면, 월간 리포트가 각자 따로 이어 붙이고 있었다. 그래서 이어 붙이는
 *   규칙을 **여기 한 곳**에 두고 다 같이 부른다. 한쪽만 고치면 또 어긋난다.
 *
 * ★ 순수 함수다(DB·시계를 안 만진다). 시험은 scripts/matholic-check.ts 에 있다.
 */

/** 두 글자가 **같은 말**인가. 공백·괄호·밑줄 차이는 같은 것으로 본다. */
function 같은말(a: string, b: string) {
  const 씻기 = (s: string) => s.replace(/[\s_·()（）[\]]+/g, '').toLowerCase()
  return 씻기(a) === 씻기(b)
}

/**
 * 단원 칸(`unit`) 옆에 **덧붙일 만한** 단원 이름만 돌려준다.
 * 같은 말이거나 한쪽이 다른 쪽에 이미 들어 있으면 빈 글자다 — 그러면 두 번 안 찍힌다.
 */
export function unitNameBeside(unit?: string | null, unitName?: string | null): string {
  const u = String(unit ?? '').trim()
  const n = String(unitName ?? '').trim()
  if (!n) return ''
  if (!u) return n
  if (같은말(u, n)) return ''
  // 「2단원」 옆의 「2단원 소수의 나눗셈」처럼 단원 칸을 품고 있으면 긴 쪽만 쓴다.
  if (n.includes(u)) return n
  if (u.includes(n)) return ''
  return n
}

/** 「2단원 소수의 나눗셈」 · 「전범위」 — 빈칸으로 이어 붙인 단원. */
export function unitLabel(unit?: string | null, unitName?: string | null): string {
  const u = String(unit ?? '').trim()
  const n = unitNameBeside(u, unitName)
  if (!u) return n
  // 단원 이름이 단원 칸을 품고 있으면 긴 쪽 하나로 끝낸다(「2단원」 + 「2단원 소수의 나눗셈」).
  if (n && n.includes(u)) return n
  return [u, n].filter(Boolean).join(' ')
}

/** 「2단원 (소수의 나눗셈)」 · 「전범위」 — 소단원을 괄호에 넣는 기존 화면 꼴. */
export function unitParen(unit?: string | null, unitName?: string | null): string {
  const u = String(unit ?? '').trim()
  const n = unitNameBeside(u, unitName)
  if (!u) return n
  if (n && n.includes(u)) return n
  return n ? `${u} (${n})` : u
}

/** 「4」·「3.5」 — 레벨 숫자. 「4.0」의 꼬리 0 은 뗀다. */
export function levelText(v?: string | number | null): string {
  const t = String(v ?? '').trim()
  if (!t) return ''
  return t.endsWith('.0') ? t.slice(0, -2) : t
}

/**
 * 학습일지의 「채점한 학습지」 줄 ↔ DB 두 칸(worksheet_unit · worksheet_level).
 *
 * 원장님 2026-11-07 「학습지 두개의 정보가 들어갔는데 막상 하단에는 칸이 하나뿐이 없어서
 * 학습지 정보 한개만 반영되네. 학습지 갯수대로 생성될수있도록」.
 *
 * ★ 칸을 늘리지 않고 **줄을 ` · ` 로 이어** 담는다 — 주간 보고서(`과제 성취 ○○`)·학부모
 *   브리핑·OPS 가 그 두 칸을 글자 그대로 쓰기 때문에, 칸을 바꾸면 그쪽이 조용히 어긋난다.
 * ★ 레벨은 **줄 자리를 맞춰** 잇는다. 단원 둘에 레벨 하나면 어느 쪽 레벨인지 알 수 없다.
 */
export const WS_SEP = ' · '

export interface WsRow { unit: string; level: string }

export function wsRowsToText(rows: WsRow[]): { unit: string; level: string } {
  const kept = (rows ?? []).filter((r) => (r?.unit ?? '').trim() || (r?.level ?? '').trim())
  // ★ 빈 칸도 **자리를 지켜** 잇는다. 레벨이 없는 줄을 빼 버리면(「Lv2」만 남기면)
  //   되읽을 때 그 레벨이 **앞 줄에 붙는다** — 다른 학습지의 레벨이 된다.
  //   그래서 trim 도 하지 않는다. ' · Lv2' 의 앞 빈 자리가 「첫 줄은 레벨 없음」이다.
  const 이어서 = (xs: string[]) => {
    const joined = xs.join(WS_SEP)
    return joined.split(WS_SEP).some((x) => x.trim()) ? joined : ''
  }
  return {
    unit: 이어서(kept.map((r) => (r.unit ?? '').trim())),
    level: 이어서(kept.map((r) => (r.level ?? '').trim())),
  }
}

export function wsRowsFromText(unit?: string | null, level?: string | null): WsRow[] {
  const u = String(unit ?? '').split(WS_SEP).map((s) => s.trim())
  const l = String(level ?? '').split(WS_SEP).map((s) => s.trim())
  const n = Math.max(u.length, l.length)
  const rows = Array.from({ length: n }, (_, i) => ({ unit: u[i] ?? '', level: l[i] ?? '' }))
    .filter((r) => r.unit || r.level)
  return rows.length ? rows : [{ unit: '', level: '' }]
}
