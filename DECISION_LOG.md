# 결정 기록 (DECISION_LOG)

> DB 또는 기능을 바꿀 때마다 여기에 적는다. **무엇을 · 왜 · 되돌리는 법**을 반드시 포함한다.
> 최신 것이 위로 온다.
>
> **D-번호 대장은 `docs/AI_QUESTION_APP_DECISION_LOG.md` 다.**
> 새 D 번호는 그 파일에 등록하고, 여기에는 회차별 작업과 되돌리기 절차를 적는다.

---

## 2026-09-27 — 질문웹앱 이름 확정 + 전체 역할 구조 설계 (D-114~D-117)

**무엇을**
- `docs/AI_QUESTION_APP_DECISION_LOG.md`에 D-114~D-117 신규 추가
- **D-114** 질문웹앱 이름을 **씽크체크(ThinkCheck)**로 확정
- **D-115** 학생 / 씽크체크 / 스터디체크 / 강사(사람) 4층 역할 구조 확정
  - 씽크체크 = 학습 중 실시간 힌트 조력 (그 순간의 막힘)
  - 스터디체크 = 플로우 배정·데이터 수집·과제 자동 매칭·이상 감지 (누적 관리)
  - 강사 = 현장 관리·정서적 라포·예외 대응·학부모 소통·방향 승인 — 프로그램이 못 하는 것만
- **D-116** 스터디체크의 플로우 자동조정은 완전자동이 아니라 **강사 확인·승인 후 확정**
- **D-117** 학생별로 **"휴먼터치 비중"**을 다르게 설정할 수 있게 설계 (저학년·의지 약한 학생은 사람 개입 비중↑)
- `GPT_BRIEF_ROLES.md` 신규 (루트) — 위 내용을 GPT에 붙여넣을 수 있게 정리한 별도 브리핑

**왜**
원장님의 궁극적 목표는 완전한 자기주도학습 체제이고, 강사 인건비를 최소화하기 위해
학습관리(태도·분석·성향·과제·속도) 전부를 프로그램이 맡는 큰 그림을 잡았다. 그 안에서
"그럼 사람(강사)은 뭘 하나"가 정의되지 않으면 씽크체크·스터디체크 각각의 기능 범위를
설계할 수 없어, 대화로 역할을 먼저 확정했다. 완전자동 대신 강사 승인 게이트를 둔 것과
학생별 휴먼터치 비중을 둔 것은 모두 원장님이 직접 판단해 확정한 사항이다.

**되돌리는 법**
문서만 변경. `docs/AI_QUESTION_APP_DECISION_LOG.md`의 D-114~D-117 항목 삭제 +
`GPT_BRIEF_ROLES.md` 삭제. 코드·DB 변경 없음.

**DB 변경** 없음

## 2026-09-23 — GPT-EXEC-005: 검수 결함 수정 (D-055가 핵심)

**가장 중요한 수정 — 교사 수정 승인이 막혀 있었다 (D-055)**
이전 CHECK 제약 `(format_validation_passed or status = 'rejected')` 때문에,
교사가 문항을 고쳐 승인하면 `approved` + `format_validation_passed=false` 조합이 되어
**제약 위반으로 승인이 실패**했다. 설치 후 검증도 수정 없이 승인하는 경로만 시험해 못 잡았다.
→ 상태별 `case` 제약으로 재작성해 교사 수정 승인을 정식 상태로 허용했다.

**무엇을**
- 결정로그 **D-055~D-062** 반영
- `docs/sql/쌍둥이_설치.sql` — 상태별 불변식, 사후 거부 시 `teacher_approved=false`,
  `pronargs=0` 확인, 목록에 `source_fingerprint` 반환
- `docs/sql/쌍둥이_설치전_점검.sql` — `to_regclass`·`to_regprocedure` 로 재작성 (없는 테이블에도 안전)
- `docs/sql/쌍둥이_설치후_검증.sql` — 전면 재작성. psql 변수 제거, 모든 실패가 `raise exception`,
  정확한 오류 코드 확인, 교사 수정 승인·다른 배치 시나리오 추가
- `docs/sql/쌍둥이_롤백.sql` — `cascade` 완전 제거
- `lib/twin/repository.ts` — **Zod 엄격 파싱** + **Admin/Server 저장소 분리**
- `lib/twin/mode.ts`·`publish.ts`·`fixtures.ts`·API·화면 동기화
- `lib/twin/repo.test.ts` — 전면 재작성
- `TWIN_PIPELINE_REVIEW_BUNDLE_005.zip` · `CLAUDE_RESULT_005.md`

**되돌리는 법**
`git checkout -- .` + 신규 파일 삭제. 저장소 코드만 바뀌었고 DB·배포는 건드리지 않았다.

**DB 변경** 없음. 읽기 전용 select 2건만 실행했다 (사전 호환성 확인).

## 2026-09-23 — GPT-EXEC-004: 검수용 원문 묶음 제출

**무엇을**
- `TWIN_PIPELINE_REVIEW_BUNDLE_004.zip` 신규 (56,562 bytes, 19항목)
- `CLAUDE_HANDOFF_004.md` 신규

**왜**
GPT Work 가 결과 요약만 받았고 최종 SQL·코드 원문을 직접 검수하지 못한 상태였다.
운영 DB 실행 전에 원문을 그대로 넘겨 검수받기 위한 묶음이다.

**코드·문서를 하나도 고치지 않았다.** 저장소에서 그대로 복사하고 `diff -r` 로 차이 0을 확인했다.

**보고한 것 — 롤백 SQL 58행의 `cascade`**
§143 점검에서 발견했다. 분석상 이 기능이 만든 FK 제약 하나만 지우므로 안전하지만,
`cascade` 는 실행해 봐야 무엇이 딸려 지워지는지 안다. **§30 에 따라 고치지 않고 보고**하고
대안(제약을 먼저 명시적으로 drop)을 제시했다. GPT 판단 대기.

**되돌리는 법**
ZIP 과 `CLAUDE_HANDOFF_004.md` 삭제. 저장소 코드는 변경되지 않았다.

**DB 변경** 없음. 이번 명령에서는 **운영 DB 조회조차 하지 않았다.**

## 2026-09-23 — GPT-EXEC-003: SQL 안전성 결함 7건 수정

**무엇을**
- 결정로그 **D-049~D-054** 반영
- `docs/sql/쌍둥이_설치.sql` **신규** (`쌍둥이_private_스키마.sql` 대체) —
  전용 스키마 `ai_question_private`, 한 트랜잭션, 사전검사 블록, RPC 8개, CHECK 불변식
- `docs/sql/쌍둥이_설치전_점검.sql` **신규** (읽기 전용)
- `docs/sql/쌍둥이_설치후_검증.sql` **신규** (begin ... rollback)
- `docs/sql/쌍둥이_롤백.sql` 재작성
- `lib/twin/repository.ts`·`fixtures.ts`·검수 화면·테스트 동기화

**고친 결함 7건 중 특히 중요한 셋**
1. 안전 승인을 꺼도 게시된 자산이 살아남던 문제 → 같은 트랜잭션에서 자동 게시취소
2. 승인 후보를 거부해도 예제가 살아남던 문제 → `retired` 신설, 자산 즉시 비활성
3. **`auth.uid()` 를 `public.users(id)` FK 에 걸던 것** → 운영 DB 확인 결과
   `auth.users` 257행 / `public.users` 11행이라 위험했다. FK 제거하고 `*_by_auth_uid` 로 명명

**되돌리는 법**
문서·코드만 변경. `git checkout -- .` + 신규 SQL 3개와 `CLAUDE_RESULT_003.md` 삭제

**DB 변경** 없음. **읽기 전용 select 2건만** 실행했다 (사전 호환성 확인).

## 2026-09-23 — GPT-EXEC-002 REV.2: RPC 저장 계층 연결

**무엇을**
- 결정로그 **D-046~D-048** 반영
- `docs/sql/쌍둥이_private_스키마.sql` — **RPC 8개 추가** (관리자 6 + 서버 2), 권한 분리, 생성 키 제약
- `docs/sql/쌍둥이_롤백.sql` — 함수 → 테이블 → 스키마 순으로 보강
- `lib/twin/repository.ts` — **`SupabaseTwinRepository` 신규**, RPC 응답 파서, fixture 를 새 계약에 맞춤
- `lib/twin/mode.ts` — **신규.** production fail-closed
- `lib/twin/repo.test.ts` — **신규.** 테스트 28개
- API 저장소 주입부 교체, 화면을 예제 id 기반으로 수정

**설계의 핵심**
`is_admin()` 이 `auth.uid()` 기반이라 **service-role 로 부르면 자동으로 false** 가 된다.
관리자 동작을 service-role 로 우회하려는 시도가 DB 차원에서 막힌다.
`createAdminRepository` 는 service 클라이언트를 아예 넣지 않아 코드에서도 한 번 더 막는다.

**계약 조정 2건** (추정이 아니라 RPC 시그니처를 따른 것)
- `publish(candidateId)` → `setPublication(practiceProblemId, publish)`
- `approve(id, reviewerId)` → `approve(id, edits)` → 예제 id 반환.
  `reviewerId` 를 받지 않는다 — RPC 가 `auth.uid()` 로 읽으므로 위조 불가

**되돌리는 법**
`git checkout -- .` + `lib/twin/mode.ts` `lib/twin/repo.test.ts` `CLAUDE_RESULT_002.md` 삭제

**DB 변경** 없음. **읽기 전용 select 1건만** 실행했다 (`is_admin`·`is_staff` 시그니처 확인).

## 2026-09-23 — GPT-EXEC-001 REV.2 완수 (완료 기준 12/12)

**무엇을**
- 결정로그 **D-043~D-045** 반영 (제작 대상 전부 공통수학1 / 프롬프트 v1.1 / 의존성 사후 승인)
- 프롬프트 **v1.1 신규** (`twin-gen-v1.1`·`twin-review-v1.1`). v1.0은 대체 표시만 하고 보존
- 코드 신규: `repository.ts`(인터페이스 + fixture) · `fixtures.ts` ·
  `app/api/twin/review/route.ts` · `app/teacher/twin-review/page.tsx`
- 테스트 32 → **38개** (상태 전이 6개 추가)
- `CLAUDE_RESULT_001.md` 전면 갱신, `CLAUDE_BLOCKER_001.md` 해소 표시

