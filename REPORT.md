# 작업 보고 (REPORT)

> 작업이 끝날 때마다 **바꾼 파일 · 테스트 결과 · 남은 문제**를 적는다. 최신 것이 위로 온다.

---

## 2026-09-23 (15) — GPT-EXEC-005: 검수 결함 수정

### 바꾼 파일

**SQL 4개 전부 수정** (설치·설치전점검·설치후검증·롤백)
**코드** `lib/twin/repository.ts`(전면 재작성) · `mode.ts` · `publish.ts` · `fixtures.ts`(재작성) ·
`repo.test.ts`(재작성) · `twin.test.ts` · `app/api/twin/review/route.ts` · `app/teacher/twin-review/page.tsx`
**신규** `TWIN_PIPELINE_REVIEW_BUNDLE_005.zip` · `CLAUDE_RESULT_005.md` · `docs/GPT_EXEC_005.md`

### 테스트 결과

```
npm run test:twin  →  tests 82 · pass 82 · fail 0   (68 → 82)
npx tsc --noEmit   →  lib/twin · app/api/twin · app/teacher/twin-review 에러 0
npx eslint         →  에러 0
```

§196 요구 12항목 전부 테스트로 덮었다. SQL 파일 정적 회귀검사 7종 추가
(롤백 cascade 0건 · psql 변수 0건 · raise warning 0건 · 4-4 별도 후보 · 설치 트랜잭션 등).

**운영 DB는 읽기 전용 select 2건만.** DDL/DML·API 호출·배포·commit 없음.

### 남은 문제

1. **SQL 실제 파서 검사 여전히 미수행** — 도구가 없고 §221 이 설치를 금지한다
2. **역할별 보안 검증은 설치 후에만 가능** — 이제 실패 시 예외로 중단된다
3. 결정론적 검산 없음 (D-047)
4. 학생 공개 경로 없음
5. 작업이 미커밋 상태 — `TASK_DIFF.patch` 로 전체 차이를 볼 수 있게 했다

## 2026-09-23 (14) — GPT-EXEC-004: 검수용 원문 묶음

### 바꾼 파일

**신규** `TWIN_PIPELINE_REVIEW_BUNDLE_004.zip` · `CLAUDE_HANDOFF_004.md` · `docs/GPT_EXEC_004.md`
**기존 코드·SQL 변경 없음** (원문을 그대로 묶는 명령)

### 테스트 결과

```
npm run test:twin  →  tests 68 · pass 68 · fail 0   (묶기 직전 재실행)
npx tsc --noEmit   →  lib/twin · app/api/twin 에러 0
npx eslint         →  에러 0
sha256sum -c       →  18개 전부 OK
```

자체검사 10항목 전부 통과 — 필수 목록 일치(17/17) · 심볼릭 링크 0 · 절대경로 0 ·
비밀값 0 · SQL 4개 UTF-8 · 설치 SQL begin/commit · 검증 SQL begin/rollback · 복사본 diff 0

**운영 DB 접근 없음.** API 호출·배포 없음.

### 남은 문제

1. **롤백 SQL 58행의 `cascade`** — 분석상 안전하나 §30 에 따라 고치지 않고 보고.
   대안 제시함. GPT 판단 대기
2. **로컬 SQL 문법검사 미수행.** supabase CLI·psql·docker 가 없고 §154 가 새 도구 설치를 금지한다.
   `쌍둥이_설치.sql` 의 PL/pgSQL 문법은 **아직 한 번도 파싱되지 않았다**
3. **파이프라인 작업 전체가 미커밋 상태.** ZIP 은 git 히스토리가 아니라 작업 트리 내용이다.
   commit SHA 로 같은 내용을 다시 꺼낼 수 없다
4. 역할별 보안 검증은 여전히 설치 후에만 가능하다

## 2026-09-23 (13) — GPT-EXEC-003: SQL 안전성 보강

### 바꾼 파일

**신규** `docs/sql/쌍둥이_설치.sql` · `docs/sql/쌍둥이_설치전_점검.sql` ·
`docs/sql/쌍둥이_설치후_검증.sql` · `CLAUDE_RESULT_003.md` · `docs/GPT_EXEC_003.md`
**수정** `docs/sql/쌍둥이_롤백.sql` · `lib/twin/repository.ts` · `lib/twin/fixtures.ts` ·
`lib/twin/repo.test.ts` · `app/teacher/twin-review/page.tsx` · `docs/AI_QUESTION_APP_DECISION_LOG.md`
**삭제** `docs/sql/쌍둥이_private_스키마.sql` (설치 SQL 로 대체)

### 테스트 결과

```
npm run test:twin  →  tests 68 · pass 68 · fail 0   (기존 60 + 신규 8)
npx tsc --noEmit   →  lib/twin · app/api/twin · app/teacher/twin-review 에러 0
npx eslint         →  에러 0
```

사전 호환성 확인(읽기 전용): `ai_question_private` 없음 · 동명 RPC 0 ·
`public.twin_candidates` 행 0 · 타입 전부 일치 → **BLOCKER 없음**

**운영 DB는 읽기 전용 select 2건만.** DDL/DML·API 호출·배포 없음.

### 남은 문제

1. **★ 역할별 보안 검증이 여전히 실제로 되지 않았다.** 설치 후 검증 3단계가 운영 전 최우선 확인 항목
2. **§263의 5·6·7·9·11번은 DB CHECK·RPC 로직으로만 구현**돼 로컬 테스트로 확인하지 못했다.
   설치 후 검증 스크립트에 시나리오를 넣어 뒀다
3. 설치 SQL 의 `plpgsql` 문법은 실행해야 확인된다. 한 트랜잭션이라 실패해도 반쪽 설치는 남지 않는다
4. 결정론적 검산 없음 (D-047). `unverified`(사유 `no_cas`)로 기록
5. 학생이 게시된 예제를 받는 API 가 아직 없다 (§265 금지)
6. `TWIN_REPOSITORY_MODE=supabase` 환경변수 설정이 필요하다

## 2026-09-23 (12) — GPT-EXEC-002 REV.2: RPC 저장 계층 연결

### 바꾼 파일

**신규** `lib/twin/mode.ts` · `lib/twin/repo.test.ts` · `CLAUDE_RESULT_002.md` · `docs/GPT_EXEC_002_REV2.md`
**수정** `docs/sql/쌍둥이_private_스키마.sql`(RPC 8개) · `docs/sql/쌍둥이_롤백.sql` ·
`lib/twin/repository.ts`(`SupabaseTwinRepository`) · `lib/twin/fixtures.ts` ·
`app/api/twin/review/route.ts` · `app/teacher/twin-review/page.tsx` ·
`docs/AI_QUESTION_APP_DECISION_LOG.md`(D-046~048) · `package.json`

### 테스트 결과

```
npm run test:twin  →  tests 60 · pass 60 · fail 0   (기존 32 + 신규 28)
npx tsc --noEmit   →  lib/twin · app/api/twin · app/teacher/twin-review 에러 0
npx eslint         →  lib/twin · app/api/twin 에러 0
```

신규 28개: 상태 전이 7 · 교사 수정 시 자동검증 무효화 2 · 안전 예제 철회 2 ·
목록 4 · 저장소 모드 fail-closed 8 · RPC 응답 검증 4 · 오류 누출 1

**운영 DB는 읽기 전용 select 1건만** (`is_admin`·`is_staff` 시그니처 확인). 쓰기·API 호출·배포 없음.

### 남은 문제

1. **★ 역할별 보안 검증이 실제로 되지 않았다.** SQL 을 실행하지 않아 학생·anon·authenticated 가
   정말 거부되는지 확인하지 못했다. `CLAUDE_RESULT_002.md` 체크리스트 3번이 실행 후 최우선 확인 항목이다
2. **화면의 안전 예제 표시가 서버 상태를 읽지 못한다.** 안전 예제는 예제(practice) 속성인데
   목록 RPC 가 후보 행만 돌려준다. 동작은 정상이고 **표시만** 문제. 다음 회차에 목록 RPC 보강 필요
3. 결정론적 검산은 여전히 없다 (D-047). `unverified`(사유 `no_cas`)로 기록된다
4. 학생이 `published` 예제를 받는 API 가 아직 없다. 필터(`studentSafeExample`)만 준비돼 있다
5. 새 SQL 미실행. `public.twin_candidates` 가 빈 채로 남아 있다
6. production 에 `TWIN_REPOSITORY_MODE=supabase` 설정이 필요하다. 없으면 API 가 500을 낸다

## 2026-09-23 (11) — GPT-EXEC-001 REV.2 완수

### 바꾼 파일

**코드 신규** `lib/twin/repository.ts` · `lib/twin/fixtures.ts` ·
`app/api/twin/review/route.ts` · `app/teacher/twin-review/page.tsx`
**프롬프트 신규** `prompts/twin-gen-v1.1.md` · `prompts/twin-review-v1.1.md`
**수정** `lib/twin/schema.ts`(promptVersion → v1.1) · `lib/twin/twin.test.ts`(+6) ·
`docs/AI_QUESTION_APP_DECISION_LOG.md`(D-043~045) · `CLAUDE_RESULT_001.md` · `CLAUDE_BLOCKER_001.md`

### 테스트 결과

```
npm run test:twin  →  tests 38 · pass 38 · fail 0
npx tsc --noEmit   →  lib/twin · app/api/twin · app/teacher/twin-review 에러 0
npx eslint         →  lib/twin · app/api/twin 에러 0
```

**완료 기준 12/12 통과.**

추가된 상태 전이 테스트 6개 — 승인 없이 게시 불가 / 승인→게시 순서 / 거부 사유 필수 /
`safe_worked_example` 승인자 기록 / 승인분은 검수 대기 목록에서 제외 / fixture 플래그 정합성.

**표본 확인**: 그림 의존이 의심되던 3개 유형의 원문 6개를 로컬 이미지로 직접 열어 확인.
**전부 순수 텍스트**였다. 파일럿 10개 유형 교체 없이 확정.

운영 DB는 읽기 전용 select 만. 쓰기·API 호출·배포 없음.

### 남은 문제

1. **저장 계층 DB 구현체 없음 (유일한 블로커).** `private` 스키마에 `supabase-js` 접근 불가.
   SECURITY DEFINER RPC 시그니처를 GPT Work가 정해야 한다. 인터페이스는 이미 있어 **구현체만 채우면 붙는다**
2. **결정론적 검산이 항상 false.** CAS 미도입. 확대 단계에서 자동 검산 비율을 못 올린다.
   `mathjs` 도입 여부 결정 필요
3. **사이드바 미등록.** 실데이터 연결 후 등록하면서 `app/teacher/manual/page.tsx` 도 함께 고쳐야 한다
4. 새 SQL 미실행 (REV.2 §69에서 불허). `public.twin_candidates` 가 빈 채로 남아 있다
5. 검수 화면이 `react-hooks/set-state-in-effect` 1건에 걸리나 **저장소 기존 16곳과 같은 패턴**이라 두었다

## 2026-09-23 (10) — GPT-EXEC-001: 파이프라인 코드 구현

### 바꾼 파일

**신규 코드** — `lib/twin/`: `flags.ts` `targets.ts` `source.ts` `generate.ts` `verify.ts`
`review.ts` `publish.ts` `twin.test.ts`
**신규 문서** — `prompts/twin-review-v1.0.md` · `docs/sql/쌍둥이_롤백.sql` ·
`CLAUDE_RESULT_001.md` · `CLAUDE_BLOCKER_001.md` · `docs/GPT_EXEC_001.md`
**수정** — `lib/twin/schema.ts` · `prompts/twin-gen-v1.0.md` · `docs/sql/쌍둥이_private_스키마.sql` ·
`docs/sql/쌍둥이후보_테이블.sql`(폐기 표시) · `docs/쌍둥이제작_설계.md`(전면 재작성) ·
`docs/AI_QUESTION_APP_DECISION_LOG.md` · `AGENTS.md` · `package.json`

### 테스트 결과

```
npx tsx --test lib/twin/twin.test.ts   →  tests 32 · pass 32 · fail 0
npx tsc --noEmit                        →  lib/twin 에러 0 (저장소 기존 16건은 그대로)
npx eslint lib/twin                     →  에러 0
```

안전장치 테스트가 전부 통과했다 — AI 합의로 독립 검산이 안 켜짐 / 자동 승인 없음 /
미게시 문항이 학생 응답에 안 섞임 / `answer_text` 없는 문항 제외 / 실제 API 호출 차단.

**운영 DB는 읽기 전용 select 만 실행했다.** 쓰기·API 호출·배포 없음.

### 남은 문제

1. **작업 G 중단** — 파일럿 학년 구성 불가. 179개 유형이 전부 고등.
   고등 10개 선정안을 `CLAUDE_BLOCKER_001.md` 에 올렸다. GPT 확정 대기
2. **작업 F 중단** — `private` 스키마에 `supabase-js` 로 접근 불가.
   SECURITY DEFINER RPC 경유를 제안했고 **함수 시그니처를 GPT Work가 정해야** 한다
3. **프롬프트가 "한국 중학교 수학"** 인데 대상은 고등. 문구만이 아니라 규칙 8·9의 기준도 달라진다.
   임의로 고치지 않고 원문 보관
4. **결정론적 검산이 항상 false.** CAS 미도입 — 의존성 추가에 GPT 지시가 필요하다.
   파일럿은 전량 사람 검수라 막히지 않지만 **확대 단계에서는 자동 검산 비율을 못 올린다**
5. 선정안 5·6번(그래프 의존 유형)은 `unsupported` 비율이 높게 나올 수 있다
6. 새 SQL 미실행. 운영 DB에 구조인 `public.twin_candidates` 가 빈 채로 남아 있다

## 2026-09-23 (9) — CP-008 반영, 작업 순서 변경, 회신 정리

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `AGENTS.md` | **「일의 순서」 규칙 추가** — 실행 명령은 GPT Work가 내린다 (D-042) |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-039~D-042 |
| `docs/sql/쌍둥이_private_스키마.sql` | D-040·D-041 반영 (승인자·게시 기록 칼럼) |
| `docs/AI_QUESTION_APP_CP008.md` | 신규 (원본) |
| `GPT_BRIEF.md` | CP-007·CP-008 회신. §8 「실행 승인 요청」 고정 항목 신설 |
| `package.json` · `package-lock.json` | **`zod@4.6.5`, `openai@7.22.0` 추가** |

### 테스트 결과

| 확인 | 결과 |
|---|---|
| `zod` 런타임 | 정상 동작 |
| `openai/helpers/zod` | `zodTextFormat`·`zodResponseFormat` 존재 |
| `client.responses.parse` | 함수로 존재 — Structured Outputs 사용 가능 |

앱 코드가 `lib/twin/schema.ts` 하나뿐이라 실행 테스트는 없다. DB 변경·조회 없음.

### 남은 문제

1. **실행 대기 A** — 새 SQL 미실행. 운영 DB에 CP-007 이전 구조인
   `public.twin_candidates`가 빈 채로 남아 있다. **GPT 승인 후 원장님 실행**
2. **실행 대기 B** — `lib/twin/` 모듈 6개 + API + 검수 화면 미작성.
   CP-008 §146이 승인했으나 D-042에 따라 GPT 지시 대기
3. **프롬프트 학년 불일치** — `twin-gen-v1.0`이 "중학교"인데 대상은 고등.
   문구만 바꾸는 문제가 아닐 수 있다 (규칙 8·9의 기준도 달라진다). GPT Work 판단 대기
4. **의존성을 GPT 지시 전에 설치했다.** 사후 승인 요청함 (§8-F)
5. 새 SQL의 **문법은 아직 검증되지 않았다.** 실행해야 알 수 있다
6. CAS 재계산의 실제 적용 범위 미검증

## 2026-09-23 (8) — CP-007: 프롬프트 수령, Zod 스키마, 파일럿 유형 10개 선정

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/sql/쌍둥이_private_스키마.sql` | 신규 **미실행**. private 전환 + 테이블 3개 |
| `prompts/twin-gen-v1.0.md` | 신규. GPT Work 프롬프트 원문 보관 (수정 없음) |
| `lib/twin/schema.ts` | 신규. **첫 앱 코드** — Zod 스키마 + 형식 검증기 8종 |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-032~D-038 |
| `docs/AI_QUESTION_APP_CP007.md` | 신규 (원본) |
| `GPT_BRIEF.md` | CP-007 회신 |

### 테스트 결과

**빌드·실행 테스트 없음.** `lib/twin/schema.ts`가 `zod`를 import하는데 **아직 설치되지 않았다.**
(`package.json`에 `zod`·`openai` 둘 다 없음). `next.config.ts`의 `ignoreBuildErrors: true` 때문에
빌드는 통과하겠지만 런타임에서는 동작하지 않는다. **설치 전까지 이 파일을 import하는 코드를 만들지 않는다.**

운영 DB 읽기 전용 조회로 확인한 것:

| 확인 | 결과 |
|---|---|
| 모델명 `gpt-6-astra`/`sol`/`luna` | **공식 문서에 실재.** 이전 "확인 불가" 보고는 틀렸다 |
| 쌍둥이 없는 유형의 학년 분포 | **공통수학1 179 / 중1 11(사용가능 0) / 중2·중3 0** |
| 파일럿 조건 충족 유형 | 고등 12개 → 10개 선정 (성격 3·3·2·2 구성 충족) |
| `public.twin_candidates` | 존재함 (직전 실행분). 행 0개 |

### 남은 문제

1. **★ 파일럿 학년 구성이 실행 불가.** D-037의 중1·중2·중3 분산은 맞출 수 없다.
   **179개 유형이 전부 고등(공통수학1)** 이다. 고등 단원 분산으로 대체 제안함
2. **★ `twin-gen-v1.0` 프롬프트가 "한국 중학교 수학"으로 시작한다.** 대상과 맞지 않는다.
   불변 원칙 1에 따라 임의로 고치지 않고 GPT Work 판단 대기
3. **SQL 재실행 필요.** 앞서 만든 `public.twin_candidates`를 지우고 private로 옮겨야 한다
4. **의존성 미설치** — `zod`, `openai`. `package.json` 변경이라 원장님 승인 필요
5. 파일럿 5·6번 유형(근의 분리, 이차부등식 해 조건)은 그래프 의존이라
   `unsupported` 비율이 높게 나올 수 있다
6. 미구현: `generate.ts`, `verify.ts`, API, 승인 화면

## 2026-09-23 (7) — CP-006 반영 + `twin_candidates` 테이블 생성 완료

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/sql/쌍둥이후보_테이블.sql` | CP-006 상태 전이로 수정 → **원장님이 실행 완료** |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-024~D-031 추가, 번호 충돌 정리 |
| `docs/힌트그래프_스키마.md` | v1.1 — 판정 5갈래·stuck_score·strategy 분리·known_answer 모드 |
| `docs/AI_QUESTION_APP_CP006.md` | 신규 (원본) |
| `GPT_BRIEF.md` | CP-006 회신 (7항목 보고) |
| `DECISION_LOG.md` | 항목 추가 (**DB 변경 기록**) |

**앱 코드는 아직 0줄.** 생성 프롬프트 미수령으로 생성부를 만들 수 없다.

### 테스트 결과

**`twin_candidates` 테이블이 운영 DB에 실제로 만들어졌고, 검증을 통과했다.**

| 확인 | 결과 |
|---|---|
| 테이블 존재 | 예 |
| 칼럼 수 | 31 |
| 행 수 | 0 (빈 테이블, 정상) |
| RLS | **켜짐** |
| 정책 | `SELECT → is_staff()` · `UPDATE → is_admin()` |
| FK | 3개 (`problems` 2, `users` 1) |
| 인덱스 | 6개 |

정책이 `is_staff()`/`is_admin()`을 쓰므로 **학생·학부모(익명 authenticated)는 이 테이블을 읽을 수 없다.**
미승인 문항과 정답이 학생에게 노출되는 경로가 막혔다.

기존 테이블 변경 없음. `problems`·`students`는 FK로 참조만 한다.

### 남은 문제

1. **생성 프롬프트 미수령 (최우선 블로커).** D-024·불변 원칙 1에 따라 Claude가 문항 생성 규칙을
   정할 수 없다. 프롬프트가 와야 생성 호출부를 만든다
2. **CP-006이 CP-005 회신을 반영하지 않았다.** §6에 "1,105~2,210개" 가 남아 있으나
   실제 제작 대상은 **179~358문항**이다 (903개 유형이 이미 쌍둥이 보유). 회신에서 재보고함
3. **자동 검증이 불가능한 유형이 있다** — 도형·서술형·복수정답·맥락 자연스러움·학년 적합성.
   특히 **"수학적으로 옳지만 교육적으로 못 쓰는 문항"** 은 검산기가 거르지 못한다.
   프롬프트에서 눌러 주셔야 검수 부담이 줄어든다
4. D-021(모델명) 여전히 OPEN. 환경변수로 주입하도록 설계는 마쳤다
5. 앱 코드 전체 미착수 (대상 선정·검산기·승인 화면·생성 호출)

