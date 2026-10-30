// pg-learning-test.cjs — 저장 SQL 을 **격리 PostgreSQL 에서 실제로 돌린다** (GPT-EXEC-045 §5)
//
// 무엇을 하나
//   ① 쓰고 버리는 클러스터를 `initdb` 로 만든다 (127.0.0.1 에만 연다)
//   ② 합성 fixture → `045_learning_actions.sql` → `pg-learning-verify.sql`
//   ③ **재적용**(멱등) 확인
//   ④ 호출자 검사(JWT role claim)를 역할별로
//   ⑤ **동시 요청** — 두 세션으로 같은 행동 키를 겹쳐 보낸다
//   ⑥ 되돌리기 1·2·3 단계
//   ⑦ **기본 execute 직접권한이 있는 설정과 없는 설정** 두 가지에서 역할별 허용·거부
//   ⑧ 클러스터를 멈추고 폴더째 지운다
//
// 하지 않는 것
//   운영 DB 접속, 실제 키·실제 자료 사용, 외부 포트 공개, package.json 변경,
//   레지스트리·서비스·시작프로그램 건드리기.
//
// 쓰는 법
//   node scripts/pg-learning-test.cjs --pg <PostgreSQL bin 폴더> [--keep]
//
// 종료코드: 0 통과 · 1 실패 · 2 환경 없음

/* eslint-disable @typescript-eslint/no-require-imports -- 변환기 없이 node 가 바로 돌린다 */
'use strict'

const { spawnSync, spawn } = require('node:child_process')
const { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const net = require('node:net')

const REPO = resolve(__dirname, '..')
const MIGRATION = join(REPO, 'docs', 'sql', 'migrations', '045_learning_actions.sql')
const ROLLBACK = join(REPO, 'docs', 'sql', 'migrations', '045_learning_actions_rollback.sql')
const FIXTURE = join(__dirname, 'pg-learning-fixture.sql')
const VERIFY = join(__dirname, 'pg-learning-verify.sql')
const RUN_ID = 'pgtest-045'
const STUDENT_A = '11111111-1111-4111-8111-111111111111'
const SHEET_1 = 'aaaa1111-0000-4000-8000-000000000001'
const FN_SIG = 'uuid, text, text, text, text, text, text, text, timestamptz, jsonb, text, uuid'

const args = process.argv.slice(2)
const pgBin = (() => { const i = args.indexOf('--pg'); return i >= 0 ? args[i + 1] : null })()
const keep = args.includes('--keep')

function bin(name) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  return pgBin !== null ? join(pgBin, exe) : exe
}

const results = []
let failed = 0
function say(ok, label, detail) {
  results.push({ ok, label })
  if (!ok) failed += 1
  const body = detail ? `\n       ${String(detail).trim().split('\n').slice(0, 12).join('\n       ')}` : ''
  process.stdout.write(`${ok ? '[OK]  ' : '[FAIL]'} ${label}${body}\n`)
}

/** 빈 포트 하나. 127.0.0.1 에 잠깐 묶어 보고 바로 놓는다 */
function freePort() {
  return new Promise((done, fail) => {
    const srv = net.createServer()
    srv.on('error', fail)
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port
      srv.close(() => done(p))
    })
  })
}