**파일럿 유형 확정 — 표본을 실제로 열어 봤다**
REV.2 §217이 그림 의존 유형의 표본 확인을 요구했다. 의심되던 3개 유형의 원문 6개를
**로컬 이미지로 직접 확인**한 결과 **전부 순수 텍스트**였다.
유형명의 "수형도"·"근의 분리"는 푸는 방법이지 문항의 그림이 아니었다.
→ 내가 앞서 제기한 우려는 근거가 없었고, **10개 유형을 교체 없이 확정**했다.

**되돌리는 법**
`git checkout -- .` + 신규 파일 삭제 (`lib/twin/` `prompts/` `app/api/twin/` `app/teacher/twin-review/`
`CLAUDE_*.md` `docs/sql/쌍둥이_롤백.sql`) + `npm uninstall zod openai tsx`

**DB 변경** 없음. **읽기 전용 select 만** 실행했다. 표본 이미지는 로컬 파일로 확인했다.

## 2026-09-23 — GPT-EXEC-001 수행: 파이프라인 코드 구현 (A~E 완료, F·G 중단)

**새 작업 규칙 — `GPT_EXEC_###` 체계 (GPT-EXEC-001 §13)**
- `CP-###` = 기획·결정 문서. **그 자체로 실행명령이 아니다**
- `GPT_BRIEF(###)` = Claude의 보고. 실행명령이 아니다
- **`GPT_EXEC_###` = 실행명령. Claude가 작업을 시작할 수 있는 유일한 문서**
- `CLAUDE_RESULT_###` / `CLAUDE_BLOCKER_###` = 수행 결과 / 중단 보고
- 실행명령이 없으면 읽기·조사·제안만 하고 코드를 고치지 않는다
- 범위를 넘어서는 개선을 임의로 함께 구현하지 않는다
- 실제 코드·DB가 명령의 전제와 다르면 **우회하지 않고 중단 보고**한다

**무엇을**
- 코드 신규: `lib/twin/` 에 `flags · targets · source · generate · verify · review · publish · twin.test`
- 프롬프트: `prompts/twin-review-v1.0.md` 분리 (내용 무수정)
- SQL: 플래그 5종 칼럼 추가, `docs/sql/쌍둥이_롤백.sql` 신규, 구 SQL 폐기 표시
- 문서: 설계 문서 전면 재작성, 결정로그 D-022 → `SUPERSEDED BY D-032`, 수량 179~358로 통일
- 보고: `CLAUDE_RESULT_001.md`, `CLAUDE_BLOCKER_001.md`

**설계의 핵심 — 안전장치를 타입으로 걸었다**
`AiReviewVerdict` 타입에 `independent_check_passed` 필드를 **아예 만들지 않았다.**
`review.ts` 가 그 값을 만들 수 없으므로 AI 합의가 독립 검산으로 승격되는 일이 구조적으로 불가능하다.
`canAutoApprove()` 의 반환 타입은 `false` 다 — 자동 승인 경로가 타입상 존재하지 않는다.

**의존성 추가** `zod@4.6.5`, `openai@7.22.0`, `tsx@4.23.15`(dev).
`tsx` 는 완료 기준 10(테스트)을 채우기 위해 §1의 "로컬 테스트·빌드 허용" 범위로 판단해 넣었다.
되돌리기: `npm uninstall zod openai tsx`

**중단한 것 (CLAUDE_BLOCKER_001)**
1. **작업 G** — 파일럿 "중1 3·중2 4·중3 3" 구성 불가. 쌍둥이 없는 179개 유형이 **전부 고등**이다
2. **작업 F** — `private` 스키마가 PostgREST에 노출되지 않아 `supabase-js` 로 접근할 수 없다.
   SECURITY DEFINER RPC 경유를 제안했으나 **함수 시그니처는 GPT Work가 정해야** 한다

**되돌리는 법**
`git checkout -- .` + `lib/twin/` `prompts/` `CLAUDE_*.md` `docs/sql/쌍둥이_롤백.sql` 삭제 +
`npm uninstall zod openai tsx`

**DB 변경** 없음. **읽기 전용 select 만** 실행했다.

## 2026-09-23 — CP-008 반영 + 작업 순서 변경(D-042) + 의존성 설치

**원장님 지시 — 일의 순서가 바뀌었다 (D-042)**
> "기획은 GPT가 하니 실행 명령도 GPT가 내려라. 그 내용을 보고 Claude Code가 움직이게 하자."

Claude가 먼저 SQL을 만들어 실행까지 갔다가 CP-007 §9의 "아직 실행하지 마세요"와 어긋나
같은 테이블을 두 번 만든 일이 계기다. `AGENTS.md`에 규칙으로 기록했다.
**단, 만들고 검증하고 충돌을 보고하는 일은 계속한다** — GPT는 저장소·운영 DB를 볼 수 없다.

**무엇을**
- `docs/AI_QUESTION_APP_CP008.md` 신규
- `docs/AI_QUESTION_APP_DECISION_LOG.md` — **D-039~D-042 반영**
- `docs/sql/쌍둥이_private_스키마.sql` — D-040·D-041 반영
  (`safe_approved_by`·`safe_approved_at`, `published_by`·`published_at`,
   `ai_practice_problems.status ∈ (approved, published)`)
- `AGENTS.md` — 「일의 순서」 규칙 추가
- `GPT_BRIEF.md` — CP-007·CP-008 회신. **§8 「실행 승인 요청」을 고정 항목으로 신설**

**의존성 추가  ⚠ 사후 보고**
`npm install zod openai` 실행 → `zod@4.6.5`, `openai@7.22.0` (`package.json` 변경됨).
CP-008 §146이 "Zod 스키마"와 "생성 호출 모듈"을 승인 범위에 넣어 그 전제로 설치했으나,
**원장님이 D-042를 지시하시기 직전이었다.** 앞으로 의존성 추가는 GPT 지시 후에 한다.
되돌리기: `npm uninstall zod openai`

**되돌리는 법**
문서·설정만 변경. `git checkout -- AGENTS.md GPT_BRIEF.md docs/AI_QUESTION_APP_DECISION_LOG.md
docs/sql/쌍둥이_private_스키마.sql package.json package-lock.json` + `npm uninstall zod openai`

**DB 변경** 없음. 이번 턴에는 DB 조회도 하지 않았다.

## 2026-09-23 — CP-007 반영: private 스키마 전환, 프롬프트 수령, 파일럿 유형 선정

**무엇을**
- `docs/AI_QUESTION_APP_CP007.md` 신규 (GPT 원본)
- `docs/AI_QUESTION_APP_DECISION_LOG.md` — **D-032~D-038 반영**
- `docs/sql/쌍둥이_private_스키마.sql` 신규 — **미실행.** 앞서 만든 `public.twin_candidates`를 지우고
  `private.twin_candidates` + `private.ai_practice_problems` + `public.type_learning_assets`로 재구성
- `prompts/twin-gen-v1.0.md` 신규 — GPT Work의 생성·검토 프롬프트 원문 보관 (**내용 수정 없음**)
- `lib/twin/schema.ts` 신규 — **첫 앱 코드.** Zod Structured Outputs 스키마 + 형식 검증기
- `GPT_BRIEF.md` — CP-007 회신

**왜**
CP-007이 생성 프롬프트를 전달하고 D-032~D-038을 확정했다. 막혀 있던 생성부를 만들 수 있게 됐다.

**DB 관련 — 되돌려야 할 것이 생겼다**
CP-007 §9가 "SQL을 아직 실행하지 말라"고 했으나 **직전 세션에서 이미 실행됐다.**
`public.twin_candidates`가 존재한다. 행이 0개라 손실은 없고, 새 SQL 맨 앞에서 `drop` 후 재생성한다.

**설계가 두 번 뒤집혔다 (GPT 지적이 맞다)**
1. D-034 — 승인 문항을 `problems`에 넣는다던 내 설계를 폐기했다.
   `problems`에 **텍스트 본문을 담을 칼럼이 없다.** `book='AI쌍둥이'`만으로는 표시·인쇄가 깨진다
2. D-035 — `public` + RLS 대신 **`private` 스키마 + 서버 전용 접근**으로 바꿨다. 더 안전하다

**내 보고가 틀렸던 것 — 모델명**
CP-002 회신에서 `gpt-6-astra`/`gpt-6-sol`을 "확인 불가"라고 보고했으나 **공식 문서에 실재한다.**
지식 기준일 이후 모델이었다. D-036 기본값을 그대로 쓴다.

**되돌리는 법**
문서·코드만 변경(DB 미변경). 신규 4개 파일 삭제 + `git checkout -- GPT_BRIEF.md docs/AI_QUESTION_APP_DECISION_LOG.md`.

**DB 변경** 없음. 읽기 전용 SELECT 5건만 실행했다.

## 2026-09-23 — ★ 운영 DB 변경: `twin_candidates` 테이블 생성 + CP-006 반영

### DB 변경  ⚠ 실제로 운영 DB가 바뀐 첫 항목이다

**무엇을** — `public.twin_candidates` 테이블 신설 (원장님이 Supabase SQL Editor에서 직접 실행, D-012 절차)

- 칼럼 31개 / FK 3개 (`problems` 2, `users` 1) / 인덱스 6개
- **RLS 켜짐.** 정책 2개 — `SELECT: is_staff()`, `UPDATE: is_admin()`
- INSERT·DELETE 정책은 **만들지 않았다.** 생성·삭제는 서버 API(service_role)로만 한다
- 상태 전이(CP-006 §6): `generated → auto_validated → pending_review → approved → published`, 거부는 `rejected`

**기존 테이블은 전혀 건드리지 않았다.** `problems`·`students`를 참조만 한다(FK).

**실행 후 검증** (읽기 전용 조회)

| 확인 | 결과 |
|---|---|
| 테이블 | 존재, 칼럼 31개, 행 0 |
| RLS | 켜짐 |
| 정책 | `SELECT → is_staff()` / `UPDATE → is_admin()` — 학생은 `is_staff()`가 false라 못 읽는다 |
| FK | 3개 정상 |

**되돌리는 법**

```sql
drop table if exists public.twin_candidates;
```

이 한 줄이면 원상복구된다. 기존 테이블에는 영향이 없다. **후보 데이터가 들어간 뒤라면
승인되어 `problems`로 복사된 문항(`book='AI쌍둥이'`)은 별도로 지워야 한다.**

### 문서 변경 (CP-006)

- `docs/AI_QUESTION_APP_CP006.md` 신규
- `docs/AI_QUESTION_APP_DECISION_LOG.md` — **D-024~D-031 추가.** 번호 충돌 정리
  (CP-005의 D-022 → D-024 승계, Claude 제안 D-023 → D-025 확정)