## 2026-09-23 (6) — CP-005: 쌍둥이 제작 설계안 5건 + 후보 테이블 SQL

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/AI_QUESTION_APP_CP005.md` | 신규 (GPT 원본) |
| `docs/쌍둥이제작_설계.md` | 신규 253줄. 설계안 5건 + 미정 항목 + 파일럿 기준 |
| `docs/sql/쌍둥이후보_테이블.sql` | 신규 88줄. **미실행** — 원장님이 직접 실행 (D-012) |
| `GPT_BRIEF.md` | CP-005 회신으로 전면 교체 (333줄) |
| `DECISION_LOG.md` | 항목 추가 |

**앱 코드 없음. DB 변경 없음.** CP-005의 "대량 생성 코드는 작성하지 말 것"을 지켰다.

### 테스트 결과

작성한 SQL이 실제 DB와 맞는지 **운영 DB에서 스키마 참조를 전부 검증**했다.

| 확인 | 결과 |
|---|---|
| `public.is_staff()` / `public.is_admin()` | 둘 다 존재 |
| `problems.id` | `bigint` + **PRIMARY KEY** → FK 참조 가능 |
| `users.id` | `uuid` + PRIMARY KEY |
| `pgcrypto` | 설치됨 (`gen_random_uuid` 사용 가능) |
| `twin_candidates` 기존 존재 | 없음 — 이름 충돌 없음 |
| 기존 `twin_id` 양방향 일관성 | **불일치 0건** (8,050행 = 4,025쌍) |
| 쌍둥이 보유 유형 | **903 / 1,093.** 없는 유형 190개, 그중 검산 가능 179개 |

**SQL 자체는 실행하지 않았으므로 문법 검증은 되지 않았다.** 스키마 참조는 전부 맞다.

### 남은 문제

1. **CP-004를 받지 못했다.** CP-005가 우선순위에 언급했는데 파일이 없다.
   CP-003의 Q1·Q2 답이 거기 있었다면 그 내용을 모르는 상태다
2. **생성 프롬프트 본문이 없다.** GPT Work가 만들어야 하고(불변 원칙 1), 이게 와야 배치 프로그램을 짤 수 있다
3. **후보를 이미지로 만들지 텍스트로 둘지 미정.** 텍스트면 인쇄 시험지에 섞을 수 없다.
   화면 전용이면 텍스트로 충분하다고 제안함
4. `similarity_to_source` 임계값 미정 — 파일럿 결과를 봐야 한다
5. D-021(모델명) 여전히 OPEN
6. 앞선 항목의 남은 문제(D-023 MVP 범위, 쌍둥이 1:1 역산, difficulty null 대체 규칙)는 그대로 유효

## 2026-09-23 (5) — CP-003 반영 + 보충 루프 예시 + MVP 범위 발견

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/AI_QUESTION_APP_CP003.md` | 신규 (GPT 원본) |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-014 REJECTED, D-015~D-020 추가, D-015→D-021 번호 이동, D-022·D-023 추가 |
| `docs/AI_QUESTION_APP_CLAUDE_HANDOFF.md` | 금지 표현 4건 교체 |
| `docs/힌트대화_예시.md` | 보충 루프 예시 2건 추가 (169줄) |
| `GPT_BRIEF.md` | CP-003 회신으로 전면 교체 (202줄) |
| `DECISION_LOG.md` | 항목 추가 |

**앱 코드·DB 변경 없음.**

### 테스트 결과

핸드오프 수정 후 **금지 표현 잔존 검사**를 돌렸다 — 「하루 신규 질문 5개」 0건,
「전체 풀이 공개 단계」 0건, 「대표유형 영상을 연결」 0건.

운영 DB 읽기 전용 조회 결과:

| 확인 | 결과 |
|---|---|
| Storage `problem-images` | **42,687개**. `updated_at`·`ETag` 100% 보유 → D-019 계산 가능 |
| `problems.difficulty` | **11,365개(51%)만 존재** → 유사 문제 난이도 비교가 절반에서 불가 |
| `answer_text` 보유 | **11,475개(51.6%)만**. `image` 10,159 + `null` 608은 0개 |
| 쌍둥이 없는 문항 분포 | 99.8%가 같은 유형 5개 이상 보유. **완전 고립 5개** |
| 보충 루프 예시 표본 | A: id 5479 (쎈, twin 4581) / B: id 3994 (베이직쎈, twin 없음·answer image·difficulty null) |

### 남은 문제

1. **D-023 확정 대기 (최우선).** `answer_text` 없는 10,767문항(48.4%)은 서버 판정·누출 검사·
   비교 채점이 전부 불가능하다. MVP 범위를 51.6%로 한정할지 GPT·원장님 확정 필요
2. **쎈↔쎈B 쌍둥이 4,025쌍이 1:1 대응이라** D-016의 1순위 유사 문제를 끝까지 풀어주면
   원문 답이 역산된다. 1순위를 마이크로 예제로 바꿀지 Q1으로 질의함
3. `difficulty` null 51%에 대한 `step` 대체 규칙 미정
4. D-021(모델 선택) OPEN. **CP-002의 모델명(GPT-6 Sol/Astra/Luna)은 여전히 미확인**
5. D-022 쌍둥이 제작 — 파이프라인 미착수. 원장님 착수 지시 대기
6. 힌트 단계별 통과 조건 미정 (Q2로 질의함)

## 2026-09-23 (4) — CP-002 검토 + 산출물 2건 + 코워크 인수인계

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/AI_QUESTION_APP_CP002.md` | 신규 (GPT 원본 복사) |
| `docs/힌트그래프_스키마.md` | 신규. JSON 스키마 v1.0 — `say`/`check` 분리, 검증 규칙 6개 |
| `docs/힌트대화_예시.md` | 신규. 중2 일차함수 4갈래 (순조/막힘/답요구/**답을 이미 앎**) |
| `GPT_BRIEF.md` | 전면 교체. CP-002 회신 348줄 |
| `COWORK_BRIEF.md` | 신규. Claude Cowork용 전체 인수인계 204줄 |
| `DECISION_LOG.md` | 항목 추가 |

**코드·DB 변경 없음** (CP-002 「코드를 구현하지 말 것」 준수).

### 테스트 결과

코드 미작성. 대신 **운영 DB를 읽기 전용으로 조회**해 CP-002 스키마를 검증했다.

| 확인 | 결과 |
|---|---|
| `problems.id` 타입 | **`bigint`** — CP-002의 `problem_id uuid` 3곳이 **실행 시 실패**한다 |
| `students.id` 타입 | `uuid` — CP-002와 일치 |
| `standard_types` PK | `code` (text). `id` 칼럼 없음 |
| `problems` 행 수 | **22,242** — 문서의 14,451은 낡음 |
| `standard_types` 행 수 | **1,105** — 문서의 915는 낡음 |
| `concepts` / `concept_video_progress` | 개념 876행에 **영상 URL 칼럼 없음**. 진행표는 촬영 여부만(2건) |
| 예시용 유형 선정 | `중2-1-09-09` x절편·y절편 — 29문항, 쌍둥이 10쌍 |

### 남은 문제

1. **E-1 미해결 (최우선).** 주 진입 경로(채점→질문)로 오는 학생은 정답을 이미 봤는데
   §0은 "최종 정답 절대 비공개"다. 두 개가 같이 성립하지 않는다. CP-003 답을 기다린다
2. **모델명 GPT-6 Sol/Astra/Luna를 확인할 수 없다.** 비용 추정 전체가 이 위에 서 있다.
   구현 착수 전 공식 문서 확인 필요
3. **비용 추정을 22,242문항 기준으로 다시 잡아야 한다** (CP-002는 14,451 기준 $87 → 약 $134)
4. `private` 스키마 신설 시 **PostgREST 노출 제외** 설정을 빠뜨리면 이름만 private이 된다
5. `docs/문제은행.md`의 수치(14,451 / 915)가 낡았다. 갱신 필요
6. 힌트 그래프 스키마 v1.0은 **초안**이다. GPT 검토 후 확정

## 2026-09-23 (3) — CP-001 검토: 위험 3건 발견

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/AI_QUESTION_APP_CLAUDE_HANDOFF.md` | 신규 (GPT 확정본 복사) |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | 신규 (GPT 결정로그 복사) |
| `docs/QUESTION_APP_STANDARD.md` | 전면 재작성 — 충돌 A-1~A-5, 기술검토 B |
| `GPT_BRIEF.md` | 전면 교체 — CP-001 회신 (C-1~C-5) |
| `DECISION_LOG.md` | 항목 추가 |

**코드·DB 변경 없음** (핸드오프 §8 준수).

### 테스트 결과

코드를 작성하지 않았으므로 빌드·동작 영향 없음. 대신 아래를 **실제 코드·DB에서 확인**했다.

| 확인한 것 | 결과 |
|---|---|
| `problems` 칼럼 구성 | `problem_fingerprint` 없음 (D-008 캐시 키 불가) |
| 유형↔영상 연결 | **없음.** `grep`으로 `standard_types`+영상 교차 검색 0건 |
| 영상 자산 | 수업별 `sessions.video_url`·`video_watch_logs`만 존재. 유형별 아님 |
| 개념강의 촬영 진행 | **0 / 308 (0%)**, 2026-09-07 ~ 2027-04-08 |
| QR 채점의 정답 전달 | `app/api/grade/[code]/route.ts:92`가 `answerText`를 무인증 응답에 포함 |

### 남은 문제

**위험 (MVP 출발을 막는 것)**

1. **힌트 1이 영상에 의존하는데 영상이 0개다.** 완성 예정 2027-04, 게다가 단위 불일치
   (촬영은 개념 308개 / 힌트에 필요한 건 유형 915종). 대안 필요 — 쌍둥이 4,025쌍 활용 제안함
2. **D-004 최종답 비공개의 출구가 「교사 연결」 하나뿐이다.** 실시간이 아니라
   밤에 혼자 공부하는 아이는 그 자리에서 막힌 채 끝난다. 원장님 대원칙과 충돌할 수 있다

**수정 필요**

3. **D-014 하루 5개 한도가 원장님 09-23 지시와 정면 충돌.** 문서 우선순위상 한도 없음이 우선.
   GPT에 `REJECTED` 처리 요청함
4. **핸드오프 §5 「정답은 서버 전용」이 이미 깨져 있다.** QR 자기채점이 정답을 학생에게 내려준다.
   설계 전제를 다시 세워야 함 (답을 모르게 → 풀이를 대신 완성하지 않기)
5. `problem_fingerprint` 칼럼 부재

**그 외**
6. 앱 명칭·MVP 대상 학년·파일럿 단원 등 핸드오프 §7의 13개 미결정 항목

## 2026-09-23 (2) — GPT 전달용 브리핑 파일 신설

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `GPT_BRIEF.md` | 신규. GPT에 통째로 붙여넣는 브리핑 — 결정 D1~D11 누적, 이번 질문 5개 |
| `docs/질문웹앱.md` | GPT 질의문 코드블록 제거 → `GPT_BRIEF.md` 포인터로 교체 |
| `AGENTS.md` | 결정이 생길 때마다 `GPT_BRIEF.md`를 갱신하라는 규칙 추가 |
| `DECISION_LOG.md` | 항목 추가 |

코드·DB 변경 없음.

### 테스트 결과

해당 없음 — 문서만 작성. 실행 코드 무변경이라 빌드·동작에 영향 없음.
`grep`으로 `docs/질문웹앱.md`의 포인터 연결과 `AGENTS.md` 규칙 블록 위치는 확인했다.

### 남은 문제

1. **`GPT_BRIEF.md`는 손으로 갱신해야 한다.** 결정이 늘 때마다 D번호를 추가하는 걸 잊으면
   GPT가 낡은 전제로 답한다. `AGENTS.md`에 규칙으로 박아 뒀지만 자동 검증 수단은 없다.
2. 앞선 항목의 남은 문제(비용 수치, 힌트 분해 축, §1·§2 초안 상태, 막힌지점 테이블, 프로젝트 폴더)는
   그대로 유효하다.

## 2026-09-23 — 표준 문서 수정: 한도 폐지·힌트 무제한

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/QUESTION_APP_STANDARD.md` | §0 대원칙 신설, 하루 한도 삭제, 힌트 2단계→무제한, 전체풀이 게이트 2회→1회, §3 비용 대안 신설 |
| `DECISION_LOG.md` | 2026-09-23 항목 추가 |
| `REPORT.md` | 이 항목 |

코드·DB 변경 없음.

### 테스트 결과

해당 없음 — 문서만 고쳤다. 실행 코드를 건드리지 않았으므로 빌드·동작에 영향이 없다.

### 남은 문제

1. **비용이 열려 있다.** 한도를 없앴으므로 학생 220명이 얼마든지 질문할 수 있다.
   §3의 네 가지(캐시·이미지 미전송·모델 차등·예산 경보)로 잡을 계획이나 **수치가 없다.**
   GPT 답변(③)을 받아 월 예상 비용을 계산한 뒤 원장님께 상한을 여쭤야 한다.
2. **"힌트를 어디까지 잘게 쪼갤지"가 안 정해졌다.** 무제한이라고 했지만 실제로는
   같은 힌트를 말만 바꿔 반복하는 구간이 생길 수 있다. 이게 아이에겐 더 답답하다.
   힌트 단계 설계가 이 앱의 성패를 가른다 — GPT ②의 답과 대조할 것.
3. **§1·§2가 아직 초안이다.** 원장님 확정 전이라 구현을 시작할 수 없다.
4. `question_usage` 테이블은 불필요해졌다. 대신 **막힌 지점을 쌓는 테이블**이 필요하다 (스키마 미설계).
5. 새 프로젝트 폴더가 아직 없다.

## 2026-09-22 — 질문 웹앱 착수: 구조 조사와 작업 규칙 수립

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/질문웹앱.md` | 신규. 설계 브리핑 — 재사용 가능 자산, 함정, 미결 쟁점 ①~⑥, GPT 질의문 |
| `docs/QUESTION_APP_STANDARD.md` | 신규. 학습 흐름·정답 차단 정책 **초안** (확정 대기) |
| `DECISION_LOG.md` | 신규 |
| `REPORT.md` | 신규 |
| `AGENTS.md` | 「질문 웹앱 작업 규칙」 4개 항목 추가 |

코드·DB 변경 없음.

### 테스트 결과

해당 없음 — 문서만 작성했다. 실행 코드를 건드리지 않았으므로 빌드·동작에 영향이 없다.

### 남은 문제

1. **`docs/QUESTION_APP_STANDARD.md` §1·§2가 초안 상태다.** 원장님 확정 전이라 구현을 시작할 수 없다.
   특히 하루 질문 한도 수치, 전체 풀이 개방 조건이 비어 있다.
2. **GPT 답변 대기 중.** `docs/질문웹앱.md` 하단 질의문에 대한 ①~⑥ 답변이 오면 초안과 대조한다.
3. **새 프로젝트 폴더가 아직 없다.** 별도 Next.js 앱을 어디에 만들지(경로·저장소) 미정.
4. **운영 DB 테이블 추가가 필요하다.** 학생 220명 실서비스라 SQL 파일로 만들어 원장님이 직접 실행한다.

## 2026-09-23 — GPT-EXEC-006 수행 (쌍둥이 파이프라인 작업 A~G)

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `lib/twin/fingerprint.ts` | **신규**. SHA-256 canonical 지문. Storage 메타 없으면 fail closed |
| `lib/twin/pipeline.ts` | **신규**. 원문 1건 종단 오케스트레이터 12단계 + `summarize()` |
| `lib/twin/reviewApi.ts` | **신규**. 검수 API 요청 본문 Zod `.strict()` 계약 |
| `lib/twin/exec006.test.ts` | **신규**. 이번 명령 회귀 테스트 40개 |
| `lib/twin/publish.ts` | 학생 payload 3필드로 재작성. `can_show_final_value` 제거 |
| `lib/twin/repository.ts` | `batch_id` 필수 · null 기본값 치환 제거 · RPC 이름 오타 수정 |
| `lib/twin/targets.ts` | 존재하지 않던 `twin_eligible_types` → `server_list_eligible_twin_types` |
| `app/api/twin/review/route.ts` | POST 본문 Zod 검증 · 문구 개명 |
| `app/teacher/twin-review/page.tsx` | 교사 수정 UI · 「미확인」 표시 · 「학생 게시 안전검수 완료」 |
| `docs/sql/쌍둥이_설치.sql` | 명칭 일괄 변경 · UNIQUE 에 `batch_id` · 원문 조건 검증 · RPC 1개 추가(9개) |
| `docs/sql/쌍둥이_설치전_점검.sql` | 실패 시 `raise exception` · 이름 충돌 기준 통일 |
| `docs/sql/쌍둥이_설치후_검증.sql` | 함수 9개 기준 · `[3-마]`·`[4-13]`·`[5-다]` 추가 · `[4-5]` 수정 |
| `docs/sql/쌍둥이_롤백.sql` | 새 RPC drop 추가 |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-063 ~ D-071 기록 |
| `package.json` | `test:twin` 에 `exec006.test.ts` 추가 |
| `CLAUDE_RESULT_006.md` · `REVIEW_CONTEXT_006.md` · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_006.tar.gz` | **신규** 검수 묶음 |

**DB 변경 없음** — SQL 은 파일로만 있고 운영 DB 에서 실행하지 않았다.

### 테스트 결과

```text
npm run test:twin   → tests 122 / pass 122 / fail 0
npx tsc --noEmit    → 이번 작업 범위 오류 0 (전체 15개는 전부 기존 파일)
npx eslint lib/twin app/api/twin app/teacher/twin-review --ext .ts,.tsx
                    → error 0 / warning 1 (Storage signed URL 이라 <img> 유지)
sha256sum -c MANIFEST.sha256 (푼 디렉터리에서) → 33/33 OK
```

수행 중 실제 결함 2건을 찾아 고쳤다.

1. `repository.ts` 가 `admin_set_student_publish_**approved**` 를 불렀다 —
   설치 SQL 에는 `..._approval` 이다. 설치했다면 안전검수 켜기/끄기가 전부 실패했다.
2. 검증 SQL 이 `type_code` 에 가짜 값(`'VERIFY-TYPE'`)을 넘겨, 작업 B 의 원문 유형 일치
   검사 때문에 통과할 수 없었다. 원문의 실제 `type_code` 를 읽도록 고쳤다.

### 남은 문제

1. **SQL 문법 검사 미수행.** 로컬에 SQL 파서가 없고 새 도구 설치가 금지돼 있다.
   Supabase SQL Editor 의 첫 실행이 사실상 첫 문법 검증이 된다.
2. **설치 전 점검 SQL 실행 대기.** 읽기 전용이지만 원장님 지시 전에는 돌리지 않는다.
3. **파일럿 범위 미정** — 몇 유형 × 유형당 몇 문항인지.
4. **사이드바 미등록.** `app/teacher/twin-review` 는 아직 메뉴에 없다 (금지 사항).
   등록할 때 `app/teacher/manual/page.tsx` 매뉴얼 문구도 같이 고쳐야 한다.
5. **`next/image` 경고 1건** — 원문 이미지가 Storage signed URL 이라 최적화를 못 쓴다.

## 2026-09-23 — GPT-EXEC-007 수행 (006 검수 결함 8개 수정)

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `lib/twin/storage.ts` | **신규**. 이미지·Storage 메타 fail closed. 경로가 있는데 못 받으면 예외 |
| `lib/twin/exec007.test.ts` | **신규**. 결함 8개 회귀 테스트 45개 |
| `lib/twin/pipeline.ts` | 실제 `twin_id`·`is_essay` 검사 · batch 캐시 3~4단계 · 입력 계약 0단계 · 후보 번호 검사 · 유사도 null |
| `lib/twin/targets.ts` | `SourceProblem` 에 `twin_id`·`is_essay` · 조용한 보정 금지 · Zod `.strict()` 파싱 |
| `lib/twin/source.ts` | 이미지 로더를 `storage.ts` 로 옮기고 옛 이름 제거 |
| `lib/twin/verify.ts` | 가짜 유사도 함수 삭제 (후보 본문 vs 원문 **정답** 비교였음) |
| `lib/twin/generate.ts` | `GenerationOutcome.raw` 제거 |
| `lib/twin/repository.ts` | `getBatchState()` + Zod `.strict()` · 새 오류 코드 10개 |
| `lib/twin/exec006.test.ts` | 파이프라인 테스트를 007로 이관 · 함수 개수 검사 이관 |
| `docs/sql/쌍둥이_설치.sql` | RPC 10개 · verified 양방향 불변식 · payload 화이트리스트 · enum/range CHECK · cast 안정화 |
| `docs/sql/쌍둥이_설치전_점검.sql` | 함수 10개 · 참조 칼럼 15개 확인 |
| `docs/sql/쌍둥이_설치후_검증.sql` | 함수 10개 · 권한 16가지 · `[3-바]` · `[4-14]` 추가 |
| `docs/sql/쌍둥이_롤백.sql` | 새 RPC drop |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-072 ~ D-081 |
| `package.json` | `test:twin` 에 `exec007.test.ts` 추가 |
| `CLAUDE_RESULT_007.md` · `REVIEW_CONTEXT_007.md` · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_007.tar.gz` | **신규** 검수 묶음 |

**DB 변경 없음** — 읽기 전용 점검 SQL 도 실행하지 않았다.

### 테스트 결과

```text
npm run test:twin   → tests 167 / pass 167 / fail 0
npx tsc --noEmit    → 이번 작업 범위 오류 0 (전체 15개는 전부 기존 파일)
npx eslint lib/twin app/api/twin app/teacher/twin-review --ext .ts,.tsx
                    → error 0 / warning 1 (Storage signed URL 이라 <img> 유지)
tar -xzf (옵션 없음) → exit 0
sha256sum -c MANIFEST.sha256 → 35/35 OK
SQL 파서 → 미수행 (로컬에 없고 새 패키지 설치 금지)
```

작업 중 내가 낸 오류 1건을 스스로 잡았다. `variant_kind` CHECK 를
`numeric|context|structure|mixed`, `difficulty_delta` 를 `-2..2` 로 적었는데
실제 계약은 `lib/twin/schema.ts` 의 `numeric|wording|context|representation|mixed` 와 `-1..1` 이다.
그대로 설치했다면 정상 후보 중 `wording`·`representation` 이 DB 에서 거부됐다.
고친 뒤 `VariantKind.options` 를 직접 읽어 SQL 과 대조하는 테스트를 넣었다.

### 남은 문제

1. **SQL 문법 검사 미수행.** 파서가 없고 새 도구 설치가 금지돼 있다.
2. **읽기 전용 점검 SQL 도 실행 대기.** GPT 검수 뒤 지시를 받는다.
3. **파일럿 스모크 미실행** (D-073: 1유형 × 원문 1개 × 후보 2개).
4. **사이드바 미등록.** 등록할 때 `app/teacher/manual/page.tsx` 도 같이 고쳐야 한다.
5. **원문 본문(OCR)이 없어 유사도를 못 잰다** (D-074). 지금은 `null` = 「미확인」.