const initdb = bin('initdb')
const pgctl = bin('pg_ctl')
const psqlBin = bin('psql')
for (const [label, p] of [['initdb', initdb], ['pg_ctl', pgctl], ['psql', psqlBin]]) {
  const probe = spawnSync(p, ['--version'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0) {
    process.stderr.write(`${label} 을 찾을 수 없습니다: ${p}\n`
      + '--pg <PostgreSQL bin 폴더> 로 알려 주세요.\n')
    process.exit(2)
  }
}
const version = spawnSync(psqlBin, ['--version'], { encoding: 'utf8' }).stdout.trim()

const base = mkdtempSync(join(tmpdir(), 'pg045-'))
const data = join(base, 'data')
let port = 0

process.on('exit', () => {
  spawnSync(pgctl, ['-D', data, '-m', 'immediate', 'stop'],
    { stdio: ['ignore', 'ignore', 'ignore'] })
  if (!keep) { try { rmSync(base, { recursive: true, force: true, maxRetries: 5 }) } catch { /* 보고는 남는다 */ } }
})

/** psql 한 번. `role`·`jwtRole` 을 주면 그 역할로 바꿔 끼운 뒤 돈다 */
function psql(sqlOrFile, opts = {}) {
  const { role = null, jwtRole = null, file = false, db = 'learn' } = opts
  const pre = []
  if (jwtRole !== null) pre.push(`set request.jwt.claim.role = '${jwtRole}';`)
  if (role !== null) pre.push(`set role ${role};`)
  const input = file
    ? `${pre.join('\n')}\n\\i ${sqlOrFile.replace(/\\/g, '/')}\n`
    : `${pre.join('\n')}\n${sqlOrFile}\n`
  const r = spawnSync(psqlBin, ['-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port),
    '-U', 'app_server', '-d', db, '-X', '-q', '--no-psqlrc', '-A', '-t'], {
    input, encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: 'x', PGCLIENTENCODING: 'UTF8' },
  })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const one = (sql, opts) => {
  const r = psql(sql, opts)
  const lines = r.out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '')
  return { status: r.status, value: lines[lines.length - 1] ?? '', out: r.out }
}

const CALL = (actionId, extra, graded, when) => `select (public.apply_learning_action(
  '${STUDENT_A}'::uuid, '101', 'exam_sheet', '${SHEET_1}', '${RUN_ID}', '${actionId}',
  'studycheck-learning-045-pilot', 'answer', '${when}'::timestamptz,
  jsonb_build_object('schema_version','0.2-draft.1','problem_ref','101',
    'occurred_at','${when.replace('Z', '.000Z')}','task_ref','exam_sheet:${SHEET_1}',
    'event_type','problem_answered','answer','3'${extra ? `,${extra}` : ''}),
  ${graded === null ? 'null' : `'${graded}'`}, null)) ->> 'verdict';`

function freshDb(label) {
  psql('drop database if exists learn;', { db: 'postgres' })
  const c = psql('create database learn;', { db: 'postgres' })
  if (c.status !== 0) { say(false, `${label}: 데이터베이스 만들기`, c.out); return false }
  const f = psql(FIXTURE, { file: true })
  if (f.status !== 0) { say(false, `${label}: fixture`, f.out); return false }
  return true
}

/** 같은 행동 키를 **겹쳐** 보낸다 — 두 번째가 기다려야 한다 */
function concurrency() {
  return new Promise((done) => {
    const argv = ['-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port),
      '-U', 'app_server', '-d', 'learn', '-X', '-q', '--no-psqlrc', '-A', '-t']
    const env = { ...process.env, PGPASSWORD: 'x', PGCLIENTENCODING: 'UTF8' }
    const sql = CALL('act-cc-1', null, 'correct', '2026-10-29T04:00:00Z')
    const p1 = spawn(psqlBin, argv, { env })
    const p2 = spawn(psqlBin, argv, { env })
    let o1 = ''; let o2 = ''
    p1.stdout.on('data', (d) => { o1 += d }); p1.stderr.on('data', (d) => { o1 += d })
    p2.stdout.on('data', (d) => { o2 += d }); p2.stderr.on('data', (d) => { o2 += d })

    // 세션1: 트랜잭션을 열고 호출한 뒤 **커밋하지 않고 기다린다**
    p1.stdin.write(`begin;\n${sql}\n`)
    setTimeout(() => {
      // 세션2: 같은 행동 키 → advisory lock 에 **걸려 기다려야 한다**
      p2.stdin.write(`${sql}\n`)
      setTimeout(() => {
        const blockedBefore = !/applied|duplicate|conflict/.test(o2)
        p1.stdin.end('commit;\n')
        setTimeout(() => {
          p2.stdin.end()
          setTimeout(() => done({ o1, o2, blockedBefore }), 2000)
        }, 1500)
      }, 1500)
    }, 800)
  })
}