- `docs/힌트그래프_스키마.md` — **v1.1.** `support_level` 단일 숫자를 `strategy`/`attempt_count`/`stuck_score`로
  분리(D-031), 판정 5갈래(D-029), `stuck_score` 가중치(D-030), `mode.known_answer` 노드(D-028)
- `docs/sql/쌍둥이후보_테이블.sql` — CP-006 상태 전이로 수정 후 실행
- `GPT_BRIEF.md` — CP-006 회신

**왜** — CP-006이 D-024~D-031을 확정하고 파이프라인 계속 진행을 지시했다.
후보 테이블은 프롬프트 없이도 만들 수 있는 부분이라 먼저 처리했다.

## 2026-09-23 — CP-005 반영: 쌍둥이 제작 설계안 + 후보 테이블 SQL

**무엇을**
- `docs/AI_QUESTION_APP_CP005.md` 신규 (GPT 원본)
- `docs/쌍둥이제작_설계.md` 신규 — CP-005 요청 설계안 5건
- `docs/sql/쌍둥이후보_테이블.sql` 신규 — `twin_candidates` 생성 SQL (**미실행**)
- `GPT_BRIEF.md` — CP-005 회신으로 전면 교체

**왜**
CP-005가 D-022를 확정하고(GPT Work=수학 내용 / Claude=시스템 / 교사=승인) 설계안 5건을 요청했다.
CP-005가 "대량 생성 코드는 작성하지 말고 설계안 먼저"라고 명시해 **코드는 쓰지 않았다.**

**제작 범위가 크게 줄었다 (D-022 재산정)**
`twin_id`를 유형 단위로 집계한 결과 **903개 유형이 이미 쌍둥이를 갖고 있었다.**
쌍둥이가 전혀 없는 유형은 190개뿐이고, 그중 `answer_text`가 있어 검산 가능한 것은 **179개**다.
D-018·D-016이 유형 단위로 동작하므로 제작 대상은 **179~358문항**이다 (기존 추정 1,093~2,186의 약 1/6).

**설계의 핵심 결정 두 가지**
1. **승인된 것만 `problems`에 넣고, `book='AI쌍둥이'`로 구분한다.** `problems`에 칼럼을 추가하지 않는다.
   학습지 출제·문제은행 화면이 `book`으로 교재를 고르므로 **검수 안 된 문항이 인쇄 시험지에
   섞여 나가는 사고가 구조적으로 막힌다.**
2. **자동 검산을 통과해도 `approved`로 바로 가지 않는다.** `ready_for_review`까지만 간다.
   CP-005 불변 원칙("생성 즉시 학생에게 공개하지 않는다")을 지키려면 승인은 사람이 눌러야 한다.

**되돌리는 법**
문서만 변경. 신규 3개 파일 삭제 + `git checkout -- GPT_BRIEF.md`.
SQL은 아직 실행하지 않았다. 실행 후 되돌리려면 `drop table if exists public.twin_candidates;`.

**DB 변경** 없음. 읽기 전용 SELECT 4건만 실행했다 (유형별 쌍둥이 집계, 함수·타입·PK 확인).

## 2026-09-23 — CP-003 반영, 쌍둥이 제작 범위 확정(D-022), MVP 범위 제안(D-023)

**무엇을**
- `docs/AI_QUESTION_APP_CP003.md` 신규 (GPT 원본)
- `docs/AI_QUESTION_APP_DECISION_LOG.md` — D-014 `REJECTED`, D-015~D-020 추가,
  **기존 D-015(모델 선택)를 D-021로 번호 이동** (CP-003이 D-015를 재사용해 충돌),
  D-022·D-023 추가
- `docs/AI_QUESTION_APP_CLAUDE_HANDOFF.md` — 하루 5개 / 전체 풀이 공개 / 영상 필수 흐름 /
  `students.session_uid` 직접 비교 **4건 모두 교체**. 잔존 0건 확인
- `docs/힌트대화_예시.md` — 즉시 보충 루프 예시 2건 추가 (실제 문항 id 5479 · 3994)
- `GPT_BRIEF.md` — CP-003 회신으로 전면 교체

**왜**
CP-003이 D-014를 폐기하고 D-015~D-020을 확정했으며 문서 반영과 산출물 4건을 요청했다.
작업 중 운영 DB에서 MVP 범위를 바꾸는 사실을 발견했다 (아래).

**원장님 결정 (D-022)**
쌍둥이 없는 문항에 대해 처음에는 문항당 3개씩(42,576문항)을 검토하셨으나,
조회 결과 **99.8%가 같은 유형 문항을 5개 이상 보유**하고 완전 고립은 5개뿐이었다.
검수 인력도 감당 불가여서 **유형당 1~2개(1,105~2,210문항)** 로 확정하셨다.

**Claude 제안 (D-023, 확정 대기)**
`answer_text`가 있는 문항이 **11,475개(51.6%)뿐**이다. `answer_kind='image'` 10,159개와
`null` 608개는 정답 텍스트가 0개다. 이 문항들은 서버 판정·누출 검사·비교 채점이 **전부 불가능**하다.
→ MVP 대상을 `answer_text` 보유 문항으로 한정하자고 제안했다.

**되돌리는 법**
문서만 변경. `git checkout -- docs/AI_QUESTION_APP_DECISION_LOG.md docs/AI_QUESTION_APP_CLAUDE_HANDOFF.md
docs/힌트대화_예시.md GPT_BRIEF.md` + `docs/AI_QUESTION_APP_CP003.md` 삭제.

**DB 변경** 없음. 읽기 전용 SELECT 4건만 실행했다.

## 2026-09-23 — CP-002 반영, 산출물 2건 작성, 코워크 인수인계 신설

**무엇을**
- `docs/AI_QUESTION_APP_CP002.md` 신규 (GPT 체크포인트 원본)
- `docs/힌트그래프_스키마.md` 신규 — `private.problem_hint_graphs.graph` JSON 스키마 v1.0 초안
- `docs/힌트대화_예시.md` 신규 — 유형 `중2-1-09-09` 기준 분기형 대화 4갈래
- `GPT_BRIEF.md` 전면 교체 — CP-002 회신 (DB 불일치 + 산출물 2건 + E-1 재질의)
- `COWORK_BRIEF.md` 신규 — Claude Cowork에 에이전트 역할을 맡기기 위한 전체 인수인계

**왜**
CP-002가 C-1·C-2·C-4·C-5를 수용했고 산출물 2건을 요청해 왔다. 작성 전에 **운영 DB를 직접 조회**해
CP-002 스키마가 실제와 맞는지 확인했고, `problems.id`가 `bigint`인데 CP-002는 `uuid`로 쓰고 있어
그대로 실행하면 마이그레이션이 실패하는 것을 발견했다.
또한 원장님이 Cowork에 에이전트 역할을 맡기시므로, 맥락 없이 바로 이어받을 수 있는 파일이 필요했다.

**스키마 설계의 핵심 결정** — 힌트 그래프에 **정답을 담지 않는다.**
노드를 `say`(학생에게 나가는 것) / `check`(서버 전용 판정)로 나누고, 서버는 `say`만 직렬화한다.
정답은 `problems.answer_text`에만 두고 서버가 그때그때 읽는다(`accept_from`).
그래프가 통째로 유출돼도 정답이 새지 않게 하려는 것이다.

**되돌리는 법**
문서만 변경. 신규 5개 파일 삭제 + `git checkout -- GPT_BRIEF.md`.

**DB 변경** 없음. **읽기 전용 SELECT만 실행**했다 (`information_schema` 3건, `standard_types` 조인 1건).

## 2026-09-23 — GPT 확정본(CP-001) 수령, 기준 문서 교체

**무엇을**
- `docs/AI_QUESTION_APP_CLAUDE_HANDOFF.md`, `docs/AI_QUESTION_APP_DECISION_LOG.md` 신규 (GPT·원장님 확정본)
- **설계 기준 문서를 교체했다.** `docs/QUESTION_APP_STANDARD.md`(내 초안) → 위 핸드오프
- `docs/QUESTION_APP_STANDARD.md`를 재작성 — 핸드오프를 가리키고, **핸드오프에 없는 것만** 담는다.
  즉 코드·DB 현실과의 충돌(A-1~A-5)과 기술 검토(B). 결정 번호는 GPT의 `D-001~` 체계로 통일
- `GPT_BRIEF.md`를 CP-001 회신으로 전면 교체 (검토 결과 + 해소 요청 C-1~C-5)

**왜**
원장님이 GPT와 확정한 CP-001이 도착했다. 핸드오프 §9가 문서 우선순위를 정하는데
내 초안(`QUESTION_APP_STANDARD.md`)은 4순위 「기존 설계문서」로 내려간다.
같은 내용을 두 군데 두면 반드시 어긋나므로, 내 초안에서 중복을 걷어내고
**핸드오프가 알 수 없는 것**(실제 코드·DB와의 충돌)만 남겼다.

**되돌리는 법**
문서만 변경. `git checkout -- docs/QUESTION_APP_STANDARD.md GPT_BRIEF.md` +
`docs/AI_QUESTION_APP_*.md` 두 파일 삭제. 원본은 다운로드 폴더에 있다.

**DB 변경** 없음. 핸드오프 §8에 따라 코드도 작성하지 않았다.

## 2026-09-23 — GPT 전달용 브리핑 파일 신설

**무엇을**
- `GPT_BRIEF.md` 신규 (저장소 맨 위). 통째로 복사해 ChatGPT에 붙여넣는 용도.
  상황 / 확정된 결정 D1~D11 / 현재 학습 흐름안 / 미결 항목 / 이번에 묻는 것
- `docs/질문웹앱.md`에 있던 GPT 질의문 코드블록을 삭제하고 `GPT_BRIEF.md` 포인터로 교체 (중복 제거)
- `AGENTS.md` 작업 규칙에 한 줄 추가 — 작은 결정이 생길 때마다 `GPT_BRIEF.md`를 갱신한다

**왜**
원장님이 이 대화 내용을 GPT에게 옮겨 설계를 상의하신다. 지금까지 결정이 대화와 문서 여기저기에
흩어져 있어 옮길 때마다 다시 정리해야 했다. 옮길 것 하나를 고정된 자리에 두고 누적한다.
질의문이 두 군데 있으면 반드시 어긋나므로 `docs/질문웹앱.md` 쪽은 없앴다.

**되돌리는 법**
문서만 변경. `GPT_BRIEF.md` 삭제 + `git checkout -- docs/질문웹앱.md AGENTS.md`.

**DB 변경** 없음

## 2026-09-23 — 질문 한도 폐지, 힌트 무제한으로 변경 (원장님 지시)