## 2026-09-23 — GPT-EXEC-008 수행 (007 보정 · 운영 점검은 권한 차단)

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `lib/twin/exec008.test.ts` | **신규**. is_essay·Storage·점검SQL 회귀 테스트 23개 |
| `lib/twin/storage.ts` | `created_at` fallback 삭제 · 폴더형/metadata null 거부 · `arrayBuffer()` 실패 정규화 |
| `lib/twin/targets.ts` | `is_essay` 명시적 false 만 · `strictBool` 이 null 도 실패 · 오류 메시지에 is_essay 추가 |
| `lib/twin/flags.ts` | 옛 `safe_worked_example` 주석을 현재 명칭으로 |
| `docs/sql/쌍둥이_설치.sql` | `is distinct from false` · `coalesce(is_essay,false)` 제거 |
| `docs/sql/쌍둥이_설치전_점검.sql` | `[12]`~`[22]` 추가 (is_essay 통계 · Storage 구조·참조 무결성) |
| `docs/sql/쌍둥이_설치후_검증.sql` | 검증용 원문도 `is_essay = false` |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-082 ~ D-087 |
| `package.json` | `test:twin` 에 `exec008.test.ts` 추가 |
| `CLAUDE_RESULT_008.md` · `CLAUDE_BLOCKER_008.md` · `REVIEW_CONTEXT_008.md` · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_008.tar.gz` | **신규** 검수 묶음 |

**DB 변경 없음. 운영 DB 읽기도 못 했다.**

### 테스트 결과

```text
npm run test:twin   → tests 190 / pass 190 / fail 0   (선언 수 190 = 실행 수 190)
npx tsc --noEmit    → 이번 작업 범위 오류 0
npx eslint          → error 0 / warning 1
tar -xzf (옵션 없음) → exit 0
sha256sum -c        → 38/38 OK
운영 SQL 실행       → 0건 (권한 차단)
SQL 파서            → 미수행
```

### 남은 문제

1. **운영 사전점검을 못 돌렸다.** auto 모드가 운영 DB 를 **읽기까지 차단**한다.
   순수 `select count(*)` 도 거부됐다. 우회하지 않고 `CLAUDE_BLOCKER_008.md` 를 만들었다.
   원장님이 SQL Editor 에서 한 번 돌려 주시거나, 이 세션에 읽기 권한을 열어 주셔야 한다.
2. **Storage ETag 키 표기 미확인.** 코드는 `metadata.eTag` / `metadata.etag` 둘만 본다.
   다르면 모든 원문이 막힌다 (안전한 실패 방향). 점검 SQL `[22]` 가 확인해 준다.
3. **`[20]`~`[22]` 판정 기준이 빡빡할 수 있다.** 엄격 원문 중 1건이라도 걸리면 점검이 실패한다.
4. 설치·스모크·사이드바 등록은 그대로 대기.

## 2026-09-23 — GPT-EXEC-009 수행 (이미지 필수 · 사전점검 판정 재설계)

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `lib/twin/exec009.test.ts` | **신규**. D-088·Storage 판별·점검 판정·코드 분리 회귀 테스트 32개 |
| `lib/twin/targets.ts` | `image_path` 필수 (조회·재검사) · 오류 메시지에 image_path 추가 |
| `lib/twin/pipeline.ts` | 1단계에 `image_path` 전달 · 5단계 방어를 무조건으로 |
| `lib/twin/storage.ts` | `id`·`updated_at`·`metadata` 타입까지 엄격 판별. `.trim()` 전에 타입부터 본다 |
| `lib/twin/repository.ts` | `source_image_missing`·`source_is_essay_unknown` 코드 추가 · **긴 코드부터 매칭** |
| `docs/sql/쌍둥이_설치.sql` | 생성 RPC 의 `image_path` 검사 · `is_essay` 2분기 · 유형집계 count 3개 조건 통일 |
| `docs/sql/쌍둥이_설치전_점검.sql` | 판정 재설계 (`[12]`~`[24]`) · Storage 구조 가드 |
| `docs/sql/쌍둥이_설치후_검증.sql` | 원문 선정에 image_path · `[4-13마/바/사]` 음성 테스트 |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-088 ~ D-092 |
| `package.json` | `test:twin` 에 `exec009.test.ts` 추가 |
| `CLAUDE_RESULT_009.md` · `REVIEW_CONTEXT_009.md` · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_009.tar.gz` | **신규** 검수 묶음 |

**DB 변경 없음. 운영에 접속하지 않았다.**

### 테스트 결과

```text
npm run test:twin   → tests 222 / pass 222 / fail 0   (선언 수 222 = 실행 수 222)
npx tsc --noEmit    → 이번 작업 범위 오류 0
npx eslint          → error 0 / warning 1
사전점검 정적검사   → 변경문 9종 전부 0건, 임시테이블 0건
tar -xzf (옵션 없음) → exit 0
sha256sum -c        → 38/38 OK
운영 SQL 실행       → 0건
SQL 파서            → 미수행
```

작업 중 실제 버그 1건을 찾아 고쳤다. `toError()` 가 안정 코드를 삽입 순서대로 훑어
`source_is_essay_unknown` 을 짧은 `source_is_essay` 로 잘못 보고했다. 긴 코드부터 보도록 바꿨다.

전제가 바뀌어 기존 테스트 6개를 고쳤다. 그중 하나는 뒤집었다 —
"이미지 없는 원문은 null 입력으로 생성까지 간다"가 이제 "생성까지 가지 않는다"다.

### 남은 문제

1. **사전점검 실행 대기.** GPT 검수 뒤 원장님이 SQL Editor 에서 1회 실행한다 (D-092).
2. **D-091: 유료 스모크 전에 Storage SDK 표본 1건이 필요하다.** 지금 세션은 운영 읽기가 막혀 있다.
   그때 권한을 열지 미리 정해 둬야 스모크에서 막히지 않는다.
3. **D-088 이 대상 수를 얼마나 줄이는지 모른다.** 점검 `[14]` 가 나와야 안다.
4. **`[24]` 의 5개 기준이 유형집계 RPC 의 기본값과 두 곳에 적혀 있다.** 한쪽만 바꾸면 어긋난다.
5. 설치·스모크·사이드바 등록은 그대로 대기.

## 2026-09-26 — GPT-EXEC-010 수행 (사전점검 의미 일치 최종 보정)

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `lib/twin/exec010.test.ts` | **신규**. `[24]` 정합·구조 가드·필터 순서 회귀 테스트 18개 |
| `lib/twin/targets.ts` | `.neq('answer_text','')` · `.neq('image_path','')` 를 limit **앞**에 (D-095) |
| `docs/sql/쌍둥이_설치전_점검.sql` | `[7-2]` code 중복 중단 항목 · `[11-2]` 문제 구조 가드 · `[24]` standard_types inner join · 참고 count 존재 확인 |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-093 ~ D-096 |
| `package.json` | `test:twin` 에 `exec010.test.ts` 추가 |
| `PREFLIGHT_TO_RUN_010.sql` | **신규**. 점검 SQL 과 SHA-256 동일한 사본 (원장님 실행용) |
| `CLAUDE_RESULT_010.md` · `REVIEW_CONTEXT_010.md` · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_010.tar.gz` | **신규** 검수 묶음 |

**DB 변경 없음. 운영에 접속하지 않았다** (읽기 시도조차 하지 않음 — D-096).

### 테스트 결과

```text
npm run test:twin   → tests 240 / pass 240 / fail 0   (선언 수 240 = 실행 수 240)
npx tsc --noEmit    → 이번 작업 범위 오류 0
npx eslint          → error 0 / warning 1
사전점검 정적검사   → 변경문 9종 전부 0건, 임시테이블 0건, DO 블록 1개
tar -xzf (옵션 없음) → exit 0
sha256sum -c        → 40/40 OK
PREFLIGHT_TO_RUN_010.sql ↔ 원본 → SHA-256 동일 (cmp 통과)
운영 SQL 실행       → 0건
SQL 파서            → 미수행
```

전제가 바뀌어 기존 테스트 2개를 고쳤다 — 체인 mock 에 `neq` 추가,
Storage 가드 문구가 `if not v_storage_ok or not v_problem_ok` 로 바뀐 것.

### 남은 문제

1. **점검 실행 대기.** GPT 검수 뒤 원장님이 `PREFLIGHT_TO_RUN_010.sql` 을 1회 실행한다.
2. **`[7-2]` code 중복이 실제로 몇 건일지 모른다.** 중단 항목이라 있으면 설치가 멈춘다.
   §86 대로 했지만 운영 데이터를 못 봐서 판단 근거가 없다.
3. **`[24]` 의 `>= 5` 와 유형집계 RPC 의 `p_min_eligible = 5` 가 두 곳에 있다.**
   한쪽만 바꾸면 어긋난다. 테스트는 양쪽 존재만 보고 값 일치는 안 본다.
4. **D-091: 유료 스모크 전에 Storage SDK 표본 1건이 필요하다.** 지금 세션은 운영 읽기가 막혀 있다.
5. 설치·스모크·사이드바 등록은 그대로 대기.

## 2026-09-27 — 운영 사전점검 실행 결과 기록 (원장님 실행 · Claude 기록)

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `PREFLIGHT_RAW_011.txt` | **신규**. 실행 원시 기록 (`Success. No rows returned` · notice 미표시 사실) |
| `PREFLIGHT_RESULT_011.md` | **신규**. 판정과 확정/미확정 사실 구분 |
| `CLAUDE_RESULT_011.md` | **신규**. 회신 |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-097 |

**코드·SQL 무변경. 운영 DB 에 접속하지 않았다** (이 회차 접속 0회).

### 테스트 결과

해당 없음 — 소스를 건드리지 않았다. 직전 상태 그대로다 (tests 240 / pass 240 / fail 0).

### 결과 요약

사전점검 **통과**(`v_fail = 0`). 구조 13항목 전부 통과, 두 가드 모두 true,
**사용 가능 원문 ≥ 1 · 사용 가능 파일럿 유형 ≥ 1** 확정.

### 남은 문제

1. **개별 통계 미수집.** Supabase SQL Editor 가 `raise notice` 를 표시하지 않는다.
   `[12]`~`[22]` 와 `[23]`·`[24]` 의 **정확한 수**를 모른다. 추정해 채우지 않았다.
2. **파일럿 규모(10유형)를 확정할 수 없다.** `[24] ≥ 1` 만 안다.
3. **D-088 이 대상을 얼마나 줄였는지 모른다** (`[14]` 미수집).
4. **ETag 실제 키 미확정.** SQL 쪽 계약은 성립하지만 `eTag`/`etag` 중 어느 쪽인지 모른다.
   D-091 대로 유료 스모크 전에 SDK 표본 1건이 필요하다.
5. 숫자를 얻는 세 가지 방법을 문서에 적어 두었으나 **이번 회차에 실행하지 않았다**
   (숫자 조회 전용 SELECT / Postgres Logs / 세션에 읽기 권한 개방).
6. `GPT_EXEC_011.md` 파일을 받지 못했다. 명령서의 추가 요구 항목이 있을 수 있다.

## 2026-09-27 — GPT-EXEC-012 수행 (파일럿 준비 수치 조회 SQL 제작)

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/sql/쌍둥이_설치전_수치조회.sql` | **신규**. `[12]`~`[24]` 를 **결과표로** 돌려주는 읽기 전용 SELECT 하나 |
| `PREFLIGHT_COUNTS_TO_RUN_012.sql` | **신규**. 위 파일과 SHA-256 동일한 실행용 사본 |
| `lib/twin/exec012.test.ts` | **신규**. 동일성·읽기전용·금지출력·조건일치·합 구조 회귀 테스트 23개 |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-098 ~ D-104 추가 · D-097 오타 수정 |
| `package.json` | `test:twin` 에 `exec012.test.ts` 추가 |
| `CLAUDE_RESULT_012.md` · `REVIEW_CONTEXT_012.md` · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_012.tar.gz` | **신규** 검수 묶음 |

**판정용 `쌍둥이_설치전_점검.sql` 은 건드리지 않았다** (D-103). 011 실행 당시 해시 그대로이고,
그 해시를 회귀 테스트에 박아 뒀다. 설치 SQL·프롬프트·파이프라인도 무변경.

**DB 변경 없음. 운영에 접속하지 않았다.**

### 테스트 결과

```text
npm run test:twin   → tests 263 / pass 263 / fail 0   (선언 수 263 = 실행 수 263)
npx tsc --noEmit    → 이번 작업 범위 오류 0
npx eslint          → error 0 / warning 1
수치조회 정적검사   → 변경 키워드 9종 0건 · DO/RAISE/CALL/COPY/set_config/TEMP 0건
                      세미콜론 1개 · LIMIT 없음 · 읽는 테이블 3개뿐
두 SQL 파일         → SHA-256 동일 (cmp 통과)
tar -xzf (옵션 없음) → exit 0 · sha256sum -c → 43/43 OK
운영 SQL 실행       → 0건
SQL 파서            → 미수행
```

초안에서 `strict_src` 에 `image_path` 를 안 넣어 조인이 깨지는 버그를 냈다. 고치면서
경로가 거쳐 가는 CTE 를 `base` 하나로 줄여, 결과에 실릴 여지도 함께 없앴다.

### 남은 문제

1. **SQL 문법 검증이 안 됐다.** 로컬 파서가 없다. `bool_or`·`filter`·`row_number()`·
   `union all` 타입 일치 오타가 있으면 원장님 실행에서 처음 드러난다. 읽기 전용이라
   운영에 영향은 없지만 왕복이 한 번 더 생길 수 있다.
2. **`[24]` 의 `count(twin_id)` 계산 위치가 판정 SQL 과 다르다.** `[7-2]` 로 code 유일성이
   확인돼 결과는 같지만 구현이 다르다. GPT 검수 항목으로 올렸다.
3. **파일럿 10유형 가능 여부는 여전히 모른다.** 이 SQL 을 돌려야 `[24]` 실제 값이 나온다.
4. **D-100/D-091: 유료 스모크 전 Storage SDK 표본 1건이 필요하다.** 지금 세션은 운영 읽기 차단.
5. 설치·스모크·사이드바 등록은 그대로 대기.

## 2026-09-27 — GPT-EXEC-014 수행 (설치 패키징 · 파일럿 10유형 확정)

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/sql/쌍둥이_설치후_검증.sql` | **수정**. 수동 UUID placeholder 제거 → 관리자·학생 자동 선택 (D-112) |
| `docs/twin/PILOT_TYPES_014.json` | **신규**. 1차 파일럿 10유형 manifest (D-111) |
| `INSTALL_TO_RUN_014.sql` · `POSTINSTALL_TO_RUN_014.sql` · `ROLLBACK_014.sql` | **신규**. 공식 원본과 바이트 동일한 실행용 사본 |
| `PILOT_TYPES_014.json` | **신규**. manifest 루트 사본 |
| `INSTALL_RUNBOOK_014.md` | **신규**. 맨 위에 "지금은 실행하지 마십시오" |
| `lib/twin/exec014.test.ts` | **신규**. 회귀 테스트 23개 |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-108 ~ D-113 |
| `package.json` | `test:twin` 에 `exec014.test.ts` 추가 |
| `CLAUDE_RESULT_014.md` · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_014.tar.gz` | **신규** 검수 묶음 |

**`쌍둥이_설치.sql` 무변경** (객체·권한·RLS 의미 그대로). 롤백·점검·수치조회 SQL,
프롬프트, 파이프라인 코드도 무변경. **운영 DB 에 접속하지 않았다.**

검증 SQL 은 설정 블록 하나만 바꿨다. 임시 테이블의 컬럼 이름을 유지해 그것을 읽는
6곳을 하나도 고치지 않았다 — 검증 의미가 바뀔 여지를 최소화했다.

### 테스트 결과

```text
npm run test:twin   → tests 286 / pass 286 / fail 0   (선언 수 286 = 실행 수 286)
npx tsc --noEmit    → 이번 작업 범위 오류 0
npx eslint          → error 0 / warning 1
검증 SQL            → placeholder 0건 · begin 시작 · rollback 끝 · commit 0건
실행용 4개 파일      → 공식 원본과 SHA-256 동일 (cmp 통과)
tar -xzf (옵션 없음) → exit 0 · sha256sum -c → 49/49 OK
운영 SQL 실행       → 0건
SQL 파서            → 미수행
```

작업 중 내 테스트 코드에서 버그 세 개를 냈고 전부 잡았다.
(1) CRLF 때문에 주석 제거가 동작하지 않았다.
(2) plpgsql 의 `select ... into` 를 결과표로 오해했다.
(3) python 이 `\b` 를 백스페이스 문자로 써 넣어 정규식이 `/\x08into\x08/` 가 됐다 —
Node 가 출력할 때 보이지 않아 `/into/i` 처럼 보였다.
또 `on commit drop` 의 `commit` 을 트랜잭션 commit 으로 오해한 것도 고쳤다.
**SQL 쪽을 느슨하게 고쳐서 통과시킨 곳은 없다.**

### 남은 문제

1. **SQL 문법이 아직 검증되지 않았다.** 로컬 파서가 없다. 새로 쓴 자동 선택 구문
   (`create temp table … as select (서브쿼리), (서브쿼리);`)은 한 번도 실행된 적이 없다.
   설치 SQL 첫 실행이 사실상 첫 문법 검증이다. 트랜잭션이라 실패해도 DB 는 안전하다.
2. **파일럿 10유형 수치를 대조하지 못했다.** 전달받은 값을 그대로 적었다.
   내부 정합성(10개·중복0·단원당2·합일치·5개이상·공통수학1)만 확인했다.
3. **학생이 한 번도 로그인하지 않았으면 검증이 멈춘다** (`session_uid` 비어 있음). 안전한 실패.
4. **Storage 정리 600 / 899건**이 남아 있다. 파일럿과 독립적으로 처리해야 한다.
5. **Storage SDK 표본 미수행.** D-091·D-100 이 유료 스모크 전 필수로 못 박았는데
   이 세션은 운영 읽기가 차단돼 있다. SDK 키 표기(`eTag`/`etag`)는 여전히 미확인이다.
6. 설치·스모크·사이드바 등록은 **GPT 승인 전까지 대기** (D-113).

## 2026-09-27 — GPT-EXEC-016 수행 (검증 SQL 42501 수정)

설치는 **성공**했고(D-119) 설치 후 검증만 `42501 permission denied for schema
ai_question_private` 로 실패했다. 원인은 보안 결함이 아니라 **검증문이 `authenticated`
역할인 채로 비공개 테이블을 직접 읽은 것**이다. 그 42501 은 차단이 작동한다는 증거였다.

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `docs/sql/쌍둥이_설치후_검증.sql` | **수정**. 역할을 RPC 단위로 켜고 즉시 끔 (D-121). `[4-6]`·`[4-8]`~`[4-12]`·`[5-나]` |
| `POSTINSTALL_TO_RUN_016.sql` | **신규**. 위와 바이트 동일한 실행용 사본 |
| `lib/twin/exec016.test.ts` | **신규**. 역할 상태를 추적해 위반을 전수 검사 (20개) |
| `lib/twin/exec014.test.ts` | 014 검증 사본 비교 대상을 016 으로 이관 |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-118 ~ D-121 (**D-114~D-117 은 충돌로 보류**) |
| `CLAUDE_RESULT_016.md` · **`CLAUDE_BLOCKER_016.md`** · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_016.tar.gz` | **신규** 검수 묶음 |

**설치 SQL 무변경** (운영 설치본 해시와 같음). 권한·RLS 를 한 줄도 넓히지 않았다.
`INSTALL_TO_RUN_016.sql`·`ROLLBACK_016.sql` 은 만들지 않았다.

### 테스트 결과

```text
npm run test:twin   → tests 306 / pass 306 / fail 0   (선언 수 306 = 실행 수 306)
npx tsc --noEmit    → 이번 작업 범위 오류 0
npx eslint          → error 0 / warning 1
검증 SQL            → placeholder 0 · begin 시작 · rollback 끝 · commit 0
tar -xzf (옵션 없음) → exit 0 · sha256sum -c → 49/49 OK
운영 SQL 실행       → 0건
SQL 파서            → 미수행
```

핵심 테스트는 실행 본문을 한 줄씩 훑으며 **역할 상태를 추적**해, 역할이 켜진 채
`ai_question_private` 를 건드리는 줄을 전수 검사하는 것이다. `[5-나]` 한 줄만 예외다.

### 이번에 낸 실수

**결정 로그 번호를 확인하지 않고 D-114~D-121 을 덧붙였다.** D-114~D-117 은 이미
씽크체크 명칭·4층 역할 구조 등 **다른 의미로 존재**했다. 바로 발견해 내가 추가한 넷만
되돌리고 `CLAUDE_BLOCKER_016.md` 로 보고했다. 기존 항목은 손대지 않았다.
앞으로 덧붙이기 전에 항상 번호를 먼저 조회한다.

### 남은 문제

1. **SQL 런타임 검증이 안 됐다.** 정적 테스트는 파일 내용 검사일 뿐이다.
   원장님이 `POSTINSTALL_TO_RUN_016.sql` 을 1회 실행해야 실제 확인이 끝난다.
2. **D-114~D-117 번호를 GPT 가 정해 줘야 한다.** 네 결정이 아직 로그에 없다.
3. **결정 로그를 두 작업 흐름이 공유**해 번호 충돌이 또 날 수 있다. 번호 공간 분리 검토 필요.
4. `POSTINSTALL_TO_RUN_014.sql` 은 폐기본으로 남아 있다. 실행하면 안 된다.
5. Storage SDK 표본·유료 스모크는 그대로 대기 (D-091 · D-100).

