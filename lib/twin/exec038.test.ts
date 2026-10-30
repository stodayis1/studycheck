/**
 * GPT-EXEC-038 유한 대조 — **읽기전용 구조 조회문의 안전 성질**만 본다 (§4).
 *
 * 왜 시험으로 두나
 *   그 SQL 은 **아직 실행하지 않았습니다.** 그러면 "데이터 행을 읽지 않는다" 는 말이
 *   문서의 약속으로만 남습니다. 037 에서 배운 것이 그것입니다 —
 *   **말로 적은 보장을 수로 확인되는 보장으로 바꿔야** 합니다.
 *
 *   그래서 조회문의 **글자 자체**를 기계로 검사합니다. DB 없이 할 수 있고,
 *   누가 나중에 한 줄을 더해도 이 시험이 잡습니다.
 *
 * 하지 않는 것
 *   - DB 에 **접속하지 않습니다.** 운영·로컬 어느 쪽도 아닙니다.
 *   - 이 시험은 조회문이 **문법적으로 맞다는 증거가 아닙니다.** 금지된 것이
 *     들어 있지 않다는 것만 봅니다. 실제 PG 수용 시험은 **미실행**입니다
 *     (기존 환경에 PostgreSQL 바이너리가 남아 있지 않고, §4 가 새 패키지 설치를 금지합니다).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..')
const SQL_PATH = 'READONLY_LEARNING_SCHEMA_038.sql'
const RAW = readFileSync(join(ROOT, SQL_PATH), 'utf8')

/** `--` 주석과 문자열 리터럴을 빼고 **코드만** 남긴다 */
function codeOnly(src: string): string {
  const noComments = src
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--')
      return i === -1 ? line : line.slice(0, i)
    })
    .join('\n')
  // 홑따옴표 리터럴 제거 ('' 이스케이프 포함)
  return noComments.replace(/'(?:[^']|'')*'/g, "''")
}

const CODE = codeOnly(RAW)

/** 대상 목록에 적힌 (schema, table) 쌍 */
function declaredTargets(): Array<[string, string]> {
  const m = RAW.match(/with targets\(schema_name, table_name\) as \(([\s\S]*?)\n\)/)
  assert.ok(m, '대상 목록(targets CTE)을 찾지 못했습니다')
  return [...m![1].matchAll(/\('([a-z_]+)',\s*'([a-z_]+)'\)/g)].map((x) => [x[1], x[2]])
}

// ════════════════════════════════════════════════════════════════════
// S. 조회문의 안전 성질
// ════════════════════════════════════════════════════════════════════

test('S1 **한 문장**이다 — 세미콜론이 맨 끝에 하나뿐', () => {
  const semis = (CODE.match(/;/g) ?? []).length
  assert.equal(semis, 1, `세미콜론이 ${semis}개입니다 — 한 문장이어야 합니다`)
  assert.match(CODE.trimEnd(), /;$/, '마지막이 세미콜론이 아닙니다')
  // `with` 로 시작해 `select` 로 끝나는 읽기 문장이다
  assert.match(CODE.trimStart().toLowerCase(), /^with\s/, 'WITH 로 시작하지 않습니다')
})

test('S2 쓰기·권한·역할 구문이 **없다**', () => {
  const lower = CODE.toLowerCase()
  const banned = [
    /\bcreate\s/, /\balter\s/, /\bdrop\s/, /\binsert\s/, /\bdelete\s/,
    /\btruncate\b/, /\bgrant\s/, /\brevoke\s/, /\bcopy\s/,
    /\bset\s+role\b/, /\bset\s+session\b/, /\bset\s+local\b/,
    /\bupdate\s+\w+\s+set\b/, /\bdo\s+\$\$/, /\bcall\s/, /\bexecute\s/,
    /\bcommit\b/, /\brollback\b/, /\bsavepoint\b/, /\bbegin\b/,
    /\breindex\b/, /\bvacuum\b/, /\banalyze\b/, /\brefresh\s+materialized\b/,
  ]
  for (const re of banned) {
    assert.ok(!re.test(lower), `금지 구문이 있습니다: ${String(re)}`)
  }
})