**무엇을**
`docs/QUESTION_APP_STANDARD.md`를 고쳤다.
- §0 「대원칙」 신설 — *힌트의 목적은 생각을 이끌어내 스스로 결론에 도달하게 하는 것. 포기하게 만드는 장치는 넣지 않는다.* 이 원칙이 다른 모든 규칙 위에 있다
- **하루 질문 한도 삭제.** §2에서 "1인당 하루 질문 수 상한" 행을 빼고 "제한 없음"으로 명시
- **힌트 2단계 고정 → 무제한.** ③④를 하나의 반복 구간으로 바꿔, 학생이 "아직 모르겠어요"를 누르면
  더 잘게 쪼갠 힌트가 계속 나오고 이전 힌트로 되돌아갈 수도 있게 했다
- **전체 풀이 게이트를 "답 2회 제출" → "1회 제출"로 완화**
- 포기 방지 장치를 흐름의 일부로 못박음 (학생이 쓴 것 인정 / 진행 표시 / 같은 자리 3회 막힘은
  선행 개념 결손 신호로 선생님에게 전달 — 학생에 대한 불이익 아님)
- §3 신설 — 비용을 학생 제한이 아닌 캐시·이미지 미전송·모델 차등·예산 경보로 잡는다
- §5에서 `question_usage`(한도 테이블)는 불필요하다고 표시. 대신 막힌 지점 테이블이 필요하다

**왜**
원장님 지적: *"질문한도를 정해두면 애들은 포기하지. 포기하지 않게 생각을 이끌어내서
스스로 결론에 도달하기 위한게 힌트의 목적인데"*

한도가 있으면 아이는 남은 횟수를 아끼려고 물어야 할 때 묻지 않는다. 그게 곧 포기다.
같은 이유로, 초안의 "힌트 2번 주고 답을 내라"도 2차 힌트로 모르는 아이에겐 막다른 길이라 함께 고쳤다.
이 지적은 원장님이 직접 하신 것이므로 작업 규칙 2의 승인에 해당한다.

**되돌리는 법**
문서 변경만 있고 코드·DB 변경은 없다. `git diff docs/QUESTION_APP_STANDARD.md`로 확인,
`git checkout -- docs/QUESTION_APP_STANDARD.md`로 직전 상태 복구.
단 되돌리면 §0 대원칙이 사라지므로, 되돌리기 전에 원장님께 반드시 확인할 것.

**DB 변경** 없음 (다만 `question_usage` 테이블을 만들 필요가 없어졌다)

## 2026-09-22 — 질문 웹앱 작업 규칙 도입

**무엇을**
- `AGENTS.md`에 「질문 웹앱 작업 규칙」 4개 항목 추가 (표준 문서 선독, 흐름·차단정책 무단변경 금지, 결정 기록, 완료 보고)
- `docs/QUESTION_APP_STANDARD.md` 신규 — 학습 흐름·정답 차단 정책 초안
- `DECISION_LOG.md`, `REPORT.md` 신규

**왜**
원장님 지시. 질문 웹앱은 "AI가 숙제를 대신 풀어주는 기계"가 되면 안 되는 앱이라,
학습 흐름과 정답 차단 정책이 작업자(사람·AI)에 따라 흔들리지 않게 문서로 고정할 필요가 있다.

**되돌리는 법**
문서 추가일 뿐 코드·DB 변경은 없다. 세 파일을 지우고 `AGENTS.md`의
`<!-- BEGIN:question-app-rules -->` ~ `<!-- END:question-app-rules -->` 구간을 삭제하면 원상복구된다.

**DB 변경** 없음

---

## 2026-10-05 — 첫 소량 생성(스모크) 준비 · 키 모양 가드 (GPT-EXEC-032)

**무엇을**
- `scripts/check-storage-sample-029.ts` — `looksLikeServiceKey()` 추가, `readConfig` 가 origin 검사
  **전에** 호출. `readConfig` 를 `export`. (해시 `baf44c90…` → `46d111f3…`)
- `lib/twin/targets.ts` — `toSourceProblem` 을 `export` (한 단어. 함수 본문 무수정)
- `lib/twin/smoke.ts` 신규 — 호출 계량기 `SmokeMeter`, 호출 상한(총 3 · 생성 1 · 검토 2),
  출력 토큰 상한, 모델 허용 목록, `maxRetries: 0` 호출부
- `scripts/run-twin-smoke-032.ts` 신규 — 원문 1건용 진입점 (계획 모드가 기본)
- `scripts/run-twin-smoke.cjs` 신규 — 로컬 tsx 만 쓰는 실행기
- `lib/twin/exec032.test.ts` 신규 — 합성 시험 49건
- `package.json` 의 `test:twin` 에 `exec032.test.ts` 추가, `lib/twin/exec017.test.ts` 수집 목록에 한 줄
- `lib/twin/exec029.test.ts` · `exec030.test.ts` — 합성 키를 7~15자에서 실제 모양(40자+)으로 교체
- 문서: `SMOKE_PLAN_032.md` · `SMOKE_RUNBOOK_032.md` · `CLAUDE_RESULT_032.md` ·
  `DB_CHECKPOINT_032.md` 신규, `GPT_BRIEF.md` 갱신

**왜**
- 키 모양 가드: **원장님 직접 지시**(032 명령서와 함께 "1"). 앞선 사고에서 가짜 키 +
  승인된 진짜 origin 조합이 통과해 운영 주소로 REST 읽기 4회가 나갔다. supabase-js 가 키를
  로컬에서 검증하지 않아 origin 검사만으로는 막히지 않는다.
- 스모크 도구: GPT-EXEC-032 §4. 운영 `createOpenAiTransport` 에 출력·시간·재시도 상한이
  하나도 없어, 그대로 켜면 비용 상한 없이 첫 유료 호출이 나간다. 기존 파일을 고치지 않고
  (030 심사 바이트 보존) 스모크가 자기 transport 로 상한을 건다.

**되돌리는 법**
- 가드만 되돌리려면: `looksLikeServiceKey` 함수와 `readConfig` 안의 그 호출 3줄을 지운다.
  그러면 `exec029`·`exec030` 의 합성 키를 짧게 되돌려도 통과하지만, 되돌릴 필요는 없다.
- 스모크 도구 전체를 되돌리려면: `lib/twin/smoke.ts` · `scripts/run-twin-smoke-032.ts` ·
  `scripts/run-twin-smoke.cjs` · `lib/twin/exec032.test.ts` 를 지우고,
  `package.json` 의 `test:twin` 에서 `lib/twin/exec032.test.ts` 를 떼고,
  `lib/twin/exec017.test.ts` 수집 목록에서 그 한 줄을 뺀 뒤 `MANIFEST.sha256` 를 다시 만든다.
  `targets.ts` 의 `export` 한 단어도 떼면 완전 원복이다.
- 기존 파이프라인·프롬프트·SQL·DB 객체는 **건드리지 않았으므로 되돌릴 것이 없다.**

**DB 변경** 없음. 운영 DB·Storage 접속 0건. 모델 호출 0회. commit·push·배포 없음.

---

## 2026-10-05 — 공통 SDK 전송 경로 통합 · 키 가드 보완 (GPT-EXEC-033)

**무엇을**
- `lib/twin/openaiSend.ts` 신규 — **유일한** 실제 SDK 전송 경로.
  역할별 모델 고정(생성 Astra·검토 Sol), `maxRetries:0`, timeout 120초,
  `max_output_tokens` 4000/2000, `baseURL` 공식 주소 고정, `detail:'high'`,
  `readUsage`(AND·비음수·정수), 중첩 refusal·incomplete 분류, `AbortGate`
- `lib/twin/generate.ts` · `review.ts` — 자기 SDK 호출부를 버리고 공통 전송기 사용.
  `client.responses.parse` 를 **메서드 호출**로 (receiver 유실 수정). `role` 전달.
  `incomplete` 결과 종류 추가. 생성 이미지에 `detail:'high'`
- `lib/twin/smoke.ts` — 전송을 공통 모듈에 넘기고 계량·예산만 담당.
  사전 금액 예약(생성 $0.320·검토 $0.036), 예산 초과 시 전송 전 중단
- `scripts/check-storage-sample-029.ts` — `looksLikeServiceKey` → `inspectServiceKeyShape`.
  publishable·anon·빈/잘린 `sb_secret_`·임의 40자 거부, legacy JWT 는 Base64URL 해독 후
  `role=service_role` 과 `ref` 대조
- `scripts/run-twin-smoke-032.ts` — 결과 분류(`classifyResult`)와 종료코드 분화,
  `detail`·`error` 원문 비출력, 승인 기록(`approvalKey`)과 실행 잠금(`.twin-smoke/`)
- `scripts/check-model-access-033.ts` + `scripts/run-model-access.cjs` 신규 —
  `GET /v1/models/{astra,sol}` metadata-only 모드 (**실행 미승인**)
- `lib/twin/exec032.test.ts` 개정(53건) · `lib/twin/exec033.test.ts` 신규(25건)
- `lib/twin/twin.test.ts` — live 잠금 시험을 새 분류 코드 계약에 맞춤
- `package.json`·`lib/twin/exec017.test.ts` — 시험 배선 한 줄씩
- 문서: `SMOKE_PLAN_033.md` · `SMOKE_RUNBOOK_033.md` · `CLAUDE_RESULT_033.md` ·
  `GPT_BRIEF.md` 갱신 · `SDK_CONTRACT_LOG_033.txt`

**왜**
GPT_REVIEW_032 가 네 가지 결함을 지적했고 **전부 사실로 확인됐다.**
- `client.responses.parse` 를 변수로 떼어내 설치된 openai 7.22.0 에서 **fetch 전에 TypeError**.
  즉 032 코드는 첫 유료 호출이 나가지도 못했다.
- `readUsage` 가 OR 조건이어서 한쪽 값만 와도 "완전 확인"이 되고 다른 쪽 합계를 **0 으로** 적었다.
  음수·비정수도 수락했다.
- 키 가드가 publishable·임의 40자·빈 접두사·`a.b.c` 를 수락했다.
- 부분 저장이 종료코드 0 이었고 모델 자유서술 거부 사유와 DB 오류 원문을 그대로 출력했다.

GPT-EXEC-033 §55 가 "최초 유료 호출 전에 전송 경로를 공통화"하라고 정했다. 미루지 않았다.