## 2026-09-28 — GPT-EXEC-017 수행 (016 검수 지적 R016-01~04 보완)

GPT 검수가 016 을 **조건부 반려**했다. 세 지적 모두 정확했고, 특히 **내 회귀 테스트 20개가
통과한 것 자체가 의미 없었다** — 검사를 건너뛰고 있었다.

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `lib/twin/verifySqlAudit.ts` | **신규**. 역할 경계 감사기. 순수 함수라 변이 테스트가 가능하다 |
| `lib/twin/exec017.test.ts` | **신규**. 구간별 실검사 + 변이 탐지 31개 |
| `docs/sql/쌍둥이_설치후_검증.sql` | `[4-9]`·`[4-11]` 을 RPC 별 경계로 분리 (R016-03) |
| `POSTINSTALL_TO_RUN_017.sql` | **신규**. 현행 공식 검증 SQL 과 바이트 동일 |
| `lib/twin/exec016.test.ts` | 016 실행본 비교 책임을 017 로 이전 (§156) |
| `docs/AI_QUESTION_APP_DECISION_LOG.md` | D-122 ~ D-126 (옛 제안 번호 매핑 포함) |
| `package.json` | `test:twin` 에 `exec017.test.ts` 추가 |
| `CLAUDE_RESULT_017.md` · `MANIFEST.sha256` · `TASK_DIFF.patch` | **신규** |
| `TWIN_PIPELINE_REVIEW_BUNDLE_017.tar.gz` | **신규**. 테스트 입력 3개를 포함 |

**설치 SQL 무변경**(해시 `a5e441e5…f9b0`). 권한·RLS 를 한 줄도 넓히지 않았다.
`INSTALL_TO_RUN_017.sql`·`ROLLBACK_017.sql` 은 만들지 않았다.

### 테스트 결과

```text
개발 저장소   npm run test:twin → tests 337 / pass 337 / fail 0 / skipped 0
해제 폴더     tar -xzf → exit 0 · sha256sum -c → 54/54 · test:twin → 337/337
tsc           이번 변경 범위 오류 0 (저장소 전체 15개는 기존 파일)
eslint        error 0 / warning 1 (기존)
운영 DB·Storage·모델 호출 → 0건
SQL 런타임 검증 → 미확인 (로컬 파서 없음)
```

### 016 의 실패가 왜 가능했나

검사 로직이 테스트 안에 흩어져 있어 **"이 검사가 정말 무언가를 잡는가" 를 스스로 확인할
방법이 없었다.** 감사 로직을 순수 함수로 꺼내니 일부러 망가뜨린 사본을 넣어 시험할 수 있게 됐다.
변이 10가지 전부 잡고 정상 SQL 은 통과한다.

`sha256sum -c 49/49` 가 **"필요한 파일이 다 있다"** 를 뜻하지 않는다는 것도 배웠다.
이제 테스트가 읽는 파일을 자동으로 뽑아 manifest 에 다 있는지 확인한다.

### 남은 문제

1. **SQL 런타임 검증 미확인.** 정적 테스트 통과는 PostgreSQL 실행 통과가 아니다.
   `[4-9]`·`[4-11]` 을 나누며 역할 전환 구문이 6번 늘었다.
2. **GPT 재검수 대기.** 원장님께 017 SQL 실행을 요청하지 않았다.
3. **D-124·D-126 은 정책 기록만.** 신규 문항 자동 점검, 학생별 취약 유형 재학습은 미구현.
4. Storage SDK 표본·유료 스모크는 그대로 대기 (D-091 · D-100).

## 2026-09-28 — GPT-EXEC-018 수행 (감사기 실행 의미 확인 · 입력 수집 보완)

GPT 검수가 017 감사기를 **변이 5가지로 뚫었다.** 전부 사실이었다.
원인은 하나 — **줄 주석만 지우고 블록 주석·문자열을 코드로 셌다.**

### 바꾼 파일

| 파일 | 내용 |
|---|---|
| `lib/twin/sqlTokens.ts` | **신규**. 어휘 분해 — 줄/블록(중첩) 주석 · `'...'`·`E'...'`·dollar-quote · PL/pgSQL 본문 구분 |
| `lib/twin/verifySqlAudit.ts` | **재작성**. 토큰 기반 · `[5-나]` 실행 순서 8단계 · 구간 중복/순서 검사 |
| `lib/twin/exec018.test.ts` | **신규**. 어휘 9개 + 변이 16개 + 입력 수집 5개 |
| `lib/twin/exec017.test.ts` | 정규식 `read(?:Raw)?` 로 수정 · manifest 부재를 실패로 |
| `lib/twin/exec016.test.ts` | 아무것도 확인하지 않던 검사를 검증기에 위임 |
| `package.json` | `test:twin` 에 `exec018.test.ts` 추가 |

**SQL 을 한 글자도 바꾸지 않았다.** 변경 금지 해시 6개 전부 일치.
`POSTINSTALL_TO_RUN_018.sql`·`INSTALL_TO_RUN_018.sql`·`ROLLBACK_018.sql` 만들지 않았다.
새 결정 번호도 추가하지 않았다.

### 테스트 결과

```text
개발 저장소   npm run test:twin → tests 370 / pass 370 / fail 0 / skipped 0
해제 폴더     tar -xzf → exit 0 · sha256sum -c → 56/56 · test:twin → 370/370
tsc           이번 변경 범위 오류 0 (저장소 전체 14개는 기존 파일)
eslint        error 0 / warning 1 (기존)
변이 탐지     16/16 · 정상 대조군 위반 0
운영 DB·Storage·모델 호출 → 0건
SQL 런타임 검증 → 미확인 (이번엔 SQL 무변경이라 새 위험은 없음)
```

### 두 번 반복한 실수에서 배운 것

016 도 017 도 **"검사가 통과했다" 가 "검사가 무언가를 확인했다" 를 뜻하지 않았다.**
016 은 표식을 못 찾아 `continue`, 017 은 주석·문자열을 코드로 셌다.

이번에는 감사 로직을 순수 함수로 두고 **일부러 망가뜨린 사본으로 감사기를 시험**한다.
정상 대조군도 함께 둬서 거짓 양성도 본다. 이 구조가 아니면 같은 실수가 또 난다.

manifest 도 마찬가지다. `catch { return }` 로 부재를 통과시키던 것을 실패로 바꿨고,
개발/최종 모드를 **일부러 두지 않았다** — 모드가 있으면 "어느 모드 로그인지" 를 매번
확인해야 하고, 그 확인을 빠뜨리는 것이 바로 두 번 겪은 실패 방식이다.

### 남은 문제

1. **SQL 런타임 미검증.** 이번엔 SQL 무변경이라 017 대비 새 위험은 없다.
2. **어휘 분해가 이 파일 형식만 다룬다.** `$$` 익명 태그 등 다른 형태는 `lex_error` 로 막힌다.
3. **`verdict_self_caught` 는 `begin`/`end;` 개수로 어림한다.** 복잡한 중첩에서 틀릴 수 있다.
4. **입력 수집은 리터럴·선언 상수만.** 동적 경로는 못 잡는다.
5. GPT 재검수 대기. 실행 파일은 계속 017 이며 실행 미승인.

---

## GPT-EXEC-019 — `[5-가]/[5-나]` 블록 고정 토큰 대조 (2026-09-28)

### 무엇을 왜

`GPT_REVIEW_018` 이 018 감사기를 다섯 가지로 더 뚫었다. **전부 사실이었다.**
고치기 전에 이 저장소에서 그대로 재현했고 전부 `[]` 미탐이었다.

```text
통과 []  ← 원본(정상)
미탐 []  ← sentinel 줄주석 / 블록주석        (R018-01)
미탐 []  ← 두번째 역할 anon / 조회 2회        (R018-02)
미탐 []  ← RAISE를 if false 안으로            (R018-02)
```

원인 — sentinel 은 **주석을 지우기 전 `raw`** 에서 찾았고, 역할·조회는 `findIndex` 로
**첫 하나만** 봤으며, `findNaRange` 는 끝을 못 찾으면 **파일 끝까지** 늘렸다.

017·018 은 「이 조건도 확인하자」를 하나씩 붙였다. 018 검수는 그 방식에 끝이 없다는 것을
보였다. 019 는 방향을 바꾼다 — **검수된 do 블록 하나를 통째로 고정 기대 토큰과 맞춘다.**
빠지든 늘든 자리가 바뀌든 불일치다. 막을 구멍을 미리 알 필요가 없다.

### 바꾼 파일

```text
새로 만듦  lib/twin/sqlExecTokens.ts       실행 토큰 분해 (주석·공백 버림, 문자열 값·종류 보존)
           lib/twin/verifyBlockTemplate.ts do 블록 열거 → 검수 블록 특정 → 대조
           lib/twin/verifyBlockExpected.ts 고정 기대 토큰 126개 (검수 전용 상수)
           lib/twin/exec019.test.ts        C1·C2 · M1~M10 회귀 36개
           CLAUDE_RESULT_019.md
고침       lib/twin/verifySqlAudit.ts      템플릿 대조 연결 · findNaRange 의 EOF fallback 삭제
           lib/twin/exec017.test.ts        수집 목록에 exec019 추가
           package.json                    test:twin 에 exec019 추가
           GPT_BRIEF.md · MANIFEST.sha256 · TASK_DIFF.patch
```

**SQL 은 한 글자도 바꾸지 않았다.** 변경 금지 해시 6개 전부 일치.
019 번호의 설치·검증·rollback SQL 을 만들지 않았고 새 결정 번호도 추가하지 않았다.

### 테스트 결과

```text
개발 저장소   npm run test:twin → tests 406 / pass 406 / fail 0 / skipped 0
해제 폴더     tar -xzf → exit 0 · sha256sum -c → 60/60 · test:twin → 406/406
변이 탐지     13/13 · 정상 대조군 5가지 위반 0
tsc           변경 범위 strict 오류 0 (저장소 전체 14개는 전부 기존 app/* · next.config.ts)
eslint        변경 파일 error 0 / warning 0
묶음 해시     bca5faa46d28c4adac5bea2f3845bc2c27681c3e0e636b751954f1630ba1e549
```

### 이번에 내가 먼저 틀린 것 (기록해 둔다)

첫 재현 스크립트의 M5 가 "미탐" 으로 나왔는데 **변이가 엉뚱한 데 적용돼 있었다.**
앵커 `v_sqlstate := sqlstate;` 는 이 파일에 8곳 있어서 950행이 아니라 206행을 고쳤고,
이 SQL 은 **CRLF** 라 `\n` 으로 쓴 여러 줄 앵커는 애초에 하나도 안 맞았다.

016·017 과 **똑같은 실패 방식**이다 — 시험이 조용히 건너뛴다. 그래서 변이 도구가 이제
치환을 대상 블록 안에서만 하고, 앵커가 그 블록 안에 정확히 한 번 없으면 `assert` 로 실패하고,
줄바꿈을 CRLF 에 맞추고, 치환 뒤 정말 달라졌는지 확인한다.

같은 이유로 `test:twin` 이 돌리는 테스트가 모두 `filesReadByTests()` 목록에 있는지도
검사로 고정했다. 016·017 에서 목록 추가를 잊어 생긴 문제다.

### 남은 문제

1. **SQL 문법·런타임 미검증.** 이번에도 SQL 무변경이라 017 대비 새 위험은 없다.
2. **지원 문법이 이 블록 범위다.** 다른 형태는 `template_lex_error` 로 막히지만,
   막는 것과 이해하는 것은 다르다.
3. **블록 특정이 조회 한 줄에 기댄다.** 지우면 실패하므로 안전 방향이나 방식 자체는 검수 대상.
4. 템플릿 대조는 **이 do 블록 하나**에만 건다. 나머지는 018 까지의 개별 조건 검사 그대로다.
5. GPT 재검수 대기. 실행 파일은 계속 `POSTINSTALL_TO_RUN_017.sql` 이며 **실행 미승인**.

---

## GPT-EXEC-021 — 게시 RPC 42P10 수정 + 실제 PostgreSQL 대조 (2026-09-28)

### 무슨 일이 있었나

원장님이 `POSTINSTALL_TO_RUN_017.sql` 을 1회 실행하셨고 `[4-9] 안전 승인 후 게시` 에서
42P10 으로 멈췄다. **성공으로 기록하지 않는다.**

원인은 설치 SQL 안에서 인덱스와 게시문이 어긋나 있던 것이다.

| 위치 | 내용 |
|---|---|
| `docs/sql/쌍둥이_설치.sql` 362~363행 | `where practice_id is not null` 붙은 **부분** 유일 인덱스 |
| 같은 파일 805행 | `on conflict (practice_id)` — 그 조건이 **빠짐** |

부분 유일 인덱스는 conflict target 에 같은 조건이 적혀 있어야 추론된다.
**빈 표에서도 난다** — 중복 데이터 때문이 아니다.

### 이번에는 정적 검사로 끝내지 않았다

016~019 는 전부 문자열 검사였는데, 이 오류는 **엔진의 추론 규칙**에서 난 것이라 문자열로는
잡히지 않는다. 문법도 맞고 그럴싸하게 읽힌다. 그래서 근거를 실행으로 옮겼다.

폐기 가능한 로컬 PostgreSQL(**15.12 · 17.10 · 18.4**)에 합성 기반 스키마를 만들고 014 설치
SQL 을 그대로 돌려, 실제 RPC 경로로 게시해 **운영과 같은 42P10 을 같은 53행에서** 받았다.

### 만든 것

```text
docs/sql/migrations/021_fix_practice_publication_conflict.sql   증분 패치
PATCH_PUBLICATION_021.sql                                       ← 위와 바이트 동일
PATCH_RUNBOOK_021.md                                            적용 경로·판정 기준
docs/sql/pgtest/합성기반_스키마.sql · 합성데이터.sql            로컬 시험용 (운영 금지)
lib/twin/pgtest/harness.ts · exec021.pg.test.ts                 R1~R8 실제 실행 대조
lib/twin/exec021.test.ts                                        패치 파일 정적 회귀 24개
PGTEST_LOG_021.txt                                              원문 로그
```

고친 업무 로직은 **한 줄**이다.

```diff
-    on conflict (practice_id)
+    on conflict (practice_id) where practice_id is not null
```

패치는 `begin ... commit` 안에서 사전확인(시그니처·본문·인덱스) → 교체 → 사후확인
(OID·소유자·ACL·속성·RLS) 을 한다. 모르는 본문이면 **덮어쓰지 않고 중단**하고, 이미
수정본이면 `already_applied` 로 끝낸다.

### 테스트 결과

```text
실제 PostgreSQL   15.12 / 17.10 / 18.4 각각 tests 13 / pass 13 / fail 0
정적 회귀         npm run test:twin → 430 / 430 / fail 0   (019 의 406 + 24)
해제 폴더 재현    sha256sum -c 69/69 · 정적 430/430 · PG 13/13 × 3엔진
묶음 해시         daf8d237221c1e942a7fe1e16f773b50fdf2f27f27d1794d4863007be0f8cc9e
```

R8 이 **017 을 한 글자도 고치지 않고** 끝까지 통과한 것이 이번 수정의 최종 근거다.

### 원본 보존

014 설치와 017 검증은 바이트 무변경이고, 설치 SQL 805행에는 문제의 그 줄이 **그대로 남아
있다**(테스트로 고정). 이미 실행된 파일의 역사를 바꾸지 않는다. 차이는 021 증분 패치로 둔다.
`INSTALL_RUNBOOK_014.md` 도 고치지 않았다.

### 이번에 내가 겪은 것 (기록해 둔다)

1. **CRLF 때문에 변이가 조용히 안 먹었다.** R7 의 「모르는 본문」 시험이 SQL 안에서
   `replace(v_src, 'begin' || chr(10), ...)` 로 본문을 고치려 했는데, 설치 SQL 이 CRLF 라
   하나도 치환되지 않았다. 그러면 본문이 그대로라 패치가 정상 적용되고 시험은 엉뚱하게
   실패한다. 이제 직접 읽어 바꾸고 **정말 바뀌었는지 assert** 한다.
2. **앞 시험의 aborted 트랜잭션이 다음 시험을 오염시켰다.** 패치·검증 SQL 은
   `begin ... commit` 이라 예외가 나면 연결이 aborted 로 남는다. R7 세 개가 앞 시험의
   오류 메시지를 받아 실패했다. 이제 실패 뒤 반드시 `rollback` 한다.
3. **주석을 먼저 걷으면 상수를 떼지 못한다.** 패치 검사에서 `c_orig` 를 제거하려 했는데
   주석 제거를 먼저 해서 문자열이 더 이상 일치하지 않았다. 순서를 바꾸고, 정말 떼어졌는지
   `assert` 로 확인한다. 016·017·019 와 같은 부류의 실수다.

### 남은 문제

1. **운영 카탈로그 미조회.** 운영의 현재 함수·인덱스·ACL 을 직접 보지 않았다. 그래서 패치가
   **실행 시점에 스스로** 확인하고 예상과 다르면 멈춘다.
2. **운영 PostgreSQL 버전 미확인.** 그래서 15·17·18 세 가지에서 돌렸다.
3. **합성 기반은 대역이다.** `auth.uid()`·`is_admin()`·Supabase 역할은 대역이라,
   이 통과는 SQL 문법·ON CONFLICT 추론·게시 함수 동작의 증거이지 Supabase 인증·RLS
   통합의 증거가 아니다.
4. **017 실행 세션의 종료·정리 상태**를 별도로 조회하지 않았다.
5. GPT 재검수 대기. 실제 DB 객체를 바꾸는 패치이므로 **별도 실행 승인**이 필요하다.
   그 전에는 운영 SQL 추가 실행 없음.

---

## GPT-EXEC-022 — 429/1 로그 불일치 해소 (2026-09-28)

### 무엇이 어긋났나

GPT 검수가 같은 021 제출물 안의 두 값이 충돌한다고 지적했다. 사실이었다.

| 파일 | 값 |
|---|---|
| `CLAUDE_RESULT_021.md` · 021판 브리핑 | 정적 회귀 **430 / 430 / fail 0** |
| `PGTEST_LOG_021.txt` | 정적 회귀 **430 / pass 429 / fail 1** |

### 원인 — 로그를 manifest 보다 **먼저** 만들었다

`PGTEST_LOG_021.txt` 자체가 그 묶음의 `MANIFEST.sha256` 에 등재돼 있다. manifest 가 그
해시를 담으려면 로그가 먼저 있어야 한다. 즉 로그를 만들던 시점의 manifest 는 021 파일들이
빠진 **이전 판**이었고, 그 상태에서 `exec017.test.ts` 의 「테스트가 읽는 파일이 모두
MANIFEST 에 들어 있다 (R016-01)」 한 건이 실패한다.

**016 에서 테스트 입력 3개가 묶음에서 빠졌던 일 때문에 넣은 검사다. 제 일을 한 것이다.**

### 재현으로 확인

| 조건 | tests | pass | fail | 종료코드 |
|---|---:|---:|---:|---:|
| 최종 021 묶음 그대로 | 430 | 430 | 0 | 0 |
| 같은 묶음에서 manifest 의 021 항목만 제거 | 430 | 429 | 1 | 1 |

실패 1건은 정확히 그 R016-01 검사였다 (`lib/twin/exec017.test.ts:301`).

**한계**: 021 로그를 만든 명령이 요약 줄만 grep 으로 걸러 담아서, **그때의 실패 상세는
로그에 남아 있지 않다.** 위는 *그 원인이 그 수치를 만든다*는 재현이지 원문 복원이 아니다.

### 고친 것

1. **로그를 만드는 순서.** tar 를 먼저 만들고 → 새 빈 폴더에 해제한 뒤 거기서 실행하고 →
   stdout/stderr 를 거르지 않고 담고 **프로세스의 실제 종료코드**를 따로 적고 → **tar 밖**에 둔다.
   `STATIC_TEST_LOG_022.txt` · `PGTEST_LOG_022.txt` · `FINAL_BUNDLE_VERIFY_022.txt`.
2. **R7c 주석** (비차단). "전역 UNIQUE 면 수정본도 42P10" 은 정확하지 않다 — 전역 UNIQUE 도
   조건이 맞으면 추론 대상이 될 수 있다. 그 시험의 실제 목적인 **"기대와 다른 인덱스를 패치
   가드가 거부하는가"** 로 설명을 바로잡았다. assertion 과 기대 동작은 그대로다.

`PGTEST_LOG_021.txt` 의 429/1 을 수동으로 고치지 않았다 (`691ebb2e…c08` 보존).
옆에 `PGTEST_LOG_021_NOTE.md` 를 두어 읽는 법을 적었다.
`CLAUDE_RESULT_021.md` 와 021판 브리핑도 고치지 않았다 — GPT 가 해시로 확인한 제출물이라
사후에 말을 바꾸지 않는다.

### 최종 재현 결과

```text
최종 tar     37b5ec053836e2bcbea593dcca9eacb72160c92bead7aba6eb31cdf9d8b3a242
해제 폴더    manifest 70/70 OK · 종료코드 0
정적 회귀    tests 430 / pass 430 / fail 0 · **종료코드 0**
실제 PG      15.12 · 17.10 · 18.4 각각 13/13 · **종료코드 전부 0**
보존 해시    패치 021 · 014 · 017 · 016 · 014기록본 · 010 · 012 전부 일치
```

SQL·패치·테스트 로직·감사기 설계·앱 기능·의존성 **전부 무변경**.
022 번호의 패치·설치·검증·rollback SQL 을 만들지 않았고 새 결정 번호도 추가하지 않았다.

### 남은 문제

1. **운영 DB 미조회.** 함수 본문·인덱스·ACL·PostgreSQL 버전·017 세션 정리 상태 전부 미확인.
2. **021 로그의 원문 실패 출력은 복원 불가.**
3. 합성 기반은 대역이라 Supabase 인증·RLS 통합의 증거가 아니다.
4. 운영 적용 **미승인**. GPT 재검수 대기. 원장님께 실행을 먼저 요청하지 않는다.