test('S3 **원문 덤프 함수**를 쓰지 않는다', () => {
  const lower = CODE.toLowerCase()
  for (const fn of [
    'pg_get_constraintdef', 'pg_get_indexdef', 'pg_get_expr', 'pg_get_viewdef',
    'pg_get_functiondef', 'pg_get_triggerdef', 'pg_get_ruledef', 'pg_get_userbyid',
    'obj_description', 'col_description', 'shobj_description',
    'pg_read_file', 'pg_ls_dir', 'pg_stat_file', 'dblink', 'query_to_xml',
  ]) {
    assert.ok(!lower.includes(fn), `덤프/외부 함수가 있습니다: ${fn}`)
  }
  // 허용한 것: 열의 정확한 타입 이름을 얻는 표준 함수
  assert.match(CODE, /format_type\(/, 'format_type 이 없으면 정확한 타입을 알 수 없습니다')
})

test('S4 정책 **본문**·역할 멤버·default 표현식·주석을 읽지 않는다', () => {
  const lower = CODE.toLowerCase()
  for (const col of [
    'polqual', 'polwithcheck', 'polroles',       // 정책 본문·역할
    'pg_attrdef', 'adbin', 'adsrc',              // 열 default 표현식
    'pg_description', 'pg_shdescription',        // 주석
    'prosrc', 'proargdefaults',                  // 함수 본문
    'pg_trigger', 'tgqual',                      // 트리거
    'pg_authid', 'rolpassword',                  // 비밀
    'pg_shadow', 'pg_user_mapping',
  ]) {
    assert.ok(!lower.includes(col), `읽어서는 안 되는 것이 있습니다: ${col}`)
  }
  // 정책은 **이름·명령·개수**만
  assert.match(CODE, /p\.polname/)
  assert.match(CODE, /p\.polcmd/)
})

test('S5 `auth` schema 와 학생 데이터에 손대지 않는다', () => {
  const lower = CODE.toLowerCase()
  assert.ok(!lower.includes('auth.users'), 'auth.users 를 읽습니다')
  assert.ok(!/\bauth\s*\./.test(lower), 'auth schema 를 참조합니다')
  assert.ok(!lower.includes('answer_text'), '정답 열을 참조합니다')
  assert.ok(!lower.includes('video_url'), '영상 URL 열을 참조합니다')
  assert.ok(!lower.includes('student_answer'), '학생 답 열을 참조합니다')
  assert.ok(!lower.includes('session_uid'), '세션 식별자를 참조합니다')
})

test('S6 업무 테이블의 **데이터 행을 읽지 않는다** — count(*) 도 카탈로그에만', () => {
  const lower = CODE.toLowerCase()
  // count(*) 는 pg_policy 를 세는 한 자리뿐이어야 한다
  const counts = (lower.match(/count\s*\(\s*\*\s*\)/g) ?? []).length
  assert.equal(counts, 1, `count(*) 가 ${counts}개입니다`)
  const polCount = /count\s*\(\s*\*\s*\)\s*as\s+policy_count/.test(lower)
  assert.ok(polCount, 'count(*) 가 정책 수를 세는 자리가 아닙니다')

  // FROM/JOIN 으로 읽는 관계는 pg_catalog · CTE · unnest 뿐이어야 한다
  const cteNames: string[] = []
  for (const m of RAW.matchAll(/^(\w+) as \(/gm)) cteNames.push(m[1])
  for (const m of RAW.matchAll(/with (\w+)\(/g)) cteNames.push(m[1])
  const ctes = new Set(cteNames)
  const rels: string[] = []
  for (const m of lower.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_.]*)/g)) rels.push(m[1])
  for (const r of rels) {
    const ok = r.startsWith('pg_catalog.') || ctes.has(r) || r === 'unnest'
    assert.ok(ok, `카탈로그·CTE 가 아닌 관계를 읽습니다: ${r}`)
  }
  assert.ok(rels.length > 5, `읽는 관계가 ${rels.length}개뿐입니다 — 검사가 헛돌았습니다`)
})