async function main() {
  // ── ① 클러스터 ────────────────────────────────────────────────────
  port = await freePort()
  let r = spawnSync(initdb, ['-D', data, '-U', 'app_server', '-A', 'trust',
    '--encoding=UTF8', '--locale=C'], { encoding: 'utf8' })
  if (r.status !== 0) {
    process.stderr.write(`initdb 실패:\n${r.stdout}\n${r.stderr}\n`)
    process.exit(2)
  }
  // **127.0.0.1 에만** 연다. 외부 포트·터널을 열지 않는다
  writeFileSync(join(data, 'postgresql.auto.conf'),
    `listen_addresses = '127.0.0.1'\nport = ${port}\nfsync = off\n`, 'utf8')
  // ⚠️ Windows 에서는 `stdio` 를 파이프로 두면 **돌아오지 않는다.**
  //   `pg_ctl start` 가 떼어 놓은 서버가 그 파이프를 계속 물고 있어서
  //   `spawnSync` 가 끝을 보지 못한다. 전부 버리고 로그 파일로 본다.
  r = spawnSync(pgctl, ['-D', data, '-l', join(base, 'pg.log'), '-w', '-t', '60', 'start'],
    { stdio: ['ignore', 'ignore', 'ignore'] })
  if (r.status !== 0) {
    process.stderr.write('pg_ctl start 실패:\n'
      + (existsSync(join(base, 'pg.log'))
        ? readFileSync(join(base, 'pg.log'), 'latin1') : '(로그 없음)'))
    process.exit(2)
  }
  say(true, `클러스터 시작 — ${version} · 127.0.0.1:${port} (외부 포트 없음)`)

  // ── ② 설치 + 본 검증 ──────────────────────────────────────────────
  if (!freshDb('설치')) return
  const m = psql(MIGRATION, { file: true })
  say(m.status === 0, '045 설치가 통과한다', m.status === 0 ? '' : m.out)
  if (m.status !== 0) return

  const v = psql(VERIFY, { file: true })
  const oks = (v.out.match(/\[OK\]/g) ?? []).length
  // 실패한 항목 이름을 **그대로** 뽑아 보여 준다 — 어디서 걸렸는지 묻지 않아도 보이게
  const firstFail = (v.out.split(/\r?\n/).find((l) => l.includes('[FAIL]')) ?? '').trim()
  say(v.status === 0 && v.out.includes('[DONE]'),
    `본 검증 ${oks}개 항목 통과 (A~H)`,
    v.status === 0 && v.out.includes('[DONE]') ? '' : (firstFail || v.out))

  // ── ③ 재적용 (멱등) ───────────────────────────────────────────────
  const again = psql(MIGRATION, { file: true })
  say(again.status === 0, '045 를 **다시 적용해도** 통과한다 (멱등)',
    again.status === 0 ? '' : again.out)

  // ── ④ 호출자 검사 ────────────────────────────────────────────────
  for (const [claim, want] of [['service_role', 'true'], ['authenticated', 'false'],
    ['anon', 'false']]) {
    const g = one('select public.learning_caller_is_server()::text;', { jwtRole: claim })
    say(g.value === want, `요청 역할이 ${claim} 이면 호출자 검사 = ${want}`,
      g.value === want ? '' : g.out)
  }
  const denied = psql(CALL('act-guard-1', null, 'correct', '2026-10-29T03:00:00Z'),
    { jwtRole: 'authenticated' })
  say(denied.status !== 0 && /서버만 호출할 수 있습니다/.test(denied.out),
    '요청 역할이 authenticated 면 **함수 안에서** 막힌다', denied.status !== 0 ? '' : denied.out)

  // ── ⑤ 동시 요청 ──────────────────────────────────────────────────
  const c = await concurrency()
  // ⚠️ **「기다렸다」를 타이밍으로 주장하지 않는다.**
  //   처음에는 「1.5초 뒤에도 세션2 가 아무것도 안 찍었으면 기다리는 중」으로 봤다.
  //   그런데 advisory lock 을 **지운 사본에서도 그 판정이 통과했다** — psql 이 아직
  //   실행을 시작하지 않은 것을 「기다림」으로 오해한 것이다. 그 판정은 버렸다.
  //   직렬화의 근거는 verify 의 **C15**(`pg_locks` 에 그 행동 키 잠금이 실제로 있는지)다.
  //   여기서는 두 세션을 겹쳐 보내 **결과**만 본다 — 두 번 반영되지 않는가.
  say(/applied/.test(c.o1), '세션1 이 applied 다', /applied/.test(c.o1) ? '' : c.o1)
  say(/duplicate/.test(c.o2), '세션2 가 duplicate 다 (둘 다 반영되지 않는다)',
    /duplicate/.test(c.o2) ? '' : c.o2)
  const cc = one(`select count(*)::text from public.learning_actions
    where action_id = 'act-cc-1' and is_canonical;`)
  say(cc.value === '1', '받아들인 줄이 **정확히 하나**다', cc.value === '1' ? '' : cc.out)

  // ── ⑥ 되돌리기 세 단계 ───────────────────────────────────────────
  const rb = readFileSync(ROLLBACK, 'utf8')
  const blocks = [...rb.matchAll(/\/\*([\s\S]*?)\*\//g)].map((x) => x[1])
  say(blocks.length === 3, `되돌리기 블록이 세 개다 (찾은 것 ${blocks.length}개)`)
  if (blocks.length === 3) {
    const before = one('select count(*)::text from public.learning_actions;')
    const s1 = psql(blocks[0])
    say(s1.status === 0, '되돌리기 1단계(차단)가 통과한다', s1.status === 0 ? '' : s1.out)
    const after = one('select count(*)::text from public.learning_actions;')
    say(after.value === before.value && before.value !== '0',
      `1단계는 **자료를 지우지 않는다** (${before.value}줄 그대로)`)
    const nope = psql(CALL('act-after-block', null, 'correct', '2026-10-29T05:00:00Z'),
      { jwtRole: 'service_role' })
    say(nope.status !== 0, '1단계 뒤에는 **아무도 저장하지 못한다**',
      nope.status !== 0 ? '' : nope.out)

    // 다시 열어 둔다 — 2단계가 셀 자료가 필요하다.
    // 1단계가 **검사 함수까지** 거짓으로 바꿔 뒀으므로 설치본을 다시 돌려 되살린다
    const restore = psql(MIGRATION, { file: true })
    say(restore.status === 0, '045 를 다시 실행하면 1단계 차단이 풀린다',
      restore.status === 0 ? '' : restore.out)
    const reopened = psql(CALL('act-reopen', null, 'correct', '2026-10-29T05:30:00Z'),
      { jwtRole: 'service_role' })
    say(reopened.status === 0 && /applied/.test(reopened.out),
      '차단을 푼 뒤에는 다시 저장된다', reopened.status === 0 ? '' : reopened.out)

    // 다른 묶음 한 줄을 넣어 **범위 밖이 지워지지 않는지** 본다
    psql(`insert into public.learning_attempts (student_id, problem_id, source_kind, run_id)
          values ('22222222-2222-4222-8222-222222222222', 201, 'standalone', 'other-run');`)
    // 되돌리기 문서가 「고쳐야 할 곳은 아래 한 줄뿐」이라고 한 그 자리를
    // **실제로 바꿔** 돌린다 — 그 편집 경로까지 시험한다
    const stage2 = blocks[1].split("'pilot-045'").join(`'${RUN_ID}'`)
    say(stage2 !== blocks[1] && stage2.includes(`'${RUN_ID}'`),
      `2단계의 묶음 이름 한 줄을 ${RUN_ID} 로 바꿨다 (문서가 말한 그 한 곳)`)
    const s2 = psql(stage2)
    say(s2.status === 0, '되돌리기 2단계(이 묶음 정리)가 통과한다', s2.status === 0 ? '' : s2.out)
    const left = psql(`select run_id || ':' || count(*)::text from public.learning_attempts
                       group by run_id order by run_id;`)
    say(!new RegExp(RUN_ID).test(left.out) && /other-run:1/.test(left.out),
      '2단계는 **이 묶음만** 지운다 (다른 묶음은 남는다)', left.out)

    const refuse = psql(blocks[2])
    say(refuse.status !== 0 && /남아 있습니다/.test(refuse.out),
      '3단계는 **남은 기록이 있으면 멈춘다**', refuse.status !== 0 ? '' : refuse.out)
    psql('delete from public.learning_attempts;')
    const s3 = psql(blocks[2])
    say(s3.status === 0, '되돌리기 3단계(기능 철수)가 통과한다', s3.status === 0 ? '' : s3.out)
    const gone = one(`select coalesce(to_regclass('public.learning_actions')::text, 'none')
                      || '/' || coalesce(to_regproc('public.apply_learning_action')::text, 'none');`)
    say(gone.value === 'none/none', '3단계 뒤 표와 함수가 없다', gone.out)
    const kept = one('select count(*)::text from public.students;')
    say(kept.value === '3', '3단계가 기존 표(students)를 건드리지 않았다', kept.out)
  }

  // ── ⑦ 기본 execute 직접권한 **두 설정** ──────────────────────────
  //
  // ⚠️ **두 겹을 갈라 재야 한다.** 045 는 ① 권한(§6)과 ② 함수 안의 호출자 검사(§4)
  //   두 겹으로 막는다. `set role anon` + `jwt role anon` 으로 부르면 **둘 다** 걸려서,
  //   권한 회수를 지워도 호출자 검사가 막아 통과해 버린다 — 일부러 망가뜨려 보고 알았다.
  //   그래서 권한 겹만 재려면 **호출자 검사를 통과시킨 채** 역할만 바꿔 부른다
  //   (`jwt role = service_role`, `set role = anon`). 그러면 거부는 권한에서만 올 수 있다.
  for (const withDirect of [true, false]) {
    const label = withDirect ? '직접권한 있음' : '직접권한 없음'
    if (!freshDb(label)) continue
    if (withDirect) {
      // 이 환경에서는 새 함수에 anon·authenticated 실행권이 **자동으로 붙는다.**
      // 043 의 `revoke from public` 하나로는 막히지 않는 경우다
      psql(`alter default privileges in schema public
              grant execute on functions to anon, authenticated;`)
    }
    const mm = psql(MIGRATION, { file: true })
    if (mm.status !== 0) { say(false, `${label}: 설치`, mm.out); continue }

    // 설치 **직후의 권한 상태**를 숫자로 확인한다 — 두 설정이 정말 다른지
    const priv = one(`select string_agg(r || '=' ||
      has_function_privilege(r, 'public.apply_learning_action(${FN_SIG})', 'EXECUTE')::text, ',')
      from unnest(array['anon','authenticated','service_role']) r;`)
    say(priv.value === 'anon=false,authenticated=false,service_role=true',
      `${label}: 설치 뒤 권한이 anon·authenticated 거부 / service_role 허용이다`, priv.value)

    // 권한 겹만 — 호출자 검사는 통과시킨 채 역할만 바꾼다
    for (const role of ['anon', 'authenticated']) {
      const d = psql(CALL(`act-priv-${role}`, null, 'correct', '2026-10-29T06:00:00Z'),
        { role, jwtRole: 'service_role' })
      say(d.status !== 0 && /permission denied|권한이 없|권한 없음/i.test(d.out),
        `${label}: ${role} 는 **권한에서** 막힌다 (호출자 검사와 별개로)`,
        d.status !== 0 ? d.out.split(/\r?\n/).find((l) => /ERROR/.test(l)) ?? '' : d.out)
    }
    // 호출자 검사 겹만 — 권한은 있는 채 요청 역할만 바꾼다
    const guardOnly = psql(CALL('act-guard-only', null, 'correct', '2026-10-29T06:10:00Z'),
      { jwtRole: 'anon' })
    say(guardOnly.status !== 0 && /서버만 호출할 수 있습니다/.test(guardOnly.out),
      `${label}: 권한이 있어도 요청 역할이 anon 이면 **함수 안에서** 막힌다`,
      guardOnly.status !== 0 ? '' : guardOnly.out)

    const allow = psql(CALL('act-srv-1', null, 'correct', '2026-10-29T06:30:00Z'),
      { jwtRole: 'service_role' })
    say(allow.status === 0 && /applied/.test(allow.out),
      `${label}: service_role 은 저장할 수 있다`, allow.status === 0 ? '' : allow.out)
  }
}

main().then(() => {
  process.stdout.write(`\n엔진: ${version}\n`)
  process.stdout.write(`fixture: scripts/pg-learning-fixture.sql · 검증: scripts/pg-learning-verify.sql\n`)
  process.stdout.write(`항목 ${results.length} · 통과 ${results.length - failed} · 실패 ${failed}\n`)
  process.exitCode = failed === 0 ? 0 : 1
}, (e) => {
  process.stderr.write(`실행기가 던졌습니다: ${e && e.stack ? e.stack : String(e)}\n`)
  process.exitCode = 1
})