---

## GPT-EXEC-025 — 021 패치의 비대칭 CRLF 처리 수정 (2026-10-01)

### 운영에서 무슨 일이 있었나

023 승인으로 `PATCH_PUBLICATION_021.sql` 을 1회 실행했고 `[2] 알려진 본문 비교` 에서
P0001 로 멈췄다. **함수 교체 전이라 운영에는 아무 변경도 남지 않았다.**

024 읽기 전용 진단 CSV 를 **직접 파싱해** 대조한 결과:

```text
운영 body_raw      2252자 · CR 63 · LF 63 · sha256 fb9a8f33af7385a8…
014 파일 추출 본문  2252자 · CR 63 · LF 63 · sha256 fb9a8f33af7385a8…
>>> 운영 본문 == 014 원문 (CRLF 포함 전체 비교) : True
>>> 조건 없는 on conflict (practice_id) 가 아직 있음 : True
```

**누가 함수를 고친 흔적은 없다.** 손대지 않은 014 원본이다.

### 원인 — 비교가 한쪽만 되어 있었다

```sql
-- 021
v_norm := replace(coalesce(v_src, ''), chr(13), '');   -- DB 쪽만 CR 제거
if v_norm = c_fixed then ... elsif v_norm = c_orig then ...   -- 상수는 전달된 그대로
```

패치가 CRLF 로 전달되면 `c_orig` 에 CR 63개가 들어온다. DB 쪽만 정리한 2,189자와
상수 쪽 2,252자를 비교해 **정상 원본조차 탈락**한다. 화면의 `본문 2189 글자` 가 그 길이다.
사후 검사에도 같은 문제가 있어 사전 비교만 고치면 모자랐다.

024 입력 probe 가 `CR=1 · LF=1` 로 돌아온 것이 그 경로 입력이 CRLF 였다는 관측이다.
다만 실패하던 순간의 전송 문자열은 없으므로 어떤 조작이 그렇게 만들었는지는 단정하지 않는다.

### 만든 것

```text
PATCH_PUBLICATION_025.sql = docs/sql/migrations/025_fix_publication_patch_line_endings.sql
PATCH_RUNBOOK_025.md
lib/twin/pgtest/exec025.pg.test.ts   실제 PG 수용 시험 24개 (입력을 CRLF 로 보낸다)
lib/twin/exec025.test.ts             패치 파일 정적 회귀 32개
lib/twin/pgtest/harness.ts           installBaselineAs / toCRLF / inputStats 추가
```

업무 로직은 **021 과 똑같이 한 줄**이다. 달라진 것은 비교 방식뿐 —
CRLF 쌍만 LF 로 바꾸고, DB 본문·고정 원본·고정 수정본·선언부에 **같은 기준**을 쓰고,
사전·교체·사후 **세 단계 모두** 그 기준을 쓴다. 남은 **단독 CR 은 지우지 않고 미지원으로 중단**한다.
`btrim`·공백 삭제·주석 제거·`lower`·유사도 비교는 쓰지 않았다(정적 테스트로 막음).

**원장님이 편집기를 바꾸거나 파일을 변환할 필요가 없다.** 그게 요점이다.

### 테스트 결과

```text
실제 PostgreSQL  17.10 · exec025 24/24 · exec021(역사 대조군) 13/13 · 종료코드 전부 0
정적 회귀        tests 462 / pass 462 / fail 0 · 종료코드 0
해제 폴더        manifest 75/75 OK · 두 시험을 그 폴더에서 새로 실행
묶음 해시        35270679b36c4c7a96d3365a394c3f7a81fdd59241c82f193842831fb01dc83f
패치 해시        62d7c26039af9c7c3346f6aa4f1e4c7210e377bf2185efab2feb8241031f8cb0
```

핵심은 두 가지다.

1. **A3 가 운영 실패를 그대로 재현한다** — 021 을 CRLF 로 보내면 P0001, 메시지에 `2189`,
   함수 불변. 입력의 줄끝이 원인이었다는 직접 증거다.
2. **네 조합(DB LF/CRLF × 입력 LF/CRLF)이 모두 통과한다.** 보내기 직전의 CR/LF 개수를
   로그에 남겨 CRLF 로 실제 전송한 것을 확인할 수 있게 했다.

025 뒤 **무변경 017 전체 검증**이 LF·CRLF 입력 양쪽에서 끝까지 통과했다.

### 적용 체인

```text
(가) 기존 운영 : [이미 됨] 014 → [승인 뒤] 025 → [승인 뒤] 017   ← 021 을 거치지 않는다
(나) 새 설치   : 014 → 025 → 017                                  ← 021 을 거치지 않는다
(다) 021 이 이미 적용된 환경 : 025 는 확인 후 no-op
```

014·017·021 은 이력으로 보존했다(해시 일치). 설치 SQL 805행의 문제 줄도 그대로 남겼다.
025 번호의 설치·검증·rollback SQL 은 만들지 않았고 새 결정 번호도 추가하지 않았다.

### 이번에 내가 겪은 것

정적 테스트 하나가 **내 설명 때문에 내 검사에 걸렸다.** 025 머리말이 021 의 잘못된 코드
`replace(DB본문, chr(13), '')` 를 설명으로 인용하는데, 금지 패턴 검사를 원문 전체에 걸어서
그 주석이 잡혔다. 실행문만 보도록 고쳤다 — 016·017·019·021 에서 되풀이한 그 방식이다.

### 남은 문제

1. **운영 DB 미조회.** 근거는 024 CSV 뿐이고, 그것은 지정 항목을 그 조회 시점에 확인한 것이다.
   앱 전체 보안·다른 함수·모든 RLS 정책·Supabase JWT 통합을 검증한 것이 아니다.
2. **실패 순간의 전송 문자열은 없다.** 입력 CRLF 는 024 probe 의 관측이다.
3. **엔진 버전**: 로컬 17.10 / 운영 17.6. 같은 계열이지만 같은 패치 버전은 아니다.
4. 합성 기반은 대역이라 Supabase 인증·RLS 통합의 증거가 아니다.
5. 운영 적용 **미승인**. GPT 재검수 대기. 원장님께 실행을 먼저 요청하지 않는다.

---

## GPT-EXEC-028 — 운영 검증 완료 반영 + Storage 표본 1건 준비 (2026-10-02)

### 운영 상태

| 단계 | 파일 | 결과 |
|---|---|---|
| 014 기준선 설치 | `a5e441e5…f9b0` | 성공 · 유지 중 |
| 025 대체 패치 | `62d7c260…8cb0` | **적용 성공** (`Success. No rows returned`) |
| 025 적용 후 017 전체 검증 | `4c913d8d…5deb` | **검증 통과** (`Success. No rows returned`) |

**이번 설치·게시 오류 수정 단계는 종료한다.** 역할 복원(42501) · 게시 UPSERT(42P10) ·
패치 줄바꿈 비교(P0001) 문제는 위 실행 결과 범위에서 해결 완료다.

판정 범위는 넘기지 않는다 — Claude 는 이 실행들을 **관찰하지 않았고**, 편집기의
`raise notice` 는 코드이지 NOTICE 출력이 아니며, 개별 NOTICE 와 조건부 생략 여부는
화면에서 확인되지 않았고, `0 rows` 는 조회 결과 행 수다. 017 은 ROLLBACK 파일이며
025 패치를 제거하지 않는다.

### 만든 것

```text
docs/twin/DB_CHECKPOINT_028.md   운영 체크포인트 (근거·판정 범위·미확인 범위·실패 이력)
STORAGE_SAMPLE_PLAN_028.md       Storage 표본 1건 계획 (운영 실행 미승인)
lib/twin/storageSample.ts        표본 1건용 **독립 진입점** 하나
lib/twin/exec028.test.ts         합성 응답 시험 29개
결정 로그                        번호 없는 「운영 체크포인트」 절 (CP-2026-10-02)
```

**기존 도구를 다시 만들지 않았다.** 필요한 검증은 이미 `storage.ts` 에 있었다 —
이름 정확일치 · `updated_at` 대체 금지(D-083) · ETag 키 두 가지만(D-086) · 0바이트 거부.
빠진 것은 **파이프라인을 돌리지 않고 한 건만 보는 진입점**이었다.

`checkStorageSample` 은 ① 원시 `list` 로 **ETag 키 표기**를 확인 → ② `loadStorageMeta` 로
**운영 경로가 수락하는지** 확인 → ③ 실제 읽기·바이트 수를 확인한다. ①·② 를 모두 거치면
「내 probe 가 읽었다」가 아니라 **「운영 코드가 받아들였다」**까지 확인된다.

**실행 스크립트를 일부러 만들지 않았다** — 저장소에 두면 실수로 운영 Storage 를 읽을 수 있다.

### 결과

```text
정적 회귀   491/491 · fail 0 · 종료코드 0 (해제 폴더에서)
해제 폴더   manifest 81/81 OK
tar         a336538215af6f1f110e9f2b088b5e1b2a6b79b8b0be2b9af9f4793a857a1e4d
운영 접속   DB·Storage·모델·배포·commit/push 전부 0건
새 D 번호   없음 (D-126 이 그대로 최대값) · 028 SQL 미생성
```

표본 `problems.id`·`image_path` 는 **미확정**이다. 운영 조회를 하지 않아 알 수 없고,
임의로 적으면 없는 경로를 점검하게 된다. 한 건으로 좁히는 **방법만** 적었다.

### 이번에 겪은 것 — 해제 폴더가 먼저 잡았다

첫 묶음에서 해제 폴더 정적 회귀가 **3건 실패**했다. `exec028` 의 한 시험이
`CLAUDE_RESULT_025.md` 를 읽는데, 025 회차에 그 파일을 tar 밖에 두었던 탓에 해제 폴더에
없었다 (ENOENT).

**016 에서 테스트 입력이 묶음에서 빠졌던 것과 같은 부류이고, R016-01 검사가 잡았다.**
개발 저장소에서는 파일이 있어 통과했으므로 **해제 폴더 실행이 아니면 놓쳤을** 문제다.
그 파일을 묶음에 넣고 다시 만들어 491/491 으로 통과했다. 첫 묶음은 폐기했다.

### 남은 문제

1. **운영 SDK 응답 형태 미확인.** `metadataKeys` 실제 구성과 ETag 키 표기(`eTag`/`etag`)는
   아직 모른다 — 그걸 알아내는 것이 표본 점검의 목적이다.
   합성 시험 통과를 「실제 표본 성공」이라고 쓰지 않는다.
2. **앱 전체 인증·보안 / 모든 RLS 정책 / Supabase JWT 통합 미확인.**
3. 모델 생성 품질 · 학생 질문 화면 · 취약 유형 재학습 **미착수**.
4. GPT 검수 대기. Storage 표본은 **운영 실행 미승인**. 원장님께 실행부터 요청하지 않는다.

### 덧붙임 — 체크포인트 문서를 루트에도 복사 (원장님 요청)

GPT 에 보낼 때 폴더를 왔다갔다 하지 않도록 `DB_CHECKPOINT_028.md` 를 저장소 루트에도 뒀다.
`docs/twin/DB_CHECKPOINT_028.md` 와 **바이트 동일**이고(`2a72bf87…`), 사본이 조용히
어긋나지 않게 동일성 검사를 넣었다 (`PATCH_PUBLICATION_025.sql` = migration 과 같은 방식).

정적 회귀 490 → **491/491**, 묶음 재생성 → `a336538215af6f1f110e9f2b088b5e1b2a6b79b8b0be2b9af9f4793a857a1e4d`.

---

## GPT-EXEC-029 — 표본 판정 보완(R028-01·02)과 1건 실행 진입점 (2026-10-02)

### GPT 지적은 사실이었다 — 호출 횟수까지 재현했다

```text
          028 판                                      → 029 판
정상  ok=true  list=2 download=1                      ok=true  list=1 download=1
F1    ok=true  list=2 download=1  updated_at=해석불가  ok=false updated_at_invalid  download=0
F2    ok=true  list=2 download=1  updated_at=없음      ok=false updated_at_missing  download=0
F3    ok=true  list=2 download=1  (1차 키 + 2차 통과)  ok=true  list=1 (1차만 씀)
F4    ok=true  list=2 download=1  etagLen=0            ok=false etag_missing        download=0
O1    ok=false list=2 download=1  (실패 전에 읽었음)   ok=false list_error           download=0
```

**`list=2` 가 모든 경로에서 나왔다.** 보고는 1차 응답, 검증은 2차 응답이었다.
F1 은 보고서에 「해석불가」라고 적으면서 동시에 「성공」이라 적는 모순이었다.

### 고친 것

`loadStorageMeta` 가 `list` 를 부를 때 **실제 db 로 넘기면서 그 응답을 포착하는** 작은
전달용 어댑터를 표본 도구 안에 두었다. **SDK list 는 한 번뿐**이고, 그 한 응답이 검증과
보고를 함께 쓴다. 호출 횟수를 세서 list 1 · download 1 을 넘기려 하면 그 자리에서 막는다.

성공은 이제 **필수 조건의 논리곱**이다 — 정확일치 1개 · `updated_at` 날짜 해석 가능 ·
ETag 키 확정 + 길이 > 0 · 보고와 검증이 같은 응답 · 이미지 바이트 > 0.
어긋나면 **다운로드 전에** 끝난다. 새 코드 `updated_at_invalid` · `etag_empty` ·
`meta_report_mismatch` · `extra_read_blocked` 를 더했다.

`storage.ts` · `targets.ts` 는 **바꾸지 않았다.** 필요한 검증은 이미 거기 있었고,
모자란 것은 표본 도구 쪽 판정이었다.

### 작은 정정 둘

1. **R028-03** — `db.from(` 검사 정규식에 `\b` 대신 **U+0008** 이 들어가 아무것도 못 잡았다.
   python heredoc 에서 백슬래시가 먹힌 그 버그다. 이 세션에서 019·021 에 이어 또 나왔다.
   파일에 U+0008 이 0개인 것을 시험으로 고정했다.
2. **R028-04** — 014 검증의 42501 위치를 `[5-나]` → **`[4-6]`** 으로 정정했다.
   `[5-나]` 는 의도적으로 42501 을 기대하는 접근 거부 검사다. 최신 체크포인트만 고치고
   과거 SQL·보고 원본은 그대로 뒀다.

### 만든 것

```text
scripts/check-storage-sample-029.ts   1건 실행 진입점 (초안, 운영 미승인)
STORAGE_SAMPLE_RUNBOOK_029.md         실행 안내 (작업 폴더·명령 하나로 확정)
lib/twin/exec029.test.ts              합성 시험 34개
```

진입점은 **import·인자 없음·`--help`·`--plan` 에서 네트워크 0건**이고 설정·키를 읽지 않는다.
SDK 와 선정 함수는 `await import` 로만 가져온다. `--execute-approved-sample` 를 통과한
경우에만 설정을 읽고, 설정이 없거나 URL 모양이 다르면 **접속 전에 중단**한다.
읽는 범위는 `problems` 1행 · `list` 1회 · `download` 1회뿐이고, 선정 함수가 **정답을 포함한
12개 열**을 메모리에 올린다는 사실을 런북에 그대로 적었다.

### 결과

```text
정적 회귀  525/525 · fail 0 · 종료코드 0 (해제 폴더에서)
해제 폴더  manifest 84/84 OK
tar        d09a43cdb38ef45195c8209245586af7ae6d459128c3b2d507e3992b990b2fc7
보존       storage.ts · targets.ts · pgtest/* · prompts/* · 모든 SQL/패치 바이트 동일
운영 접속  DB·Storage·키·모델·배포·commit/push 전부 0건 · 실행 플래그 미사용
```

### 이번에 내가 틀린 것

테스트를 python heredoc 으로 고치다 **정규식의 `\n` 이 실제 줄바꿈으로 먹혀**
`exec029.test.ts` 가 파싱조차 안 됐다. `Edit` 로 고쳤다.
그리고 내가 쓴 검사 셋이 **내 문서·코드에 걸렸다** — 「키를 채팅에 붙이지 마십시오」라는
올바른 경고문이 금지 패턴에 잡혔고, 여러 줄 import 와 `Promise.all([import(...)])` 를
정규식이 못 잡아 **빈 배열로 통과할 뻔했다.** 검사를 느슨하게 하는 대신 정확하게 고쳤다.

### 남은 문제

1. **운영 SDK 응답 형태 미확인.** `metadataKeys` 실제 구성과 ETag 키 표기는 아직 모른다 —
   그걸 알아내는 것이 표본 점검의 목적이다. 합성 통과를 실제 표본 성공이라고 쓰지 않는다.
2. 표본 `problems.id` · `image_path` **미확정** (운영 조회를 하지 않았다).
3. 앱 전체 인증·보안 / 모든 RLS 정책 / Supabase JWT 통합 **미확인**.
4. GPT 재검수 대기. Storage 표본은 **운영 실행 미승인**. 원장님께 실행을 먼저 요청하지 않는다.

---

## GPT-EXEC-030 — 실행 명령·설정 공급·실행 위치 연결 (2026-10-02)

### GPT 지적 둘 다 사실이었다

**R029-01** `npx tsx` 는 로컬에 tsx 가 없으면 **스크립트가 시작되기 전에** 패키지를 조회한다.
`defaultDeps()` 의 import 실패 처리는 그 바깥을 막을 수 없다.

**R029-02** 세 갈래였다.
- (a) 독립 프로세스의 `process.env` 에 `.env.local` 이 자동으로 들어오지 않는다.
- (b) 029 런북이 안내한 `C:\Users\USER\studycheck` 에 **최종 코드가 없다** (직접 확인).
- (c) URL **형식** 검사를 「승인된 프로젝트 확인」이라 쓸 수 없다.

### 고친 것

```text
scripts/run-storage-sample.cjs    로컬 tsx 만 쓰는 얇은 실행기 (신규)
scripts/check-storage-sample-029.ts  설정 로더·대상 확인·인자 처리 보완
STORAGE_SAMPLE_RUNBOOK_030.md     폴더·명령·설정 공급 확정 (029 대체)
lib/twin/exec030.test.ts          합성 시험 27개
```

**실행기** — `node_modules/tsx/dist/cli.mjs` 하나만 보고, 없으면 **네트워크·설정파일·키를
건드리기 전에** 종료코드 7 로 멈춘다. `npx`·`npm install`·레지스트리 주소가 실행문에 없다.
Node 기본 모듈 셋만 쓴다. 일부러 CJS 다 — tsx 가 있는지도 모르는 단계에서 도는 파일이라
변환기를 요구하면 안 된다.

**작업 폴더** — `git rev-parse --show-toplevel` 로 확인한 작업트리 한 곳으로 바로잡았다.
그 폴더에서 **실제로** 최상위 `--plan`/`--help`/인자없음을 돌려
`LOCAL_LAUNCH_TEST_LOG_030.txt` 에 남기고, 묶음 해제본 로그와 **구분**했다.

**설정 공급** — 셸이 우선, 없으면 **메인 루트의 `.env.local`** 한 곳. 경로는 디렉터리를
뒤지지 않고 git 메타데이터로 한 번에 정한다. 그 파일이 지금 있는 것도 확인했다(338바이트) —
**내용은 읽지 않았다.** 로더는 Node 내장 `process.loadEnvFile` 이고, 셸 우선·따옴표 처리·
주석 무시·ENOENT 동작을 **로컬에서 직접 확인**했다.

**대상 확인** — `AGENTS.md` 에 이미 적힌 프로젝트 ref `cggskjxsyrvuhsldgkoj` 와 origin 이
맞는지 본다. 비밀이 아니고 새로 만든 값도 아니다. 스크립트 상수가 `AGENTS.md` 와 어긋나면
시험이 실패한다. 029 가 통과시켰던 가짜 프로젝트들은 이제 **클라이언트 생성 0회**로 막힌다.

### 결과

```text
정적 회귀  552/552 · 코드 0 (해제 폴더에서)
실제 폴더  --plan/--help/인자없음 → 전부 0 · 설정파일·키·네트워크 0건
해제 폴더  manifest 88/88 OK
tar        17d50d445f514c90b872fe1254cdf3e6c2e3b3631f74d2b26aea4f819c723334
보존       storageSample.ts 029 해시 그대로(06687bca…) · SQL·PG·프롬프트 바이트 동일
```

### 이번에 내가 틀린 것

위치 의존 시험을 **묶음 해제본에서도** 돌게 썼다. 해제본은 다른 경로이고 `.git` 도 없어서
**해제 폴더에서 2건 실패**했다. 저장소 사실과 환경 사실을 섞은 것이다.
둘을 나누고, **조용히 건너뛰지 않게** 어느 쪽을 봤는지 로그에 찍게 했다.
그리고 또 python heredoc 에서 백슬래시가 먹혀 정규식이 깨졌다 — `Edit` 로 고쳤다.

### 남은 문제

1. **운영 SDK 응답 형태 미확인.** `metadataKeys` 구성과 ETag 키 표기는 아직 모른다.
2. **원장님 PC 셸에 두 변수가 들어 있는지 미확인** — 그래서 파일 경로를 함께 준비했다.
3. 표본 `problems.id`·`image_path` **미확정**. 환경파일 **내용은 읽지 않았다.**
4. GPT 재검수 대기. Storage 표본은 **운영 실행 미승인**.

---

## GPT-EXEC-032 — 첫 소량 생성 시험 준비 (2026-10-05)

### 바꾼 파일

