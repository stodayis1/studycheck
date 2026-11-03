# CLAUDE_RESULT_021 — GPT-EXEC-021 회신

작성: 2026-09-28 · 대상 명령 `GPT_EXEC_021.md`
실행 SQL: **`PATCH_PUBLICATION_021.sql` — 작성 완료 · 운영 실행 미승인**
`POSTINSTALL_TO_RUN_017.sql` · `INSTALL_TO_RUN_014.sql` — **바이트 무변경**

---

## 0. 한 줄

42P10의 원인을 **진짜 PostgreSQL에서 재현했고**(운영과 같은 함수·같은 53행), 게시 함수
**한 줄만** 고치는 증분 패치를 만들어 같은 엔진에서 대조했습니다. 인덱스·권한·RLS·설치
SQL은 건드리지 않았습니다.

```text
실제 PostgreSQL 대조   15.12 / 17.10 / 18.4 에서 각각 tests 13 / pass 13 / fail 0
정적 회귀              npm run test:twin → tests 430 / pass 430 / fail 0 / skipped 0
                       (019 의 406 + exec021 24개. 기존 검사를 지우지 않았습니다)
tsc                    변경 범위 오류 0 (저장소 전체 14개는 전부 기존 app/* · next.config.ts)
eslint                 변경 파일 error 0 / warning 0
운영 DB 접속·SQL 실행  0건 · Storage·모델 호출 0건
```

---

## 1. 원인 — 파일에서 확인하고 엔진에서 재현했습니다

### 1-A. 파일 근거 (GPT 분석과 일치)

| 위치 | 내용 |
|---|---|
| `docs/sql/쌍둥이_설치.sql` 362~363행 | `create unique index tla_practice_uidx on public.type_learning_assets (practice_id) **where practice_id is not null**` |
| 같은 파일 805행 | `on conflict (practice_id)` — **조건이 빠짐** |

부분 유일 인덱스는 conflict target에 같은 조건이 적혀 있어야 추론 대상이 됩니다.

저장소 전체를 검색해 **잘못된 게시 구문은 이 한 곳뿐**임을 확인했습니다.
다른 `on conflict` 1건(`server_create_twin_candidate` 의 5개 칼럼 조합)은 설치 SQL 182행에
일반 UNIQUE가 있어 정상이며 **수정 대상이 아닙니다.** 관련 없는 코드는 고치지 않았습니다.

### 1-B. 엔진 재현 (R1·R3)

**빈 표에서** 재현됩니다 — 중복 데이터 때문이 아닙니다. R1이 `select count(*) = 0` 을 먼저
assert한 뒤 UPSERT를 던져 42P10을 받습니다.

R3는 합성 기반 위에 **014 설치 SQL을 그대로** 돌리고 실제 RPC 경로
(`server_create_twin_candidate` → `server_update_twin_validation` →
`admin_approve_twin_candidate` → `admin_set_student_publish_approval` →
`admin_set_practice_publication`)로 게시해, 운영과 **같은 오류**를 받았습니다.

```text
2026-09-28 ERROR:  there is no unique or exclusion constraint matching the ON CONFLICT specification
CONTEXT:  SQL statement "insert into public.type_learning_assets
      (type_code, asset_type, practice_id, is_active, review_status)
    values (v_type, 'ai_practice', p_practice_problem_id, true, 'approved')
    on conflict (practice_id)
    do update set is_active = true, review_status = 'approved', updated_at = now()"
PL/pgSQL function public.admin_set_practice_publication(uuid,boolean) line 53 at SQL statement
```

**원장님이 받으신 것과 함수·문장·행 번호(53)까지 같습니다.**

---

## 2. 고친 것 — 함수 한 곳의 한 줄

```diff
-    on conflict (practice_id)
+    on conflict (practice_id) where practice_id is not null
```

WHERE는 **`do update` 앞의 conflict target**에 붙였습니다. `do update set` 뒤의 WHERE와
혼동하지 않았고, 그 점을 테스트로 고정했습니다 (conflict target 바로 뒤가 `do update set` 인지 확인).

R6이 엔진에서 **패치 전후 `prosrc` 를 줄 단위로 비교**해, 달라진 줄이 **정확히 1개**이고
그 줄이 위 diff와 같음을 확인합니다.

### 하지 않은 우회 (§98~§105) — 정적 테스트로 고정

패치의 실행문에 다음이 하나도 없음을 검사합니다.
`drop index` · `create index` · `create unique index` · `alter table` · `alter function` ·
`create/alter/drop policy` · `drop function` · `grant` · `revoke` ·
`on conflict on constraint` · `do nothing` · `truncate` · `delete from` ·
`exception when`(실패 삼키기) · `create table` · `create temp table`.

