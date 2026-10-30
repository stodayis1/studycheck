// 학교알리미(schoolinfo.go.kr)에서 학교를 찾고, 숫자 지표로 자료집 한 장을 만든다. 서버에서만 쓴다.
//
// 두 가지 길을 쓴다.
//   · 학교 찾기 — 학교알리미 화면이 쓰는 json(시도 → 시군구 → 학교). 키도 캡차도 없다.
//   · 숫자 지표 — OpenAPI(/openApi.do). 인증키는 SCHOOLINFO_API_KEY.
//     공개 견본 키(sample)는 한 번에 20곳까지만 줘서 운영에는 못 쓴다.
//
// 수학 편제·정기시험은 학교마다 모양이 다른 hwp/pdf 첨부라 여기서 못 만든다(사람이 읽는다).
// 교과 성취도는 학교알리미가 자동입력 방지(캡차)로 막아 둬서 가져오지 않는다 — 뚫지 말 것.
// 자세한 사정은 .claude/skills/school-profile/SKILL.md

import { normalizeSchool } from '@/lib/school'
import type { SchoolProfile, SchoolStats, Highlight, Source, GradeStat } from '@/lib/schoolProfile'

const BASE = 'https://www.schoolinfo.go.kr'

/** 학교급 — 학교알리미 코드 */
export const LEVEL_CODE = { 초: '02', 중: '03', 고: '04' } as const
export type Level = keyof typeof LEVEL_CODE

async function postForm(path: string, data: Record<string, string>) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`학교알리미 응답 ${res.status}`)
  return res.json()
}

/** 시도 목록. 코드가 바뀌므로(2026 「전남광주통합특별시」) 고정하지 않고 화면에서 읽는다. 화면은 EUC-KR. */
export async function listSidos(): Promise<{ code: string; name: string }[]> {
  const res = await fetch(BASE + '/ei/ss/pneiss_a03_s0.do', { cache: 'no-store' })
  const html = new TextDecoder('euc-kr').decode(await res.arrayBuffer())
  const out: { code: string; name: string }[] = []
  for (const m of html.matchAll(/for="sidoCode(\d+)">([^<]+)/g)) out.push({ code: m[1], name: m[2].trim() })
  return out
}

export async function listSigungus(sido: string): Promise<{ code: string; name: string }[]> {
  const rows = await postForm('/ei/ss/pneiss_a03_s0_sigungu_json.do', { SIDO_CODE: sido })
  return (rows ?? []).map((r: any) => ({ code: r.ADDR_CD_ID, name: r.ADRCD_ID_LAST_NM }))
}

export async function listSchools(level: Level, sido: string, sigungu: string): Promise<{ shl: string; name: string }[]> {
  const rows = await postForm('/ei/ss/pneiss_a03_s0_school_json.do',
    { HG_JONGRYU_GB: LEVEL_CODE[level], SIDO_CODE: sido, GUGUN_CODE: sigungu })
  return (rows ?? []).map((r: any) => ({ shl: r.SHL_IDF_CD, name: r.SHL_NM }))
}

export function schoolinfoUrl(shl: string) {
  return `${BASE}/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=${shl}`
}

// ── OpenAPI ────────────────────────────────────────────────────────────────

class NoKeyError extends Error {}
export const isNoKey = (e: unknown) => e instanceof NoKeyError

/** 한 항목을 한 지역 단위로 받는다. sido/sgg 는 OpenAPI 쪽 짧은 코드(41 / 41281). */
async function openApi(apiType: string, level: Level, sido: string, sgg: string, year: number): Promise<any[]> {
  const key = process.env.SCHOOLINFO_API_KEY
  if (!key) throw new NoKeyError('학교알리미 인증키(SCHOOLINFO_API_KEY)가 서버에 없어요.')
  const q = new URLSearchParams({
    apiKey: key, apiType, pbanYr: String(year), schulKndCode: LEVEL_CODE[level], sidoCode: sido, sggCode: sgg,
  })
  const res = await fetch(`${BASE}/openApi.do?${q}`, { cache: 'no-store' })
  const json = await res.json().catch((): any => null)
  if (json?.resultCode !== 'success') throw new Error(`학교알리미 OpenAPI: ${json?.resultMsg ?? res.status}`)
  return json.list ?? []
}

/** 행정동 코드(10자리)에서 OpenAPI 지역 코드를 뗀다 — 4128111600 → 41 / 41281 */
const regionOf = (adrcd: string) => ({ sido: adrcd.slice(0, 2), sgg: adrcd.slice(0, 5) })

const n = (v: any) => (v == null || v === '' ? undefined : Number(String(v).trim()))

/** 「일반고등학교」 → 「일반고」 */
const shortType = (s?: string) => s?.replace(/고등학교$/, '고').replace(/중학교$/, '중').replace(/초등학교$/, '초') || null

/** 자동으로 채우는 한 줄 이름 — 다시 받을 때 이것만 바꾸고 손으로 적은 줄은 둔다 */
const AUTO_LABELS = ['교내 Wee클래스', '창의적체험활동 동아리', '학생 자율동아리']
const isAuto = (h: Highlight) => AUTO_LABELS.includes(h.label) || / 신입생$/.test(h.label)

export type Fetched = Pick<SchoolProfile,
  'school_name' | 'school_level' | 'official_name' | 'source_year' | 'region' | 'office' | 'foundation' | 'school_type' | 'coed'>
  & { stats: SchoolStats; highlights: Highlight[]; url: string }

/**
 * 학교 한 곳의 숫자 지표를 받는다.
 * adrcd 를 알면 그 시군구만, 모르면 sido·sigungu(학교 찾기 화면의 긴 코드)로 지역을 정한다.
 * 올해 공시가 아직 비어 있으면 작년 것을 쓴다.
 */