| 파일 | 변경 |
|---|---|
| `scripts/check-storage-sample-029.ts` | 키 모양 가드 추가 · `readConfig` export (원장님 지시) |
| `lib/twin/targets.ts` | `toSourceProblem` export (한 단어) |
| `lib/twin/smoke.ts` | **신규** — 호출 계량·상한·스모크 전용 transport |
| `scripts/run-twin-smoke-032.ts` | **신규** — 원문 1건용 진입점 |
| `scripts/run-twin-smoke.cjs` | **신규** — 로컬 tsx 실행기 |
| `lib/twin/exec032.test.ts` | **신규** — 합성 시험 49건 |
| `lib/twin/exec029.test.ts` · `exec030.test.ts` | 합성 키를 실제 모양으로 교체 |
| `package.json` · `lib/twin/exec017.test.ts` | 시험 배선 한 줄씩 |
| `MANIFEST.sha256` | 88 → 97행 |
| 문서 | `SMOKE_PLAN_032` · `SMOKE_RUNBOOK_032` · `CLAUDE_RESULT_032` · `DB_CHECKPOINT_032` · `GPT_BRIEF` |

**바꾸지 않은 것:** `pipeline.ts` · `generate.ts` · `review.ts` · `repository.ts` ·
`schema.ts` · `source.ts` · `prompts/twin-*-v1.1.md` · SQL 전부 — 바이트 동일.

### 테스트 결과

```text
032 합성 시험  49/49 · 실패 0
전체 묶음      601/601 · 실패 0 (개발 저장소)
해제 폴더      601/601 · 실패 0 · 종료코드 0 · manifest 97/97 OK
런북 폴더      계획=0 · 깃발만=3 · 잘못된인자=2 (유료 0회 · DB 0회 · 키 안 읽음)
PG 시험        다시 돌리지 않음 (SQL 무변경, §116)
돌연변이       7종 전부 잡힘
tar            9752d910b482945cf629baf9c98ebf2453a6ebc08ca050359abb686e14089312
보존           보존 기준 7개 중 6개 바이트 동일 · 029 스크립트만 원장님 지시로 변경
```

### 이번에 내가 틀린 것

1. `sed -i` 로 CRLF 파일(`targets.ts`)을 고쳐 **215줄 전체가 LF로 바뀌었다.** 되돌리고
   줄바꿈을 보존해 다시 고쳤다. 지금은 실제로 1줄만 다르다.
2. 스모크 진입점이 `resolveEnvFilePath` 에 **모양이 다른 fs 객체**를 넘기고 있었다
   (`{existsSync, readFileSync}` vs `{isDir, isFile, read}`). 실행 모드 첫 줄에서 터질 자리였다.
   `SmokeFs` 타입을 029 쪽과 똑같이 맞추고 해시용 `readBytes` 를 따로 뒀다.
3. 돌연변이 시험에서 「`usage` 없음을 0으로」 가 **살아남았다.** `usage` 가 있지만 필드 이름이
   다른 경우를 빠뜨린 것이다. 시험 `B5b` 를 추가했다.
4. 내 검사 2건이 내 코드·합성값에 걸렸다 (`detail` 매개변수 이름, 두 글자 정답 `'12'` 가
   토큰 수 `1200` 에 포함). 둘 다 **검사를 좁히거나 값을 구별되게** 고쳤다 — 느슨하게 하지 않았다.
5. heredoc 이 두 번 깨져 `Write` 도구로 바꿔 썼다.

### 남은 문제

1. **운영 `createOpenAiTransport` 에 상한이 없다** (F-01). 스모크만 자기 경로로 걸었다.
   경로가 두 갈래다 — 스모크 통과 뒤 합쳐야 한다.
2. **모델 계정 사용 권한 미확인** (F-05). 유료 요청 없이 확인할 방법을 찾지 못했다.
3. 이미지 픽셀 크기 미확인 → 이미지 토큰은 띠(300~1,600)로만 적었다 (F-07).
4. `detail` 미설정 (F-02) · batch 의 `prompt_version` 이 생성 쪽만 기록 (F-03) ·
   금액 상한을 코드가 막지 않음 (F-04).
5. **실행 미승인.** GPT 검수 → 원장님 승인 → 원장님 실행 순서다. 유료 호출 0회.

---

## GPT-EXEC-033 — 공통 전송 경로·키 가드·진입점 보완 (2026-10-05)

### 바꾼 파일

| 파일 | 변경 |
|---|---|
| `lib/twin/openaiSend.ts` | **신규** — 유일한 실제 SDK 전송 경로 (역할별 모델·상한·usage·AbortGate) |
| `lib/twin/generate.ts` · `review.ts` | 공통 전송기 사용 · receiver 유실 수정 · `detail:'high'` · `incomplete` |
| `lib/twin/smoke.ts` | 전송을 넘기고 계량·예산만. 사전 금액 예약 |
| `scripts/check-storage-sample-029.ts` | 키 가드 강화 (`inspectServiceKeyShape`) |
| `scripts/run-twin-smoke-032.ts` | 결과 분류·종료코드 분화·원문 비출력·승인 기록·실행 잠금 |
| `scripts/check-model-access-033.ts` · `run-model-access.cjs` | **신규** — metadata-only 조회 (미실행) |
| `lib/twin/exec032.test.ts` · `exec033.test.ts` | 개정 53건 · 신규 25건 |
| `lib/twin/twin.test.ts` · `exec017.test.ts` · `package.json` | 계약·배선 맞춤 |
| 문서 | `SMOKE_PLAN_033` · `SMOKE_RUNBOOK_033` · `CLAUDE_RESULT_033` · `GPT_BRIEF` |

**바꾸지 않은 것:** SQL 전부 · `storageSample.ts` · `run-storage-sample.cjs` ·
프롬프트 2개 · 검산 정책 · 학생 payload · `pipeline.ts` · `repository.ts` · `targets.ts`

### 테스트 결과

```text
exec032 53건 · exec033 25건
전체 묶음      630/630 · 실패 0
해제 폴더      630/630 · 종료코드 0 · manifest 104/104 · 해제 105개
런북 폴더      스모크 계획=0 · 깃발만=3 · 조회 계획=0 · 조회 깃발만=3
변경 범위 타입  에러 0 (전체 14건은 전부 미변경 app/*)
변경 범위 ESLint 종료코드 0
PG 시험        미실행 (SQL 무변경)
tar            35a7efeb2d30c7730f21ffde0dc8bbc81144e9871f4573e21a16ec21bde0a12d
보존           §177~183 불변 7개 전부 바이트 동일 · 032 tar 보존
```

### 이번에 내가 틀린 것

1. **033 §82 를 어겼다.** 주입 fetch 로 확인하라고 했는데 처음 한 번을 실제 네트워크로
   보냈다 (`api.openai.com/v1/responses` 1건, 합성 키, 401, 과금 없음). 앞선 운영 origin
   REST 4건 사고와 같은 종류다. 이후는 전부 주입 fetch 로 했다.
2. `KeyShapeVerdict` 를 판별 유니온으로 써 TS2339 — AGENTS.md 함정 3 그대로.
3. 진입점이 `resolveEnvFilePath` 에 모양이 다른 fs 를 넘기고 있었다 (실행 첫 줄에서 터질 자리).
4. `recordClosed` 를 모듈 수준에 둬 두 번째 실행의 기록이 닫히지 않았다.
5. 시험의 기본 매개변수 함정으로 "usage 없음" 시험이 **거짓으로 통과**했다.
6. 내 검사가 내 도움말 문구에 걸렸다 — 검사를 좁혔다 (느슨하게 하지 않았다).
7. 탐침 파일을 저장소 안에 둬 tsc 가 집어 올렸다.

### 남은 문제

1. **모델 사용 권한 미확인** — 조회 도구는 준비, 실행 미승인. `inferenceVerified=false`
2. 원문 이미지 **픽셀 크기 미확인** (재다운로드 안 함)
3. 지역 처리 +10% 적용 여부 미확정
4. 실제 청구액은 사람이 확인해야 한다 — 코드는 횟수·예약만 막는다
5. **`exec007/008/009` 의 검토 대역 응답이 스키마와 달라 한 번도 파싱을 통과한 적이 없다.**
   범위 밖이라 손대지 않고 보고만 했다
6. F-03 (batch 에 검토 프롬프트 버전) — 스모크 이후 설계로 남김
7. **유료 실행·모델 조회 둘 다 미승인.** GPT 재검수 대기

---

## GPT-EXEC-034 — 전송 차단·실측 계수·검토 실패 판정 (2026-10-05)

### 바꾼 파일

| 파일 | 변경 |
|---|---|
| `test/netguard.cjs` | **신규** — 시험 프로세스 외부 전송 차단 (IPC·loopback만 통과) |
| `scripts/run-twin-tests.cjs` | **신규** — 차단 장치를 먼저 적재하는 시험 실행기 |
| `test/probes/negative034.ts` · `sdkContract034.ts` | **신규** — 묶음 안에서 돌는 탐침 |
| `lib/twin/imageSize.ts` | **신규** — 메모리 PNG 에서 폭·높이·패치 수 |
| `lib/twin/openaiSend.ts` | 입력 계수기 · `service_tier='default'` · `outbound_blocked` · 잘림 사유 상세 |
| `lib/twin/smoke.ts` | cache-write 단가 · 10% 여유 · **실측 계수로 예약** · 전송 전 기록 · 실패 연결 |
| `lib/twin/pipeline.ts` | `CandidateOutcome.review_status`·`review_fail_code` |
| `scripts/run-twin-smoke-032.ts` | 분류에 gate·meter·검토 상태 · 종료코드 16~19 · 이미지 검사 |
| `scripts/check-model-access-033.ts` | OpenAI **전용** 설정만 (`openai_config_not_isolated`) |
| `lib/twin/exec034.test.ts` | **신규** 38건 |
| `exec032`·`exec033`·`exec007`·`exec017`·`exec019`·`package.json` | 계약·대역·배선 |
| 문서 | `SMOKE_PLAN_034` · `SMOKE_RUNBOOK_034` · `CLAUDE_RESULT_034` · `CLAUDE_BLOCKER_034` · `GPT_BRIEF` |

**바꾸지 않은 것:** SQL 전부 · `storageSample.ts` · `run-storage-sample.cjs` ·
`check-storage-sample-029.ts` · `targets.ts` · 프롬프트 2개 · `generate.ts` · `review.ts` ·
검산 정책 · 학생 payload

### 테스트 결과

```text
exec032 53 · exec033 25 · exec034 38
전체 묶음        668/668 · 실패 0 (차단 경계 안)
해제 폴더        668/668 · 종료코드 0 · manifest 115/115 · 해제 116개
SDK 계약 탐침     통과 44 / 실패 0 / 종료코드 0 / 외부 전송 0건
음성 격리 탐침     시도 1 / 차단 1 / 전송 0 / 종료코드 0
런북 폴더        계획 0 · 깃발만 3 · 조회계획 0 · 조회깃발만 3 · 모르는인자 2
변경 범위 타입     0건 (전체 14건은 전부 미변경 app/* · next.config.ts)
변경 범위 ESLint   0 (오류 0 · 경고 0)
tar              f2c54670fea2a56f5383f34318fc3000ab8cb808ed4fcc925bb7a67e83115a50
보존             §7 불변 8개 + 033 tar + 033 실패 로그 전부 바이트 동일
```

### 이번에 내가 틀린 것

1. **`SDK_CONTRACT_LOG_033.txt` 를 성공이라고 보고했다.** 실제로는 MODULE_NOT_FOUND 5건이었다.
   `sed` 로 import 경로를 `$PWD`(`/c/...`)로 바꿔 Windows Node 가 해석하지 못했고,
   내 검증 `grep "실패:"` 는 탐침이 catch 전에 죽어 아무것도 못 봤다.
   → 파일은 **편집하지 않고** 실패 이력으로 보존. 탐침을 묶음 안으로 옮기고 판정·종료코드를 찍게 했다.
2. **차단 장치를 만들었는데 시험 프로세스에 없었다.** `--require` 가 tsx 자식으로 전파되지 않는다.
   시험 `P1` 이 잡았고 `NODE_OPTIONS` 로 고쳤다.
3. `NODE_OPTIONS` 에 따옴표를 넣어 모듈을 못 찾았다. 경로에 공백이 있으면 시험을 막도록 했다.
4. 차단 장치가 tsx 의 **로컬 IPC** 까지 막아 변환기가 죽었다. `Socket.connect` 가
   `[options, cb]` **배열**로 들어오는 것을 못 봤다.
5. 잘림 사유를 `'incomplete'` 로만 남겨 어느 한도인지 잃었다 → `incomplete_max_output_tokens`.
6. **Bash perl 한 줄에서 백틱·`${...}` 가 셸에 먹혀** 코드·주석이 깨진 일이 4번.
   그중 하나는 `incomplete_${trunc}` → `incomplete_` 가 되어 **시험이 느슨하게 통과**했다.
   그 뒤로는 그런 내용을 `Edit` 으로만 고쳤다.
7. 탐침 파일의 타입 에러를 "변경 범위 0건"이라고 적었다가 검증 요약에서 발견해 고쳤다.

### 남은 문제 (`CLAUDE_BLOCKER_034.md`)

1. **입력 계수 API 의 요금·지원 범위·권한 미확정.** 무료라고 단정하지 않았고
   예약에 계수 비용을 넣지 못했다
2. 모델 계정 사용 권한 미확인 · 조회 미실행 (`inferenceVerified=false`)
3. 지역 처리 가산 미확정 → ×1.1 여유로만
4. **`.env.openai.local` 이 아직 없다** → 조회 모드는 지금 종료코드 6 으로 멈춘다
5. 실제 원문 이미지 픽셀 크기 미확인 (합성 PNG 로만 시험)
6. 실제 청구액은 사람이 확인해야 한다
7. F-03 — 스모크 이후 설계
8. **유료 실행·모델 조회·입력 계수 전부 미승인.** GPT 재검수 대기

---

## GPT-EXEC-035 — 중단 사유 최종 반영·실험 잠금·가드 분류 (2026-10-12)

### 바꾼 파일

| 파일 | 변경 |
|---|---|
| `scripts/run-twin-smoke-032.ts` | 중단 사유를 최종 판정에 연결 · 수를 먼저 집계 · 종료코드 20~25 · 실험 잠금 · 고정 계획 대조 · OpenAI 키 명시 전달 |
| `lib/twin/openaiConfig.ts` | **신규** — 설정 공급 공용 모듈 (셸 우선 → 전용 파일 → 중단) |
| `scripts/check-model-access-033.ts` | 같은 공용 모듈 사용 |
| `test/netguard.cjs` | 호출 종류별 분류 (HTTP path ≠ IPC) · `escaped` 제거 · 측정 경계 명시 |
| `lib/twin/exec034.test.ts` | T·U·V·W 묶음 추가 (22건) |
| `lib/twin/exec032/033.test.ts` | 계약 변경 반영 |
| `.gitignore` | `.env.openai.local` 차단 |
| 문서 | `SMOKE_PLAN_035` · `SMOKE_RUNBOOK_035` · `CLAUDE_RESULT_035` · `CLAUDE_BLOCKER_035` · `GPT_BRIEF` |

**바꾸지 않은 것:** `openaiSend.ts` · `smoke.ts` · `pipeline.ts` (034 와 동일) ·
SQL 전부 · `storageSample.ts` · `run-storage-sample.cjs` · `check-storage-sample-029.ts` ·
`targets.ts` · 프롬프트 2개 · 검산 정책 · 학생 payload

### 테스트 결과

```text
exec032 53 · exec033 25 · exec034 86
전체 묶음        690/690 · 실패 0 (차단 경계 안)
해제 폴더        690/690 · 종료코드 0 · manifest 122/122 · 해제 123개
SDK 계약 탐침     '통과' 43 (구간별 내역 로그에) · 실패 0 · 종료코드 0
음성 격리 탐침     시도 1 / 차단 1 · 종료코드 0
가드 분류 대조     12건 실패 0 (무전송)
런북 폴더        계획 0 · 깃발만 3 · 조회계획 0 · 조회깃발만 3 · 모르는인자 2
변경 범위 타입     0건 (전체 14건은 전부 미변경 app/*)
변경 범위 ESLint   0 (오류·경고 0)
tar              87f1afe92e8f691a65523cc6bb50d3743b27cefa7be1f8e061c0e0bd130d9667
보존             §8 불변 9개 + 034 tar + 033/034 SDK 로그 전부 바이트 동일
```

### 이번에 내가 틀린 것

1. **Bash heredoc 이 백슬래시를 반으로 먹어** 가드 탐침의 Windows 파이프 경로 입력이 깨졌고,
   "가드가 IPC 를 막는다"는 **거짓 실패**를 한 번 봤다. 입력이 틀린 것이었다.
   `Write` 로 파일을 만들어 다시 확인했다. 이 함정은 이 작업에서 반복됐다.
2. 가드를 고치다 `net.connect(port, host)` 의 맨 호스트를 `unknown` 으로 빠뜨려
   **loopback 까지 막았다.** 유한 대조 12건이 잡았다.
3. `V2` 시험의 계수값을 1,000 으로 둬 **생성**이 먼저 초과했다. "마지막 검토만 초과"를
   만들려면 앞 요청의 계수를 크게 둬야 했다.
4. OpenAI 설정 확인을 Supabase 확인보다 앞에 둬 기존 시험 4건이 깨졌다. 순서를 고쳤다.
5. `exec034.test.ts` 에 `listDir` 를 두 번 넣어 구문 오류를 냈다.
6. 034 브리핑의 K4 예약 숫자($0.049/$0.236)가 **틀렸다.** 코드 산식은
   $0.23375/$0.30250/$0.38500 이다. 산식이 맞고 설명이 틀렸으므로 설명만 고쳤다.
7. 034 SDK 로그 요약의 '통과 44' 가 **범위를 밝히지 않았다.** 계약 파일 43 + 별도 음성 1 이다.

### 남은 문제 (`CLAUDE_BLOCKER_035.md`)

1. **입력 계수 API 요금·지원·권한 미확정.** 공급자 문의 **초안만** 준비(발송 안 함)
2. 모델 계정 권한 미확인 · 조회 미실행 (`inferenceVerified=false`)
3. 지역 처리 가산 미확정 → ×1.1 여유로만
4. **`.env.openai.local` 이 아직 없음** → 조회·스모크 지금 종료코드 25
5. 실제 원문 이미지 픽셀 크기 미확인 (합성 PNG 로만)
6. 실제 청구액은 사람이 확인 — 코드는 횟수·예약만 막는다
7. F-03 — 스모크 이후 설계
8. **유료 실행·모델 조회·입력 계수 전부 미승인.** GPT 재검수 대기

---

## 035 추가 (2026-10-15) — 강의영상 소식 반영, 코드 변경 없음

원장님께서 "강의영상 AI선생님으로 하나씩 만들고 있다, 완성되면 질문앱·문제은행과 한 세트가 된다"고
알려주셨다. GPT 에게 전달해야 하므로 다음을 **문서만** 추가했다.

| 파일 | 내용 |
|---|---|
| `GPT_BRIEF.md` §10 | 새 사실 + A-4 와의 관계 + 근거표 + 제안 흐름 + 결정 6건 |
| `SELF_DIRECTED_FLOW_DRAFT.md` | 세 축(문제은행·질문앱·강의영상) 자기주도 흐름 **제안** |

### 찾은 사실 (근거 있음)

- `docs/sql/쌍둥이_설치.sql:337` 의 `type_learning_assets` 에 `asset_type='video'`,
  `video_url`, `start_seconds`, `end_seconds` 가 **이미 있다** (014 설치분).
  → 개념영상 1개를 구간으로 잘라 여러 유형에 붙일 수 있으므로
  **A-4 의 단위 불일치(개념 308 ↔ 유형 915)가 구조적으로는 해결된다.**
- 힌트 1 은 D-018 로 **이미 영상과 분리**돼 있다
  (`docs/AI_QUESTION_APP_CLAUDE_HANDOFF.md` §3: "영상이 없는 유형도 정상 동작해야 한다").
  → 들어오는 영상은 **전제 조건이 아니라 추가분**이다. MVP 출발을 막지 않는다.
- 세 축 모두 `type_code` 로 묶인다. 병목은 테이블이 아니라
  **915개 유형에 영상 구간을 붙이는 사람 손**이고, 이는 D-126("강사 부담 증가 없이")과 부딪친다.
  지렛대는 개념↔유형 매핑을 **한 번만** 만드는 것 (문항에 이미 `type_code` 가 있다).

### 바꾸지 않은 것

학습 흐름·정답 차단 정책·검산 정책·학생 payload·코드·SQL·프롬프트 **변경 0건.**
초안은 **제안**이라고 문서 머리에 명시했다. AGENTS.md 규칙대로 먼저 보고만 한다.

### 묶음·로그 재생성

문서 2개가 들어가 tar 해시가 바뀌었다. 과거 로그의 해시만 고치는 것은
GPT_EXEC_035 §159("과거 성공 로그를 새 결과로 재사용하지 않는다")에 어긋나므로,
깨끗한 폴더에서 **다시 돌려** 4개 로그를 새 출력으로 만들었다.

- tar `5978435784090ef7ae111f7bcb9cd551c5bdb20f6e0aefe6bdf513f6d501084b` · 124항목 · 866,971바이트
- manifest 123/123 · 회귀 690/690 종료코드 0 · SDK 계약 43통과 · 음성 1차단 · 런처 0/0
- 변경 범위 타입 에러 0건 (전체 14건은 전부 손대지 않은 기존 파일)
- 외부 `GPT_BRIEF.md` 와 묶음 내부가 바이트 동일

---

## 036 (2026-10-15) — 설정 출처·이력 조회 실패 보완 + 통합 계약 초안

지시 `GPT_EXEC_036.md` · 검수 `GPT_REVIEW_035.md` · 방향 `STUDYCHECK_INTEGRATION_DIRECTION_036.md`

### 바꾼 파일