패치는 게시 함수를 **시험 호출하지 않고**, `public.students` · `ai_question_private.*` 에서
운영 데이터를 고르지도 않습니다.

---

## 3. 패치의 안전장치 (§114~§135)

`PATCH_PUBLICATION_021.sql` = `docs/sql/migrations/021_fix_practice_publication_conflict.sql`
(바이트 동일, sha256 `7bf1a27297df43d13c530be13b389210ea1e36fb6f3671443f5624dbcd13de1e`)

`begin ... commit` 한 덩어리이고 `set local lock_timeout = '5s'` ·
`set local statement_timeout = '60s'` 를 걸어 둡니다.

| 순서 | 확인 | 어긋나면 |
|---|---|---|
| [1] | 같은 이름 함수가 **정확히 하나** · 인자형(uuid, boolean) · 인자명 · `returns void` · plpgsql · `security definer` · proconfig가 `search_path` 하나뿐 | 중단 (없으면 **새로 만들지 않음**) |
| [2] | 본문이 **014 원본** 또는 **이 패치의 수정본** 과 같은가 (줄바꿈만 정규화) | 중단 — 모르는 변경을 덮어쓰지 않음 |
| [3] | `tla_practice_uidx` 가 unique·valid·ready·live·immediate·비exclusion, 키가 `practice_id` 하나, 조건이 `(practice_id IS NOT NULL)` | 중단 (이름만 보지 않음) |
| [4] | 바꾸기 전 OID·소유자·ACL·`pg_proc` 전체 속성·표 RLS·정책 기록 | — |
| [5] | `create or replace function` 으로 본문만 교체 (`drop` 안 함) | — |
| [6] | OID·소유자·ACL·속성·RLS·정책이 **전부 그대로**인지, 본문이 기대한 수정본인지 | 중단 |

- 이미 수정본이면 `already_applied` 로 알리고 **아무것도 바꾸지 않습니다.** 그 판정이 DDL
  실행보다 앞에 있는 것도 테스트로 고정했습니다.
- 본문 비교는 `replace(v_src, chr(13), '')` **하나뿐**입니다. `regexp_replace`·`btrim`·`lower`
  로 공백이나 주석을 걷어내지 않습니다 — 그러면 서로 다른 정의를 같다고 취급하게 됩니다.
- NULL 때문에 검사가 건너뛰어지지 않게 모든 판정을 `coalesce`/`is distinct from` 으로 감쌌습니다.
- 임시 표도 영구 백업 표도 만들지 않습니다. 사전/사후 비교는 DO 블록 지역 변수로 합니다.
- **이 COMMIT은 승인 후 함수 수정을 남기기 위한 것**이고, 017 검증의 `rollback` 과 다릅니다.
  이번 회차에는 **작성과 로컬 시험만** 했습니다.

### 패치 본문을 옮겨 적다 틀리지 않았는가

원본 본문(2189자)을 손으로 옮기지 않고 **설치 SQL에서 그대로 떠 왔습니다.**
그 사실을 테스트가 매번 다시 확인합니다 — 패치의 `$orig$` 상수가 설치 SQL의
`admin_set_practice_publication` 본문과 **글자까지 같은지**, 그리고 `$fixed$` 가 그것에서
**딱 한 줄만** 다른지.

---

## 4. 유한한 수용 시험 — 실제 실행 결과 (§177)

세 엔진(15.12 · 17.10 · 18.4)에서 각각 **13/13 통과**. 원문 로그는 `PGTEST_LOG_021.txt`.

| ID | 시험 | 기대 | 결과 |
|---|---|---|---|
| R1 | 빈 표 + 부분 UNIQUE + **조건 없는** 원본 UPSERT | 정확히 42P10 | **42P10** (다른 코드는 재현으로 인정 안 함) |
| R1 | 실패 기대 검사가 성공을 삼키지 않는가 | 삼키면 터짐 | **터짐** 확인 |
| R2 | 조건 붙인 UPSERT 첫 실행 / 같은 키 재실행 | INSERT → UPDATE, 행 1개 | **통과** (`xmax = 0` 으로 구분) |
| R3 | 합성 기반 + 014 원본 게시 RPC로 게시 | 42P10 재현 | **재현** (상태·자산 행 변화 0) |
| R4 | 021 패치 적용 뒤 게시 → 게시취소 → 재게시 | 성공, 자산 1행, active 전환, 최초 게시 이력 보존 | **통과** |
| R5 | 안전 미승인 / 비관리자 / 잘못된 인자 / 없는 id / retired | 기존 거부 코드 유지 | **통과** (`22023` · `42501` · `P0002`) |
| R6 | 패치 전후 OID·owner·ACL·security·search_path·volatility·인덱스·RLS·정책 | 본문 한 줄 외 보존 | **통과** (본문 차이 1줄) |
| R7 | 패치 2회 적용 | 두 번째는 no-op | **통과** (`prosrc` 동일, 게시도 여전히 됨) |
| R7 | 모르는 본문 | 변경 전 중단 | **통과** (본문 그대로) |
| R7 | 인덱스가 전역 UNIQUE로 바뀐 상태 | 변경 전 중단 | **통과** |
| R7 | 대상 함수 없음 | 새로 만들지 않고 중단 | **통과** (함수 0개 유지) |
| R8 | 패치 **전** 017 전체 검증 | 42P10으로 멈춤 | **멈춤** |
| R8 | 패치 **후** 017 전체 검증 (파일 무변경) | 끝까지 통과 | **통과** + rollback 뒤 검증 데이터 0건 |