**되돌리는 법**
- 전송 통합을 되돌리려면: `lib/twin/openaiSend.ts` 를 지우고 `generate.ts`·`review.ts`·`smoke.ts`
  를 032 해시(`f0dd469d` / `046bc77a` / `2e1287cb`)로 복원한다.
  **다만 그 상태는 receiver 결함이 있어 실제 호출이 불가능하다.**
- 키 가드만 되돌리려면: `inspectServiceKeyShape` 와 `keyOk`/`keyBad` 를 지우고
  `readConfig` 의 호출 3줄을 뺀다. 032 판으로 되돌리려면 `46d111f3` 해시본으로 복원한다.
- 진입점·조회 도구를 되돌리려면: `scripts/check-model-access-033.ts`·`run-model-access.cjs`·
  `lib/twin/exec033.test.ts` 를 지우고, `run-twin-smoke-032.ts` 를 `8d6d7d67` 로 복원한 뒤
  `package.json`·`exec017.test.ts` 의 배선 한 줄씩을 떼고 `MANIFEST.sha256` 를 다시 만든다.
- `.twin-smoke/` 폴더는 실행 기록이다. 지워도 코드는 동작한다.
- SQL·DB 객체·프롬프트·검산 정책·학생 payload 는 **건드리지 않았으므로 되돌릴 것이 없다.**

**DB 변경** 없음. 운영 DB·Storage 접근 0건. 유료 모델 호출 0회. commit·push·배포 없음.

**사고 기록** — 033 §82 는 주입 fetch 로 확인하라고 했는데, 처음 한 번을 실제 네트워크로
보냈다. `POST https://api.openai.com/v1/responses` 1건, 합성 키, 401 거절, 과금 없음,
프롬프트·이미지·원문 없음. 자세한 내용은 `CLAUDE_RESULT_033.md` §0-B.

---

## 2026-10-05 — 전송 차단·실측 입력 계수·검토 실패 판정 (GPT-EXEC-034)

**무엇을**
- `test/netguard.cjs` 신규 — 시험 프로세스의 **외부 전송 차단**. `net`/`tls`/`http(s)`/`fetch`
  를 막고 로컬 IPC·loopback 만 통과. `시도`·`차단`·`전송`·`localAllowed` 를 따로 센다
- `scripts/run-twin-tests.cjs` 신규 — `NODE_OPTIONS=--require` 로 차단 장치를 **먼저** 적재한 뒤
  시험을 돌린다. 차단 장치가 없으면 시험을 돌리지 않는다. `package.json` 의 `test:twin` 이 이것을 부르고
  파일 목록은 `test:twin:files` 로 옮겼다
- `test/probes/negative034.ts` · `test/probes/sdkContract034.ts` 신규 — 묶음 안에서 돌는 탐침
- `lib/twin/openaiSend.ts` — `createInputCounter`(`POST /responses/input_tokens`),
  `ROLE_MAX_INPUT_TOKENS`, `SERVICE_TIER='default'` 를 요청에 명시,
  `outbound_blocked` 코드, 잘림 사유를 `incomplete_<reason>` 으로 남김
- `lib/twin/smoke.ts` — 단가를 **cache-write**(12.5/2.5)로, `REGIONAL_HEADROOM=1.1`,
  `reserveUsd(role, measuredInputTokens)`, `reserveCeilingUsd`,
  전송 전 `persistReservation`, 실패·미확인·초과가 **후속 유료 요청을 막도록** 연결
- `lib/twin/pipeline.ts` — `CandidateOutcome` 에 `review_status`·`review_fail_code` 추가
- `scripts/run-twin-smoke-032.ts` — `classifyResult` 가 gate·meter·검토 상태를 함께 받고
  `review_failed`(16)·`usage_unknown`(17)·`input_rejected`(18)·`recordIncomplete`(19) 분화.
  종료 기록 실패를 빈 catch 로 삼키지 않는다. 이미지 검사를 생성 전에 끼운다
- `lib/twin/imageSize.ts` 신규 — **이미 메모리에 있는 PNG** 의 IHDR 로 폭·높이·패치 수.
  네트워크 없음. 모르면 생성 전 중단
- `scripts/check-model-access-033.ts` — OpenAI **전용** 설정만 쓴다. 셸에 키가 있으면
  환경파일 0회, 없으면 `.env.openai.local` 만, 그것도 없으면 `openai_config_not_isolated`(6)
- `lib/twin/exec034.test.ts` 신규 38건 · `exec032`·`exec033` 개정 ·
  `exec007` 의 **정상** 검토 대역을 실제 스키마로 · `exec017`·`exec019` 배선
- 문서: `SMOKE_PLAN_034` · `SMOKE_RUNBOOK_034` · `CLAUDE_RESULT_034` · `CLAUDE_BLOCKER_034` ·
  `GPT_BRIEF` 갱신 · `SDK_CONTRACT_LOG_034` · `STATIC_TEST_LOG_034` ·
  `LOCAL_LAUNCH_TEST_LOG_034` · `FINAL_BUNDLE_VERIFY_034`

**왜**
GPT_REVIEW_033 의 다섯 지적이 전부 사실이었다.
- 예약이 **실제 입력과 연결돼 있지 않았다.** 지침 20만자를 넣어도 같은 금액이었다
- 필수 검토가 실패해도 저장만 되면 `complete`·exit 0 이었다
- 내가 첨부한 `SDK_CONTRACT_LOG_033.txt` 는 MODULE_NOT_FOUND 5건뿐인데 성공으로 보고했다
- 033 에서 주입 fetch 없이 실제 OpenAI 로 POST 1건을 보냈다 (승인 범위 밖 실행)
- metadata-only 도구가 공유 `.env.local` 전체를 적재해 Supabase 키까지 읽었다

**되돌리는 법**
- 차단 장치만 되돌리려면: `package.json` 의 `test:twin` 을 `tsx --test <파일들>` 로 바꾸고
  `scripts/run-twin-tests.cjs`·`test/netguard.cjs`·`test/probes/` 를 지운 뒤
  `lib/twin/exec019.test.ts` 의 `test:twin:files` 검사와 `exec034.test.ts` 의 P 묶음을 뺀다.
  **다만 그러면 시험이 외부로 나갈 수 있는 상태가 된다.**
- 계수·예산을 되돌리려면: `createInputCounter` 를 지우고 `reserveUsd` 를 1인자로,
  단가를 10/2 로, `createSmokeTransport` 의 계수 단계를 뺀다.
  **그러면 R033-01 이 다시 열린다.**
- 검토 판정을 되돌리려면: `CandidateOutcome` 의 `review_status` 2줄과
  `classifyResult` 의 `review_failed` 분기를 뺀다. `pipeline.ts` 를 033 해시(`88764239…`)로 복원.
- 조회 설정 분리를 되돌리려면: `resolveIsolatedOpenAiEnvPath` 와 분기를 지우고
  `resolveEnvFilePath` + `loadEnvFile` 로 되돌린다. **그러면 Supabase 키를 다시 읽는다.**
- 이미지 검사를 되돌리려면: `lib/twin/imageSize.ts` 를 지우고 진입점의
  `loadAndInspectImage` 를 `loadSourceImageDataUrl` 로 되돌린다.
- `.twin-smoke/` 는 실행 기록 폴더다. 지워도 코드는 동작한다.
- SQL·DB 객체·프롬프트·검산 정책·학생 payload 는 **건드리지 않았으므로 되돌릴 것이 없다.**

**DB 변경** 없음. 운영 DB·Storage 0건. 실제 키 열람 0건. 모델 조회 0회.
입력 계수 실제 호출 0회. 유료 생성 0회. 후보 저장 0행. commit·push·배포 없음.
외부 전송 **0건** (차단 장치 관측값 `escaped: 0`).

---

## 2026-10-12 — 중단 사유 최종 반영 · 실험 잠금 · 가드 분류 (GPT-EXEC-035)

**무엇을**
- `scripts/run-twin-smoke-032.ts`
  - `classifyResult` 를 "수를 먼저 세고 → 종류로 분류 → **중단 사유가 있으면 성공으로
    끝내지 않는다**" 구조로 바꿨다. `classifyStopReason` 추가.
    모르는 사유는 `aborted`(23)로 둔다.
  - 분류에 `inferenceCount`·`lastRequestUnsent` 추가. 출력에 '실제 나간 유료 추론'과
    '마지막 요청 미전송'·'중단 사유'를 적는다.
  - 종료코드 추가: `reservationExceeded` 20 · `budgetExceeded` 21 · `recordFailed` 22 ·
    `aborted` 23 · `planMismatch` 24 · `configNotIsolated` 25
  - `EXPERIMENT_ID`(고정) · `EXPERIMENT_LOCK_FILE` · `APPROVED_PLAN_KEY`(고정) 추가.
    `scanExperimentRecords` 로 `.twin-smoke/run-*.json` **전부**를 보고, 하나라도 있으면
    외부 요청 전 중단. 실험 잠금을 `wx` 로 만들어 동시 실행을 막는다.
  - OpenAI 설정을 공유 파일 적재 **전**에 셸에서 떠 두고, 공용 함수로 확보해
    sender·counter 에 **명시 전달**한다 (`apiKey: openai.apiKey`).
- `lib/twin/openaiConfig.ts` 신규 — 설정 공급 공용 모듈. 셸 우선 → 전용 파일 →
  없으면 `openai_config_not_isolated`. `scripts/check-model-access-033.ts` 도 이것을 쓴다.
- `test/netguard.cjs`
  - `classifyTarget(family, args)` — 호출 종류별 해석. HTTP 의 `path` 를 IPC 로 보지 않고
    `socketPath` 만 IPC 로 본다. 명시된 host/hostname 은 `path` 유무와 무관하게 판정.
    소켓 계열의 비-IPC 문자열은 호스트로 판정 (loopback 이 막히던 것 수정).
  - **`escaped` 필드 제거.** 갱신 코드가 없는 고정 0 을 실측처럼 보고한 것을 바로잡고
    `measurementScope` 로 측정 경계를 값과 함께 내보낸다.
- `lib/twin/exec034.test.ts` — T(실험 잠금 8건) · U(설정 공급 9건) · V(끝에서 끝까지 4건) ·
  W(사유→분류 1건) 추가. `exec032`·`exec033` 는 계약 변경에 맞춤.
- `.gitignore` — `.env.openai.local` 추가 (git·묶음 유입 차단)
- 문서: `SMOKE_PLAN_035` · `SMOKE_RUNBOOK_035` · `CLAUDE_RESULT_035` · `CLAUDE_BLOCKER_035` ·
  `GPT_BRIEF` 갱신 · 035 로그 4종