| 파일 | 무엇 |
|---|---|
| `lib/twin/openaiConfig.ts` | 적재·되읽기 → **내용 파싱**. 실패 사유 5개 분리. `defaultEnvParser` 추가 |
| `scripts/run-twin-smoke-032.ts` | `statDir`·`ScanOutcome`·exit26 · `nodeSmokeFs()` 내보내기 · 설정 호출부 |
| `scripts/check-model-access-033.ts` | 같은 설정 공급으로 교체 |
| `lib/twin/exec036.test.ts` | **신규** — X 14건 + Y 15건 |
| `lib/twin/exec032/033/034.test.ts` | `statDir` 추가 · U1~U5·Q3 을 새 계약으로 |
| `lib/twin/exec017/019.test.ts` | 입력 수집 목록에 `exec036` 등록 |
| `package.json` | `test:twin:files` 에 `exec036` (의존성 변경 없음) |
| `STUDYCHECK_LEARNING_CONTRACT_DRAFT_036.md` | **신규** — 트랙 B 계약 초안 |
| `MUTATION_LOG_036.txt` · `SMOKE_PLAN_036.md` · `SMOKE_RUNBOOK_036.md` | 신규 |

### 시험 결과

```
전체 회귀      719 pass / 0 fail / 0 skip / 종료코드 0   (035 690 → +29)
tsc 전체       14건 — 전부 손대지 않은 기존 파일
그중 변경 범위  0건
변경 범위 ESLint 종료코드 0
돌연변이        8건 전부 검출 · 생존 0건
승인키          d139142ec46c81e3 (불변) · 실험 twin-smoke-first-46284 (불변)
```

### 이번에 내가 틀렸던 것

1. **035 에서 입구를 막고 같은 창문을 열어 뒀다.** SDK 가 `process.env` 를 집어가는 길은
   막았는데, 명시로 넘기는 그 값을 `process.env` 에서 꺼냈다. U6 단정이 "명시 전달" 만 보고
   **값의 출처**를 보지 않았다.
2. **돌연변이에서 M4 가 생존했다.** 실제 운영 adapter 가 `defaultDeps()` 안에 숨어 있어
   시험이 부를 수 없었고, 시험 파일의 **복제품**만 보고 있었다. 복제품은 내가 올바르게
   썼으니 늘 통과한다. → adapter 를 `nodeSmokeFs()` 로 내보내고 Y13 을 동작 시험으로 새로 썼다.
3. 브리핑 해시 하나를 잘못 적었다 (`check-model-access-033.ts` 끝 4자리). 고쳤다.
4. 035 브리핑 §6 에 **689** 가 남아 있었다. 최종값은 **690** 이고 갱신을 빠뜨린 오기다.
   035 원본 tar·로그는 고치지 않았다.

### 트랙 B 에서 찾은 것 — 끊긴 곳 세 군데

| | 끊긴 곳 | 왜 |
|---|---|---|
| G-1 | `video_watch_logs` 가 **`video_url` 로만** 붙는다 | 어느 개념·유형 영상인지 알 수 없다 |
| G-2 | `concepts` ↔ `standard_types` **매핑 없음** | 개념 영상을 유형에 붙일 고리가 없다 |
| G-3 | `type_learning_assets` 에 **`concept_id` 없음** | 영상이 유형에만 붙는다 |

그리고 **`video_watch_logs.watch_seconds` 는 재생 시간이 아니다** —
`app/student/dashboard/page.tsx:334` 는 새 창이 닫힐 때까지의 **벽시계 시간**을 더한다.
`grading_answers` 에는 시간 열이 없어 문항별 풀이시간을 말할 수 없다.
**시청 완료를 이해 완료로 쓸 수 없는 이유가 정책이 아니라 측정 자체다.**

### 남은 문제 (`CLAUDE_BLOCKER_036.md`)

**구현 결함 0건.** 나머지는 자료·승인 대기다.

1. **`GPT_REVIEW_035_EVIDENCE.zip` 미수령** — 보고서의 줄 번호로 재현해 진행했다
2. 입력 계수 요금·지원·권한 미확정 · 문의 **발송 0건** (주체는 윤T/계정 관리자)
3. 모델 계정 권한 미확인 · 조회 미실행
4. 지역 처리 가산 미확정 → ×1.10 여유로만
5. `.env.openai.local` 없음 → **준비 대기** (결함 아님). 지금 돌리면 exit25
6. 실제 이미지 픽셀 크기 미확인 (재다운로드 안 함)
7. 실제 청구액은 사람이 확인
8. F-03 — 스모크 이후 설계
9. 트랙 B: `concepts` DDL 이 저장소에 없음 · G-2 매핑 없음 · 질문앱 실제 스키마 모름 ·
   AI 영상 실시간 대화 여부 미확인

### 범위 위반 1건 — 내가 낸 것

035 결함을 CLI 로 재현하다가 **운영 Supabase 주소로 요청 1건**을 보냈다.
합성 저장소·가짜 키(`sb_secret_A1b2…`)였고 **거부**됐다. 읽은 행 0 · 쓴 행 0 ·
Storage 0 · OpenAI 0회. 그래도 **운영 호스트로 요청이 나간 것은 승인 밖이다.**

원인: 036 판이 관문(exit 25·26)에서 멈추는 것을 보고 **035 판도 비슷하게 멈출 것이라
가정**했다. 035 판에 그 관문이 없다는 것이 바로 이번에 고친 결함인데, 그것을 실험의
위험으로 연결하지 못했다. 합성 폴더·가짜 키만 보고 격리됐다고 판단하고
**주소가 운영이라는 점**을 놓쳤다. 033 에서 같은 종류의 잘못을 했고 034 §23 에서
지적받았는데 되풀이했다.

재발 방지: **관문 없는 옛 판을 실제 주소가 적힌 설정으로 돌리지 않는다.**
옛 판 재현이 필요하면 전송 차단 가드를 먼저 적재하거나 주소를 합성값으로 바꾼다.

---

## 037 (2026-10-22) — 시험 절차 고정 + 통합 계약 0.1-draft

지시 `GPT_EXEC_037.md` · 검수 `GPT_REVIEW_036.md`

### 판정: R035-01·R035-02 는 **통과·종료**

GPT 가 manifest 130/130, 원본 테스트 8파일 222/222, 독립 합성 대조 28/28 을 직접 확인했다.
두 결함은 다시 열지 않는다. §145 의 일곱 파일 전부 바이트 동일로 보존했다.

### 바꾼 파일 — **시험 진입점과 문서뿐**

| 파일 | 무엇 |
|---|---|
| `test/bootstrap.cjs` | **신규.** 가드가 실제로 걸렸는지 함수 신원으로 확인 → 아니면 종료코드 97 |
| `scripts/run-guarded.cjs` | **신규.** 옛 판·임시 폴더·손 탐침을 같은 경로로 띄우는 wrapper |
| `test/guardRequired.ts` | **신규.** 탐침의 첫 import. 멈춘 시점의 앱·SDK 모듈 수를 찍는다 |
| `scripts/run-twin-tests.cjs` | netguard → bootstrap (4곳) |
| `test/probes/negative034.ts` · `sdkContract034.ts` | 첫 import 한 줄 |
| `lib/twin/exec037.test.ts` | **신규** — Z 14건 |
| `lib/twin/exec017.test.ts` · `package.json` | 목록 등록 (의존성 변경 없음) |
| `STUDYCHECK_LEARNING_CONTRACT_DRAFT_037.md` · `OPENAI_LOCAL_PREPARATION_037.md` · `MUTATION_LOG_037.txt` | 신규 문서 |

`test/netguard.cjs` 는 **고치지 않았다.** 새 분류기·방화벽을 만들지 않았다.

### 036 사고 경로를 보호된 경로로 다시 돌린 결과

```
[037] 가드 수치 — 시도=4 차단=4 로컬허용=4 대상=fetch:cggskjxsyrvuhsldgkoj.supabase.co ×4
```

**036 에서 밖으로 나갔던 그 요청이 이번에는 4건 전부 막혔다.**
이번 회차에 운영 호스트로 나간 요청은 **0건**이다.

### 시험 결과

```
전체 회귀      733 pass / 0 fail / 0 skip / 종료코드 0   (036 719 → +14)
tsc 전체       14건 — 전부 손대지 않은 기존 파일 · 변경 범위 0건
변경 범위 ESLint 0
돌연변이        4건 전부 검출 · 생존 0건
승인키 d139142ec46c81e3 불변 · 실험 twin-smoke-first-46284 불변
```

### 이번에 내가 틀렸던 것

1. **036 의 사고 원인은 "가드를 올렸다고 믿은 것"** 이었다. 올렸는지 확인하는 자리가
   없었고, 탐침의 확인은 SDK 적재 뒤에 돌았다. 합성 폴더·가짜 키를 격리로 착각했다.
2. **돌연변이 N3 이 처음에 소스 글자 검사만 통과시켰다.** 동작으로는 똑같이 97 이 나와
   Z7 이 통과했는데, 실제로는 멈추기 전에 SDK 가 적재되는 상태였다. → 멈춘 시점의
   앱·SDK 모듈 수를 `require.cache` 에서 세어 찍게 하고 Z7 이 0개인지 단정하게 고쳤다.
   036 의 M4 와 **같은 종류의 실수**다 — 말로 적은 보장을 수로 확인되는 보장으로 바꿔야 한다.
3. **036 blocker 에서 전용 파일 없음을 모든 모드 25 로 묶어 적었다.**
   스모크는 25, 모델 조회는 **6** 이다. 코드를 통일하지 않고 설명만 고쳤다.
4. **036 의 "도움 유무를 구분할 열이 없다" 가 부정확했다.** `grading_answers.graded_by`
   (`self`·`auto`·`teacher_pending`)가 있다. 그것은 누가 채점했는지이고 학생이 도움을
   받았는지는 아니다. 둘을 구분해 적었다.
5. **036 식별자 표가 합성 fixture 를 운영 타입 근거로 썼다.** `합성기반_스키마.sql` 은
   머리에서 스스로 "운영 실물이 아니다" 라고 밝힌다. E3 으로 내렸다 —
   실제 타입이 다르다는 주장이 아니라 운영 근거 미확정이라는 뜻이다.

### 트랙 B — 연결 두 안 비교

| | 안 A — 자산 쪽에 유형별 구간 행 | 안 B — 개념↔유형 매핑표 |
|---|---|---|
| 자산 복제 | 유형 수만큼 행 증가 | 없음 |
| 개념 연결 | 안 됨 | 됨 |
| 유지 작업량 | 915 유형 × 구간 → D-126 과 충돌 | 매핑 1회 |
| 새 DB 변경 | 없음 | 매핑표 1개 + 개념 참조 |

**안 B 가 유리하지만** G-2(개념↔유형 매핑)가 전제이고 그것이 운영에 있는지
**확인하지 못했다.** `concept_id` 열 추가가 유일한 해법이라고 확정하지 않았다.

### 두 번째 미수령

`GPT_HANDOFF_037.zip`·`GPT_REVIEW_035_EVIDENCE.zip` 이 **또 오지 않았다.**
보고서에 적힌 실패 4조건의 **이름**으로 대조해 진행했다. JSON 원문·줄 번호 일치·
ZIP 해시는 대조하지 못했다.

### 남은 문제 (`CLAUDE_BLOCKER_037.md`)

**구현 결함 0건.** 자료·승인 대기 9건. 그중 트랙 B 를 막는 것은
**운영 DDL 부재**(B-1 미승인)와 **G-2 매핑 확인 불가**다.

### 037 추가 — 증거 묶음을 받아 대조했다 (2026-10-22)

`GPT_HANDOFF_037.zip` 을 뒤이어 받았다. 전달 누락이 아니라 한 걸음 늦은 것이었다.

```
zip 3b1411c6298eb2f40789b5d39c0279db1f3e304b1ac3a562efe1775d76b21004 · 29파일 · manifest 28/28
035 증거 zip 해시 4e75bb1a…e624f7a  → 037 §68 이 적은 값과 일치
동봉된 036 tar                      → 내가 만든 7a46502e… 와 일치
PROBES_035  24충족/4미충족 — 이름·관측값 전부 내 보고와 일치
PROBES_036  28/28 · 미충족 0 · JS 외부요청 0
SOURCE_LOCATIONS_035  650줄 대조 · 어긋난 줄 0 · 해시 4/4
SOURCE_LOCATIONS_036  822줄 대조 · 어긋난 줄 0 · 해시 5/5
```

가장 중요한 확인: GPT 탐침이 `sdkKeySources` 를 **직접 기록**했고 그 값이 `"shared"` 였다.
036 진단("출처는 전용이라 적으면서 공유 값을 전달")이 **추론이 아니라 같은 관측**이었다.

### 그 과정에서 찾은 내 잘못 — 브리핑 해시 오기

`exec034.test.ts` 해시가 035 묶음·manifest·GPT 증거 세 곳 모두 `d35e2c45…` 인데
**내 035 브리핑 표는 `8979a418…`** 였다. 036 브리핑이 그 값을 한 번 더 옮겼다.

원인: 035 끝에 그 파일을 한 번 더 고치고(중복 `listDir` TS1117 수정) **표의 해시를
갱신하지 않았다.** manifest 는 묶기 직전 재계산되므로 맞았고 123/123·130/130 검사도
통과했다. **묶음 무결성 문제가 아니라 표의 오기다.** 같은 표의 나머지 6개는 전부 일치했다.

재발 방지: **브리핑 해시 표는 manifest 를 만든 뒤 그 파일에서 떠서 적는다.**

### 계약 초안에 발췌를 하나 더 넣었다

GPT 의 `INTEGRATION_SOURCE_AVAILABILITY_036.json` 이 036 tar 에 app 소스 세 개가
없다고 적어서, `app/teacher/video-schedule/page.tsx` 의 `Concept` 선언·조회문도
발췌로 넣었다 (036 때는 둘, 이제 셋). `concepts` 의 열 **이름**은 알고
`id: string` 은 TS 선언이라 **DB 타입은 여전히 미확정**이다.

---

## 038 (2026-10-22) — 통합 계약 0.1-draft.1 + 구조정보 조회 준비

지시 `GPT_EXEC_038.md` · 검수 `GPT_REVIEW_037.md`(**P036-01 통과·종료**) ·
설계 `STUDYCHECK_CONTRACT_REVIEW_NOTES_038.md`

### 실행 코드는 건드리지 않았다

보존 대상 **12개 전부 바이트 동일**. 문서와 새 시험(S1~S10)만 추가했다.

```
전체 회귀 743 pass / 0 fail (037 733 → S 10건) · 변경 범위 타입 0 · ESLint 0
운영 요청 0건 · 조회문 실행 0회 · 새 패키지 설치 0건
```

### 로컬 자료로 E4 를 줄였다

운영에 실행된 SQL 을 다시 읽어 **037 에서 합성 fixture 로 잘못 근거를 댔던 자리**를 바꿨다.

| 새로 채운 것 | 근거 |
|---|---|
| `students` 7열 (`session_uid`·`parent_session_uid` **uuid** 등) | 학부모세션분리 1·2 |
| `student_worksheets` 10열 · `worksheet_action_logs` 14열 | 초등학습지 70점 차단 트리거 |
| `users.id` **uuid** · `exams.id` **uuid** | 같은 트리거 · 단원평가 복구 스크립트 |

**없는 것도 확인했다** — generated DB types 없음(`createClient` 를 타입 인자 없이 부른다),
전체 schema export 없음. 그래서 **구조정보 1회 조회**가 필요하다.

### 조회문은 초안만, 미실행

카탈로그만 읽는 **한 문장**. 데이터 행 0줄·`count(*)` 0회(정책 수만)·정책 본문 0건·
덤프 함수 0회·DDL/DML 0건. 대상 15개 고정, **질문앱 이름은 추측해 넣지 않았다.**

아직 돌리지 않으니 약속이 문서에만 남지 않게 **글자를 기계로 검사**했다(S1~S10).
**실제 PostgreSQL 수용 시험은 미실행** — `psql`·설치 폴더가 없고 021·025 때의
embedded-postgres 는 껍데기만 남았다(`postgres.exe` 없음). 새 패키지 설치는 금지다.
그래서 **S 시험은 "금지된 것이 없다"는 검사이고 문법 증거가 아니다.**

### 이번에 내가 낸 결함 — 시험이 헛돌고 있었다

S6 의 정규식 `\b(?:from|join)` 이 python 비-raw 문자열 때문에 **백스페이스 제어문자**로
바뀌어 관계를 **0개** 찾고 있었다. 통과가 아니라 **헛도는 검사**가 될 수 있었다.

**잡은 것은 내가 그 시험에 넣어 둔 마지막 줄이다:**
`assert.ok(rels.length > 5, '검사가 헛돌았습니다')`

raw 문자열로 되돌리고 python 으로 고친 **16개 파일을 제어문자로 재검사**해 그 한 줄 외에는
깨끗함을 확인했다. 033·035·036 에서도 같은 함정(heredoc·python 이스케이프)에 걸렸다.
**규칙: 역슬래시가 든 줄은 python 으로 고치지 않고 Write/Edit 로 쓴다.**

### 남은 문제 (`CLAUDE_BLOCKER_038.md`)

**구현 결함 0건.** ① 실제 PG 문법 시험 미실행 ② 운영 구조정보 미확인(조회문 검수 대기)
③ 질문앱 인계 회신 대기(대응표 미확인 칸은 비워 둠) ④~⑧ 요금·권한·설정파일·이미지·청구액 대기.

### 038 추가 (2026-10-23) — 강의영상이 **세 종류**라는 사실을 받았다

원장님: "기본 영상은 **개념영상·대표문제 풀이영상·증명영상** 이고, 필요하면 더 만들 수 있다."

037 검수에서 GPT 가 "개념 영상과 대표유형 풀이영상의 목적이 다를 수 있다" 고 했고 맞았다.
**거기에 증명영상이 하나 더 있었다.** 계약 초안 §1-B 를 세 종류로 고쳤다.

| 영상 | 붙는 단위 | 재사용 폭 |
|---|---|---|
| 개념영상 | 개념 | 개념 1 → 유형 N |
| 대표문제 풀이영상 | **유형 직접** | 유형 1 → 문항 N |
| **증명영상** | **정리·공식**(개념보다 작은 단위) | **정리 1 → 개념 N → 유형 M** |

증명영상이 안 B(자산 재사용)의 가장 강한 사례다 — 근의공식 유도 하나가 여러 개념·유형에
걸리므로 유형별 복제는 재검수 폭탄이 된다.

### 보고만 하고 고치지 않은 것 두 개

1. **증명영상 × D-017 충돌.** `problems.is_essay` 가 있고(E1), "증명하시오" 문항에서
   증명영상은 **그 문항의 답 자체**다. 계산 문항에서는 답과 무관하다.
   → 공개 경계를 `자산 × 원문 문항 종류` 로 둬야 한다. AGENTS.md 대로 먼저 보고했다.
2. **증명 문항은 AI 쌍둥이를 만들 수 없다.** 014 설치 SQL 이 서술형을 명시적으로 거부한다
   (`raise exception 'source_is_essay'`). D-016 선택 순서에서 **twin 칸이 구조적으로 비는
   유일한 경우**이고, 확인 문제를 사람이 고를 수밖에 없다.

### 제안 두 개

- **영상을 진단 축으로 고른다.** CP-002 의 진단 축 6개는 질문앱이 이미 기록한다.
  ④개념 회상→개념영상, ①②⑤→풀이영상, ④의 "왜"·선수개념→증명영상.
  관계 단위가 `축 × (개념｜유형｜정리)` 가 된다. `axis` 를 넣을지는 미결로 뒀다.
- **네 번째 영상(오답·검산)은 데이터 뒤로.** `grading_answers` 에 오답이 이미 쌓이므로
  흔한 오답 상위 N 개를 뽑은 뒤 찍는 게 낫다. 집계는 운영 조회가 필요해 하지 않았다.

---

## 039 (2026-10-23) — 근거 등급 정정 + 계약 0.1-draft.2

지시 `GPT_EXEC_039.md` · 검수 `GPT_REVIEW_038.md` · 결정 `GPT_VIDEO_EVENT_DECISIONS_039.md`

### 판정: 038 무결성·보존 통과, 조회문은 **윤T 1회 조회 진행 가능**

다만 **GPT 환경에도 PostgreSQL 이 없어** 문법·런타임은 **양쪽 모두 미확인**이다.
공개 PG17 카탈로그 정의와 소스를 대조한 검토이고, 실행 오류가 나면 그대로 멈추고 전달한다.

### 이번 회차에 한 일 — 문서뿐

코드·시험·조회문 **변경 0건.** 조회문은 해시가 고정돼(`f25d1d9f…`) 윤T 실행 대상이라
건드리지 않았다. 확인용 회귀 1회 743 pass — **새 성과가 아니고** 문서 추가로 깨진 것이
없다는 확인이다.

### 내가 근거 없이 단정한 것 다섯 개를 내렸다

| # | 내렸다 |
|---|---|
| 1 | **`exams.id` uuid** → uuid 모양 문자열은 열 타입을 입증하지 않는다 (`text`·`varchar` 여도 성립) → **E4** |
| 2 | **참조측 선언 = 대상측 타입** → `problem_id bigint references problems(id)` 는 참조측 선언. "호환" 까지만 → **두 칸으로** |
| 3 | **새 운영 SQL 인용을 E1** → 전문이 묶음에 없다 → **E2.** 파일 존재 ≠ 운영 실행 성공 |
| 4 | **질문앱 "현행호환"** → 이름이 같은 것이 양방향 호환 확인이 아니다 → **자료미확인** |
| 5 | **`axis` "이미 기록"** → 설계 선언까지가 E2, 실제 저장은 **E4** |

그리고 내 **범위 표현**도 틀렸다 — "목록 밖 schema 를 뒤지지 않는다" 는 **훑는 목록이
고정**이라는 뜻이고, `inbound` 는 **15개를 참조하는 FK 의 출발 관계 이름**을 돌려주므로
**목록 밖 이름이 결과에 나올 수 있다.** SQL 을 고치지 않고 문서를 고쳤다.

### 계약에서 제일 큰 수정 — 중복 비교가 구멍이었다