### 중요한 구분 (§192·§194)

- **게시 중인 항목에 다시 `publish=true` 는 `invalid_state` 입니다.** R4를 통과시키려고
  멱등 성공으로 바꾸지 않았습니다. R4는 그 `invalid_state` 를 **명시적으로 assert** 한 뒤,
  게시취소를 거쳐 재게시합니다. UPSERT의 UPDATE 경로는 그 재게시에서 실제로 돕니다.
- R2(원시 UPSERT 중복)와 R4(RPC 상태 전이)를 분리했습니다.
- R8이 **017 파일을 한 글자도 고치지 않고** 통과한 것이 이번 수정의 최종 근거입니다.

---

## 5. 원본 보존과 적용 체인 (§141~§151)

014 설치와 017 검증의 **역사를 바꾸지 않았습니다.** 설치 SQL 805행에는 문제의 그 줄이
**그대로 남아 있고**, 그것도 테스트로 고정했습니다 (기준선에 수정본이 들어가 있으면 실패).

```text
(가) 기존 운영 환경 : [이미 됨] 014 → [승인 뒤] 021 패치 → [승인 뒤] 017 검증
(나) 새 설치 환경   : 014 → 021 패치 → 017 검증
```

`PATCH_RUNBOOK_021.md` 에 두 경로와 판정 기준, 되돌리는 방법을 적었습니다.
`INSTALL_RUNBOOK_014.md` 는 **고치지 않았습니다** — 과거에 이미 수정돼 있던 것처럼
보이게 만들지 않습니다. 그 점도 테스트로 고정했습니다.

`INSTALL_TO_RUN_021.sql` · `POSTINSTALL_TO_RUN_021.sql` · 전체 설치 제거용 `ROLLBACK_021.sql`
은 **만들지 않았습니다** (§150). 파일이 없다는 것을 테스트가 확인합니다.

### 변경 금지 해시 — 전부 일치

```text
a5e441e59c2c08aa65d6a0b85b2a4737b0799aaece5376e0a151a5105946f9b0  INSTALL_TO_RUN_014.sql = docs/sql/쌍둥이_설치.sql
4c913d8d4beef1fb8247afee5e31084d7163b5cafe9271ecea613bbffccb5deb  POSTINSTALL_TO_RUN_017.sql = docs/sql/쌍둥이_설치후_검증.sql
fbbf52b78006393e6b8c9c537707cbd9910557601300785426220d8af67b27ad  POSTINSTALL_TO_RUN_016.sql
3f4949d1f9e11bc02dc73ea25e10b8f5685b13776f9bba6b7e83435a6bbe9dc7  POSTINSTALL_TO_RUN_014.sql
723419f0f998c43ee97c96666cafca8e2274f7b3c4de22ec445cb0d8fbf2023a  PREFLIGHT_TO_RUN_010.sql
4aad024c0cdcb94df76197ae80b4d29e303f884f12b5d63e533cb580494fcc11  PREFLIGHT_COUNTS_TO_RUN_012.sql
```

---

## 6. 격리와 환경 (§169~§175)

```text
호스트      Windows 11 (win32 x64) · Node v24.16.0
엔진        embedded-postgres 가 내려받은 **진짜 PostgreSQL 서버 바이너리**
            15.12 · 17.10 · 18.4 세 가지에서 각각 실행
접속 대상   격리 로컬 (127.0.0.1, 임시 포트, 임시 데이터 디렉터리, persistent=false → 종료 시 삭제)
데이터      전부 합성. uuid 도 합성값이고 실제 사람의 정보가 없다
쓰지 않음   운영 URL · service-role key · 실제 학생/문항 · Storage · 외부 모델
```