**왜**
GPT_REVIEW_034 의 세 지적이 전부 사실이었고, 증거 탐침 10건이 미충족이었다.
- **마지막 검토가 예약을 넘겨 gate 를 닫아도 CLI 는 exit 0 · complete** 였다.
- 계수 사유의 조기 반환이 **이미 저장된 후보 2개를 savedCount 0** 으로 만들었다.
- `run-<현재 키>.json` **하나만** 확인해, 승인 조건을 바꿔 키가 달라지면
  다른 키의 `in_progress`·파손·`finished`(예약 3.1) 기록을 무시하고 진행했다.
- 가드가 `https.request({hostname:'external.invalid', path:'/v1/responses'})` 의
  **HTTP path 를 IPC 로 분류**해 통과시켰다.
- 034 스모크가 공유 `.env.local` 을 적재하고 `apiKey: undefined` 를 둬
  **공유 파일이 OpenAI 키의 무언의 fallback** 이 될 수 있었다.

**되돌리는 법**
- 최종 판정만 되돌리려면: `classifyStopReason` 을 지우고 `classifyResult` 의 (3)단계를 뺀다.
  **그러면 R034-01 이 다시 열린다.**
- 실험 잠금만 되돌리려면: `EXPERIMENT_ID`·`EXPERIMENT_LOCK_FILE`·`APPROVED_PLAN_KEY`·
  `scanExperimentRecords` 와 run() 의 해당 블록을 지우고 `isFile(recPath)` 단일 검사로 되돌린다.
  **그러면 다른 승인키로 잠금을 피할 수 있다.**
- 설정 공용화를 되돌리려면: `lib/twin/openaiConfig.ts` 를 지우고 두 스크립트의 분기를
  각자 되돌린다. **그러면 스모크가 공유 파일의 값을 쓸 수 있다.**
- 가드 분류를 되돌리려면: `test/netguard.cjs` 를 034 해시(`a22dc62e…a790`)로 복원한다.
  **그러면 외부 HTTP path 가 IPC 로 분류된다.**
- `.twin-smoke/` 는 실행 기록·잠금 폴더다. 지워도 코드는 동작한다.
- SQL·DB 객체·프롬프트·검산 정책·학생 payload 는 **건드리지 않았으므로 되돌릴 것이 없다.**

**DB 변경** 없음. 운영 DB·Storage 0건. 실제 키 열람 0건. 모델 조회 0회.
입력 계수 실제 호출 0회. 유료 추론 0회. 후보 저장 0행. commit·push·배포 없음.
외부 전송 0건 (가드가 가로챈 범위 안의 수치. 패킷 실측이 아님).

---

## 2026-10-15 — 036: 설정 출처·이력 조회 실패 보완 (GPT_EXEC_036)

### 무엇을

**R035-01 — OpenAI 설정 공급** (`lib/twin/openaiConfig.ts`)

`resolveOpenAiConfig` 의 인자에서 `loadEnvFile`·`readBack` 을 **없애고** `parseEnv` 를 받는다.
전용 파일을 **적재하지 않고 내용만 읽어 Node 기본 파서(`node:util.parseEnv`)로 파싱**한 뒤
그 객체에서만 `OPENAI_API_KEY` 를 꺼낸다. `process.env` 를 보지 않는다.
실패 사유를 다섯으로 나눴다 — `not_isolated`(25) · `unreadable` · `unparsable` ·
`key_missing` · `env_parser_unavailable`(모두 4).

**R035-02 — 실행 이력 조회** (`scripts/run-twin-smoke-032.ts`)

`SmokeFs` 에 `statDir(p): DirState`(`missing`|`dir`|`not_dir`|`unknown`)를 넣고,
`listDir` 이 **오류를 삼키지 않고 던지게** 했다. `scanExperimentRecords` 는
`{ ok, state, records, reservedTotalUsd, code, detail }` 을 돌려준다.
확인 불가 → `run_history_unreadable` · **종료코드 26**. 실제 adapter 를 `nodeSmokeFs()` 로 내보냈다.

### 왜

**R035-01:** Node 의 `process.loadEnvFile` 은 **이미 있는 환경값을 덮지 않는다.**
스모크는 Supabase 설정 때문에 공유 `.env.local` 을 먼저 적재하므로, 그 파일에 OpenAI 값이
있으면 전용 파일을 적재해도 `process.env` 는 공유 값을 그대로 들고 있었다.
그래서 **"전용 파일에서 읽었다" 고 보고하면서 공유 파일의 값을 전달**했다.
공유 파일에는 Supabase service_role 키도 함께 있어 분리의 의미가 사라진다.

**R035-02:** `isDir(): boolean` 은 "없다" 와 "확인할 수 없다" 를 구분하지 못한다
(`statSync` 가 EACCES 로 던져도 `false`). 두 자리가 예외를 빈 값으로 덮어,
**과거 기록이 있고 새 실험 잠금이 없는 폴더**에 목록 오류가 생기면 새로 돌 수 있었다.
한 번만 돌려야 하는 유료 실험이므로 이것은 금액으로 직결된다.

### 되돌리는 법

둘 다 **코드 변경만이다. DB·SQL·운영 설정 변경 0건.**

```
git diff 로 다음 파일만 되돌리면 035 상태가 된다
  lib/twin/openaiConfig.ts
  scripts/run-twin-smoke-032.ts
  scripts/check-model-access-033.ts
  lib/twin/exec032.test.ts · exec033.test.ts · exec034.test.ts
  lib/twin/exec017.test.ts · exec019.test.ts   (입력 수집 목록)
  package.json  (test:twin:files 에서 exec036 제거 — 의존성은 손대지 않았다)
그리고 lib/twin/exec036.test.ts 를 지운다
```

되돌리면 035 의 두 결함이 **되살아난다.** 035 판의 사본은 세션 scratchpad 에 있으나
저장소에는 두지 않았다 (중복 파일을 만들지 않는다).

### 범위 밖 — 하지 않은 것

운영 DB·Storage 0건 · SQL 0건 · 새 D 번호 0건 · 의존성 추가 0건 · 배포·commit·push 없음 ·
모델 조회 0회 · 입력 계수 0회 · 유료 추론 0회 · 전용 설정파일 생성·열람 0건.
`openaiSend.ts`·`smoke.ts`·`pipeline.ts`·`netguard.cjs`·프롬프트·targets·설치 SQL **바이트 동일**.
승인키 `d139142ec46c81e3` 와 실험 식별 `twin-smoke-first-46284` **불변** — 계획 조건이 안 바뀌었다는 증거.

### 트랙 B — 문서만

`STUDYCHECK_LEARNING_CONTRACT_DRAFT_036.md` 를 **초안으로** 추가했다.
DB·기능 변경 0건이므로 되돌릴 것은 그 파일을 지우는 것뿐이다.

---

## 2026-10-22 — 037: 시험 수행 절차 고정 (GPT_EXEC_037 §43~§61)

### 무엇을

**코드 변경은 시험 진입점뿐이다. 운영 코드·DB·SQL 변경 0건.**

| 파일 | 무엇 |
|---|---|
| `test/bootstrap.cjs` | **신규.** netguard 적재 전후의 함수 신원을 비교해 9자리가 실제로 교체됐는지 확인하고, 아니면 `process.exit(97)` |
| `scripts/run-guarded.cjs` | **신규.** 무엇을 돌리든 `NODE_OPTIONS` 로 bootstrap 을 올려 띄우는 wrapper (`--cwd` 지원) |
| `test/guardRequired.ts` | **신규.** 탐침의 첫 import. 멈추는 시점의 앱·SDK 모듈 수를 찍는다 |
| `scripts/run-twin-tests.cjs` | netguard → **bootstrap** 으로 교체 (상수·메시지·공백 검사 4곳) |
| `test/probes/*.ts` | 첫 import 한 줄 추가 |

`test/netguard.cjs` 는 **고치지 않았다** (037 §43). 새 분류기·방화벽을 만들지 않았다.

### 왜

036 에서 옛 035 판 CLI 를 임시 폴더에서 **가드 없이** 돌려 운영 Supabase 호스트로
요청 1건이 나갔다 (P036-01). 실행기는 `--require netguard` 로 가드를 **올렸지만
올라갔는지 확인하는 자리가 없었고**, 손으로 띄운 CLI 에는 아무것도 없었다.
그리고 탐침의 `__NETGUARD__` 확인은 **SDK 가 이미 적재된 뒤**에 돌았다.

"합성 폴더 + 가짜 키 = 격리" 라는 내 판단이 틀렸다. **둘 다 전송 차단기의 대체물이 아니다.**

### 되돌리는 법

```
지우면 037 이전 상태가 된다
  test/bootstrap.cjs
  test/guardRequired.ts
  scripts/run-guarded.cjs
  lib/twin/exec037.test.ts
되돌리면 037 이전 상태가 된다
  scripts/run-twin-tests.cjs       (BOOTSTRAP → GUARD 로 4곳)
  test/probes/negative034.ts       (첫 import 한 줄 제거)
  test/probes/sdkContract034.ts    (같음)
  lib/twin/exec017.test.ts         (목록에서 exec037 제거)
  package.json                     (test:twin:files 에서 exec037 제거 — 의존성은 손대지 않았다)
```

되돌리면 **손으로 띄운 탐침·옛 판 CLI 가 다시 가드 없이 돈다.**

### 운영 실행을 막지 않는다

`run-twin-smoke-032.ts`·`check-model-access-033.ts` 는 `guardRequired`·`__NETGUARD__` 를
import 하지도 보지도 않는다 (시험 Z14 가 단정한다). **승인된 실제 실행은 wrapper 없이 돈다**
(037 §61). 시험 경로의 보호와 운영 실행 승인은 별개다.

### 보존 확인

037 §145 의 일곱 파일 **전부 바이트 동일** — `openaiConfig.ts` `b819b1a9` ·
`run-twin-smoke-032.ts` `9c0d0c0f` · `check-model-access-033.ts` `d782077f` ·
`openaiSend.ts` `b2806e53` · `smoke.ts` `305885c6` · `pipeline.ts` `7df7015d` ·
`netguard.cjs` `b4b1d991`. 승인키 `d139142ec46c81e3` 불변.

### 트랙 B — 문서만

`STUDYCHECK_LEARNING_CONTRACT_DRAFT_037.md`(`0.1-draft`)와
`OPENAI_LOCAL_PREPARATION_037.md` 를 추가했다. **DB·기능 변경 0건**이므로
되돌릴 것은 그 파일을 지우는 것뿐이다. 036 초안의 식별자 표에서 합성 fixture 를
운영 근거로 쓴 표기를 **E3(합성 시험 기준)으로 내렸다** — 실제 타입이 다르다는
주장이 아니라 **운영 근거 미확정**이라는 뜻이다.