export async function fetchSchool(shl: string, level: Level, region: { adrcd?: string; sigungu?: string }): Promise<Fetched> {
  const code = region.adrcd ?? region.sigungu
  if (!code) throw new Error('학교가 있는 지역을 알 수 없어요.')
  const { sido, sgg } = regionOf(code)

  const thisYear = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }))
  let year = thisYear
  let base = (await openApi('0', level, sido, sgg, year)).find(r => r.SHL_IDF_CD === shl)
  if (!base) { year = thisYear - 1; base = (await openApi('0', level, sido, sgg, year)).find(r => r.SHL_IDF_CD === shl) }
  if (!base) throw new Error('학교알리미 OpenAPI 에서 이 학교를 찾지 못했어요.')

  // 나머지 항목은 SHL_IDF_CD 없이 학교코드(SCHUL_CODE)로만 온다
  const pick = async (t: string) => (await openApi(t, level, sido, sgg, year)).find(r => r.SCHUL_CODE === base.SCHUL_CODE)
  const [cls, tch, adm, club, cns] = await Promise.all(['09', '22', '51', '56', '61'].map(t => pick(t).catch((): any => undefined)))

  // 학년별 학생수 — COL_S1~6 학생, COL_C1~6 학급, COL_1~6 학급당. 7 은 특수학급.
  const grades = level === '초' ? 6 : 3
  const byGrade: GradeStat[] = []
  for (let g = 1; g <= grades; g++) {
    const students = n(cls?.[`COL_S${g}`]) ?? 0
    if (!students) continue
    byGrade.push({ grade: `${g}학년`, students, classes: n(cls?.[`COL_C${g}`]) ?? 0, perClass: n(cls?.[`COL_${g}`]) })
  }
  const stats: SchoolStats = {
    total: n(cls?.COL_S_SUM),
    classes: n(cls?.COL_C_SUM),
    perClass: n(cls?.COL_SUM),
    byGrade,
    teachers: n(tch?.COL_S),
    studentsPerTeacher: n(cls?.TEACH_CAL),
    schoolinfo: { shl, adrcd: base.ADRCD_CD, level },
  }
  if (n(cls?.COL_S7)) stats.special = { students: n(cls.COL_S7)!, classes: n(cls.COL_C7) ?? 0, perClass: n(cls.COL_7) }

  const highlights: Highlight[] = []
  if (cns?.WEE_CINSTL_YN) highlights.push({ label: '교내 Wee클래스', value: cns.WEE_CINSTL_YN === 'Y' ? '설치' : '없음' })
  if (n(club?.CREAT_EXPER_ACT_CCCLU_FGR))
    highlights.push({ label: '창의적체험활동 동아리', value: `${n(club.CREAT_EXPER_ACT_CCCLU_FGR)}개 · ${n(club.CREAT_EXPER_ACT_STDNT_FGR) ?? 0}명 참여` })
  if (n(club?.STDNT_SLCTL_CCCLU_FGR))
    highlights.push({ label: '학생 자율동아리', value: `${n(club.STDNT_SLCTL_CCCLU_FGR)}개 · ${n(club.STDNT_SLCTL_FGR) ?? 0}명` })
  if (n(adm?.ALL_SUM))
    highlights.push({ label: `${year} 신입생`, value: `${n(adm.ALL_SUM)}명 (남 ${n(adm.MAN_SUM) ?? 0} · 여 ${n(adm.WOMAN_SUM) ?? 0})` })

  return {
    school_name: normalizeSchool(base.SCHUL_NM),
    school_level: level,
    official_name: base.SCHUL_NM,
    source_year: year,
    region: base.ADRCD_NM ?? null,
    office: cls?.JU_ORG_NM ?? base.JU_ORG_NM ?? null,
    foundation: base.FOND_SC_CODE ?? null,
    school_type: shortType(base.HS_KND_SC_NM),
    coed: [base.COEDU_SC_CODE, base.DGHT_SC_CODE].filter(Boolean).join(' · ') || null,
    stats,
    highlights,
    url: schoolinfoUrl(shl),
  }
}

/**
 * 받아 온 값을 기존 한 장에 얹는다.
 * ★ 사람이 정리한 것(수학 편제·정기시험·메모·성취도·수행평가·손으로 적은 한 줄)은 절대 덮지 않는다.
 */
export function mergeProfile(prev: SchoolProfile | null, f: Fetched): SchoolProfile {
  const { url, ...rest } = f
  const keepHighlights = (prev?.highlights ?? []).filter(h => !isAuto(h))
  const apiDetail = `학년별·학급별 학생수 / 직위별 교원 현황 / 동아리 / 상담 / 입학생 (${f.source_year})`

  const sources: Source[] = (prev?.sources?.length ? prev.sources : [{ name: '학교알리미 공시' }])
    .filter(s => s.name !== '학교알리미 OpenAPI')
    .map(s => s.name === '학교알리미 공시' ? { ...s, url } : s)
  if (!sources.some(s => s.name === '학교알리미 공시')) sources.unshift({ name: '학교알리미 공시', url })
  sources.push({ name: '학교알리미 OpenAPI', detail: apiDetail })

  return {
    ...rest,
    stats: {
      ...rest.stats,
      ...(prev?.stats?.achievement ? { achievement: prev.stats.achievement } : {}),
      ...(prev?.stats?.assessment ? { assessment: prev.stats.assessment } : {}),
    },
    math_curriculum: prev?.math_curriculum ?? [],
    exam_calendar: prev?.exam_calendar ?? {},
    highlights: [...f.highlights, ...keepHighlights],
    notes: prev?.notes ?? null,
    sources,
  }
}