test('S7 대상 목록이 **고정**이고 schema 를 뒤지지 않는다', () => {
  const targets = declaredTargets()
  assert.equal(targets.length, 15, `대상이 ${targets.length}개입니다`)
  const names = targets.map(([s, t]) => `${s}.${t}`)
  // 038 §4 가 적은 후보가 모두 들어 있다
  for (const n of [
    'public.students', 'public.problems', 'public.standard_types', 'public.concepts',
    'public.concept_video_progress', 'public.video_watch_logs', 'public.gradings',
    'public.grading_answers', 'public.student_worksheets', 'public.progress_checks',
    'public.learning_notes', 'public.type_learning_assets',
  ]) {
    assert.ok(names.includes(n), `대상에서 빠졌습니다: ${n}`)
  }
  // schema 를 패턴으로 훑는 자리가 없다
  //
  // 040 §5 — 여기 있던 `assert.ok(... || true, '')` 는 **항상 통과하는 무효 단정**이었다
  // (GPT_REVIEW_038 §79 가 찾았고 039 에서 이연했다). 유효한 검사로 바꾼다.
  //
  // **이 단정들이 보장하는 범위:** "대상을 **찾아 훑는 목록**이 고정 VALUES 15개다" 까지다.
  // **"결과에 목록 밖 이름이 나오지 않는다" 는 보장하지 않는다** — `inbound` CTE 는
  // 15개를 참조하는 FK 의 **출발 관계 이름**을 돌려주고 그것은 목록 밖일 수 있다
  // (`LOCAL_SCHEMA_SOURCES_039.md` §5). 실제로 스냅샷에 `lesson_videos` 등이 나왔다.
  const lower = CODE.toLowerCase()
  assert.ok(!/nspname\s+(?:not\s+)?like/.test(lower), 'schema 를 LIKE 로 훑습니다')
  assert.ok(!/nspname\s*(?:not\s+)?in\s*\(\s*select/.test(lower), 'schema 를 부질의로 고릅니다')
  assert.ok(!/information_schema/.test(lower), 'information_schema 를 훑습니다')
  assert.match(RAW, /with targets\(schema_name, table_name\) as \(\s*\n\s*values/,
    '대상이 고정 VALUES 목록이 아닙니다')
  // 질문앱 테이블을 **추측해 넣지 않았다**
  for (const guess of ['questions', 'question_turns', 'question_usage',
    'question_student_sessions', 'question_stuck_events']) {
    assert.ok(!names.includes(`public.${guess}`),
      `인계 자료로 확인되지 않은 질문앱 이름을 넣었습니다: ${guess}`)
  }
})

test('S8 모으는 메타데이터가 §4 의 목록과 같다', () => {
  // 열: 이름·정확한 타입·nullable·identity/generated
  for (const k of ['a.attname', 'format_type', 'a.attnotnull', 'a.attidentity', 'a.attgenerated']) {
    assert.ok(CODE.includes(k), `열 메타데이터가 빠졌습니다: ${k}`)
  }
  // 제약: PK/UNIQUE/FK 의 열 대응과 참조 대상
  assert.match(RAW, /co\.contype in \('p', 'u', 'f'\)/)
  assert.ok(!/contype\s*=\s*'c'/.test(RAW), 'CHECK 제약을 가져옵니다 (본문이 딸려옵니다)')
  assert.ok(CODE.includes('co.confrelid') && CODE.includes('co.confkey'),
    'FK 참조 대상이 빠졌습니다')
  // 인덱스: 키 열 · unique 여부
  assert.ok(CODE.includes('i.indisunique') && CODE.includes('i.indkey'))
  // 표현식 인덱스는 이름 없이 표시
  assert.match(RAW, /<expression>/)
  // RLS: enabled/forced
  assert.ok(CODE.includes('c.relrowsecurity') && CODE.includes('c.relforcerowsecurity'))
  // 없는 이름은 missing 으로 나간다
  assert.match(RAW, /'exists', r\.rel_oid is not null/)
})

test('S9 문서가 **미실행**이라고 적고 있다', () => {
  assert.match(RAW, /아직 실행하지 않았습니다/)
  const plan = readFileSync(join(ROOT, 'SCHEMA_SNAPSHOT_PLAN_038.md'), 'utf8')
  assert.match(plan, /미실행/)
  assert.match(plan, /GPT 검수/)
  // 평문 키·id 수작업 교체를 요구하지 않는다
  assert.ok(!/\$env:|service_role|sb_secret_/.test(plan),
    '계획서에 키·환경변수 예시가 들어 있습니다')
})

test('S10 계약 초안은 **운영 확정이 아니라고** 적고 있다', () => {
  const d = readFileSync(join(ROOT, 'STUDYCHECK_LEARNING_CONTRACT_DRAFT_038.md'), 'utf8')
  assert.match(d, /0\.1-draft/)
  assert.ok(/운영 계약 확정|운영판으로 확정하지 않/.test(d), '운영 확정 아님을 적지 않았습니다')
  // 037 이 금지한 과잉 판정을 되살리지 않았다
  assert.ok(!/정답 1개로 유형 해제한다/.test(d))
  assert.match(d, /915/, '과거 유형수를 현재 작업량으로 쓰지 않는다는 표기가 필요합니다')
  // 037 원본은 보존한다
  const old = readFileSync(join(ROOT, 'STUDYCHECK_LEARNING_CONTRACT_DRAFT_037.md'), 'utf8')
  assert.ok(old.length > 0, '037 원본이 사라졌습니다')
})