**DB 변경** 없음. 운영 DB·Storage 0건. 실제 키 열람 0건. 모델 조회 0회.
입력 계수 0회. 유료 추론 0회. 후보 저장 0행. commit·push·배포 없음.
운영 호스트로 나간 요청 0건 (가드가 가로챈 범위 안의 수치. 패킷 실측이 아님).

---

## 2026-10-22 — 038: 통합 계약 인계와 구조정보 확인 준비 (GPT_EXEC_038)

### 무엇을

**실행 코드 변경 0건.** 문서와 새 시험만이다.

| 파일 | 무엇 |
|---|---|
| `STUDYCHECK_LEARNING_CONTRACT_DRAFT_038.md` | 신규 `0.1-draft.1` — 안 B 방향·매핑 책임·합성 payload 7건·네 사례·질문앱 대응표 |
| `LOCAL_SCHEMA_SOURCES_038.md` | 신규 — 출처·시점·범위 표 (E1~E4) |
| `READONLY_LEARNING_SCHEMA_038.sql` | 신규 — 카탈로그만 읽는 **한 문장**. **미실행** |
| `SCHEMA_SNAPSHOT_PLAN_038.md` | 신규 — 1회 조회 절차 |
| `lib/twin/exec038.test.ts` | 신규 — S1~S10 (조회문 안전 성질) |
| `lib/twin/exec017.test.ts` · `package.json` | 시험 목록 등록 (의존성 변경 없음) |

### 왜

037 계약의 E4(미확인)가 대부분 "운영 열의 정확한 타입·제약·관계" 였다.
그것 없이는 학생 한 명 기준의 참조 타입도, 개념↔유형 중간 관계의 존재 여부도 정할 수 없다.
그래서 **읽기 전용 구조정보**를 한 번 보는 조회문을 준비했다.

조회문을 아직 돌리지 않으므로 "데이터 행을 읽지 않는다" 가 문서의 약속으로만 남는다.
037 에서 배운 대로 **글자 자체를 기계로 검사**해 수로 확인되는 보장으로 바꿨다.

### 되돌리는 법

```
지우면 038 이전 상태가 된다
  STUDYCHECK_LEARNING_CONTRACT_DRAFT_038.md
  LOCAL_SCHEMA_SOURCES_038.md
  READONLY_LEARNING_SCHEMA_038.sql
  SCHEMA_SNAPSHOT_PLAN_038.md
  lib/twin/exec038.test.ts
되돌리면 038 이전 상태가 된다
  lib/twin/exec017.test.ts   (목록에서 exec038 제거)
  package.json               (test:twin:files 에서 exec038 제거 — 의존성은 손대지 않았다)
```

**DB 변경 없음 · SQL 실행 0회.** 되돌릴 운영 객체가 없다.
037 계약 원본(`..._037.md`)은 **보존**했으므로 그대로 남는다.

### 설계 결정 (GPT 가 정한 것을 받은 것)

- 연결은 **안 B 방향**(자산·검수·버전 재사용). **물리 설계·새 표는 구조 확인 뒤.**
  안 A 의 기존 연결은 **과도기 어댑터로 재사용.** `concept_id` 추가를 선확정하지 않는다.
- 자산 **품질 검수**와 **관계 적합성 검수**를 나눈다. 자산 승인만으로 미검수 관계가
  자동 공개되지 않는다. 승인된 관계를 **학생마다 재검수하지 않는다.**
- 영상 시청 시간의 관측 방법 이름을 **`video_window_elapsed`** 로 고정한다 —
  미래의 실제 player 관측과 같은 칸에 섞지 않는다.
- 중복 비교에서 **서버 부가값**(`received_at` 등)을 뺀다. 같은 id·다른 내용은 **충돌**이다.
- 늦게 온 기록은 **사실 기록 · 분석 갱신 · 승인된 계획 적용**을 나눈다 (D-116 유지).

새 D 번호 없음. 기존 D-016·D-017·D-018·D-116·D-117·D-126 유지.

### 보존 확인

실행 코드·시험 절차 **12개 전부 바이트 동일** — `openaiConfig.ts` `b819b1a9` ·
`run-twin-smoke-032.ts` `9c0d0c0f` · `check-model-access-033.ts` `d782077f` ·
`openaiSend.ts` `b2806e53` · `smoke.ts` `305885c6` · `pipeline.ts` `7df7015d` ·
`netguard.cjs` `b4b1d991` · `bootstrap.cjs` `06252993` · `run-guarded.cjs` `ac7ae483` ·
`guardRequired.ts` `0b43f276` · `run-twin-tests.cjs` `5b53495b` · `exec037.test.ts` `64a3e167`.
승인키 `d139142ec46c81e3` 불변.

**DB 변경** 없음. 운영 DB·Storage 0건. 실제 키 열람 0건. 모델 조회 0회.
입력 계수 0회. 유료 추론 0회. 후보 저장 0행. commit·push·배포 없음.
운영 호스트로 나간 요청 0건. 새 패키지 설치 0건.

---

## 2026-10-23 — 039: 근거 등급 정정과 계약 0.1-draft.2 (GPT_EXEC_039)

### 무엇을

**코드·시험·조회문 변경 0건.** 문서 4개만 추가했다.

| 파일 | 무엇 |
|---|---|
| `LOCAL_SCHEMA_SOURCES_039.md` | 신규 — **근거 등급 과잉 확정 5건을 내린 정정표** |
| `STUDYCHECK_LEARNING_CONTRACT_DRAFT_039.md` | 신규 `0.1-draft.2` — 의미 정정 6건 |
| `CLAUDE_RESULT_039.md` · `CLAUDE_BLOCKER_039.md` | 신규 |

037·038 원본은 **전부 보존**했다. 덮어쓰지 않았다.

### 왜 — 내가 근거 없이 단정한 것 다섯

1. **`exams.id` uuid 확정** → uuid **모양 문자열**과 비교·삭제한 것이 열의 DB 타입을
   입증하지 않는다. PostgreSQL 에서 그 비교는 `text`·`varchar` 여도 성립한다. → **E4**
2. **참조측 선언을 대상측 타입으로** 썼다 → `problem_id bigint references problems(id)` 는
   참조측 선언이고 `problems.id` 의 카탈로그 타입이 아니다. "bigint 와 호환" 까지만.
   → **참조측 E1 / 대상측 E4 두 칸으로**
3. **새로 인용한 운영 SQL 을 E1 로** 적었다 → 전문이 묶음에 없다. → **E2.**
   그리고 **파일 존재 ≠ 운영 실행 성공**
4. **질문앱 `problem_id`·`type_code` 를 "현행호환" 으로** 적었다 → 이름이 같다는 것이
   양방향 호환 확인이 아니다. → **우리쪽 근거는 별도 열, 종합은 자료미확인**
5. **`axis` 를 "이미 기록하는 값"** 으로 적었다 → 설계 문서에 있다는 것까지가 E2(설계),
   **실제 저장 여부는 E4**

### 내 범위 표현도 정정

038 의 SQL 주석·계획서가 "목록 밖 schema 를 뒤지지 않는다" 고 적혀 있다.
**훑는 목록이 15개로 고정**인 것은 맞지만, `inbound` CTE 는 **15개를 참조하는 FK** 의
출발 관계 **이름**을 돌려주고 그것은 **목록 밖일 수 있다.** 또 내가 "개념과 유형을
참조하는" 이라고 좁게 적었지만 실제 SQL 은 **15개 전부**에 대해 넓다.

→ **SQL 을 고치지 않고 문서를 고쳤다.** 그 파일은 윤T 실행 대상으로 해시가 고정됐다
(`f25d1d9f…`). 이번 1회 조회의 승인 범위에 그 메타데이터까지 명시적으로 포함됐다.

### 계약 의미 정정 (GPT 가 정한 것을 받은 것)

- 영상 ↔ 진단축 **배타적 1:1 아님.** 한 관계가 여러 축 지원(`supported_axes[]`).
  표현변환·계산을 **영상 금지 축으로 두지 않는다**
- 답 노출 판정은 `자산종류 × is_essay` 가 **아니라** `현재 원문 × 과제 목적 ×
  자산 버전·구간 × 사용 맥락`. **`is_essay` 는 생성기의 자격 조건이고 답 노출 지표가 아니다**
- 증명 문항에서 **강사가 학생마다 확인문제를 고르는 구조를 채택하지 않는다.**
  검수된 묶음 + 연결규칙을 한 번 준비하고 **시스템이 고른다**
- 벽시계 관측 이벤트 이름을 **`video_window_elapsed_recorded`** 로 (실제 재생·구간완료와 분리)
- 중복 비교를 **고정 열 목록에서 `client_event` 전체**로 바꾸고
  `server_envelope`(`received_at`·`resolved_student_scope` 등)를 분리. **학생 범위는 서버가 확정**
- `video_kind` / `relation_kind` **분리.** 세 값은 초기 목록이고 폐쇄 구조가 아니다

### 되돌리는 법

```
지우면 039 이전 상태가 된다
  LOCAL_SCHEMA_SOURCES_039.md
  STUDYCHECK_LEARNING_CONTRACT_DRAFT_039.md
  CLAUDE_RESULT_039.md
  CLAUDE_BLOCKER_039.md
```

**DB·코드·시험·SQL 변경 0건.** 되돌릴 운영 객체도, 코드도 없다.
037·038 원본이 보존돼 있으므로 그대로 남는다.

### 합의된 이연 1건

`lib/twin/exec038.test.ts:156` 의 `assert.ok(... || true, '')` 는 **무효 단정**이다.
039 §5 가 "다음 실제 시험수정 작업이 있을 때" 고치라고 해서 **이번에 열지 않았고**,
대체 문장을 `CLAUDE_BLOCKER_039.md` A-1 에 미리 적어 뒀다.

**DB 변경** 없음. 운영 DB·Storage 0건. 조회문 실행 0회·수정 0건. 모델 조회 0회.
입력 계수 0회. 유료 추론 0회. 후보 저장 0행. commit·push·배포 없음.
운영 호스트로 나간 요청 0건. 새 D 번호 0건.

---

## 2026-10-24 — 040: 구조조회 반영 · 기존 구현 연결 · 첫 로컬 학습 흐름

### 무엇을