GPT 가 투영 예시로 보여 줬다. 내 **고정 7개 열** 지문으로는
`plan_ref`·`question_ref`·`observation_method`·`unmeasured`·`corrects_event_id` 가
바뀌어도 **전부 "같은 내용"** 이 된다 — 계획이나 질문이 달라진 사실이 중복으로 묻힌다.

→ **고정 목록 방식을 버렸다.** `client_event` **전체**가 지문이고
`server_envelope`(`received_at`·`resolved_student_scope` 등)는 제외한다.
**학생 범위는 서버가 확정**하고 client 값은 참고값이다.

### 증명 학습에서 내 결론도 내렸다

"twin 칸이 비는 **유일한** 경우" → 단정하지 않는다.
"확인 문제를 **사람이 고를 수밖에 없다**" → **채택하지 않는다.** 검수된 묶음 + 연결규칙을
한 번 준비하고 **시스템이 고른다** (강사의 학생별 수작업 선택 구조를 만들지 않는다).
답 노출은 `is_essay` 하나로 판정하지 않고 **현재 원문 × 과제 목적 × 자산 버전·구간 ×
사용 맥락**으로 본다.

### 합의된 이연 1건

`exec038.test.ts:156` 의 `|| true` 는 **무효 단정**이다 (GPT 지적, 사실).
"다음 실제 시험수정 작업이 있을 때" 고치라고 해서 이번에 열지 않고 **대체 문장을
blocker 에 미리 적었다.**

### 남은 문제 (`CLAUDE_BLOCKER_039.md`)

구현 결함 0건. ① 조회문 문법·런타임 양쪽 미확인 ② 구조정보 스냅샷 **윤T 실행 대기**
③ 질문앱 인계 회신 대기 ④ `axis` 수집 여부 미확인 ⑤ 요금·권한·설정파일·이미지·청구액 대기.

---

## 040 (2026-10-24) — 구조조회 반영 · 기존 구현 연결 · 첫 로컬 학습 흐름

### 내가 또 틀렸다 — 세 번째 같은 실수

039 에서 "영상 코드를 못 찾았다" 고 보고했는데 **같은 저장소 `main` 브랜치에 전부 있었다.**
`git grep -l "lesson_videos" main` 한 번이면 나왔다. 036(insert 문만 보고 표 전체 단정) ·
039(코드 못 찾고 "없다") 에 이어 세 번째다.

**규칙: 저장소에 무엇이 있는지 말하기 전에 `git grep --all` 로 모든 브랜치를 본다.**

### 영상 열의 의미를 전부 확인했다

| 열 | 뜻 |
|---|---|
| `watch_seconds` | **옛 칸인데 뜻이 바뀌었다** — 새 경로는 실제 재생 초를 넣는다 |
| `covered_seconds` | 한 번이라도 재생된 **서로 다른** 초 (구간 합집합) |
| `watched_ranges` | `[[0,95],[120,180]]` 재방문 시 이어서 |
| `scene_seconds` | 장면 1-based 번호별 재생 초 |
| `focus_lost_seconds` | **탭 전환 관측이고 인지적 집중이 아니다** |
| `completed_at` | **coverage 90%** |
| `call_responses` | **호명 응답.** 정답·증명 답안이 아니다 |

그리고 **영상은 전체 공개가 아니다** (RLS `own_assigned_read` — 학습일지 과제에 들어간 것만),
**증명 확인 행동이 이미 있다** (`proof_submissions` 백지 사진 제출).

### 만든 것 — 로컬 합성 미리보기

`lib/twin/learningPreview.ts` 순수 함수 + 시험 14건. 운영 route·SDK·네트워크 **미사용**
(시험 Q4 가 소스로 단정). 실제 출력은 `PREVIEW_OUTPUT_040.txt`.

노출 안전성 `unknown` 인 자산을 **보류**하고 개념영상 **구간**을 고르며,
관측 4종을 **합치지 않고 따로** 적고, 도움 미측정이면 숙달을 **확정하지 않는다**.

```
전체 회귀 757 pass / 0 fail (039 743 → +14) · 변경 범위 타입·ESLint 0
```

### 이연했던 S7 무효 단정 정리

`|| true` 를 빼고 **고정 VALUES 검사 + 부질의 금지**로. 보장 범위를 주석에 정확히 적었다 —
"훑는 목록이 고정" 까지이고 "결과에 목록 밖 이름이 없다" 는 **보장하지 않는다**.
돌연변이로 검출 확인했고 조회문은 `f25d1d9f…` 로 복원했다.

### GPT 에 제안했다 — 질문앱 0단계

질문앱 코드가 **어느 브랜치에도 0줄**이다. 그런데 영상 185편 + 유형코드 + 장면 + 문제은행이
이미 있어서 **AI·쌍둥이·유료 호출 없이** 1단계가 가능하다 (D-018 이 이미 그렇게 정했다).

제안한 것은 **직원 전용 읽기 화면 하나** — 새 표 0 · 쓰기 0 · AI 0 · 강사 업무 0.
GPT 가 걱정할 것(질문앱 트랙 충돌·수집·정답 노출·D-116)에 선제 답을 붙였고,
**영상 도달 가능성**(학생은 과제로 배정된 영상만 열림)이라는 걸림돌도 정직하게 적었다.

**지시가 오기 전에는 만들지 않는다.**

---

# 041 회차 — 첫 브라우저 사용판 (2026-10-24)

## 바꾼 파일

**새로 만든 것** (기존 파일을 고치지 않았다)

```
lib/learning/contract.ts · store.ts · catalog.ts · session.ts · engine.ts
lib/lessonVideos.ts                      main 원본 그대로 (고치지 않음)
app/api/learning/{session,act,teacher}/route.ts
app/learning/page.tsx · app/learning/teacher/page.tsx
lib/twin/exec041.test.ts                 시험 33개
public/learning-demo/*.mp4               시연 영상 5편 (ffmpeg testsrc)
evidence-041/                            브라우저 기록 15장 + 설명
CLAUDE_RESULT_041.md
```

**고친 것**

```
lib/twin/learningPreview.ts   R040-A~D
lib/twin/exec040.test.ts      바뀐 계약으로 6개 옮김 (나머지 8개 그대로)
lib/twin/exec017.test.ts · package.json   시험 목록에 exec041 추가
.gitignore                    .learning-test-store/
```

의존성 추가 0개. `package.json` 의 `dependencies` 미변경.

## 시험 결과

| 무엇 | 결과 | exit |
|---|---|---|
| `node scripts/run-twin-tests.cjs` | 790/790 통과 (757 → 790, exec041 33개) | 0 |
| `next build` | `✓ Compiled successfully in 4.9s`, `/learning`·`/learning/teacher`·`/api/learning/*` 생성 | 0 |
| `next dev -p 3100` | `✓ Ready in 377ms` | — |
| 브라우저 한 바퀴 | 15장 기록, EXEC-041 §6 수용 9항목 전부 확인 | — |

브라우저에서 숫자로 잰 것: 구간 시작 95초 이동 · 구간 끝 160.4초에서 멈춤(영상은 180초) ·
구간 기준 재생률 19/65=29.2% · 되감기 중복 안 셈 · 54초 건너뛰기 안 셈.

## 남은 문제

1. **이 브랜치가 `main` 의 조상이 아니다.** `app/student/watch`·`app/api/proof-submit`·
   `app/api/type-concepts` 가 여기 없다. 운영 연결 전에 맞춰야 하는데 전면 병합은 금지돼 있어
   GPT 에 (가) 병합 후 충돌 보고 / (나) `main` 에서 새 브랜치 중 선택을 물었다.
2. **강사 요약 줄머리의 `[합성]`.** 040 계약이 모든 출력에 붙이게 돼 있다. 이번 시도는
   진짜 기록이고 콘텐츠만 시연이라 **덜 주장하는 쪽으로** 틀렸다. 승인 없이 바꾸지 않았다.
3. **공수1 로컬 자료 공백.** 유형 코드·이름만 있고 문항 본문·영상·쌍둥이는 로컬에 없다.
   유형 2개만 실제 자료로 쓰고 나머지는 시연으로 채웠다.
4. **운영 미연결**: `lesson_videos` 185편 · `problems` · `student_login` RPC · RLS · `denyIfNotStaff`.
   전부 승인 대기.
5. **제일 큰 병목은 노출 검수** — 사람이 해야 한다. 구간 단위 ≈550건, 한 건 20초로 약 3시간 추정.
   다만 검수된 것만 보이는 것이 기본 동작이라, 한 단원만 검수해도 시범은 된다.

## 겪은 것 (코드 문제 아님)

curl 로 비ASCII 값(`2쌍`, `−1`)을 보내면 셸에서 깨져 채점이 `wrong` 으로 나왔다.
같은 값을 UTF-8 파일(`--data-binary @file`)로 보내니 둘 다 `correct`. 브라우저도 `correct`.
**채점 코드 문제가 아니었다.** 처음에 「채점이 틀렸다」고 결론 낼 뻔해서 적어 둔다.

---

# 042 회차 — main 통합과 네 결함 수정 (2026-10-27)

## 어디서 보나

```bash
npm run dev:learning-demo -- -p 3200
```
학생 `/learning` (`A-2026`·`B-2026`) · 강사 `/learning/teacher` (`T-2026`).
실행 폴더 `.claude/worktrees/learning-integration-042`. 끄기 `Ctrl+C`.

`npm run dev` 만으로는 안 열린다 — §3-D 로 시험 장치가 **기본 꺼짐**이 됐다.

## 바꾼 파일

**새로**
```
lib/learning/mode.ts                  시험 모드 가름 (042 §3-D)
lib/twin/exec042.test.ts              실제 route 를 불러 돌리는 시험 34개
scripts/dev-learning-demo.cjs         demo 모드 실행기
components/MathText.tsx               수식 (main 의 MathText 를 공용 자리로)
LEARNING_STORAGE_REUSE_MAP_042.md     기존 저장 구조 재사용 대조
OPS_REQUEST_042.md                    운영 실행요청 한 건
CLAUDE_RESULT_042.md · evidence-042/
```

**고친 것**
```
lib/twin/learningPreview.ts   outcomes 넷으로 분리 · provenance · wholeDeliverySafe
lib/learning/contract.ts      행동 단위 기록 · summarize() · watchedRanges
lib/learning/store.ts         transact() · 직렬화 · 판 검사
lib/learning/engine.ts        applyAction 순서 · clampToSegment · outcomesAfterHelp
lib/learning/catalog.ts       wholeFileSafeFor · 증명 원문용 카드 · 수식
lib/learning/session.ts       demo 모드 가름
app/api/learning/*/route.ts   행동 봉투 · 관측 검사 · demo 가름 · denyIfNotStaff
app/learning/page.tsx         sendAction · 구간 clamp · 자동 저장 · 이어보기
app/learning/teacher/page.tsx 결과 넷 분리 표시
lib/twin/exec028.test.ts      §63 검사 정정 (D-137 — GPT 판단 대기)
```

의존성 추가 **0개**.

## 시험 결과

| 무엇 | 결과 | exit |
|---|---|---|
| `node scripts/run-twin-tests.cjs` | 826/826 (790 → 826, exec042 34개) | 0 |
| `tsc --noEmit` (빌드와 분리) | 29건 전부 main 원래 것, **제 경로 0건** | 2 |
| `next build` | `✓ Compiled successfully` | 0 |
| 브라우저 | A·B·C·D 네 묶음 전부 확인 | — |

## 남은 문제

1. **직원 인가는 절반만 확인**. `denyIfNotStaff` 로 막히는 것만 봤고,
   통과한 직원에게 자료가 제대로 나오는지는 운영 설정이 없어 못 봤다.
2. **학생 운영 인증(`student_login`) 미연결.**
3. **공수1 강의영상이 있는지 모른다.** 0편이면 0편이라 적고 카드로 간다.
4. **RLS 정책 본문을 못 봤다.** 스냅샷에 이름·명령만 있다. 그래서
   「`tla_read_active` 가 학생에게 열려 있다」는 이름에서 온 추측이다.
5. **§63 검사 정정(D-137)은 GPT 판단 대기.** 측정으로는 더 좁아졌지만 결정은 GPT 몫.

## 겪은 것

- `git worktree add` 로 만든 통합 트리에서 이 세션은 **쓰지 못한다**(하네스가 막는다).
  그래서 한쪽에서 고치고 다른 쪽으로 복사한 뒤 **파일 단위로 같은지 대조**했다.
- Next 16 은 한 폴더에 dev 서버를 하나만 띄운다. 모드를 바꾸려면 기존 것을 내려야 한다.
- 역슬래시 트랩이 또 났다 — 히어독·node `-e` 안의 `\n` 이 진짜 줄바꿈이 돼
  `catalog.ts` 문자열을 두 번 깼다. 둘 다 타입검사에서 즉시 잡혔다.
  **여러 줄 문자열이 든 치환은 Edit 도구로 한다.**

---

# 043 회차 — 기록 오류 닫기 + 실제 연결 코드 (2026-10-27)

## 어디서 보나

```bash
npm run dev:learning-demo -- -p 3200
```
학생 `http://127.0.0.1:3200/learning` · 강사 `/learning/teacher`.
주소가 `127.0.0.1` 로 **고정**됐다 (전에는 `0.0.0.0` 이었다).

## 바꾼 파일

**새로**
```
lib/learning/providers.ts · demoContent.ts · demoAuth.ts
lib/learning/supabaseContent.ts · supabaseAuth.ts · supabaseStore.ts   ← 실행 안 함
lib/learning/grading.ts                      기존 QR 채점 규칙을 옮겨 적음
docs/sql/migrations/043_learning_actions.sql + _rollback.sql           ← 실행 안 함
lib/twin/exec043.test.ts                     경계 시험 19개
evidence-043/
```

**고친 것**
```
app/learning/page.tsx            미확정 저장 1건 유지 · 같은 봉투 재전송 · 실패 표시
lib/learning/contract.ts         afterHelp 칸 제거 · epochOf/isAfterHelp · playedSeconds
lib/learning/engine.ts           지문에서 after_help 제거 · 완료는 서버 계산
app/api/learning/act/route.ts    척도 다른 둘을 견주지 않음 · playedSeconds 검사
scripts/dev-learning-demo.cjs    --hostname 127.0.0.1 고정 · 주소 인자 거부
lib/learning/catalog.ts          운영 열을 받을 칸 추가
MANIFEST.sha256                  새 파일 12개 등록
```

## 시험 결과

| 무엇 | 결과 | exit |
|---|---|---|
| `run-twin-tests.cjs` | **851/851** (exec040 14 · exec041 35 · exec042 40 · exec043 19) | 0 |
| `tsc --noEmit` | 29건 전부 main 원래 것, 제 경로 0건 | 2 |
| `next build` | Compiled successfully | 0 |
| 브라우저 | 저장 실패 표시 · 구간 경계 · loopback 전부 확인 | — |

## 남은 문제

1. **운영 Supabase SDK 로 한 번도 붙지 않았다.** 어댑터는 타입검사와 합성 대역만.
2. **PostgreSQL 엔진으로 DDL 을 돌려 보지 않았다.** 격리 PG 환경이 없다.
   시험의 D 계열은 SQL **글자 검사**다.
3. 직원 인가의 **통과 쪽** 여전히 미확인.
4. 운영 provider 가 만드는 관계가 **거의 항상 빈 배열**이다 — 운영에 노출 검수 기록이 없다.
5. 공수1 영상은 원장님이 「이미 올렸다」고 하셨다 (2026-10-27 보고).
   `READONLY_LEARNING_CONTENT_043.sql` 로 확인하면 숫자가 나온다.

## 겪은 것

- 히어독·`node -e` 안의 `\n`·`\b` 가 또 진짜 문자로 바뀌어 치환이 두 번 실패했다.
  **여러 줄 문자열이 든 치환은 Edit 도구로 한다** — 이번 회차에도 같은 함정이었다.
- HTTP 머리글에 한글을 넣으면 `Request` 가 만들어지지 않는다 (ByteString).
  시험에서 `'Bearer 아무거나'` 로 썼다가 걸렸다.
- Next 16 은 한 폴더에 dev 서버를 하나만 띄운다. 모드를 바꾸려면 기존 것을 내려야 한다.

---

# 045 이어서 — 화면 연결 · 직원 검수 화면 · 두 트리 반영 (2026-10-29)

원장님 지시: 「045 구현을 계속 진행하세요 … 작은 수정마다 GPT 승인을 기다리지 마세요.」

## 한 일

| 지시 | 결과 |
|---|---|
| `learning-integration-042` 에 045 반영 | **44개 파일.** Sidebar·매뉴얼은 042 판 보존 + 내 줄만 추가 |
| 학생 화면 운영 모드 차단 제거 | 전면 차단 없앰. 인증·설정으로만 막는다 |
| 기존 로그인 인증 전달 | 학습 API 네 곳 모두 Bearer 토큰 (`learningFetch`) |
| 확인 문항 그림 표시 | `ConfirmActionItem.imageUrl` → 서명 주소 → 화면 |
| 유튜브 도움 열기 기록 | `window_elapsed` 만. 본 초를 **만들지 않는다** |
| 첫 세트 확인 화면 (직원용) | `app/teacher/learning-first-set` + `app/api/learning/first-set` (원장 전용) |
| 원장님에게 JSON 요구 안 함 | 화면이 승인 명세를 만든다. 못 쓰면 내려받기 |

## 실제 브라우저에서 돈 것

`npm run dev:learning-demo` (127.0.0.1:3210) 로 띄우고 내장 브라우저로 **끝까지** 돌렸다.

로그인 → 배정 과제 3개 → 문항 열기(시도 저장) → **오답 제출(서버 채점 `wrong`)**
→ 막힌 지점(recall) → **도움**(승인된 대표예제 영상 구간 10–70초 + 확인 문제)
→ 확인 문제 제출(`correct`) → 원문 복귀 → **재풀이(`correct`)**
→ 나가기 → **재로그인**(서버에서 그대로 복원: 제출 2회 · 첫 wrong → 마지막 correct · 확인 1)
→ **강사 요약** (학생 세션으로는 403, 강사 코드로만 열림)

같이 확인한 것
- 학생 payload 의 문항 칸: `problemId · typeCode · taskGoal · stem · choices · provenance`
  **정답·해설 경로·저장소 경로 없음** (허용 목록 그대로)
- `answer` 가 나오는 자리는 **학생이 낸 답**뿐 (`attempt.answers[*]`), `problem` 안에는 없음
- `/api/learning/first-set` 을 강사 쿠키 없이 부르면 **403**

## 시험

| 항목 | 122db1 | 042 |
|---|---|---|
| twin | **906 / 906** | **906 / 906** |
| 내 경로 타입 오류 | **0** | **0** |
| `next build` | exit 0 | exit 0 |
| 새 route | — | `/api/learning/{act,first-set,session,teacher}` · `/learning` · `/learning/teacher` · `/teacher/learning-first-set` 모두 출력에 있음 |

새 시험 6개 (U1~U6): 모드 차단 제거·토큰 전달 / 확인문항 그림 / 유튜브가 본 초를 안 만듦 /
서버가 `window_elapsed` 를 미측정으로 적음 / 화면·API 원장 전용·메뉴·매뉴얼 / 정답은 원장에게만.

## 겪은 것 — 기록해 둔다

### `apiFetch` 를 그대로 쓰면 학생 화면이 하얗게 빈다

`lib/apiFetch.ts` → `lib/supabase.ts` 가 **모듈 최상단에서** `createClient(URL!, KEY!)` 를
부른다. 설정이 없으면 화면이 뜨기도 전에 던진다. 로컬 체험판에는 설정이 **일부러** 없다.
→ `lib/learning/clientFetch.ts` 가 **동적 import + try/catch** 로 그것만 다르게 한다.
하는 일(토큰 붙이기)은 같다. 브라우저에서 실제로 확인했다.

### 가드 훑기를 내 주석이 눈멀게 할 뻔했다

「이 경로에 왜 직원 인가가 없는가」를 주석으로 적으면서 `denyIfNotStaff` 를 썼더니,
safe-change §4 의 훑기(`grep -qE 'denyIfNotStaff|staffOrDeny'`)가 그 두 파일을
**더 이상 집어내지 못하게** 됐다. 설명이 검사를 가린 것이다.
→ 주석에서 그 **이름**을 빼고, 왜 뺐는지까지 적어 두었다.

### 042 의 Sidebar·매뉴얼은 내 것보다 새롭다

줄 단위로 먼저 견줬다 (메모리 규칙 「고치기 전 fetch·사본 차이」).
042 에는 수업 시각화 · 학교 자료집 · 시험지 분석 · QR 채점 · 출결관리 · 변경 기록 메뉴와
훨씬 자세한 매뉴얼이 있었다. 덮었으면 **원장님 작업이 사라졌다.**
→ 042 판을 두고 내 줄만 더했다. 더한 뒤 042 의 기존 항목이 그대로 있는지 다시 셌다.

## 남은 문제

1. **운영 DB 에 아직 붙지 않았다.** 브라우저로 돈 것은 **로컬 체험판**이다.
   운영 경로는 합성 SDK 로만 완주했다.
2. **승인 명세가 비어 있다.** 그래서 영상이 학생에게 나가지 않는다.
   이제 화면에서 눌러 만들 수 있다 — 원문·영상·확인문제를 보고 판단만 하시면 된다.
3. **첫 세트 확인 화면은 실제 로그인이 있어야 열린다** (`app/teacher` 의 AccessGate).
   이 작업 트리에는 운영 키가 없어 **브라우저로는 열어 보지 못했다.**
   API 는 강사 쿠키로 돌려 응답 모양을 확인했고, 빌드 출력에 화면이 들어 있다.
   원장님 환경에서 한 번 열어 봐 주셔야 한다.
4. 유튜브는 **본 구간을 재지 못한다.** 창이 열려 있던 시간만 남는다.
5. **「기존 배정」이 저장소 구조와 어긋난다** (D-157). 아직 안 푼 과제는 잡히지 않는다.