정적 검사기나 SQLite/DuckDB를 PostgreSQL이라고 하지 않았습니다. 위 엔진 줄은
`select version()` · `current_setting('server_version')` 의 실제 값입니다.

### 의존성 (§173)

`embedded-postgres` + `pg` 는 **로컬 시험용**이며, **앱 `package.json` 에 넣지 않았습니다.**
별도 폴더에 설치해 `NODE_PATH` 로 가리켰습니다. 앱 production 의존성은 그대로입니다.

```bash
mkdir pgtest && cd pgtest && npm init -y
npm install embedded-postgres@17.10.0-beta.17
# 저장소 루트에서
NODE_PATH=<그 경로>/node_modules npx tsx --test lib/twin/pgtest/exec021.pg.test.ts
```

의존성을 찾지 못하면 **조용히 건너뛰지 않고 크게 실패**합니다. 실행하지 않은 시험을
통과라고 쓰지 않기 위해서입니다.

### 무엇이 대역이고, 그래서 무엇이 증명되지 않는가 (§196)

`docs/sql/pgtest/합성기반_스키마.sql` 안에 그대로 적어 두었습니다.

- `auth.uid()` · `auth.users` — 세션 설정을 읽는 대역. GoTrue 토큰 검증은 없습니다.
- `public.is_admin()` · `is_staff()` — AGENTS.md의 규칙(role = admin / in (admin,teacher,staff))대로 만든 대역.
- `anon` · `authenticated` · `service_role` — 이름만 같은 로컬 역할. Supabase의 실제 역할
  설정·PostgREST 연결·JWT 검증은 재현하지 않았습니다.
- `problems` · `standard_types` · `users` · `students` — 설치·검증이 읽는 칼럼만 갖춘 최소 표.

**따라서 이 통과는 SQL 문법·ON CONFLICT 추론·게시 함수 동작의 증거이고,
Supabase 인증·RLS 통합의 증거가 아닙니다.**

---

## 7. 미확인 범위 — 정확히 밝힙니다 (§211)

- **운영 카탈로그를 조회하지 않았습니다.** 운영의 현재 함수 본문·인덱스 유효성·ACL·소유자를
  직접 보지 않았습니다. 그래서 패치가 **실행 시점에 스스로** 확인하고 예상과 다르면 멈춥니다.
- **운영 PostgreSQL 버전을 확인하지 않았습니다.** 그래서 15·17·18 세 가지에서 돌렸습니다.
- **017 실행 세션의 종료·정리 상태**를 별도로 조회하지 않았습니다. 020의 1회 실행은
  실패로 종료됐고, 마지막 `rollback` 문장까지 실행됐다고 단정하지 않습니다.
- 전체 앱 빌드·저장소 전체 ESLint 미실행 (변경 파일만).
- 저장소 전체 tsc 오류 14개는 전부 기존 `app/*` · `next.config.ts` 입니다.
  이번 변경 범위(`lib/twin/**`)에는 0개입니다.
- 이번 실행에서 **추가로 발견된 다른 문제는 없습니다.** 017 전체가 패치 뒤 끝까지 통과했습니다.

---

## 8. 운영 원칙 (§227~§230)

D-126 **"성적관리는 시스템으로, 사람관리는 휴먼터치로"** 유지.
학생 자기주도 / 원장의 학습 흐름 설계 / 강사의 기록·가이드·휴먼터치 / 반복 업무 감소 /
취약 유형 재학습 방향을 보존했습니다.

이번 수정에 **강사용 확인 화면·입력·승인 절차를 새로 만들지 않았습니다.**
**새 결정 번호를 부여하지 않았습니다** — D-122~D-126 그대로이고, 이번 사건과 적용 체인은
`PATCH_RUNBOOK_021.md` · `REPORT.md` 에 상태로만 적었습니다.

---

## 9. 다음 행동

**GPT 재검수 대기.** 실제 DB 객체를 바꾸는 패치이므로, GPT가 패치 자체와 실행 결과를
검수한 뒤 **별도 실행 승인**이 필요합니다.

**원장님의 다음 행동: 021 결과물을 GPT에게 전달. 그 전에는 운영 SQL 추가 실행 없음.**

### 하지 않은 것 (§232)

운영 DB 접속·SQL 실행 / 기준선 재설치 / 설치 제거 / 권한·RLS 완화 / Storage SDK 조회 /
유료 모델 호출·쌍둥이 생성 / 학생 공개 / 앱 배포 / 앱 의존성 변경 / `git commit`·`push`
— **전부 0건**. DB 변경은 격리 로컬의 합성 환경에서만 했습니다.