| 파일 | 무엇 |
|---|---|
| `lib/twin/learningPreview.ts` | **신규** — 합성 입력으로 다음 행동을 고르는 **순수 함수**. 운영 route·SDK·네트워크 미사용 |
| `lib/twin/exec040.test.ts` | **신규** — P 10 + Q 4 (040 §4 수용 대조 6개) |
| `lib/twin/exec038.test.ts` | **S7 무효 단정 1줄 정리** (040 §5 허용) |
| `CURRENT_LEARNING_IMPLEMENTATION_MAP_040.md` | **신규** — 영상 열 8개의 의미 + 경로·해시·발췌 |
| `STUDYCHECK_LEARNING_CONTRACT_DRAFT_040.md` | **신규** `0.1-draft.3` — 인가 순서·누락/null·payload 검증 |
| `SCHEMA_SNAPSHOT_RESULT_039.md` · `SCHEMA_SNAPSHOT_039.csv/.json` | 스냅샷 해석과 근거 보존 |

**운영 DB·조회 실행 0회. 조회문 수정 0건. `main` 브랜치 수정·병합 0건(읽기만).**

### 왜 — 두 번의 큰 정정

1. **039 의 "영상 코드를 못 찾았다" 가 틀렸다.** 그 코드는 같은 저장소 `main` 에 전부 있다.
   내 작업 트리가 쌍둥이 전용이라 거기에만 없었다. 036·039 에 이은 **세 번째 같은 실수**다.
   → **규칙: 저장소에 무엇이 있는지 말하기 전에 `git grep --all` 로 모든 브랜치를 본다.**
2. **039 에 올린 "두 표 중 어디에" 결정거리는 이미 닫혀 있었다.**
   `main:app/api/type-concepts/route.ts` 주석 — *"두 곳에 적으면 반드시 어긋난다"*.
   `lesson_videos` 가 영상↔유형 단일 출처다.

### 확정된 운영 사실 (2026-10-24 스냅샷 + main 소스)

- `students.id` **uuid** · `problems.id` bigint · `standard_types.code` text · `concepts.id` uuid
- 영상 열 의미 전부 확인 — `watch_seconds` 는 **뜻이 바뀌어** 이제 실제 재생 초가 들어간다,
  `focus_lost_seconds` 는 **탭 전환**이지 인지적 집중이 아니다, `completed_at` 은 **coverage 90%**,
  `call_responses` 는 **호명 응답**이고 정답이 아니다
- **영상은 전체 공개가 아니다** — RLS `own_assigned_read`(학습일지 과제에 들어간 것만)
- **증명 확인 행동이 이미 있다** — `proof_submissions`(시청 완료 뒤 백지 사진 제출)

### 되돌리는 법

```
지우면 040 이전 상태가 된다
  lib/twin/learningPreview.ts · lib/twin/exec040.test.ts
  CURRENT_LEARNING_IMPLEMENTATION_MAP_040.md · STUDYCHECK_LEARNING_CONTRACT_DRAFT_040.md
  CLAUDE_RESULT_040.md · PREVIEW_OUTPUT_040.txt
  SCHEMA_SNAPSHOT_RESULT_039.md · SCHEMA_SNAPSHOT_039.csv · SCHEMA_SNAPSHOT_039.json
되돌리면 040 이전 상태가 된다
  lib/twin/exec038.test.ts  (S7 의 유효 단정 → 옛 `|| true` 로. **되돌리면 다시 무효가 된다**)
  lib/twin/exec017.test.ts · package.json  (목록에서 exec040 제거)
```

**DB·SQL·운영 코드 변경 0건.** 되돌릴 운영 객체가 없다.
037·038·039 계약 원본과 조회문(`f25d1d9f…`)은 보존했다.

### 제안 (실행 아님)

**질문앱 0단계(직원 전용 읽기 화면)를 만들자고 GPT 에 제안했다** (`GPT_BRIEF` §1).
질문앱 코드가 어느 브랜치에도 **0줄**이고, 영상 185편·유형코드·장면이 이미 있어
**AI·쌍둥이·유료 호출 없이** 연결을 보일 수 있다는 근거를 붙였다.
**지시가 오기 전에는 만들지 않는다.**

**DB 변경** 없음. 운영 DB·Storage 0건. 데이터 행 0줄. 모델 조회 0회.
입력 계수 0회. 유료 추론 0회. commit·push·배포 없음. 새 D 번호 0건.

---

## 2026-10-24 — 041 회차: 첫 브라우저 사용판

받은 지시: `GPT_EXEC_041.md` (+ `GPT_REVIEW_040.md`). 화면 구현 허가가 그 문서로 났다.

> **D 번호의 정본은 `docs/AI_QUESTION_APP_DECISION_LOG.md` 다** (2026-10-27 정리).
> D-127~D-132 를 처음에 이 파일에만 적었던 것을 대장에 옮겨 등록했다.
> 여기(루트)는 **회차별 작업 기록**이고, 아래 항목은 파일별 되돌리기 절차를 남기려고 둔다.
> 결정의 내용·상태는 대장 쪽을 본다. 두 곳이 다르면 **대장이 맞다.**

### D-127 · 노출 판정을 휴리스틱에서 **승인된 검수 기록**으로 바꿈 (R040-C)

**무엇을** `ApprovedRelation.answerExposure: 'safe'|'reveals'|'unknown'` 한 칸을 없애고
`assetVersion: number` 와 `exposureReview { verdict, scope{problemRefId, taskGoal, assetVersion,
segmentKey}, reviewedBy, reviewedAt }` 를 넣었다. `disqualify()` 에서
`taskGoal==='prove' && theorem_proof && segment===undefined` 규칙을 지웠다.

**왜** GPT_REVIEW_040 §3 R040-C. 옛 규칙은 (1) 증명 원문이면 완성 증명을 무조건 막고
(2) 같은 자산에 **구간 속성만 붙이면** 통과시켰다. 둘 다 실제 노출 관측이 아니라 추측이었다.
이제 범위(원문·목적·자산 판·구간)가 하나라도 다르면 보류하므로, 구간을 새로 붙이면
`segmentKey` 가 어긋나 자동으로 막힌다.

**되돌리는 법** `lib/twin/learningPreview.ts` 의 `ExposureReview`·`ExposureScope`·`segmentKeyOf`
를 지우고 `answerExposure` 를 되살린 뒤 `disqualify()` 의 prove 규칙을 복원한다.
`lib/twin/exec040.test.ts` 의 `review()`·`rel()` 과 P2·P2-b·P2-c 를, `lib/learning/catalog.ts` 의
`relationsFor()` 를 함께 되돌려야 한다. **되돌리면 구간만 붙여 통과하는 구멍이 다시 열린다.**

### D-128 · 미측정 시간을 0 으로 치환하지 않음 (R040-A)

**무엇을** `describeVideoObservation` 이 `{observed, unmeasured}` 를 돌려준다.
`measured()` 가 `undefined`·`null`·NaN 을 걸러 `unknownScope` 로 보낸다. 실제 0 은 0 으로 남는다.

**왜** `v.windowElapsedMs ?? 0` 때문에 측정하지 않은 시간이 `창 열림 0ms` 라는 **관측**으로 찍혔다.

**되돌리는 법** 해당 함수를 `string[]` 반환으로 되돌리고 `?? 0` 을 복원한다.
**되돌리면 안 잰 시간이 잰 0 으로 보인다.**

### D-129 · 의미 비교를 정규형으로 (R040-B)

**무엇을** `canonical()` 을 넣어 객체 키는 정렬, `unmeasured` 배열만 집합(정렬+중복제거),
나머지 배열은 순서를 지킨다. `ORDERED_ARRAY_KEYS` 를 내보내 `content_refs` 를 못 박았다.

**왜** 키 순서나 `unmeasured` 순서만 달라도 `conflict` 가 떴다. 039 계약과 어긋났다.

**되돌리는 법** `meaningfulDiff` 를 옛 `JSON.stringify(a[k]) !== JSON.stringify(b[k])` 로.
**되돌리면 같은 뜻의 재전송이 충돌로 쌓인다.**

### D-130 · 대체 경로와 확인 항목을 **실물로** (R040-D)

**무엇을** `PreviewInput.availableFallbackTasks` 와 `RecommendedAction.fallbackTasks` 를 넣었다.
서버가 **배정 목록에서** 만든다. 없으면 계획 draft 에 `대체 자산 없음` 이라고 적는다.
`ConfirmAction.items` 를 필수로 하고, 검수된 항목이 없는 관계는 `disqualify` 에서 뺀다.

**왜** 「지금 가능한 다른 과제 계속」이 실제 경로 없는 문장이었고, 확인 행동도 라벨뿐이었다.

**되돌리는 법** 세 필드를 빼고 `CONFIRM_BY_RELATION` 을 그대로 쓰도록 되돌린다.
**되돌리면 학생에게 열리지 않는 동선을 준다.**

### D-131 · 시험 학습 저장소를 **파일**로 둠

**무엇을** `lib/learning/store.ts` 에 `LearningStore` 인터페이스와 `FileLearningStore` 를 만들고
`.learning-test-store/store.json` 에 쓴다. `.gitignore` 에 넣었다.

**왜** EXEC-041 §5 가 운영 DB 읽기·쓰기를 금지했다. 그러나 「새로고침·재로그인 뒤 서버에서
다시 읽히는가」는 보여야 하므로 브라우저 저장소(localStorage)로는 안 된다.
인터페이스를 같게 두어 뒤에 Supabase 구현체를 끼우면 화면은 그대로다.

**되돌리는 법** `.learning-test-store/` 폴더를 지우면 기록이 사라지고 씨앗부터 다시 선다.
`lib/learning/` 과 `app/learning/`·`app/api/learning/` 를 지우면 전부 사라진다.
**운영 객체를 만들지 않았으므로 되돌릴 DB 가 없다.**

### D-132 · `main` 의 `lib/lessonVideos.ts` 를 그대로 가져옴

**무엇을** `git show main:lib/lessonVideos.ts > lib/lessonVideos.ts`.
SHA-256 `812a5aa1aef6480d5bb494a138ab22bafe407234a8e53fb21aa061755a8d0d87` (main 원본과 동일).

**왜** GPT_REVIEW_040 §4 — 플레이어를 새로 만들지 말고 로컬 소스에서 재사용하라.
이 브랜치는 `main` 의 조상이 아니어서 그 파일이 없었다.

**되돌리는 법** 파일을 지운다. 이 브랜치에 원래 없던 파일이고 **고치지 않았다.**

---

**DB 변경 0건.** 운영 DB·Storage 0건. 모델 조회 0회. 유료 추론 0회.
commit·push·배포 0건. 의존성 추가 0건. `main` 병합·reset 0건.
