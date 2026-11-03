# AI 질문 웹앱 — 의사결정 기록

> 목적: GPT·원장님·Claude Code 사이에서 발생하는 작은 결정과 변경 이유를 누적한다.  
> 최종 업데이트: 2026-09-23  
> 규칙: 기존 기록을 삭제하지 않고 상태 변경이나 대체 결정을 새 항목으로 추가한다.

---

## 상태값

| 상태 | 의미 |
|---|---|
| `CONFIRMED` | 원장님이 명시적으로 확정함 |
| `PROVISIONAL` | 현재 권장안이나 아직 최종 확정 전 |
| `OPEN` | 논의가 필요한 항목 |
| `SUPERSEDED` | 더 최신 결정으로 대체됨 |
| `REJECTED` | 검토 후 채택하지 않음 |

---

## 결정 목록

### D-001 — 별도 웹앱으로 개발

- 날짜: 2026-09-23
- 상태: `CONFIRMED`
- 결정: AI 질문 기능은 StudyCheck 내부 화면이 아닌 별도의 Next.js 프로젝트로 개발한다.
- 이유: 질문 학습 흐름과 AI 기능을 기존 운영앱에서 분리하면서도 독립적으로 확장하기 위해서다.
- 영향: 별도 도메인, 별도 배포, 별도 환경변수와 로그인 세션이 필요하다.

### D-002 — 기존 Supabase 프로젝트 공유

- 날짜: 2026-09-23
- 상태: `CONFIRMED`
- 결정: 질문 앱은 StudyCheck와 같은 Supabase 프로젝트 `cggskjxsyrvuhsldgkoj`를 사용한다.
- 이유: 학생·반·직원·문제은행·이미지·푸시 데이터를 재사용하기 위해서다.
- 영향: 운영 DB에 질문 앱용 테이블과 RLS 정책을 추가해야 한다.

### D-003 — 1차 사용자는 학생

- 날짜: 2026-09-23
- 상태: `CONFIRMED`
- 결정: 1차 제품은 학생 사용 흐름을 우선한다. 학부모·교사 전용 화면은 2차 범위로 둔다.
- 이유: 먼저 질문과 자기풀이 경험을 검증하기 위해서다.
- 영향: 교사 검수 기능을 나중에 만들더라도 1차부터 신고·검수용 로그는 남겨야 한다.

### D-004 — 최종답 절대 비공개

- 날짜: 2026-09-23
- 상태: `CONFIRMED`
- 결정: AI는 학생에게 최종답, 객관식 번호, 완성된 마지막 식, 전체 풀이를 공개하지 않는다.
- 이유: 앱이 숙제 대행 또는 풀이 복사 도구가 되는 것을 방지하고 학생이 직접 답을 완성하게 하기 위해서다.
- 영향: 학생용 AI와 정답정보 분리, 단계형 인터페이스, 출력 전 정답 노출 검사, 교사 연결 흐름이 필요하다.
- 변경 권한: 원장님의 명시적 결정 없이는 변경할 수 없다.

### D-005 — 단계형 힌트 구조

- 날짜: 2026-09-23
- 상태: `CONFIRMED`
- 결정: 대표유형 → 개념·공식 → 단계별 풀이 코치 순으로 지원한다.
- 세부 방향:
  1. 같은 구조의 대표유형 영상
  2. 필요한 공식·개념 회상
  3. 조건 찾기 → 식 세우기 → 학생 직접 계산
- 이유: 답을 노출하지 않으면서 학생의 막힌 지점에 따라 도움의 강도를 높이기 위해서다.
- 미확정: 각 단계의 통과조건과 재시도 횟수.

### D-006 — 문제은행 연계형 MVP

- 날짜: 2026-09-23
- 상태: `PROVISIONAL`
- 제안: 1차에서는 학생이 StudyCheck 학습지·채점결과의 문제를 선택하는 방식만 지원한다.
- 이유: 문제·정답·유형을 이미 보유하므로 OCR 방식보다 정확하고 캐시 재사용이 쉽다.
- 보류: 원장님의 최종 범위 확정.

### D-007 — 사진과 수식 직접입력은 2차 후보

- 날짜: 2026-09-23
- 상태: `PROVISIONAL`
- 제안: 학교 교과서·외부 문제집 사진과 MathLive 직접입력은 문제은행 MVP 검증 후 추가한다.
- 이유: 이미지 품질, OCR, 수식 인식, 저작권·개인정보 처리를 분리해서 검증하기 위해서다.

### D-008 — 문제별 힌트팩 캐시

- 날짜: 2026-09-23
- 상태: `PROVISIONAL`
- 제안: 학생별로 매번 AI 풀이를 생성하지 않고 문제별 힌트팩을 만들어 재사용한다.
- 캐시 키 후보: `problem_id + problem_fingerprint + prompt_version + model_version`.
- 이유: 같은 문제의 답변 일관성, 비용 절감, 교사 검수 결과 누적을 위해서다.

### D-009 — AI 자유채팅을 기본으로 사용하지 않음

- 날짜: 2026-09-23
- 상태: `CONFIRMED`
- 결정: 학생에게 일반 자유채팅을 기본 질문방식으로 제공하지 않는다.
- 이유: 정답 요구, 프롬프트 공격, 전체 풀이 노출, 답변 품질 편차를 줄이기 위해서다.
- 영향: 선택형·수식형·사진형·단계형 입력 UI가 필요하다.

### D-010 — 교사 전수검수 제외

- 날짜: 2026-09-23
- 상태: `PROVISIONAL`
- 제안: 모든 질문을 사전검수하지 않고 신고·저신뢰·충돌·반복실패 질문만 교사에게 보낸다.
- 이유: 전수검수는 AI 질문 앱의 즉시성과 운영효율을 없애기 때문이다.
- 필수 후보: 1차부터 `이거 이상해요` 버튼과 관련 로그를 둔다.

### D-011 — MVP 로그인은 별도 재로그인

- 날짜: 2026-09-23
- 상태: `PROVISIONAL`
- 제안: 질문 앱에서 최초 한 번 기존 방식으로 로그인하고 세션을 유지한다.
- 이유: 다른 도메인 사이에서 익명 Supabase 세션을 안전하게 넘기는 작업은 별도 인증 설계가 필요하기 때문이다.
- 2차 후보: 일회용 인증 티켓 또는 중앙 인증 구조.
- 금지: access token 또는 refresh token을 URL 쿼리스트링으로 전달.

### D-012 — 운영 DB 변경 절차

- 날짜: 2026-09-23
- 상태: `CONFIRMED`
- 결정: DB 변경은 `docs/sql/`에 SQL 파일로 작성하고 원장님이 확인한 뒤 Supabase에서 직접 실행한다.
- 이유: 220명이 사용하는 운영 DB의 우발적 변경을 방지하기 위해서다.

### D-013 — 학생 RLS 소유권 기준

- 날짜: 2026-09-23
- 상태: `CONFIRMED`
- 결정: 학생 데이터 접근은 `students.session_uid = auth.uid()`를 통해 학생 ID를 확인한다.
- 금지: 학생 데이터 테이블에 `to authenticated using (true)` 정책 사용.
- 이유: 모든 학생이 `authenticated` 역할을 사용하므로 역할만으로는 학생 간 데이터가 분리되지 않기 때문이다.

### D-014 — 사용량 기본안

- 날짜: 2026-09-23
- 상태: `REJECTED` (CP-003)
- 기존안: 하루 신규 질문 5개, 같은 문제 재열람과 후속 힌트는 차감하지 않음.
- 폐기 사유: 질문 횟수를 아끼게 만들어 필요한 순간의 질문과 사고 시도를 포기하게 함.
- 대체 결정: D-015

### D-015-OLD → D-021로 이동 — GPT 모델 선택

- 날짜: 2026-09-23
- 상태: `OPEN`
- **주의: CP-003이 `D-015`를 「일일 한도 없음」으로 재사용했다. 번호 충돌을 피해 이 항목을 `D-021`로 옮긴다.**
- 새 번호: `D-021`
- 논의안: 정확도가 필요한 최초 힌트팩은 균형형 모델, 반복 질문은 DB 캐시, 단순 오류분류는 저비용 모델 또는 규칙 기반 판정.
- 확인 필요: 파일럿 문제 정확도 평가, 구현 시점 API 가격, 월 예산.

---

## 변경기록 작성 형식

새로운 결정을 추가할 때 다음 형식을 사용한다.

```markdown
### D-000 — 결정 제목

- 날짜: YYYY-MM-DD
- 상태: `CONFIRMED | PROVISIONAL | OPEN | SUPERSEDED | REJECTED`
- 결정 또는 제안:
- 이유:
- 영향:
- 대체한 결정: 해당 시 작성
- 확인할 사항: 해당 시 작성
```

---

## 다음 논의 우선순위

1. 3단계 힌트의 정확한 행동과 통과조건
2. 정답 노출 검사 방식
3. 문제별 힌트팩 데이터 구조
4. 학생 질문 세션과 시도 기록 DB
5. 문제은행에서 질문 앱으로 넘어오는 화면 흐름

---

## CP-003에서 확정된 결정 (2026-09-23)

> 적용 우선순위: **CP-003 > CP-002 > CP-001**

### D-015 — 질문·힌트 일일 한도 없음

- 상태: `CONFIRMED`
- 결정: 학생의 질문 수와 힌트 요청 수에 일일 한도를 두지 않는다.
- 이유: 이 앱의 목적은 질문을 제한하는 것이 아니라 학생이 스스로 결론에 도달할 때까지 사고를 이어 주는 것.
- 대체한 결정: D-014
- 운영 장치: 힌트 그래프 공용 캐시 / 이미지 대신 `problem_id`·메타데이터 / 실시간 턴은 저비용 모델 /
  비정상 연속 요청에만 서버 속도 제한 / 비용 임계치 도달 시 학생 차단이 아니라 관리자 경보 / `private.ai_runs` 기록
- 주의: "한도 없음"은 무제한 API 호출 허용이 아니다. 봇·중복·동시다발 호출만 기술적으로 제어한다.

### D-016 — 즉시 보충 루프

- 상태: `CONFIRMED`
- 결정: 마지막 힌트 후에도 막힌 학생에게 교사 연결로 끝내지 않고 **즉시 보충 루프**를 제공한다.
- 이유: "정답을 주지 않음"이 "아무것도 못 받고 끝남"이 되어서는 안 됨.
- 루프: 막힌 원인 진단 → 가장 가까운 유사 문제 선택(twin → 동일 type_code → 마이크로 예제 → 선수 개념 카드)
  → 유사 문제를 단계별로 동행 → 원문 복귀 → 3회 반복 실패 시 교사 신호(흐름은 차단하지 않음)
- 유사 문제의 정답 처리: 유사 문제는 풀이를 완성할 수 있다. 단 원문과 숫자가 1:1로 대응돼
  원문 답을 역산할 수 있으면 유사 문제의 마지막 값도 빈칸으로 둔다.

### D-017 — 질문 앱의 정답 출력 금지 (D-004 대체)

- 상태: `CONFIRMED`
- 결정: 질문 앱의 AI와 UI는 원문 문제의 최종 정답·정답 선택지·완성된 마지막 식을
  직접 출력하거나 재진술하지 않는다.
- 이유: 학생이 StudyCheck 자기채점에서 정답을 이미 보았더라도, 질문 앱의 목적은
  답 확인이 아니라 풀이 과정의 자력 완성이다.
- 대체한 결정: D-004 (「최종답 비공개」는 "학생이 정답을 전혀 알 수 없음"과
  "앱이 정답을 출력하지 않음"이 섞여 있었다)
- 추가 원칙: `answer_text`는 서버 판정·누출 검사에만 사용 / 클라이언트 응답에 포함하지 않음 /
  학생이 정답을 적어도 AI가 되받아 말하지 않고 "검산해 보자"·"처음 달라진 단계를 찾자"로 반응 /
  AI 출력 후 서버에서 누출 검사 한 번 더
- 보안 메모: `app/api/grade/[code]`의 무인증 정답 전달은 기존 자기채점 정책이므로 MVP가 막지 않는다.
  단 질문 앱은 이 API를 정답 획득 경로로 쓰지 않고 서버에서 DB를 직접 조회한다.
  6자리 코드만으로 전체 정답을 가져갈 수 있는 범위·만료 조건은 **별도 보안 점검 과제**로 등록한다.

### D-018 — 힌트 1은 영상이 아니라 대표 문제

- 상태: `CONFIRMED`
- 결정: MVP의 첫 힌트는 영상이 아니라 검수된 대표 문제 또는 구조 카드로 제공한다.
- 이유: 유형별 영상 연결 데이터가 없는 상태에서 영상을 필수로 두면 MVP 출시가 2027년까지 지연됨.
- 선택 순서: 검수된 쌍둥이 → 같은 `type_code` 대표 문제 → 난이도 한 단계 낮은 같은 개념 문제
  → AI 마이크로 예제 → 개념·공식 구조 카드
- 영상은 `type_learning_assets` 테이블로 별도 관리하고, 영상이 없는 유형도 정상 동작해야 한다.

### D-019 — 캐시 키 (D-008 대체)

- 상태: `CONFIRMED`
- 결정: 힌트 그래프 캐시 키는 `problem_id + source_fingerprint + prompt_version`.
- `source_fingerprint` = 아래를 정규화 후 SHA-256:
  `problem.id, image_path, storage.objects.updated_at 또는 ETag, answer_kind, answer_text, type_code, step, difficulty`
- 대체한 결정: D-008 (`problems`에 `problem_fingerprint` 칼럼이 없고, 이미지 경로만으로는 변경 감지 불충분)
- 유니크 제약: `unique (problem_id, source_fingerprint, prompt_version)`

### D-020 — 질문 앱 RLS 기준 (D-013 대체)

- 상태: `CONFIRMED`
- 결정: 질문 앱의 RLS는 `question_student_sessions` 매핑으로 학생 소유권을 확인한다.
- 대체한 결정: D-013 (`students.session_uid`를 질문 앱의 새 익명 세션으로 덮어쓰면
  두 앱 중 하나의 연결이 깨진다)

### D-021 — GPT 모델 선택 (기존 D-015에서 번호 이동)

- 상태: `OPEN`
- 번호 이동 사유: CP-003이 `D-015`를 「일일 한도 없음」으로 재사용했다.
- 확인 필요: 파일럿 정확도 평가, 구현 시점 API 가격, 월 예산.
  **CP-002의 모델명(GPT-6 Sol/Astra/Luna)은 Claude가 확인하지 못했다. 공식 문서 확인 필요.**

---

## 원장님 결정 (2026-09-23, 구두)

### D-022 — 유형별 쌍둥이 문항 제작

- 상태: `SUPERSEDED BY D-032` (2026-09-23)
- 결정: 쌍둥이가 없는 문항을 위해 **유형당 1~2개씩** 쌍둥이 문항을 만들어 둔다.
- ~~수량 1,105~2,210문항~~ → **D-032에서 179~358개로 확정.** 903개 유형이 이미 쌍둥이를 갖고 있어
  실제 제작 대상은 179개 유형뿐이다. 유형당 1~2개라는 원장님 결정 자체는 유효하다.
- 경위: 처음에는 문항당 3개씩(42,576문항)을 검토했으나, 실제 조회 결과
  쌍둥이 없는 14,192문항 중 **99.8%가 같은 유형 문항을 5개 이상 보유**하고
  완전 고립은 5개뿐이어서 전량 제작은 불필요했다. 검수 인력(선생님 11명)도 감당 불가.
- 범위: **179개 유형** (D-032). 자주 쓰이는 유형부터 단계적으로.

### D-023 — MVP 대상 문항 범위  〔Claude 제안 · 확정 대기〕

- 상태: `OPEN`
- 제안: MVP는 **`answer_text`가 있는 11,475문항(51.6%)** 으로 한정한다.
- 근거: `answer_kind='image'` 10,159개(45.7%)와 `null` 608개(2.7%)는 **`answer_text`가 0개**다.
  정답 텍스트가 없으면 D-017의 서버 판정도, 누출 검사도, `compare.steps`의 채점도 불가능하다.
- 보완: D-022로 새로 만드는 쌍둥이 문항은 **반드시 `answer_text`를 갖게 한다.** 이 공백을 메운다.

---

## CP-006에서 확정된 결정 (2026-09-23)

> 적용 우선순위: **CP-006 > CP-005 > CP-003 > CP-002 > CP-001**
> 번호 정리: CP-005가 `D-022`를 재사용했으나 기존 로그에 D-022·D-023이 있어 **CP-005의 번호만 무효**.
> 내용은 `D-024`로 승계됐다. 기존 D-022(원장님 쌍둥이 제작 결정)는 그대로 유효하고,
> Claude가 제안한 D-023은 `D-025`로 확정됐다.

### D-024 — 쌍둥이 제작 역할 분담 (CP-005의 D-022 승계)

- 상태: `CONFIRMED`
- 결정: 쌍둥이 문항의 **수학적 생성 규칙·프롬프트·검수 기준은 GPT Work**가 설계하고,
  **Claude Code는 생성 파이프라인·검산·관리자 승인·DB 등록**을 구현한다.
- 이유: 문항 품질 판단과 저장소 구현의 책임을 분리해야 함.

### D-025 — MVP 문항 범위 (D-023 확정)

- 상태: `CONFIRMED`
- 결정: 1차 MVP 질문 대상은 **`answer_text is not null`인 11,475문항**으로 제한한다.
- 이유: 정답 텍스트가 없으면 서버 판정·누출 검사·풀이 비교가 모두 불가능해 핵심 안전장치를 보장할 수 없음.
- 학생 화면: 지원 문항만 「이 문제 질문하기」 노출. 미지원 문항은 숨기거나 「AI 질문 준비 중」으로 비활성화.
  **기존 QR 자기채점 기능은 변경하지 않는다.**
- 2차 확장: `answer_kind='image'` 문항은 답 이미지 OCR·AI 판독 → 구조화 정답 후보 → 교사 검수 →
  승인 후 저장 → 그 뒤에 질문 가능 문항으로 전환.
- **새로 제작하는 대표·쌍둥이·마이크로 문항은 처음부터 구조화된 정답을 반드시 저장한다.**

### D-026 — 기존 `twin_id`는 구조 비교용, 보충 루프 1순위에서 제외

- 상태: `CONFIRMED`
- 결정: 기존 `twin_id` 문항은 **힌트 1의 구조 비교용**으로만 쓰고, 보충 루프의 1순위 완성 예제에서는 제외한다.
- 이유: 쎈↔쎈B 4,025쌍은 1:1 대응이라 끝까지 풀면 원문 답이 역산된다.
- 용도별 순서
  - **힌트 1 (구조 발견)**: 기존 `twin_id` → 같은 `type_code` 검수 대표 문항 → 구조 카드.
    **기존 `twin_id`의 마지막 값은 항상 마스킹한다.**
  - **보충 루프 (성공 경험)**: AI 마이크로 예제 → 검수된 같은 유형 대표 예제 → 선수 개념 예제 → 원문 복귀
- 공개 허용 범위

  | 자료 | 허용 |
  |---|---|
  | 원문 문제 | 정답·마지막 완성식 **항상 비공개** |
  | 기존 `twin_id` | 과정 비교까지만. **마지막 값 항상 마스킹** |
  | 같은 유형 DB 문항 | 학생이 마지막 값을 직접 입력. AI는 맞음 여부만 확인하고 값을 말하지 않음 |
  | 검증된 마이크로 예제 | **완성 풀이와 최종값까지 공개 가능** |

- 마이크로 예제의 최종값 공개 조건 (전부 만족): 원문과 1:1 치환 아님 / 원문 답 역산 불가 /
  `safe_worked_example=true` 통과 / 화면에 마이크로 예제임을 명시 / 종료 후 원문 복귀.
  **검증이 어려우면 마이크로 예제도 마지막 값을 학생이 입력한다.**

### D-027 — 유사 문제 난이도 선택 순서

- 상태: `CONFIRMED`
- 결정: `difficulty` 단독이 아니라 **`difficulty` → `step` → 유형 내 통계** 순으로 대체한다.
- 이유: `difficulty`가 51%만 존재하고, 베이직쎈 계열은 `step`이 실질 난이도 역할을 한다.
- 규칙: 둘 다 `difficulty` 있으면 그것으로 / 없고 `step` 있으면 `A < B < C` /
  둘 다 없으면 같은 `type_code` 안에서 계산량·풀이 단계가 적은 검수 문항 /
  근거가 부족하면 자동 선택하지 않고 **사전 지정된 대표 문항** 사용.
- `source_fingerprint` 계산에서 `difficulty`·`step`의 null은 각각 **고정된 빈 문자열로 정규화**한다.

### D-028 — 학생이 정답을 먼저 말한 경우

- 상태: `CONFIRMED`
- 결정: **`forbidden_output` 검사는 AI 출력에만 적용하고 학생 입력은 차단하지 않는다.**
- 이유: 자기채점 후 들어오는 학생은 정답을 이미 알고 있을 수 있고, 이 앱의 목적은 그 답이 나온 이유를 이해시키는 것.
- 출력 규칙: 학생 말풍선에 그 값을 표시하는 것은 허용 / **AI는 그 값을 인용하거나 정답이라고 재확인하지 않음** /
  AI는 「네가 적은 값」·「그 결과」처럼 지칭 / 이후 **`known_answer_explanation` 모드**로 전환 /
  정답 확인이 아니라 조건 → 공식 → 식 → 계산의 원인 연결을 진행.
- 최상위 원칙 문구: *"질문 앱의 AI와 UI는 원문 문제의 정답과 완성된 마지막 식을 **새로 제공하거나
  AI 발화로 재출력하지 않는다.** 학생이 이미 알고 입력한 답은 학습 출발점으로만 사용한다."*

### D-029 — 노드 판정 5갈래

- 상태: `CONFIRMED`
- 결정: `ok / partial / wrong / idk / stuck`
- 이유: 개념은 맞고 부호·계산만 틀린 응답을 완전 오답과 같이 처리하면 불필요하게 쉬운 힌트로 내려간다.

  | 판정 | 기준 | 처리 |
  |---|---|---|
  | `ok` | 요구한 개념·식·값 충족 | 다음 노드 |
  | `partial` | 핵심 구조는 맞고 부호·단위·산술·표기 오류 | **같은 단계**에서 오류 한 곳만 짚음 |
  | `wrong` | 핵심 개념·연결이 틀림 | **같은 단계**에서 첫 되짚기 |
  | `idk` | 모르겠음·도움 요청·무응답 | 즉시 한 단계 구체적 지원 |
  | `stuck` | 누적 기준 도달 | 마이크로 예제 또는 선수 개념 |

- **식은 맞고 부호만 틀린 경우는 `partial`이다.** `ok`도 `wrong`도 아니다.

### D-030 — `stuck_score` 가중치

- 상태: `CONFIRMED`
- 결정: `idk`와 `wrong`을 같은 점수에 누적하되 **동일하게 세지 않는다.**
- 이유: 생각해서 낸 첫 오답과 즉시 포기한 응답은 학습 상태가 다르다.
- 점수: 첫 `wrong` **0점** / 같은 오답·같은 오개념 반복 **+1** / 새로운 합리적 오답 **+0.5** /
  `idk` **+1** / `partial` **0** / `ok` 해당 노드 점수 초기화 후 다음 노드 /
  동일 노드 또는 동일 진단 축에서 **`stuck_score >= 3` → `stuck`**
- 구현 편의: 0.5를 정수로 저장하려면 모든 점수를 2배로 저장해도 된다.

### D-031 — 첫 오답에는 지원 강도를 낮추지 않는다

- 상태: `CONFIRMED`
- 결정: 첫 오답에는 단계를 낮추지 않고 **같은 수준에서 한 번 더 생각하게** 한다.
- 이유: 한 번 틀렸다고 바로 선택지·공식 힌트를 주면 학생의 사고 기회를 빼앗는다.
- 진행: 첫 `wrong` → 같은 노드에서 오개념별 되짚기 / 반복 `wrong` → 한 단계 구체화 /
  첫 `idk` → 한 단계 구체화 / `partial` → 같은 단계에서 부호·단위·산술만 표시 /
  `stuck_score >= 3` → 마이크로 예제·선수 개념 / 보충 성공 → **원문의 막혔던 노드로 복귀**
- **`support_level` 단일 숫자를 쓰지 않는다.** 아래로 분리한다.

```text
strategy: recall | choice | blank | partial_condition | worked_example | prerequisite | return
attempt_count: integer
stuck_score: integer or numeric
```

### 파이프라인 상태 전이 (CP-006 §6)

```text
generated → auto_validated → pending_review → approved → published
                       └──→ rejected
```

기타: GPT API 모델명은 **코드에 하드코딩하지 않고 환경변수**로 둔다.
실제 모델명·가격은 구현 직전 공식 API 문서에서 재확인한다.

---

## CP-007에서 확정된 결정 (2026-09-23)

> 적용 순서: **CP-006을 먼저 반영한 뒤 CP-007 적용**
> CP-004는 "Claude Code가 주 개발자, GPT Work가 설계·검수자"라는 역할 결정이었다 (원문 미수령, CP-007에서 요약 확인).

### D-032 — 제작 수량

- 상태: `CONFIRMED`
- 결정: 쌍둥이가 없고 `answer_text`가 있는 **179개 유형에 유형당 1~2개** 제작. 최종 179~358개.
- 파일럿: 10개 유형 × 원문 5개 × 후보 2개 = **후보 100개 전량 검수**,
  유형별 **가장 좋은 1~2개만 승인·게시**. 나머지는 거부 사유와 함께 프롬프트 개선 자료로 보관.
- **파일럿 100개를 전부 넣는 게 아니다. 평가용 후보 100개, 실제 게시 10~20개.**

### D-033 — 텍스트+LaTeX 우선

- 상태: `CONFIRMED`
- 결정: 1차 AI 예제는 **텍스트+LaTeX 화면 전용**. 이미지를 생성하지 않는다.
- 이유: 힌트·보충 예제 용도엔 텍스트로 충분하고, AI 이미지 생성은 수식·도형 오류와 검수 비용을 크게 늘린다.
- 렌더링: 기존 `mathlive` 또는 KaTeX 계열
- **도형·그래프가 반드시 필요한 유형은 `unsupported`로 반환하고 파일럿에서 제외**
- 향후 인쇄가 필요하면 승인된 텍스트·LaTeX를 HTML/SVG로 렌더한 뒤 PNG·PDF로 변환한다.
  **수식 문제 이미지를 생성형 이미지 모델로 그리지 않는다.**

### D-034 — 기존 `problems`에 넣지 않는다

- 상태: `CONFIRMED`
- 결정: 텍스트 AI 예제를 `problems`에 INSERT하거나 원문의 `twin_id`에 연결하지 **않는다.**
- 이유: `problems`는 이미지 중심이고 텍스트 필드가 없다. `book='AI쌍둥이'`만으로 넣으면 표시·인쇄 흐름이 깨진다.
- 구조: `private.twin_candidates`(후보) / `private.ai_practice_problems`(승인된 화면용 예제) /
  `public.type_learning_assets`(유형↔자산 연결, **정답 저장 안 함**)
- 학생 클라이언트에는 `problem_text_latex` 같은 **안전 필드만** 서버 API로 전달한다.
  `answer_text`·검산 기록·후보 행은 보내지 않는다.
- 나중에 인쇄용 이미지가 만들어지고 **별도 승인**을 받은 문항만 `problems`로 승격할 수 있다.
  그때도 기존 `twin_id`를 덮어쓰지 않고 승격 전용 절차를 따로 둔다.

> **Claude의 이전 설계를 뒤집은 결정이다.** 앞서 "승인된 것만 `problems`에 넣고 `book='AI쌍둥이'`로
> 구분한다"고 설계했는데, `problems`에 텍스트 본문을 담을 칼럼이 없다는 점을 GPT가 짚었다. 맞는 지적이다.

### D-035 — `private` 스키마

- 상태: `CONFIRMED`
- 결정: `twin_candidates`를 `public`이 아니라 **PostgREST 비노출 `private` 스키마**에 둔다.
- 이유: 후보 정답과 검산 정보는 학생에게 노출될 이유가 없다. 직원용 RLS 한 줄보다 서버 전용 접근이 안전하다.
- `anon`·`authenticated`에 스키마 사용 권한을 주지 않는다. 관리자 화면은
  `denyIfNotStaff(req, { adminOnly: true })`를 통과한 서버 API에서만 접근한다.

### D-036 — 모델과 API 방식

- 상태: `CONFIRMED`
- 생성 `gpt-6-astra` / 독립 검토 `gpt-6-sol` / Responses API + Structured Outputs(`strict: true`)
- 이미지 입력은 signed URL보다 **Base64 data URL** 우선
- 환경변수: `OPENAI_TWIN_GENERATION_MODEL`, `OPENAI_TWIN_REVIEW_MODEL`, `TWIN_PROMPT_VERSION`
- **2026-09-23 공식 문서에서 세 모델(`astra`/`sol`/`luna`)의 존재를 확인했다.**
  Claude가 CP-002 회신에서 "확인할 수 없는 이름"이라고 보고한 것은 **틀렸다.** 지식 기준일 이후 모델이었다.

### D-037 — 파일럿 유형 선정 기준

- 상태: `CONFIRMED`
- 결정: 질문 데이터가 없으므로 **자동 검산 가능성 + 학년 분산 + 문항 수**로 층화 선정한다.
- 필수 조건: 쌍둥이 없는 179개 유형 / 유형 내 `answer_text` 보유 원문 5개 이상 /
  `answer_kind in ('number','choice')` / 새 그림 없이 텍스트로 재구성 가능 /
  서술형·복수정답·`answer_kind='image'` 제외
- 구성(CP-007 원안): 중1 3 · 중2 4 · 중3 3
  → **실행 불가.** 쌍둥이 없는 179개 유형이 **전부 공통수학1(고등)** 이다. 아래 참고.

### D-038 — 유사도 임계값 보류

- 상태: `CONFIRMED`
- 결정: 파일럿 전에는 `similarity_to_source` 자동 탈락 임계값을 **정하지 않는다.**
- 이유: 점수와 교사 판단의 관계를 보지 않고 숫자를 정하면 정상 문항을 버리거나 복제 문항을 통과시킨다.
- 파일럿: 유사도는 **정렬·경고용으로만**. 높은 유사도 후보를 자동 승인하지 않는다.
  100개 검수 후 거부/승인 분포를 비교해 임계값을 제안한다.

---

## Claude 발견 — D-037 학년 구성이 실행 불가하다  ★

운영 DB 조회 결과, **쌍둥이가 없는 190개 유형의 학년 분포가 이렇다.**

| 학년 | 쌍둥이 없는 유형 | 문항 | 사용 가능(`answer_text` + number/choice) |
|---|---|---|---|
| **공통수학1 (고등)** | **179** | 6,440 | **4,001** |
| 중1 | 11 | 21 | **0** (전부 교과서-NE능률, 정답 텍스트 없음) |
| 중2 · 중3 | **0** | — | — |

쎈↔쎈B 쌍둥이가 **중등 전 범위를 덮고 있어** 중등에는 빈 유형이 사실상 없다.
고등은 쎈B에 해당하는 교재가 없어 쌍둥이가 전무하다.

→ **D-032의 "179개 유형"은 맞지만, 그 179개가 전부 고등이다.**
→ D-037의 "중1 3 · 중2 4 · 중3 3" 구성은 실행할 수 없다. 고등 단원 분산으로 대체해야 한다.
→ **`twin-gen-v1.0` 프롬프트가 "한국 중학교 수학 문항"으로 시작한다. 대상과 맞지 않는다.**
  Claude가 임의로 고치지 않고 GPT Work의 판단을 기다린다 (불변 원칙 1).

---

## CP-008에서 확정된 결정 (2026-09-23)

> 적용 순서: **CP-006 → CP-007 → CP-008**

### D-039 — `known_answer_explanation` 진입은 명시적 정보 우선

- 상태: `CONFIRMED`
- 결정: **명시적 진입 정보가 우선**이고, 자유 입력 분석은 **보조 수단으로만** 쓴다.
- 이유: 단순 문자열 비교로는 학생이 정답을 알고 말한 것인지 구분할 수 없다.
  오판 사례 — "답이 2가 **아닌** 것 같아요"를 정답 주장으로 오해 / 풀이 중간값이 우연히 정답과 같음 /
  객관식 번호와 계산 숫자 혼동 / 동치식 판정 오류
- 우선순위
  1. StudyCheck 자기채점에서 진입 → `entry_context='after_self_grading'`
  2. 질문 시작 화면에서 학생이 선택 (「정답은 확인했는데 풀이를 모르겠어요」 / 「어디서부터 모르겠어요」)
  3. 대화 중 학생이 "답은 봤다"고 명시
  4. **정답 문자열 일치만으로는 자동 전환하지 않는다**
- `student_stated_answer` 감지는 보조 신호로 기록만 하고 단독 트리거로 쓰지 않는다.

### D-040 — `safe_worked_example`은 사람이 승인한다

- 상태: `CONFIRMED`
- 결정: 생성 모델도 자동 검산기도 이 값을 `true`로 만들 수 없다. 기본값 `false`.
- 이유: `true`면 학생에게 예제의 **마지막 값까지** 보여줄 수 있으므로 게시 권한과 같은 수준으로 보호해야 한다.
- 규칙: 생성 시 `false` / 결정론적 검산 통과만으로 자동 전환 **금지** / 원문 역산 불가 확인 /
  **교사 검수 화면에서 관리자가 별도 승인** / `safe_approved_by`·`safe_approved_at` 기록 /
  승인 후 원문이나 생성 규칙이 바뀌면 `false`로 되돌림

### D-041 — `approved`와 `published` 분리

- 상태: `CONFIRMED`
- 결정: 둘을 분리하고 **학생에게 보이는 것은 `published`만** 허용한다.
- 이유: 검수 승인 직후 즉시 노출되면 최종 묶음 확인이나 게시 시점 조절이 불가능하다.
- `approved` = 내용 검수 완료, **아직 학생 비노출** / `published` = 원장·관리자의 명시적 게시
- **학생용 API는 `status='published'`만 반환한다.** 게시 취소 시 `approved`로 되돌릴 수 있다.

---

## 원장님 지시 — 일의 순서 (2026-09-23, 구두)

### D-042 — 실행 명령은 GPT Work가 내린다

- 상태: `CONFIRMED` (원장님)
- 결정: **기획과 실행 명령은 GPT Work가 내리고, Claude Code는 그 지시를 받아 움직인다.**
- 경위: Claude가 먼저 SQL을 만들어 실행까지 갔다가, 뒤이어 온 CP-007 §9의
  "아직 실행하지 마세요"와 어긋나 같은 테이블을 두 번 만들게 됐다.
- 분담: 기획·설계·정책·실행 명령 = **GPT Work** / 코드·SQL·문서 작성, 기술 검증, 충돌 보고 = **Claude Code** /
  실제 DB 실행·최종 승인 = **원장님**
- Claude가 GPT 지시 없이 하지 않는 것: 운영 DB 실행 / 유료 API 호출 / 배포 /
  의존성 추가(`package.json` 변경) / 기존 코드·데이터 변경
- **단, 만들고 검증하고 어긋난 것을 보고하는 일은 멈추지 않는다.** GPT는 저장소와 운영 DB를
  볼 수 없으므로, 실제와 맞지 않는 지시는 **실행 전에** 알린다.
- `AGENTS.md`에 규칙으로 기록했다.

---

## GPT-EXEC-001 REV.2에서 확정된 결정 (2026-09-23)

### D-043 — 제작 대상은 전부 공통수학1

- 상태: `CONFIRMED`
- 결정: 쌍둥이 신규 제작 대상 **179개 유형은 전부 공통수학1**이며, **중등용 생성 가정은 폐기**한다.
- 근거: 운영 DB 조회 — 쌍둥이가 없는 유형이 공통수학1 179개 / 중1 11개(전부 `answer_text` 없음) /
  중2·중3 **0개**. 쎈↔쎈B 4,025쌍이 중등 전 범위를 덮고 있다.

### D-044 — 프롬프트를 공통수학1 기준 v1.1로 교체

- 상태: `CONFIRMED`
- 결정: 생성·검토 프롬프트를 `twin-gen-v1.1` · `twin-review-v1.1`로 교체한다.
- v1.0 → v1.1 변경점
  - 대상: "한국 중학교 수학" → **"한국 고등학교 공통수학1"**
  - 규칙 8: "선수 개념" → **"상위 과정 개념"** 금지
  - 규칙 9: "정수 계산 중심이면 복잡한 분수·무리수 금지" →
    **"수 체계와 계산 복잡도를 원문 유형에 맞춘다. 복소수·분수·무리수가 필요하면 쓸 수 있다"**
- 규칙 9 변경이 중요하다. 파일럿에 **복소수의 뜻과 분류**(`공수1-03-01`)가 있어
  v1.0 기준을 그대로 적용하면 유형 자체가 성립하지 않는다.
- v1.0 파일은 **버전 이력을 위해 삭제하지 않고** 대체 표시만 했다.

### D-045 — `zod`·`openai` 설치 승인

- 상태: `CONFIRMED`
- 결정: `zod@4.6.5`, `openai@7.22.0` 설치를 **사후 승인**하고 유지한다.
- 이유: 현재 구현에 필요한 정상 의존성.
- 참고: `tsx@4.23.15`(dev)는 완료 기준 10(테스트 통과)을 채우기 위해 추가했다.
  REV.2 §1의 "로컬 테스트·빌드 허용" 범위로 판단했고 `CLAUDE_RESULT_001`에 보고했다.

### GPT_BRIEF(6) A~F에 대한 REV.2의 회신

| 항목 | 명령 |
|---|---|
| A. 운영 DB SQL 실행 | **불허** — 빈 `public.twin_candidates`는 긴급 장애가 아니다. 새 private SQL 실행 시점에 같은 트랜잭션에서 정리 |
| B. 모듈·API·검수 화면 | **허용** — mock 기반 |
| C. 후보 100건 실제 API 호출 | **불허** — 별도 실행명령에서 허가 |
| D. 프롬프트 학년 수정 | **GPT가 완료** (v1.1) |
| E. 파일럿 10개 유형 | **조건부 승인** — 이미지 의존도가 높은 유형은 표본 확인 후 확정 |
| F. `zod`·`openai` | **사후 승인** |

### 파일럿 유형 확정 — 표본 확인 결과 (Claude, 2026-09-23)

REV.2 §217이 요구한 표본 확인을 했다. **그림 의존이 의심되던 3개 유형의 원문을 실제로 열어 봤다.**

| 유형 | 표본 | 결과 |
|---|---|---|
| `공수1-09-08` 수형도를 이용하는 경우의 수 | 쎈 1101 · 풍산자 필수 737 | **둘 다 순수 텍스트** |
| `공수1-08-21` 이차방정식의 근의 분리 | 쎈 1003 · 개념+유형 08052 | **둘 다 순수 텍스트** |
| `공수1-08-08` 이차부등식이 해를 가질 조건 | 쎈 0951 · RPM 0833 | **둘 다 순수 텍스트** |

**유형명의 "수형도"·"근의 분리"는 푸는 방법을 가리키는 것이지 문항에 그림이 있다는 뜻이 아니었다.**
Claude가 `CLAUDE_BLOCKER_001`에서 제기한 "그래프 의존으로 `unsupported` 비율이 높을 수 있다"는
우려는 표본상 근거가 없다. → **제안한 10개 유형을 교체 없이 확정한다.**

---

## GPT-EXEC-002 REV.2에서 확정된 결정 (2026-09-23)

### D-046 — private 접근은 SECURITY DEFINER RPC로만

- 상태: `CONFIRMED`
- `private` 를 PostgREST 노출 스키마에 **추가하지 않는다.**
- 앱은 `public` 의 SECURITY DEFINER 함수만 호출한다.
- 관리자 함수는 **본문에서 `public.is_admin()` 을 다시 확인**한다 (권한 부여만 믿지 않는다).
- 서버 저장 함수는 `service_role` 만 실행할 수 있게 분리한다.
- API의 `denyIfNotStaff(req, { adminOnly: true })` 도 유지해 **API와 DB에서 이중 검사**한다.
- **확인**: `public.is_admin()`·`is_staff()` 는 인자 없는 `auth.uid()` 기반 SECURITY DEFINER 다.
  service-role 로 부르면 `auth.uid()` 가 null 이라 자동으로 false 가 되므로,
  관리자 동작을 service-role 로 우회하는 경로가 DB 차원에서 막힌다.

### D-047 — 이번 단계에 CAS를 넣지 않는다

- 상태: `CONFIRMED`
- `mathjs` 등 CAS 의존성을 추가하지 않는다. 자연어 `solution_outline` 을 계산식으로 재해석하지 않는다.
- **결정론적 검산기가 없는 경우는 오답이 아니라 `unverified`** 로 기록하고 전량 교사 검수한다.
- `ai_consensus_passed` 만으로 `independent_check_passed` 를 올리지 않는다.

### D-048 — 안전 예제는 철회 가능하되 노출 이력은 보존한다

- 상태: `CONFIRMED`
- 관리자는 안전 예제 표시와 게시를 **중단할 수 있어야 한다.** 회수하지 못하는 구조는 금지한다.
- 단 **최초 승인·최초 게시 이력은 삭제하지 않는다.** 한 번 학생에게 나간 사실은 되돌릴 수 없다.
- 화면 문구를 고쳤다 — ~~"켜면 되돌릴 수 없습니다"~~ →
  **"나중에 끌 수 있지만, 학생에게 공개된 내용은 이미 본 학생에게서 회수할 수 없습니다."**
- 현재 활성 상태와 최초·최근 변경 이력을 칼럼으로 분리했다
  (`safe_worked_example` / `safe_first_approved_by`·`_at` / `safe_last_changed_by`·`_at`).

### 저장소 모드 (GPT-EXEC-002 §196)

```
TWIN_REPOSITORY_MODE = fixture | supabase
```

production 에서 값이 없거나 `fixture` 면 **fail closed** — 예외를 던지고 멈춘다.
RPC·환경설정 오류가 나도 fixture 로 **자동 fallback 하지 않는다.**
조용히 예시 데이터를 보여주면 원장님이 가짜를 진짜로 알고 승인하게 되기 때문이다.

---

## GPT-EXEC-003에서 확정된 결정 (2026-09-23)

### D-049 — 전용 비노출 스키마 `ai_question_private`

- 상태: `CONFIRMED`
- 공용 이름 `private` 대신 **`ai_question_private`** 를 쓴다.
- 이유: 다른 기능이 `private` 를 쓸 때 광범위한 revoke·drop 이 영향을 주는 것을 막는다.
- Supabase Exposed Schemas 에 **추가하지 않는다.** 앱은 계속 `public` 의 RPC 만 부른다.

### D-050 — 안전 승인과 게시 상태를 DB에서 결합

- 상태: `CONFIRMED`
- **`safe_worked_example=true` 인 practice 만 게시할 수 있다.** CHECK 제약으로 DB가 강제한다.
- 게시 중인 practice 의 안전 승인을 끄면 **같은 트랜잭션에서 자동 게시취소**하고 학생 자산을 끈다.
- 학생 자산 활성 조건: `practice.status='published' AND safe_worked_example=true AND asset.is_active=true`

### D-051 — 폐기 상태 `retired`

- 상태: `CONFIRMED`
- 승인된 후보를 사후 거부하면 연결 practice 를 `retired` 로 바꾸고
  `safe_worked_example=false`, `retired_at=now()` 처리하며 학생 자산을 즉시 끈다.
- `retired` 는 다시 안전 승인·게시할 수 없다.

### D-052 — 감사 사용자 ID는 auth UID로 명시

- 상태: `CONFIRMED`
- `auth.uid()` 를 담는 칼럼은 **`*_by_auth_uid`** 로 이름을 바꾸고 `public.users(id)` FK를 걸지 않는다.
- **운영 DB 확인 결과 이 지적이 정확했다** — `auth.users` 257행 / `public.users` 11행.
  학생 익명 세션 때문이다. 직원 프로필 행이 지워지면 감사 기록이 통째로 깨진다.

### D-053 — 검증 상태 불변식을 DB가 강제

- 상태: `CONFIRMED`
- `format_validation_passed=false` → `rejected` / `verification_status='failed'` → `rejected`
- 형식 통과 + `verified|unverified` 만 `pending_review`
- `deterministic_check_passed` 또는 `independent_check_passed` 가 true 면
  `verification_status='verified'` 이고 `check_method in ('rule','cas')` 여야 한다
- `ai_consensus_passed` 는 위 두 플래그를 절대 켜지 못한다
- `server_update_twin_validation` 은 `generated` 상태에서만 동작한다.
  **승인·거부 후에는 검증값 변경을 거부한다.**

### D-054 — 모델 설정 유지, 이번 회차 호출 금지

- 상태: `CONFIRMED`
- `gpt-6-astra`·`gpt-6-sol` 은 실제 모델 ID 이므로 이름을 유지한다.
- 비용·품질 비교는 파일럿 10건의 토큰 사용량과 교사 승인률을 얻은 뒤 다시 정한다.

---

## GPT-EXEC-005에서 확정된 결정 (2026-09-23)

### D-055 — 교사 수정 승인을 DB의 정식 상태로 허용

- 상태: `CONFIRMED`
- **이전 CHECK 제약이 교사 수정 승인 경로를 막고 있었다.** 교사가 내용을 고치면
  `format_validation_passed` 가 false 로 내려가는데, "형식 실패면 rejected" 라는 일괄 규칙이
  `approved` 를 허용하지 않았다. 원장님이 문항을 고쳐 승인하려 했다면 그 자리에서 막혔을 것이다.
- `approved + teacher_edited=true` 는 아래를 모두 만족하는 **유효한 행**으로 정의한다.
  `teacher_approved=true` · `practice_problem_id is not null` ·
  형식/결정론/독립/AI 플래그 전부 false · `verification_status='unverified'` ·
  `unverified_reason='teacher_edited'` · `check_method='none'`

### D-056 — 설치 후 검증은 실패를 오류로 종료

- 상태: `CONFIRMED`
- 모든 필수 검증은 실패 시 `raise exception` 으로 스크립트를 실패시킨다.
- 예상된 실패는 `when others` 로 통과시키지 말고 **정확한 SQLSTATE·오류 코드**를 확인한다.
- 이유: `warning` 만 출력하면 비전문 사용자가 실패한 설치를 성공으로 오인한다.

### D-057 — 롤백 SQL에서 CASCADE를 쓰지 않는다

- 상태: `CONFIRMED`
- `twin_cand_practice_fk` 를 명시적으로 제거한 뒤 의존 순서대로 삭제한다.
- 이유: 미래에 다른 객체가 참조하게 되어도 롤백이 예상 밖 의존성을 조용히 제거하면 안 된다.

### D-058 — 자동 거부 범위를 생성 그룹으로 통일

- 상태: `CONFIRMED`
- `source_problem_id + source_fingerprint + prompt_version + batch_id` 가 모두 같은 후보만 거부.
- SQL 과 fixture 양쪽에서 같은 기준을 쓴다.

### D-059 — RPC 응답을 엄격하게 파싱

- 상태: `CONFIRMED`
- Zod 로 검증한다. `Boolean(...)`·`Number(...)`·문자열 변환·잘못된 배열을 `[]` 로 바꾸는
  **묵시적 보정을 금지**한다.
- 이유: DB 계약이 깨졌을 때 화면이 조용히 그럴듯한 잘못된 상태를 보여주면 검수 안전장치가 무력화된다.

### D-060 — 관리자 저장소와 서버 저장소를 구조적으로 분리

- 상태: `CONFIRMED`
- `AdminTwinRepository` 에는 생성·검증 메서드가, `ServerTwinRepository` 에는 승인·게시 메서드가
  **존재하지 않는다.**
- 이유: DB 권한 거부에만 기대지 않고 애플리케이션 구조에서도 경로를 없앤다.

### D-061 — 학생 응답에 정답·풀이를 포함하지 않는다

- 상태: `CONFIRMED`
- `retired`·미게시·`safe=false` 는 항상 `null` 을 반환한다.
- 성공 payload 의 키와 직렬화 문자열 어디에도 정답·풀이·마지막 값·검증 내부정보가 없다.

### D-062 — 검수 묶음은 의존성까지 완전해야 한다

- 상태: `CONFIRMED`
- 테스트나 제출 파일이 직접 import 하는 작업 파일을 빠뜨리지 않는다.
- 004 묶음에 `fixtures.ts`·`generate.ts`·`targets.ts`·`source.ts` 가 빠져
  `npm run test:twin` 을 재현할 수 없었다.

### D-063 — 최종답 공개 가능성 플래그를 제거

- 상태: `CONFIRMED` (GPT-EXEC-006 작업 A)
- 학생 payload 는 `id` · `type_code` · `problem_text_latex` **세 필드뿐**이다.
- `can_show_final_value` 는 타입·코드·SQL·UI 에서 전부 없앴다. 호환용 이름도 남기지 않았다.
- 이유: 지금 값이 꺼져 있어도 "보여줘도 된다"는 계약이 남아 있으면 나중에 그 문으로 정답이 나간다.
- 되돌리는 법: `lib/twin/publish.ts` 의 `StudentSafeExample` 에 필드를 되살리면 된다. 하지 말 것.

### D-064 — '마지막 값 공개 승인'을 '학생 게시 안전검수'로 개명

- 상태: `CONFIRMED` (GPT-EXEC-006 작업 A)
- DB: `safe_worked_example` → `student_publish_approved`, 감사 칼럼 4개와
  `admin_set_safe_worked_example` → `admin_set_student_publish_approval` 까지 일괄 변경.
- TS/UI: `setStudentPublishApproval`, `approve_student_publish` / `revoke_student_publish`,
  화면 문구 「학생 게시 안전검수 완료」.
- 이 승인의 뜻: **문제 본문에 정답·풀이·힌트가 없고 원문 답을 역산하기 어렵다.**
  최종답 공개 허용이 아니다.
- 감사 원칙은 그대로다 — 최초 승인자·시각은 철회해도 지우지 않고, 게시 중 철회는 같은
  트랜잭션에서 게시와 학생 자산을 내리며, `retired` 는 안전검수할 수 없다.
- 되돌리는 법: 설치 전이므로 `docs/sql/쌍둥이_설치.sql` 한 파일만 되돌리면 된다.

### D-065 — 생성 고유키에 batch_id 를 포함

- 상태: `CONFIRMED` (GPT-EXEC-006 작업 B)
- 키: `source_problem_id + source_fingerprint + prompt_version + batch_id + candidate_no`
- 같은 batch 재시도 → 기존 행 반환. 새 batch → 같은 프롬프트라도 **새 후보**.
- `CreateCandidatePayload.batch_id` 는 필수 UUID 다. 없거나 UUID 가 아니면 `invalid_payload`.
- 승인 시 자동 거부는 **같은 batch 안에서만** 일어난다 (D-058 유지).
- 되돌리는 법: UNIQUE 와 `ON CONFLICT` 에서 `batch_id` 를 빼면 된다. 그러면 재생성이 막힌다.

### D-066 — null 을 정상값으로 가장하지 않는다

- 상태: `CONFIRMED` (GPT-EXEC-006 작업 F)
- `reverse_derivation_risk` · `difficulty_delta` · `single_answer_claim` · `check_method` ·
  `variant_kind` 의 기본값 치환을 없앴다. null 은 null 로 남고 화면은 **「미확인」** 으로 쓴다.
- 이유: `'low'`·`0`·`false` 로 바꾸면 "확인 안 됨"이 "안전함"으로 읽혀 원장님 판단을 왜곡한다.
- 예외: `student_publish_approved` · `is_published` 의 `null → false` 는 남긴다.
  이 방향은 **"승인 안 됨 / 게시 안 됨"이라는 보수적 방향**이다. 반대 방향은 금지.

### D-067 — 원문 지문(fingerprint)은 fail closed 로 계산

- 상태: `CONFIRMED` (GPT-EXEC-006 작업 C)
- SHA-256, 고정 순서 canonical 입력. 이미지가 있으면 Storage 의 `updated_at` 과 ETag 를 포함한다.
- **Storage 메타 조회가 실패하면 임의 해시로 진행하지 않고 그 원문을 실패 처리한다.**
- 이유: 대충 넘어가면 바뀐 이미지를 안 바뀐 것으로 착각해 옛 후보를 재사용한다.
- 되돌리는 법: `lib/twin/fingerprint.ts` 를 지우면 파이프라인이 컴파일되지 않는다.

### D-068 — 검수 묶음은 tar.gz 로 만든다

- 상태: `CONFIRMED` (GPT-EXEC-006)
- ZIP 은 한글 파일명 인코딩이 환경마다 깨진다. tar.gz 로 UTF-8 이름을 보존한다.
- `MANIFEST.sha256` 을 넣고, 푼 뒤 `sha256sum -c` 가 전부 OK 여야 제출한다.

### D-069 — 대상 유형 집계 RPC 를 추가

- 상태: `CONFIRMED` (GPT-EXEC-006 작업 D · §274)
- `lib/twin/targets.ts` 의 `listEligibleTypes()` 가 부르던 `twin_eligible_types` 는
  **설치 SQL 에 없는 이름**이었다. 그대로 두면 파일럿 유형 선정이 런타임 오류로 끝난다.
- `public.server_list_eligible_twin_types(integer, text)` 를 설치 SQL 에 추가했다.
  `security definer` · `set search_path = ''` · **service_role 전용**.
- 설치·권한·설치전 점검·설치후 검증·롤백의 함수 개수를 8 → 9 로 모두 갱신했다.
- 되돌리는 법: `docs/sql/쌍둥이_롤백.sql` 의 drop 한 줄. 코드는 이 이름만 부른다.

### D-070 — 이름 충돌 판단 기준을 설치 SQL 과 점검 SQL 에서 통일

- 상태: `CONFIRMED` (GPT-EXEC-006 §288)
- 기준: **이름이 같으면 인자가 달라도 중단**한다.
- 이전에는 설치 SQL 이 이름 기준, 점검 SQL 이 시그니처 기준이어서 점검은 OK 인데 설치는
  중단되는 경우가 생길 수 있었다.
- 점검 SQL 은 이제 `v_fail > 0` 이면 `raise exception` 으로 실패 종료한다 (notice 로 끝내지 않는다).

### D-071 — 검수 API 요청 본문을 Zod 로 검증

- 상태: `CONFIRMED` (GPT-EXEC-006 작업 E §316)
- `lib/twin/reviewApi.ts` 의 `ReviewRequestZ` 가 동작별 모양을 `.strict()` 로 확인한다.
  배열 자리의 문자열, 허용되지 않은 편집 키, 계약 밖 필드를 **조용히 캐스팅하지 않는다.**
- 편의 검사일 뿐 최종 권위는 DB CHECK 와 RPC 다 (D-046 유지).

### D-072 — 대상 유형 선정 의미는 현재 구현이 맞다

- 상태: `CONFIRMED` (GPT-EXEC-007)
- 같은 `type_code` 에 기존 `twin_id` 가 하나라도 있으면 그 유형 **전체를 제외**한다.
- 생성 원문은 그중 `twin_id is null` · `answer_text` 보유 · `number|choice` · 비서술형만 쓴다.
- 이유: D-032·D-037 의 대상이 명시적으로 "쌍둥이가 없는 179개 유형" 이다.
- 코드를 바꾸지 않았다. `server_list_eligible_twin_types` 가 이미 이대로다.

### D-073 — 파일럿 총량은 유지하되 실제 호출은 2단계로 연다

- 상태: `CONFIRMED` (GPT-EXEC-007)
- 최종 파일럿: 10유형 × 원문 5개 × 후보 2개 = 후보 100개. 전량 교사 검수, 유형당 1~2개만 승인·게시.
- 최초 유료 호출은 **1유형 × 원문 1개 × 후보 2개** 스모크만 먼저.
- 스모크에서 이미지 입력·응답 파싱·저장·독립 검토·검수 화면까지 확인한 뒤 나머지 98개.
- 단계 분리가 총량을 바꾸지 않는다.

### D-074 — 측정할 수 없는 유사도는 null 이다

- 상태: `CONFIRMED` (GPT-EXEC-007 작업 C)
- 후보 본문과 원문 **정답**을 비교하던 `similarityToSource` 를 **삭제**했다.
  그건 유사도가 아니고, 값이 늘 낮게 나와 "원문을 베끼지 않았다"는 잘못된 안심을 준다.
- 원문 OCR/정규화 본문이 생기기 전까지 `similarity_to_source = null` 로 저장한다.
- 화면은 D-066 과 같이 **「미확인」** 으로 표시한다. 0 으로 쓰지 않는다.
- 되돌리는 법: `lib/twin/verify.ts` 주석에 적어 둔 `compareProblemTexts(후보본문, 원문본문)`
  모양으로 새로 만든다. 정답을 넘길 수 있는 자리를 두지 않는다.

### D-075 — 이미지가 있는 원문은 이미지 로드 실패 시 중단한다

- 상태: `CONFIRMED` (GPT-EXEC-007 작업 B)
- `image_path` 가 null/빈 값인 원문만 이미지 없이 진행한다.
- 경로가 있는데 다운로드 실패 · 0바이트 · 지원 밖 형식 · data URL 생성 실패면
  그 원문을 `image_load_failed` 로 끝낸다. **생성/검토 모델과 저장 RPC 를 하나도 부르지 않는다.**
- 이유: 예전 판은 실패해도 `null` 로 진행해서, 모델이 **원문을 보지 않고** 문항을 만들 수 있었다.
- `lib/twin/storage.ts` 신규. 옛 `loadSourceImageAsDataUrl` 을 호환용으로 남기지 않았다.
- 되돌리는 법: `storage.ts` 의 예외를 null 반환으로 바꾸면 된다. 하지 말 것.

### D-076 — 같은 batch 재시도는 모델을 다시 부르지 않는다

- 상태: `CONFIRMED` (GPT-EXEC-007 작업 D)
- 캐시 식별자: `source_problem_id + source_fingerprint + prompt_version + batch_id`.
- 같은 묶음에 후보 1·2 가 모두 있고 상태가 완결(`generated` 가 아님)이면
  기존 ID·상태를 반환하고 **이미지·생성·검토·DB 쓰기를 모두 생략**한다.
- 일부만 있거나 번호·개수가 어긋난 묶음은 자동 보충하지 않고 `incomplete_batch` 로 중단한다.
- 새 `batch_id` 는 의도적인 재생성이다. D-065 와 모순되지 않는다.
- 되돌리는 법: `server_get_twin_batch_state` RPC 와 파이프라인 3~4단계를 빼면 된다.
  그러면 재시도가 유료 호출을 또 하고 `invalid_state` 로 깨진다.

### D-077 — 파이프라인은 실제 원문 상태만 검사한다

- 상태: `CONFIRMED` (GPT-EXEC-007 작업 A)
- `SourceProblem` 에 `twin_id: number | null` 과 `is_essay: boolean` 을 넣었다.
- `pipeline.ts` 가 그 **실제 값**을 `isEligible()` 에 넘긴다. 상수 대입은 금지한다.
- 이유: 예전 판은 `twin_id: null, is_essay: false` 를 상수로 넣어 사실상 아무것도 검사하지 않았다.
- `pickSourceProblems()` 는 타입이 이상하면 조용히 보정하지 않고 그 조회를 실패시킨다.
- 앱 필터와 DB RPC 의 이중 차단은 그대로 유지한다.

### D-078 — verified 는 양방향 불변식이다

- 상태: `CONFIRMED` (GPT-EXEC-007 작업 F)
- (→) `deterministic_check_passed` 또는 `independent_check_passed` 가 true 이면
  `verified + rule|cas` 여야 한다. (기존 규칙 유지)
- (←) `verification_status='verified'` 라면 위 결정론적 플래그 중 하나가 반드시 true 이고
  `check_method in ('rule','cas')` 여야 한다. (이번에 추가)
- AI 합의만으로는 **어느 방향에서도** `verified` 가 될 수 없다.
- 테이블 CHECK 와 `server_update_twin_validation` 양쪽에서 강제한다.
- 되돌리는 법: CHECK 의 두 번째 `and (...)` 절과 RPC 의 `if v_vs = 'verified' and not (...)` 한 줄.

### D-079 — 모델 원응답 별칭을 보존하지 않는다

- 상태: `CONFIRMED` (GPT-EXEC-007 작업 E)
- `GenerationOutcome` 의 `raw` 필드를 제거했다. 파싱을 통과한 도메인 객체만 다음 단계로 간다.
- 이유: 원응답을 들고 다니면 로그·오류·API 응답 어딘가로 흘러나간다.
- 일반 로그·오류·API 응답에 원문·정답·이미지 data URL·모델 원응답을 넣지 않는다.

### D-080 — 검수 아카이브는 기본 tar 명령으로 풀려야 한다

- 상태: `CONFIRMED` (GPT-EXEC-007 작업 G)
- 006 묶음은 해시는 맞았지만 잘못된 UID/GID 복원 때문에 기본 `tar -xzf` 가 비정상 종료했다.
- 이제 `--owner=0 --group=0 --numeric-owner` 로 이식 가능한 소유권을 기록한다.
- 새 임시 디렉터리에서 **추가 옵션 없는** `tar -xzf` 가 exit 0 이고,
  이어서 `sha256sum -c MANIFEST.sha256` 도 전부 OK 여야 제출한다.

### D-081 — 입력 계약을 모델 호출 전에 닫는다

- 상태: `CONFIRMED` (GPT-EXEC-007 작업 E)
- `candidateCount` 는 이번 파일럿에서 **정확히 2**만 허용한다.
- `batchId` 는 필수 UUID 다. 파이프라인이 **스스로 만들지 않는다** — 만들면 재시도할 때마다
  새 batch 가 되어 같은 원문에 후보가 계속 쌓인다.
- 생성 응답의 후보 번호 집합은 정확히 `{1, 2}` 여야 한다. 중복·0·3·누락이면
  **후보 저장 전에** 생성 응답 전체를 실패 처리하고 모델 원응답을 저장·로그하지 않는다.
- 이 검사들은 Storage·모델·DB 를 부르기 **전에** 끝난다 (테스트가 호출 횟수 0회를 센다).

### D-082 — `is_essay` 는 명시적 false 만 생성 대상이다

- 상태: `CONFIRMED` (GPT-EXEC-008 작업 A)
- `is_essay = false` 만 허용한다. **`true` 와 `null` 을 똑같이 제외**한다.
- 이유: null 은 "서술형이 아님"이 아니라 **미확인**이다. 안전 쪽으로 닫는다.
- 같은 의미를 다섯 곳이 함께 쓴다.
  - 앱 조회 `pickSourceProblems()` — `.eq('is_essay', false)` (변경 없음)
  - 앱 재검사 `isEligible()` — `p.is_essay !== false` 면 false
  - 앱 변환 `strictBool()` — **null 도 조회 실패**로 던진다
  - 유형 집계 RPC — `p.is_essay = false` (`coalesce(...,false)` 제거)
  - 생성 RPC — `v_src.is_essay is distinct from false` → `source_is_essay`
- ~~안정 오류 코드는 기존 `source_is_essay` 를 유지한다.~~ → **D-090 에서 분리했다.**
  거부 정책은 같지만 코드가 `source_is_essay`(true) / `source_is_essay_unknown`(null) 로 나뉜다.
- 되돌리는 법: `isEligible()` 의 한 줄과 SQL 두 곳. 되돌리면 미확인 문항이 대상에 섞인다.

### D-083 — fingerprint 의 `updated_at` 은 대체 불가다

- 상태: `CONFIRMED` (GPT-EXEC-008 작업 B)
- 이미지가 있으면 Storage 객체의 **실제 `updated_at` 과 ETag 가 둘 다 필수**다.
- `updated_at` 이 없을 때 `created_at` 으로 대신하지 않는다. fallback 을 삭제했다.
- 둘 중 하나라도 없으면 `storage_meta_unavailable` 로 중단한다.
- 이유: 파일을 교체하면 생성 시각은 그대로인데 변경 시각만 바뀐다. created_at 으로 대신하면
  **바뀐 이미지를 안 바뀐 것으로 보고** 옛 후보를 재사용한다.
- 함께 닫은 것: 폴더형 항목(`id === null`) 거부 · `metadata == null` 거부 ·
  `arrayBuffer()` 실패를 `image_load_failed` 로 정규화.
- 되돌리는 법: `lib/twin/storage.ts` 의 `updated_at_missing` 분기 한 곳.

### D-084 — 실행 결과 숫자는 실제 명령 한 번을 기준으로 통일한다

- 상태: `CONFIRMED` (GPT-EXEC-008 작업 E)
- 테스트 선언 개수나 이전 실행 결과를 **추정해 쓰지 않는다.**
- 최종 수정 뒤 `npm run test:twin` 을 한 번 다시 실행하고, 그 출력의 `tests/pass/fail` 을
  결과 문서·브리핑·검수 문맥에 **똑같이** 적는다.
- 007 에서 실제 167개인데 문서에 166개로 적혀 있었다. 최종 수정 전 숫자를 그대로 옮긴 탓이다.
- 선언 수와 실행 수가 다르면 숫자를 맞춰 쓰지 말고 빠진 테스트 이름과 이유를 찾는다.

### D-085 — 읽기 전용 운영 사전점검을 허용한다 (008 회차 한정)

- 상태: `CONFIRMED` (GPT-EXEC-008)
- 허용 대상은 갱신된 `docs/sql/쌍둥이_설치전_점검.sql` **한 파일뿐**이다.
- SELECT · 카탈로그 조회 · `raise notice/exception` 외 운영 변경은 금지한다.
- 실행 전 정적 검사에서 변경문이 발견되면 실행하지 말고 blocker 로 보고한다.
- 이 점검이 모두 OK 여도 **설치는 자동 승인되지 않는다.**
- **008 실제 결과**: 정적 검사는 통과(변경문 0건·임시테이블 0건)했으나,
  이 세션의 auto 모드가 운영 DB 를 **읽기까지 차단**해 실행하지 못했다.
  우회하지 않고 `CLAUDE_BLOCKER_008.md` 를 만들었다.

### D-086 — Storage SDK 계약은 운영 표본으로 확인한다

- 상태: `CONFIRMED` (GPT-EXEC-008)
- 파일 목록 API 가 `updated_at` 과 metadata 를 주는 것은 공식 계약이지만,
  ETag 의 실제 키 표기(`eTag`/`etag`)는 **현재 프로젝트 표본으로 확인**한다.
- 표본 확인 전에는 추측으로 fallback 을 늘리지 않는다. 지금은 두 키만 본다.
- 운영 데이터는 읽기만 한다. 경로·ETag·이미지 내용을 결과 문서에 출력하지 않는다.
  키 존재 여부·타입·성공 개수만 보고한다.
- **008 실제 결과**: 표본 확인 미수행(권한 없음). 대신 점검 SQL `[22]` 가
  `storage.objects` 쪽에서 같은 것을 본다.

### D-087 — 설치·모델 호출은 계속 금지한다

- 상태: `CONFIRMED` (GPT-EXEC-008)
- 사전점검 성공은 "설치 가능성 확인" 이지 설치 명령이 아니다.
- `쌍둥이_설치.sql` · `쌍둥이_설치후_검증.sql` · 롤백 SQL · OpenAI API 는
  이번 회차에 실행하지 않는다.

### D-088 — 현재 MVP 의 쌍둥이 생성 원문은 실제 이미지가 필수다

- 상태: `CONFIRMED` (GPT-EXEC-009 작업 A)
- `image_path` 가 null·빈 문자열인 문항은 **생성 대상이 아니다.**
- 이유: `buildGenerationInput()` 의 `problem_ocr` 이 아직 늘 `null` 이고 문제 본문 칼럼도
  모델 입력에 없다. **이미지가 없으면 모델은 원문 문제를 전혀 보지 못한 채** 쌍둥이를 만든다.
  그렇게 만든 후보는 원문과 무관한데도 겉보기에는 멀쩡하다.
- 같은 조건을 여섯 곳이 함께 쓴다.
  - 앱 조회 `pickSourceProblems()` — `.not('image_path','is',null)`
  - 앱 재검사 `isEligible()` — trim 후 비어 있으면 false
  - 파이프라인 1단계 — `image_path: source.image_path` 를 넘긴다
  - 유형 집계 RPC — `eligible`·`number_count`·`choice_count`·HAVING **네 곳 모두**
  - 생성 RPC — `source_image_missing`
  - 설치후 검증 — 정상 원문 선정 + 음성 테스트
- 훗날 검증된 OCR·문제 본문 입력을 추가하면 **별도 결정으로** 완화할 수 있다.
- 되돌리는 법: `isEligible()` 의 한 줄과 SQL 다섯 곳. 되돌리면 모델이 원문을 못 보고 만든다.

### D-089 — Storage 불량은 원문별 격리, 구조 불량과 준비 수 부족은 전체 중단

- 상태: `CONFIRMED` (GPT-EXEC-009 작업 C)
- **중단**: `storage.objects` 없음 · 필수 칼럼(`id`·`bucket_id`·`name`·`updated_at`·`metadata`) 없음
- **경고/제외**: 엄격 원문 중 객체 없음 · `updated_at` 없음 · ETag 없음의 각 건수.
  1건만으로 전체 설치를 막지 않는다 — 파이프라인이 원문별로 이미 fail closed 라
  고장 난 원문은 안전하게 건너뛴다.
- 새로 계산하는 것
  - **사용 가능 원문**: D-088 까지 만족 + Storage 객체·`updated_at`·ETag 가 모두 정상
  - **사용 가능 파일럿 유형**: 기존 쌍둥이가 전혀 없고 사용 가능 원문이 5개 이상인 유형
- **준비도 중단**: 사용 가능 원문 = 0 또는 사용 가능 파일럿 유형 = 0
- 이유: 고장 난 원문은 건너뛰면 그만이지만, 실제로 돌릴 깨끗한 원문이 하나도 없는 상태는
  준비 완료가 아니다.
- 구조가 불완전할 때는 데이터 점검 전체를 건너뛴다. 없는 칼럼을 참조하면 중간 SQL 오류로
  끊겨 **최종 판정까지 도달하지 못한다.**
- 집계는 `count(distinct p.id)` 를 쓴다. 조인이 문항 수를 부풀리지 않게 한다.

### D-090 — `is_essay=true` 와 `is_essay=null` 의 안정 오류 코드를 구분한다

- 상태: `CONFIRMED` (GPT-EXEC-009 작업 D)
- `true` → `source_is_essay` · `null` → `source_is_essay_unknown` · `false` → 통과
- 거부 정책은 같다(D-082). 코드를 나누는 이유는 로그만 보고
  "서술형이라 뺐다"(고칠 것 없음)와 "데이터가 비어 있어 뺐다"(보정 필요)를 구분하기 위해서다.
- 앱의 1차·2차 필터는 계속 true 와 null 을 **모두** 제외한다.
- **함께 고친 것**: `toError()` 가 `KNOWN_CODES` 를 삽입 순서대로 훑어
  `source_is_essay_unknown` 메시지를 짧은 `source_is_essay` 로 잘못 보고했다.
  **긴 코드부터** 보도록 바꿨다(`CODES_LONGEST_FIRST`). 이게 없으면 코드를 나눈 의미가 사라진다.
- 영향 범위: `source_is_essay` 하나만 가정하고 분기하는 클라이언트 코드는 **없다**(`rg` 확인).
  `KNOWN_CODES` 는 Set 이라 코드 추가가 기존 동작을 바꾸지 않는다.

### D-091 — SQL 메타 확인은 설치 판단에 충분, SDK 표본은 모델 호출 전에 필수

- 상태: `CONFIRMED` (GPT-EXEC-009)
- 수정된 사전점검 SQL 이 `storage.objects.metadata` 의 `eTag`/`etag` 존재를 확인하면
  **설치 SQL 실행 여부**는 판단할 수 있다.
- SDK 응답 표본은 **설치 전에 강제로 요구하지 않는다.** 운영 읽기 권한이 없기 때문이다.
- 그러나 **유료 모델 스모크 전에는** SDK 표본 1건에서 `updated_at` · ETag 위치 ·
  정확 경로 일치 · 이미지 0바이트 초과를 확인해야 한다.
- 표본이 불가능하면 모델 스모크와 대량 생성은 계속 금지한다.

### D-092 — 수정된 사전점검의 실제 실행자는 원장님이다

- 상태: `CONFIRMED` (GPT-EXEC-009)
- Claude Code 세션은 운영 읽기가 정책상 차단돼 있으므로 **같은 시도를 반복하지 않는다.**
- 009 에서는 SQL 을 수정·정적검사·로컬 테스트만 했다.
- GPT Work 가 009 묶음을 확인한 뒤, 원장님이 Supabase SQL Editor 에서 수정된
  `docs/sql/쌍둥이_설치전_점검.sql` **한 파일**을 실행한다.

### D-093 — 파일럿 유형 준비도는 실제 유형 목록 RPC 와 같은 유형 집합에서 계산한다

- 상태: `CONFIRMED` (GPT-EXEC-010 작업 A)
- 사전점검 `[24]` 가 `join public.standard_types st on st.code = p.type_code` 를 쓴다.
- 이유: 점검은 "파일럿 유형이 있다" 고 말했는데 설치 후
  `server_list_eligible_twin_types()` 가 **빈 목록**을 주는 일이 있어서는 안 된다.
  그 RPC 는 `standard_types` 와 inner join 하므로, 점검이 join 을 빼면 두 숫자가 어긋난다.
- 유지하는 의미: 기존 쌍둥이가 하나라도 있는 유형 제외 · 정답 보유 · `number|choice` ·
  `is_essay = false` · non-empty `image_path` · Storage 객체·`updated_at`·ETag 존재 ·
  서로 다른 원문 5개 이상.
- 원문 수가 부풀지 않게 `count(distinct p.id)` 를 유지한다.
- **함께 추가한 것**: `[7-2]` `standard_types.code` 중복 수를 **중단 항목**으로 센다.
  PK/UNIQUE 계약이 확실하지 않은데 그 칼럼으로 inner join 하기 때문이다.
- 되돌리는 법: `[24]` 의 join 한 줄. 되돌리면 점검과 RPC 가 다시 어긋난다.

### D-094 — 구조 불량을 발견한 점검은 중간 SQL 오류 없이 최종 판정까지 간다

- 상태: `CONFIRMED` (GPT-EXEC-010 작업 B)
- `v_problem_ok` 가드를 둔다. 기본값은 `false` 다.
- true 조건: `public.problems` 존재 · `public.standard_types` 존재 ·
  `[11]` 참조 칼럼 15개 모두 있음 · `[7-2]` code 중복 0 · `problems.id` 가 bigint.
- false 이면 `[12]~[16]` 문제 데이터 통계와, problems 를 조인하는 `[19]~[24]`·고아 참조
  집계를 **실행하지 않고** 건너뜀 notice 를 남긴다.
- 이미 올린 `v_fail` 로 마지막 `판정: 중단 n건` 까지 도달한다.
- 참고 count(`public.users`·`auth.users`·`public.problems`)도 `to_regclass` 로 존재를 먼저 본다.
  테이블이 없을 때 점검이 중간에 끊기지 않게 한다.
- Storage 구조 가드(D-089)와 같은 원칙이다. plpgsql 은 **실행되는 구문만 파싱**하므로
  `if` 로 감싸면 없는 칼럼을 참조해도 파싱조차 되지 않는다.

### D-095 — 앱 원문 조회는 알려진 빈 문자열을 limit 전에 제외한다

- 상태: `CONFIRMED` (GPT-EXEC-010 작업 C)
- `pickSourceProblems()` 에 `.neq('answer_text', '')` 와 `.neq('image_path', '')` 를 더했다.
  기존 null 제외·`answer_kind`·`is_essay=false`·`twin_id is null`·`type_code` 조건은 그대로다.
- 이유: null 만 걸러 두면 빈 문자열 행이 id 순서상 앞에 있을 때 그 행들이 `limit` 을 채워
  **유효한 원문을 밀어낸다.** 그러면 유형 RPC 는 "생성 가능 5개 이상" 이라고 세었는데
  실제 원문 선택은 중간에 실패한다.
- 공백만 있는 값은 PostgREST 로 거르기 어렵다. `isEligible()`·`toSourceProblem()` 이
  계속 **fail closed** 로 막는다 — 조용히 정상값으로 고치지 않는다.
- DB 응답에 계약 위반 행이 섞이면 **조회 전체가 실패**한다. 그 행만 버리거나
  `limit` 을 늘려 숨기지 않는다.

### D-096 — 010 검수 전에는 운영 사전점검을 실행하지 않는다

- 상태: `CONFIRMED` (GPT-EXEC-010)
- 이번 회차도 Claude Code 는 운영 DB·Storage 에 접근하지 않았다.
- 010 묶음을 GPT Work 가 확인한 뒤, 원장님이 `PREFLIGHT_TO_RUN_010.sql` **한 파일**을 실행한다.
- 그 파일은 `docs/sql/쌍둥이_설치전_점검.sql` 과 **SHA-256 이 동일한 사본**이다.

### D-097 — 사전점검 통과 (2026-09-27 · 원장님 실행)

- 상태: `CONFIRMED` (기록)
- `PREFLIGHT_TO_RUN_010.sql` (SHA-256 `723419f0…2023a`) 을 Supabase SQL Editor 에서 **1회** 실행.
- 결과: `Success. No rows returned` · **오류·EXCEPTION 없음** → **`v_fail = 0`**
- `v_fail > 0` 이면 반드시 `raise exception` 으로 끝나므로(D-070), 오류 부재가 곧 통과다.
  notice 를 놓쳐도 판정은 남게 만든 설계가 값을 했다.
- **오류 부재로 확정되는 것**
  - 구조 13항목 전부 통과 (`[1]`~`[11]`·`[17]`). 특히 `standard_types.code` 중복 **0건**(D-093).
  - `v_problem_ok` 와 `v_storage_ok` 가 **둘 다 true** → `[18]`~`[24]` 가 건너뛰지 않고 실행됨.
    (D-094 의 가드 덕에 "건너뛴 통과" 와 "실제 통과" 가 구분된다.)
  - **사용 가능 원문 ≥ 1건**, **사용 가능 파일럿 유형 ≥ 1개**(= 사용 가능 원문 5개 이상인 유형).
  - SQL 쪽 ETag 읽기 계약이 실제 데이터에서 성립한다 — `metadata->>'eTag'` 또는 `'etag'` 중
    하나가 빈 값이 아닌 객체가 존재한다. **어느 키인지는 여전히 모른다**(D-091 유효).
- **확정되지 않는 것**: `[12]`~`[16]`·`[18]`~`[22]` 개별 수, `[23]`·`[24]` 의 정확한 값,
  고아 참조 수, ETag 실제 키. Supabase UI 가 `raise notice` 를 표시하지 않아 미수집이다.
  **추정해 채우지 않았다**(D-084).
- 남은 한계: D-073 의 파일럿 **10유형**을 채울 수 있는지 모른다. `[24] ≥ 1` 만 확정됐다.
- 기록: `PREFLIGHT_RAW_011.txt`(원시) · `PREFLIGHT_RESULT_011.md`(해석) · `CLAUDE_RESULT_011.md`
- Claude Code 는 이 실행을 관찰하지 않았고 운영 DB 에 접속하지 않았다. 추론은
  "오류가 없었다" 는 보고가 정확하다는 전제 위에 있다.

### D-098 — `v_fail > 0` 의 마지막 예외는 의도된 실패 표시다

- 상태: `CONFIRMED` (GPT-EXEC-012 §63)
- 사전점검 SQL 끝의 `raise exception` 은 버그가 아니라 **설계된 실패 신호**다(D-070 · EXEC-006 §286).
- notice 를 못 보는 환경에서도 판정이 남게 하려고 일부러 그렇게 만들었다.
- **011 실행에는 예외가 없었다.** 따라서 `v_fail = 0` 이다.
- 이 규칙 덕분에 "notice 미수집" 이 "판정 불명" 을 뜻하지 않게 됐다.

### D-099 — 사전점검 통과가 설치 자동 승인은 아니다

- 상태: `CONFIRMED` (GPT-EXEC-012 §63)
- `쌍둥이_설치.sql` 실행은 **GPT Work 의 별도 명령**으로만 한다.
- 011 통과는 "설치를 막는 조건이 없다" 는 뜻이고, "설치하라" 는 뜻이 아니다.
- D-102 가 요구하는 파일럿 준비 수치 확인이 끝날 때까지 설치는 금지다.

### D-100 — Storage SDK 표본은 유료 모델 스모크 전에 별도로 한다

- 상태: `CONFIRMED` (GPT-EXEC-012 §64)
- 011 에서는 **미실행**이다. 운영 읽기 권한이 없었고 금지 사항이었다.
- SQL 쪽 ETag 존재 집계로는 **키 표기(`eTag`/`etag`)를 확정할 수 없다.** D-091 이 유효하다.
- 유료 스모크 전에 표본 1건에서 `updated_at` · ETag 위치 · 정확 경로 일치 ·
  이미지 0바이트 초과를 확인해야 한다.

### D-101 — 011 운영 사전점검은 PASS 로 확정한다

- 상태: `CONFIRMED` (GPT-EXEC-012)
- `Success. No rows returned` + 오류·예외 없음은 이 점검 SQL 의 성공 조건과 일치한다.
- `DO` 블록이므로 결과 행이 없는 것이 정상이다.
- 개별 통계 수치는 **미수집으로 남기고 추정하지 않는다**(D-084).

### D-102 — 설치 전에 파일럿 10유형 준비 여부를 정확한 숫자로 확인한다

- 상태: `CONFIRMED` (GPT-EXEC-012)
- `[24] >= 1` 만으로는 D-073 의 **10유형 파일럿**을 보장하지 못한다.
- `[12]`~`[24]` 수치와 **사용 가능 유형 목록**을 별도 읽기 전용 조회로 확보한다.
- 이 확인이 끝날 때까지 `쌍둥이_설치.sql` 실행은 **금지**다.

### D-103 — 원장님이 실행할 운영 확인 SQL 은 결과표를 직접 반환한다

- 상태: `CONFIRMED` (GPT-EXEC-012)
- 사람에게 전달받아야 하는 값은 `raise notice` 에만 의존하지 않는다.
  현재 Supabase SQL Editor 가 notice 를 표시하지 않기 때문이다(011 에서 실제로 겪었다).
- 수치 조회 SQL 은 **하나의 결과표**를 반환해 Results 에 그대로 보이게 한다.
- **판정용 사전점검 SQL 은 변경하지 않는다.** 수치 조회는 별도 파일로 둔다.
  (판정 로직과 수치 조회를 한 파일에 섞으면, 수치를 보려고 판정 파일을 고치게 된다.)
- 신규: `docs/sql/쌍둥이_설치전_수치조회.sql` · 실행용 사본 `PREFLIGHT_COUNTS_TO_RUN_012.sql`
- 되돌리는 법: 두 파일을 지우면 된다. 점검·설치 SQL 과 독립이다.

### D-104 — 수치 조회는 개인정보·정답·경로·ETag 값을 출력하지 않는다

- 상태: `CONFIRMED` (GPT-EXEC-012)
- **허용 출력**: 집계 수 · `type_code` · 학년 · 단원명 · 유형명 · 유형별 사용 가능 원문 수.
- **금지 출력**: `answer_text`(정답 일부 포함) · 학생·학부모·직원 식별정보 ·
  `image_path` · `storage.objects.name` · 객체 id · ETag **값** · Storage metadata 원문 ·
  이미지 데이터 · 서명 URL.
- ETag 는 **존재 여부 집계만** 한다. D-091/D-100 의 SDK 표본 요구를 대체하지 않는다.
- 회귀 테스트가 SELECT 목록에 금지 열이 없는지 정적으로 확인한다.

### D-108 — 설치 전 계수 점검 통과

- 상태: `CONFIRMED` (GPT-EXEC-014 · 원장님 1회 실행 · GPT Work 검수)
- `PREFLIGHT_COUNTS_TO_RUN_012.sql` 전체 실행 결과를 **설치 전 계수 점검의 공식 결과**로 채택한다.
- 실제 결과
  - 총 **190행** = `SUMMARY` 14행 + `PILOT_TYPE` **176행**
  - 중복 `type_code` **0건**
  - 모든 후보에서 `usable_source_count = usable_number_count + usable_choice_count` **성립**
  - 엄격 조건 원문 **6,437개** → Storage 확인 후 **유효 원문 5,837개**
  - 원문 Storage 누락 **600개** (경고) · `updated_at` 누락 **0개** · ETag 누락 **0개**
  - 유효 원문 5개 이상인 유형 **176개** → 최종 verdict **`READY`**
- **실행 중 오류 1건**: 처음 일부 구문만 선택해 실행해 `42601` 구문 오류가 났다.
  실행 **전** 파싱 단계 오류라 DB 변경은 없었고, 이후 전체를 선택해 정상 실행했다.
  → 실행 안내문에 "반드시 전체 선택" 을 못 박았다(`INSTALL_RUNBOOK_014.md`).
- Claude Code 는 운영 DB 를 조회하지 않았다. 위 수치는 **전달받은 결과**다.

### D-109 — Storage 누락은 파일럿 비차단 경고

- 상태: `CONFIRMED` (GPT-EXEC-014)
- 원문 Storage 누락 **600개**, 전체 고아 이미지 참조 **899개**는 **별도 정리 대상으로 기록**하되
  해당 문항을 후보에서 제외하고 진행한다.
- 이유: 유효 원문만으로 **176개 유형 · 5,837문항**이 남아 파일럿 품질과 수량에 영향이 없다.
- D-089 의 "데이터 불량은 원문별 격리" 가 실제 데이터에서 그대로 적용된 사례다.
- 되돌릴 것 없음. 정리 작업은 파일럿과 **독립적으로** 나중에 한다.

### D-110 — 1차 파일럿 범위는 `공통수학1` 로 한정

- 상태: `CONFIRMED` (GPT-EXEC-014)
- 확인된 176개 유형이 **전부 `공통수학1`** 이므로 1차 파일럿은 공통수학1 전용으로 명시한다.
- 이번 결과를 **중학교·다른 고등 과정의 준비 완료 근거로 확대 해석하지 않는다.**
- 이유: 실제 검증된 데이터 범위와 서비스 표시 범위를 일치시켜야 한다.
- `docs/twin/PILOT_TYPES_014.json` 의 `scope_note` 에 박아 두었고 테스트가 확인한다.

### D-111 — 균형형 10개 유형을 1차 파일럿으로 고정

- 상태: `CONFIRMED` (GPT-EXEC-014)
- 단원별 2개씩 5개 단원, 주제 다양성 + 원문 수 + `number`·`choice` 균형을 함께 고려했다.

| 단원 | type_code | 유효 원문 | number | choice |
|---|---|---:|---:|---:|
| 다항식 | `공수1-01-07` | 41 | 15 | 26 |
| 다항식 | `공수1-01-02` | 36 | 14 | 22 |
| 방정식 | `공수1-05-07` | 50 | 28 | 22 |
| 방정식 | `공수1-06-07` | 40 | 13 | 27 |
| 부등식 | `공수1-07-06` | 32 | 12 | 20 |
| 부등식 | `공수1-08-15` | 32 | 12 | 20 |
| 순열과 조합 | `공수1-09-16` | 52 | 29 | 23 |
| 순열과 조합 | `공수1-09-19` | 35 | 17 | 18 |
| 행렬 | `공수1-10-05` | 38 | 17 | 21 |
| 행렬 | `공수1-10-08` | 26 | 13 | 13 |

- 기록: `docs/twin/PILOT_TYPES_014.json` (루트에 동일 사본 `PILOT_TYPES_014.json`)
- 자동 검증 6가지를 회귀 테스트로 고정했다 — 총 10개 · 중복 0 · 단원당 2개 ·
  합 일치 · 5개 이상 · 전부 `공통수학1`.
- 되돌리는 법: manifest 를 고치면 된다. 코드·SQL 과 독립이다.

### D-112 — 설치 파일은 원장님 무편집 실행 방식으로 준비

- 상태: `CONFIRMED` (GPT-EXEC-014 작업 C·D)
- `쌍둥이_설치후_검증.sql` 의 수동 placeholder(`PUT-...-UUID-HERE`)를 **전부 제거**했다.
- 검증 SQL 이 관리자·학생을 **스스로 결정적으로 1건씩** 고른다.
  - 관리자: `public.users.role='admin'` ∧ `auth.users` 에 같은 id → `order by a.id::text limit 1`
  - 학생: `public.students.session_uid is not null` → `order by s.session_uid::text limit 1`
- 후보가 없으면 **원인을 구분한 예외**로 멈춘다 (관리자 없음 / 학생 없음).
- 고른 uuid 를 **결과표·notice·예외문 어디에도 출력하지 않는다.**
- `begin … rollback` 구조와 검증 의미는 그대로다. `commit` 은 없다.
- 이유: 운영 SQL 수동 편집은 잘못된 선택 실행과 식별자 노출 가능성을 높인다.
- 되돌리는 법: `_twin_verify_cfg` 의 두 서브쿼리를 상수로 바꾸면 된다. 하지 말 것.

### D-113 — GPT 재검수 전 설치 금지

- 상태: `CONFIRMED` (GPT-EXEC-014)
- 014 는 **파일 생성·수정·로컬 검증까지만** 한다.
- GPT Work 가 결과물을 재검수해 **별도 승인 명령**을 내리기 전에는 어떤 운영 SQL 도 실행하지 않는다.
- 이유: 설치·검증 파일의 무결성과 자동 UUID 선택 방식을 먼저 확인해야 한다.
- `INSTALL_RUNBOOK_014.md` 맨 위에 "지금은 실행하지 마십시오" 를 박아 두었고 테스트가 확인한다.

### D-114 — 질문웹앱 이름을 "씽크체크"로 확정

- 상태: `CONFIRMED` (원장님, 2026-09-27 대화)
- 질문 웹앱의 정식 명칭을 **씽크체크(ThinkCheck)**로 확정한다.
- 스터디체크와 "OO체크" 형식으로 짝을 이루는 이름이며, 정답이 아니라 학생의 "생각을 체크"한다는
  의미와, 힌트 중심(정답 비공개·소크라테스식 유도)이라는 앱의 정체성을 함께 담는다.
- 되돌릴 것 없음. 문서·코드·도메인 등에 이 이름을 쓸 때는 이 항목을 근거로 삼는다.

### D-115 — 4층 역할 구조 확정: 학생 · 씽크체크 · 스터디체크 · 강사

- 상태: `CONFIRMED` (원장님, 2026-09-27 대화)
- 원장님의 최종 목표는 **완전한 자기주도학습**이다. 학생은 학원에 오면 본인의 학습 플로우를 열고,
  그 플로우대로 공부하며, 그 내용에 맞춰 준비된 과제를 출력해 가져간다. 강사 인건비를 최소화하기
  위해 **학습태도·분석·성향·과제·학습속도 등 모든 관리는 프로그램이 담당**하는 것을 원칙으로 한다.
- 이에 따라 역할을 다음 4층으로 나눈다.

| 층 | 역할 |
|---|---|
| **학생** | 실행자. 오늘의 플로우를 열고 따라가며 공부, 막히면 씽크체크에 질문, 종료 후 매칭된 과제 수령 |
| **씽크체크** | 학습 중 실시간 조력. 정답 대신 힌트로 막힌 순간을 스스로 뚫게 함 (기존에 강사가 옆에서 즉석 질문에 답해주던 역할을 대체) |
| **스터디체크** | 관리의 두뇌. 개인별 플로우 배정·진도 큐잉, 학습 데이터(속도·오답률·집중시간·과제완료율·성향) 수집, 데이터 기반 다음 플로우 조정안 산출, 과제 자동 매칭·출력, 이상 신호 감지·강사 알림, 학부모 보고 |
| **강사(사람)** | 프로그램이 할 수 없는 것만: ① 현장 관리(착석·출결·분위기·표정) ② 정서적 라포(격려·다독임·사춘기 대화) ③ 예외 대응(스터디체크가 플래그한 것만 판단) ④ 학부모 커뮤니케이션(신뢰관계) ⑤ 방향 승인(D-116 참고) |

- 이유: 관리형 반복 업무(추적·기록·매칭)를 프로그램이 전담하면, 강사는 사람이 아니면 안 되는
  일에만 시간을 쓰게 되어 강사 1인당 담당 가능 학생 수를 늘릴 수 있다는 것이 원장님의 판단이다.
- 씽크체크와 스터디체크의 경계: 씽크체크는 **그 순간의 막힘**(문제 하나를 못 풀 때)을 담당하고,
  스터디체크는 **누적 데이터를 보고 다음에 뭘 시킬지**를 담당한다. 겹치지 않는다.
- 되돌릴 것 없음. 이후 씽크체크·스터디체크 기능 설계는 이 표를 기준으로 한다.

### D-116 — 스터디체크의 플로우 자동조정은 "강사 확인·승인 후 확정" 방식

- 상태: `CONFIRMED` (원장님, 2026-09-27 대화)
- 스터디체크가 학습 데이터를 바탕으로 다음 학습 플로우(진도·교재·순서 조정)를 산출해도,
  **완전자동으로 확정하지 않는다.** 강사가 한 번 확인하고 승인해야 그 플로우가 학생에게 노출·적용된다.
- 이유: 신뢰가 쌓이기 전에 프로그램이 진도를 통째로 바꾸면 되돌리기 어려운 실수가 생길 수 있다.
  사람이 마지막 확인을 하는 게이트를 두어 위험을 줄인다. (완전자동 전환은 추후 별도 결정 사항)
- 설계 함의: 플로우 조정안은 "제안(draft) 상태"로 먼저 생성되고, 강사 승인 액션을 거쳐야
  "확정(active) 상태"로 바뀌는 상태값 구조가 필요하다. 승인 대기 목록이 강사 화면에 노출돼야 한다.
- 되돌릴 것 없음. 완전자동으로 바꾸려면 원장님의 별도 지시가 있어야 한다.

### D-117 — 학생별 "휴먼터치 비중" 설정 기능 필요

- 상태: `CONFIRMED` (원장님, 2026-09-27 대화)
- 저학년·학습의지가 약한 학생 등은 사람의 개입 비중이 더 필요할 수 있으므로,
  전체 학생에게 동일한 자동화 기준을 적용하지 않고 **학생별로 "휴먼터치 비중"을 다르게 설정**할 수
  있게 설계한다.
- 휴먼터치 비중이 높은 학생은 스터디체크의 플로우 조정 제안 빈도·승인 요구 강도, 씽크체크의
  강사 연결 임계치(예: 같은 자리에서 막히는 횟수) 등이 더 보수적으로(사람 개입이 잦게) 동작해야 한다.
  구체적 파라미터화 방식은 이후 설계 단계에서 정한다.
- 이유: "완전 자기주도"가 모든 학생에게 똑같이 맞는 답은 아니라는 것이 원장님의 판단이다.
- 설계 함의: `students` 테이블 또는 별도 설정 테이블에 학생별 휴먼터치 비중 값(또는 단계)이 필요하다.
  스터디체크·씽크체크 양쪽의 자동화 로직이 이 값을 참조해야 한다.
- 되돌릴 것 없음. 초기값(기본 비중)을 무엇으로 할지는 별도 결정 필요 — `OPEN`.

### D-118 — 모든 쌍둥이를 완성할 때까지 질문 앱 본체를 미루지 않는다

- 상태: `CONFIRMED` (GPT-EXEC-015 §145 · GPT-EXEC-016)
- 공통수학1 유료 스모크와 검수 흐름이 통과하면 **지원 가능한 문항부터** 학생 질문 MVP 를 만든다.
- 질문 앱 본체와 학습자산 확대를 **병행**한다.
- 이유: 176개 유형 전체 제작을 기다리면 앱이 언제 나올지 알 수 없다.

### D-119 — 쌍둥이 기반 DB 설치 성공

- 상태: `CONFIRMED` (2026-09-27 · 원장님 운영 실행)
- `INSTALL_TO_RUN_014.sql` (SHA-256 `a5e441e5…f9b0`) 운영 실행 **성공**
  — `Success. No rows returned`.
- 설치는 운영 DB 에 **현재 유지 중**이다.
- **같은 설치 SQL 을 다시 실행하지 않는다.** 재실행하면 사전검사가 중단시킨다
  (`ai_question_private` 스키마가 이미 있음).
- Claude Code 는 이 실행을 관찰하지 않았다. 전달받은 결과다.

### D-120 — 014 설치 후 검증 실패는 검증문의 역할 복원 누락이다

- 상태: `CONFIRMED` (GPT-EXEC-016)
- 오류: `42501 permission denied for schema ai_question_private`
  (`[4-6]` 의 `ai_question_private.twin_candidates` 직접 조회)
- 원인: `set local role authenticated` 로 관리자 RPC 를 부른 뒤 **`reset role` 없이**
  비공개 테이블을 직접 읽었다. 검증 SQL 의 버그다.
- **이 42501 은 비공개 스키마 차단이 실제로 작동한다는 증거이기도 하다.**
- 따라서 **운영 권한을 넓히거나 비공개 스키마 접근을 허용하는 방식으로 해결하지 않는다.**
- 검증 SQL 전체가 `begin` 안에서 돌다가 중단됐으므로 검증용 행은 커밋되지 않았다.
  앞서 성공한 설치는 별도 실행이라 그대로 유지된다.

### D-121 — 관리자 RPC 와 내부 상태 확인의 역할을 분리한다

- 상태: `CONFIRMED` (GPT-EXEC-016 작업 A)
- 규칙
  1. 관리자 RPC 를 부르기 **직전에만** `set local role authenticated` + admin claims
  2. RPC 가 끝나면 **즉시** `reset role`
  3. `ai_question_private.*` 직접 조회는 **반드시 `reset role` 뒤에만**
  4. 다음 관리자 RPC 가 필요하면 역할과 claims 를 **다시** 설정
  5. 실패가 예상되는 RPC 는 예외를 삼킨 뒤 **반드시 `reset role`** 로 끝낸다.
     판정은 그 뒤에 한다 — `begin` 블록 안에서 판정용 `raise` 를 하면
     자기 자신의 handler 에 잡혀 메시지가 뒤섞이고 `reset role` 에 도달하지 못한다.
- 고친 곳: `[4-6]` `[4-8]` `[4-9]` `[4-10]` `[4-11]` `[4-12]` `[5-나]`
- `[5-나]` 는 **일부러** 비공개 스키마에 직접 접근해 42501 을 기대하는 테스트라 유지한다.
  다만 sentinel 을 써서 예외 뒤 `reset role` 이 확실히 실행되게 했다.
- 회귀 테스트가 "역할을 켠 채로 private 를 읽는 줄" 을 전수 검사한다.
  `[5-나]` 의 한 줄만 예외로 허용한다.
- 되돌리는 법: `docs/sql/쌍둥이_설치후_검증.sql` 한 파일. 설치된 객체는 건드리지 않았다.

### D-122 — 문제은행은 계속 증가하는 운영 DB

- 상태: `CONFIRMED` (GPT-EXEC-017 §130 · GPT_REVIEW_016 R016-04)
- 질문 앱과 쌍둥이 파이프라인은 **현재 문항 수를 고정값으로 간주하지 않는다.**
  새 교재·새 학년·새 유형이 계속 추가되는 것을 기본 전제로 한다.
- "176개 유형 · 5,837문항" 은 **2026-09-27 시점의 스냅샷**이다. 상수처럼 쓰지 않는다.
- 옛 제안 번호 매핑: GPT-EXEC-016 §66 의 `D-114` → **`D-122`**
  (기존 `D-114` 는 씽크체크 명칭 결정이라 그대로 둔다)

### D-123 — 유형별 학습자산 재사용

- 상태: `CONFIRMED` (GPT-EXEC-017 §134)
- 새 문항이 **기존 검수 유형**이면 대표 문항·개념 카드·영상·안전한 연습문제를 재사용한다.
- 새 `type_code` 또는 학습자산 미보유 유형만 **제작 대기열**에 올린다.
- 이유: 문항마다 쌍둥이를 새로 만들면 비용이 문항 수에 비례한다.
  유형 단위로 자산을 두면 문항이 늘어도 제작량이 늘지 않는다.
- 옛 제안 번호 매핑: GPT-EXEC-016 §70 의 `D-115` → **`D-123`**

### D-124 — 신규 문항 자동 점검과 생성·공개 분리

- 상태: `CONFIRMED` (GPT-EXEC-017 §138)
- 문제 DB 추가 후 신규·변경 문항을 다섯으로 분류한다 —
  `질문 가능` / `정답 보완` / `이미지·Storage 보완` / `표준유형 연결` / `학습자산 제작`
- **점검은 자동화할 수 있다.** 그러나 유료 모델 호출 · 문항 생성 · 학생 공개는
  **자동으로 하지 않는다.** 생성은 승인된 배치에서만, 공개는 교사 검수와 원장 승인 후에만.
- 흐름: `문제 DB 추가 → 신규·변경 점검 → 기존 유형 자산 재사용 또는 제작 대기 →
  교사 검수 → 원장 게시 → 학생 질문 가능`
- 옛 제안 번호 매핑: GPT-EXEC-016 §74 의 `D-116` → **`D-124`**
- 이번 회차에 이 기능을 **구현하지 않았다** (§148). 정책 기록만 했다.

### D-125 — 과목별 프롬프트 버전 관리

- 상태: `CONFIRMED` (GPT-EXEC-017 §142)
- 현재 `twin-gen-v1.1` · `twin-review-v1.1` 은 **공통수학1 전용**이다.
- 중등 · 공통수학2 · 대수 · 미적분 등은 해당 교육과정용 생성·검토 프롬프트와 검산 규칙을
  **별도 버전**으로 추가한다. 공통수학1 프롬프트를 다른 과정에 그대로 쓰지 않는다.
- `twinConfig.promptVersion` 이 생성 고유키에 들어가므로(D-065), 프롬프트를 바꾸면
  같은 원문이라도 새 후보가 만들어진다. 과정별 분리와 잘 맞는다.
- 옛 제안 번호 매핑: GPT-EXEC-016 §78 의 `D-117` → **`D-125`**

### D-126 — 운영 원칙: "성적관리는 시스템으로, 사람관리는 휴먼터치로"

- 상태: `CONFIRMED` (원장님, 2026-09-27 대화)
- **시스템이 맡는 것**: 학생별 학습·성적 관리, **취약 유형 재학습**, 진도·과제 산출, 반복 점검
- **강사가 맡는 것**: 필요한 기록·가이드, 친밀한 휴먼터치
- 목표: 강사의 **반복 관리 부담을 줄여 추가 노동 없이 담당 학생 수를 늘리는** 구조.
- **설계 판단 기준**: 기능을 추가할 때
  **"이것이 강사의 수동 입력·확인 부담을 늘리는가?"** 를 먼저 묻는다.
  늘린다면 그 기능은 자동화 여지를 먼저 찾는다.
- D-116(강사 승인 후 확정)·D-117(학생별 휴먼터치 비중)과 충돌하지 않는다 —
  **승인은 남기되 승인까지 가는 준비를 시스템이 다 해 둔다**는 뜻이다.
- 요구사항으로 파생되는 것: **학생별 취약 유형 재학습**.
  어떤 유형에서 반복해 틀리는지 시스템이 찾아 재학습을 제안한다.
- 이번 회차에 **구현하지 않았다.** 기획 문서와 결정 로그에 원칙만 기록한다 (원장님 지시).

---

## 운영 체크포인트 — 번호 없는 실행 기록

> 아래는 **결정이 아니라 운영 실행 결과**다. 정책을 바꾸지 않으므로 `D` 번호를 주지 않는다
> (GPT-EXEC-028 §63). 기존 D-114~D-126 의 의미는 그대로다.
> 자세한 내용은 `docs/twin/DB_CHECKPOINT_028.md`.

### CP-2026-10-02 — 025 패치 적용과 017 검증 통과

- 근거: GPT-EXEC-028 §11 (원장님 실행 화면을 GPT 가 전달)
- `PATCH_PUBLICATION_025.sql` (`62d7c260…8cb0`) 운영 실행 → `Success. No rows returned`
  → **적용 성공**으로 기록한다 (GPT-EXEC-026 승인 범위)
- 이어서 `POSTINSTALL_TO_RUN_017.sql` (`4c913d8d…5deb`) 전체 실행 →
  `Success. No rows returned` → **설치 후 검증 통과**로 기록한다 (GPT-EXEC-027 승인 범위)
- 014 설치(D-119)는 그대로 유지 중이다.

**판정 범위를 넘기지 않는다**

- Claude Code 는 이 실행들을 **관찰하지 않았다.** 운영 DB 를 조회하거나 대신 실행하지 않았다.
- 편집기에 보이는 `raise notice '모든 검증 통과…'` 는 **코드**다. 실제 NOTICE 출력으로 인용하지 않는다.
- **개별 NOTICE 와 조건부 생략 여부는 화면에서 확인되지 않았다.** 모든 세부 검사를 하나도
  생략하지 않았다고 쓰지 않는다.
- 결과창의 `0 rows` 는 **조회 결과 행 수**다. 운영 데이터 수나 검증 잔여 데이터가 0 이라는
  실측값으로 쓰지 않는다.
- 017 은 검증 트랜잭션을 ROLLBACK 하는 파일이다. 앞서 완료한 **025 패치를 제거하지 않는다.**
- 이 통과는 앱 전체 인증·보안 / 모델 생성 품질 / Storage SDK 이미지 연결 /
  학생 질문 화면 / 취약 유형 재학습의 **완료를 뜻하지 않는다.**

**과거 실패 이력은 그대로 둔다** — 014 검증의 42501(D-120) · 017 게시 단계의 42P10 ·
021 의 P0001 중단. 이번 성공을 후속 사건으로 **추가**하고, 과거 보고를 성공으로 고쳐 쓰지 않는다.

### CP-2026-10-02 — 오류 수정 단계 종료, 다음은 Storage 표본 1건

- 역할 복원(42501) · 게시 UPSERT(42P10) · 패치 줄바꿈 비교(P0001) 문제는 위 실행 결과
  범위에서 **해결 완료**로 정리한다.
- 단순 재확인을 위해 014 설치 · 021/025 패치 · 017 검증 · 024 진단을 **재실행하지 않는다.**
- 다음 미완료 검사는 **Storage SDK 표본 1건**이다 (D-091 · D-100 유효).
  `updated_at` · ETag 키 표기 · 정확 경로 일치 · 이미지 0바이트 초과를
  **실제 프로그램 경로로** 확인한다. SQL 메타 집계로 대신하지 않는다.
- 계획: `STORAGE_SAMPLE_PLAN_028.md` — **운영 실행 미승인**. 표본 ID·경로는 **미확정**이다.
- 그 뒤 순서: 표본 통과 + 비용·범위 승인 → 공통수학1 1유형 × 원문 1개 × 후보 2개 유료
  스모크 → 생성물·검수 흐름 → D-118 에 따라 학생 질문 MVP 와 학습자산 확대 **병행**.

---

## 041 회차 — 첫 브라우저 사용판에서 확정 (2026-10-24)

> 지시: `GPT_EXEC_041.md` · `GPT_REVIEW_040.md`. 화면 구현 허가가 그 문서로 났다.
> 처음에 루트 `DECISION_LOG.md` 에만 적었다가 **대장이 여기라서 옮겨 적는다** (2026-10-27).
> 파일별 되돌리기 절차는 루트 `DECISION_LOG.md` 의 「2026-10-24 — 041 회차」 절에 있다.
> 운영 DB·Storage 0건. 코드는 `lib/twin/learningPreview.ts` 와 새 `lib/learning/` 만 건드렸다.

### D-127 — 답 노출 판정은 휴리스틱이 아니라 승인된 검수 기록으로 한다

- 상태: `CONFIRMED` (GPT_REVIEW_040 §3 R040-C 지시)
- 무엇을: `ApprovedRelation.answerExposure`(`safe|reveals|unknown` 한 칸)를 없애고
  `assetVersion` 과 `exposureReview { verdict, scope{ problemRefId, taskGoal, assetVersion,
  segmentKey }, reviewedBy, reviewedAt }` 를 넣었다. 「증명 원문 + 완성 증명 + 구간 없음 → 제외」
  규칙을 코드에서 지웠다.
- 왜: 옛 규칙은 ① 증명 원문이면 완성 증명을 무조건 막고 ② **같은 자산에 구간 속성만 붙이면
  통과**시켰다. 둘 다 실제 노출을 본 것이 아니라 추측이었다.
- 효과: 검수 범위가 원문·과제목적·자산판·구간 네 가지와 모두 같아야 쓴다. 구간을 새로 붙이면
  `segmentKey` 가 어긋나 자동으로 보류된다. 승인되면 증명 통째도 쓸 수 있다.
- 되돌리면: 구간만 붙여 통과하는 구멍이 다시 열린다.
- 연결: D-017(정답 차단)을 **바꾸지 않는다.** 판단 주체를 코드에서 검수 기록으로 옮긴 것이다.

### D-128 — 측정하지 않은 시간을 0 으로 바꾸지 않는다

- 상태: `CONFIRMED` (R040-A)
- 무엇을: `v.windowElapsedMs ?? 0` 를 없애고, 값이 없으면 `unknownScope` 로 보낸다.
  **실제 0 은 0 으로** 남는다.
- 왜: 값을 주지 않아도 `창 열림 0ms` 가 **관측으로** 찍혔다. 안 잰 것이 잰 0 으로 보였다.
- 되돌리면: 미측정이 관측된 0 으로 다시 둔갑한다.

### D-129 — 의미 비교는 정규형으로 한다

- 상태: `CONFIRMED` (R040-B)
- 무엇을: 객체 키는 정렬해 비교하고, `unmeasured[]` 만 집합(정렬+중복제거)으로 본다.
  `content_refs[]` 는 **순서가 의미**라 정렬하지 않는다.
- 왜: 키 순서나 `unmeasured` 순서만 달라도 `conflict` 가 떠서 039 계약과 어긋났다.
- 되돌리면: 같은 뜻의 재전송이 충돌로 쌓인다.

### D-130 — 대체 경로와 확인 항목은 실물이어야 한다

- 상태: `CONFIRMED` (R040-D)
- 무엇을: 대체 과제를 **서버의 배정 목록에서** 만든다(`availableFallbackTasks`). 없으면
  계획 초안에 「대체 자산 없음」이라고 적는다. 확인 항목(`confirmItems`)이 없는 관계는
  후보에서 뺀다.
- 왜: 「지금 가능한 다른 과제 계속」이 실제 경로 없는 문장이었고 확인 행동도 라벨뿐이었다.
- 되돌리면: 학생에게 열리지 않는 동선을 준다.
- 연결: D-126(승인은 남기되 준비는 시스템이)과 같은 방향이다.

### D-131 — 시범 학습 기록은 파일 기반 시험 저장소에 둔다

- 상태: `CONFIRMED` (범위 한정 — 운영 전환 전까지)
- 무엇을: `LearningStore` 인터페이스와 `FileLearningStore` 를 만들고
  `.learning-test-store/store.json` 에 쓴다. `.gitignore` 에 넣었다.
- 왜: EXEC-041 §5 가 운영 DB 읽기·쓰기를 금지했는데, 「새로고침·재로그인 뒤 서버에서 다시
  읽히는가」는 보여야 했다. 브라우저 저장소로는 그걸 보일 수 없다.
- 경계: **운영 대체 저장이 아니다.** 운영 설정이 없을 때 여기로 자동 전환하지 않는다
  (GPT_EXEC_042 §2 가 이를 명시적으로 금지했다).
- 되돌리면: 폴더를 지우면 기록이 사라지고 씨앗부터 다시 선다. 운영 객체는 만들지 않았다.

### D-132 — 시청 판정 코드는 새로 만들지 않고 `main` 것을 쓴다

- 상태: `CONFIRMED` (GPT_REVIEW_040 §4 지시)
- 무엇을: `main:lib/lessonVideos.ts` 를 바이트 그대로 가져왔다
  (SHA-256 `812a5aa1aef6480d5bb494a138ab22bafe407234a8e53fb21aa061755a8d0d87`).
  `mergeRanges`·`coveredSeconds`·`COMPLETE_PCT` 를 그대로 쓴다.
- 왜: 수지쌤 영상 플레이어가 쓰는 판정과 **두 벌이 되면 반드시 어긋난다.**
- 참고: 같은 이유로 2026-10-27 에 수식 표시도 `main` 의 `MathText` 를 공용 자리
  (`components/MathText.tsx`)로 올려 썼다. `mathlive` 는 이미 있던 의존성이고 새로 깐 것이 없다.
- 되돌리면: 파일을 지운다. 이 브랜치에 원래 없던 파일이고 내용을 고치지 않았다.

---

## 042 회차 — 통합 작업트리와 검사 정정 (2026-10-27)

> 지시: `GPT_EXEC_042.md` · `GPT_REVIEW_041.md`.

### D-151 — 도움 1순위는 **대표예제 풀이영상**, 개념은 **글**로 (원장님 교육 방침)

- 상태: `CONFIRMED` (원장님 지시, 2026-10-27 · **GPT 에 보고함**)
- 원장님 말씀 그대로:
  > 「개념영상보다 해당 문제 유형의 **대표예제 영상이 훨씬 좋아.**
  >  이 유형에서 생각해 풀어라. 그리고 **필요한 개념은 글로** 보여주고.」
- 무엇을: `AXIS_PREFERENCE` 를 바꿨다.
  `type_demonstration`(대표예제·필수예제 풀이)을 거의 모든 축에서 **1순위**로,
  개념은 `concept_card`(글)로, `concept_explanation`(개념영상)은 **선호 목록에서 뺐다.**
  금지가 아니다 — 다른 것이 없으면 여전히 쓰인다. 다만 먼저 고르지 않는다.
  「계산·검산」만 `reviewed_problem` 이 앞이다 — 계산에서 막히면 같은 개념의
  **다른 문제**를 풀어 보는 것이 접근법 영상보다 가깝다.
- 바뀐 결과 (시연 자료 기준)

  | 막힌 지점 | 전 | 지금 |
  |---|---|---|
  | 개념·공식 회상 | 개념영상 | **대표예제 풀이영상** |
  | 목표·조건·식세우기 | 대표예제 | 대표예제 (그대로) |
  | 표현 변환 | 개념카드 | 개념카드 (그대로) |
  | 계산·검산 | 검수된 다른 문항 | 검수된 다른 문항 (그대로) |

- **정답 노출과의 관계** — 원장님이 정리해 주셨다:
  > 「필수예제에서는 그 필수예제 영상을 보여줘도 됨. 상관없어.」

  필수예제는 **배우라고 있는 예제**다. 풀이를 보는 것이 그 문항의 목적이다.
  내가 「자기 문제 답이 드러난다」고 걱정한 것은 모든 문항을 **시험 문항**으로
  본 잘못이었다. D-017(정답 차단)은 **스스로 풀어야 하는 문항**에 걸리는 것이지
  배우는 예제에 거는 것이 아니다.
- **사실 정정**: 운영 영상 3편은 **개념서(개념+유형) 기반**이고, 첫 세트 문항 10개는
  **쎈** 것이다. 「필수예제 02」와 쎈 46259 는 **다른 문제**다.
  내가 난이도 `대표` 만 보고 같은 문제라고 넘겨짚었다. 아니었다.
- 앞으로: 원장님이 **쎈의 대표유형 문제 풀이영상도 모두 만들 예정**이다.
  지금은 개념서 영상만 먼저 만들고 있는 단계다. 쎈 영상이 붙으면
  그 문항에는 **자기 유형의 대표 풀이**가 직접 연결된다.
- 되돌리는 법: `AXIS_PREFERENCE` 를 옛 표로 되돌리고 `exec041` E7 ·
  `exec042` 의 관계 id 를 `rel-0102-concept` 로 되돌린다.
  **되돌리면 개념영상이 다시 1순위가 되어 원장님 방침과 어긋난다.**

### D-152 — 첫 세트 조회 결과 (운영, 1회 실행)

- 상태: `CONFIRMED` (원장님이 `READONLY_LEARNING_CONTENT_043.sql` 1회 실행, 2026-10-27)
- 뽑힌 것: 유형 **2** · 문항 **10** · 영상 **3** — 규칙대로 정확히.
  결과는 `FIRST_SET_INVENTORY_043.json` 에 그대로 저장했다.
- 영상 3편이 **세 종류 하나씩**이다.

  | 종류 | 길이 | 제목 | type_codes |
  |---|---|---|---|
  | 개념 | 195초 | 다항식의 곱셈 | 01-02 · 01-03 · 01-04 |
  | 증명 | 194초 | 곱셈 공식 한 번씩 써 보기 | 01-02 · 01-03 · 01-04 |
  | 대표예제 | 86초 | 필수예제 02 다항식의 전개식에서 계수 구하기 | 01-02 |

- 문항 10개: 전부 쎈 공통수학1 · **서술형 0개** · 정답 글자 10/10 ·
  `choice` 5 · `number` 5 → **자동 채점이 다 된다.**
- ~~★ **찾은 것**: `공수1-01-07` 에 연결된 영상이 **0편**이다.
  영상이 없는 것이 아니라 `type_codes` 에 `01-07` 이 안 들어 있다.
  → 첫 시범은 `01-02` 하나로 좁히는 것을 제안했다 (원장님 판단 대기).~~
  **이 줄은 틀렸다. D-153 이 정정한다** (2026-10-28).
- 유형 이름이 로컬 `PILOT_TYPES_014.json` 과 **미세하게 다르다.**
  운영: 「다항식**의** 전개식에서 계수 구하기」 / 로컬: 「다항식 전개식에서…」
  **운영이 정본**이다. 시연 화면 라벨을 운영 값으로 맞춰야 한다.
- 가져오지 **않은 것**: 정답 글자 · 이미지 경로 · 유튜브 id · 원시 scenes · 학생 자료.
  `has_answer_text` 처럼 **있다/없다**만 받았다.

### D-153 — D-152 의 「01-07 영상 0편」은 **틀렸다.** 조회 방식이 밀어낸 것이다

- 상태: `CONFIRMED` (정정. 근거: `GPT_VIDEO_MAP_044_RESULT.md` §2·§3 ·
  `evidence-044/FIRST_SET_VIDEO_CANDIDATES_044.json`)
- **무엇이 틀렸나**: D-152 에 「`공수1-01-07` 에 연결된 영상이 0편이고 `type_codes` 에
  `01-07` 이 안 들어 있다」고 적었다. 둘 다 사실이 아니다.
  `01-07` 에는 영상이 **4편** 태그돼 있었다 — 개념 1 · 증명 1 · 대표예제 2.

  | order_label / kind | 제목 | has_video_source |
  |---|---|---|
  | 03 / 개념 | 곱셈 공식의 변형 | true |
  | 03-증명1 / 증명 | 곱셈 공식의 변형 (4) 유도 | true |
  | 03-풀이02 / 대표예제 | 필수예제 06 …문자가 3개인 경우 ⑴ | **false** |
  | 03-풀이03 / 대표예제 | 필수예제 07 …문자가 3개인 경우 ⑵ | true |

- **왜 틀렸나**: `READONLY_LEARNING_CONTENT_043.sql` 의 `selected_videos` 와 내
  `supabaseContent.loadVideos()` 가 **두 유형의 결과를 합쳐** `order_label` 로 정렬한 뒤
  `LIMIT 3` 을 걸었다. `02…` 로 시작하는 `01-02` 영상 3편이 앞을 다 차지하고
  `03…` 인 `01-07` 후보가 **전부 밀려났다.** 자료가 없어서가 아니라 **전역 상한** 때문이다.
  유형별 대표를 한 편도 보장하지 못하는 구조였다.
- **내가 잘못한 것**: 빈 결과를 보고 원인을 자료 쪽으로 돌렸다. 조회가 **무엇을 못 보는지**
  먼저 재지 않았다. 그 결과 「첫 시범을 `01-02` 하나로 좁히자」는, 필요 없는 축소를 제안했다.
- **무엇을 고쳤나**: 영상을 정렬·상한으로 고르지 않고 **고정 id 로 유형별 대표**를 집는다
  (`lib/learning/firstSet.ts`). 전체 상한 3편은 그대로다. 첫 세트는 두 유형을 **모두** 덮는다.
- **검사**: `lib/twin/exec044.test.ts` V1 이 044 §3 의 7행으로 옛 방식과 새 방식을
  **둘 다 돌려 차이를 잰다** — 옛 방식이 `01-07` 을 못 덮는 것을 확인하고 나서
  새 방식이 덮는 것을 확인한다. 「고쳤다」는 주장만으로는 통과하지 않는다.
- 되돌리는 법: `loadVideos()` 를 `.overlaps('type_codes', TYPES).order('order_label').limit(3)` 로
  되돌리고 `firstSet.ts` 를 지운다. **되돌리면 `01-07` 이 다시 밀려나고 첫 세트가 한 유형만 덮는다.**
- 함께 폐기: `READONLY_VIDEO_TYPE_MAP_044.sql` (내가 만든 목록 재조회).
  044 결과 §6-1 이 「같은 조회를 다시 요청하지 않는다」고 했고, 이미 필요한 답을 받았다.

### D-154 — 영상 검수는 **다섯 칸을 각각** 적는다. 모름을 참으로 채우지 않는다

- 상태: `CONFIRMED` (044 §6-3)
- 무엇을: 첫 세트 영상마다 **자료 존재 · 재생 성공 · 과제 접근 · 노출 검수 ·
  확인문제 적합성**을 따로 적는다 (`VideoReadiness`). 값은 `yes` · `no` · **`unknown`** 셋이고
  `unknown`(아직 확인 못 함)을 `no`(아니다)와 **섞지 않는다.**
- 지금 실제 상태: 세 후보 모두 자료 존재 `yes`(= `youtube_id` 에 식별값이 있다), 나머지는
  재생 성공 `unknown` · 과제 접근 `unknown` · 노출 검수 `unknown` · 확인문제 적합성 `no`.
  → 그래서 `readyForStudents()` 가 **셋 다 false** 다. 학생에게 아직 나가지 않는다.
- 왜: `has_video_source=true` 는 그 열에 글자가 있다는 뜻일 뿐 재생·접근·적합성의 증거가 아니다
  (044 §2). 한 칸으로 합치면 「영상 있음 = 쓸 수 있음」으로 읽힌다.
- 두 가지 조심 (044 §4·§5):
  - 개념03 에 「개념 Check 정답」 장면이 있다. 그 영상을 본 뒤 **같은 문제**를 맞힌 것은
    독립 확인 성공이 아니다. 영상 전체를 금지하지도 않는다.
  - 개념03·증명03 의 `type_codes` 에 `01-07` 이 **두 번** 들어 있다. **세는 자리에서만**
    중복을 지운다. 오타로 추정해 다른 유형으로 바꾸거나 정리 SQL 을 돌리지 않는다.
- 장면 **시작·끝 초는 아직 없다.** 순번·영상 길이로 만들어 쓰지 않는다 — `scenes` 의 초가
  숫자가 아니면 구간 없이 둔다.
- 되돌리면: 모르는 검수가 참으로 채워져, 검수 안 된 영상이 학생에게 나갈 수 있다.

### D-155 — `READONLY_VIDEO_TYPE_MAP_044.sql` 을 폐기한다

- 상태: `WITHDRAWN` (2026-10-28)
- 무엇을: `WITHDRAWN_READONLY_VIDEO_TYPE_MAP_044.sql` 로 이름을 바꾸고 머리에
  「실행하지 마십시오」와 사유를 적었다. 내용은 기록으로 남긴다.
- 왜: 이 조회가 묻던 것을 **이미 받았다** —
  `evidence-044/FIRST_SET_VIDEO_CANDIDATES_044.json` 에 `공수1-01-07` 영상 4편이 있다.
  044 결과 §6-1 이 「추가 전체 영상 탐색·새 매핑표·새 제작 요청 없이 첫 후보 세트로
  이어간다」고 못 박았다. 또 이 파일을 만든 전제(「꼬리표가 달라 안 잡혔다」) 자체가
  틀렸다 — D-153 참고.
- **원장님이 지금 실행할 SQL 은 없다.**
- 되돌리는 법: 이름과 머리 주석을 되돌린다. 되돌릴 이유는 없다.

### D-156 — 엔진이 **시연 상수·시험 저장소를 직접 부르지 않는다** (의존성 주입)

- 상태: `CONFIRMED` (GPT_REVIEW_043_044 §6 · EXEC-045 §3)
- 무엇을: `lib/learning/deps.ts` 를 두고 `engine.ts` 에서 `catalog.ts` 상수와 `testStore()`
  직접 호출을 **없앴다.** 모드별로 `demoDeps.ts`(시연 상수 + 파일 저장소) 와
  `operationalDeps.ts`(운영 조회 + RPC) 를 갈아 끼운다.
  엔진이 `catalog` 에서 가져오는 것은 `forStudent` 와 그 자료형**뿐**이다.
- 왜: 043 §3-A·§3-B 로 만든 provider 가 **실제 학습 경로에 닿지 않았다.** GPT 가 route 를
  직접 호출해 확인했다 — 운영 모드에서 `/api/learning/act` 는 403, SDK 생성 0건,
  `teacher` 는 직원 인가를 통과해도 501 이었다. 「설정만 넣으면 된다」가 아니라
  **코드가 없던 것**이다. 맞는 지적이다.
- 경계: demo 보호를 **없앤 것이 아니다.** 시험 입장 코드·시험 강사 쿠키·파일 저장소는
  운영에서 여전히 통하지 않는다 (`mode.ts`). 운영 설정이 없으면 시연으로 바꾸지 않고
  503 으로 멈춘다. 자동 fallback 경로를 만들지 않았다.
- 시험 대역(`__setLearningClientFactoryForTest` · `__setLearningDepsForTest`)은
  `NODE_ENV === 'production'` 이면 **던진다** — R041-04 의 뒷문을 반복하지 않는다.
- 되돌리면: 운영 모드가 다시 403·501 이 되고, 운영 provider 가 어디에도 꽂히지 않는다.

### D-157 — 운영 「배정」은 **그 학생이 제출한 시험지의 문항**으로 읽는다 (보고해야 할 어긋남)

- 상태: `OPEN — GPT 확인 필요`
- 무엇을: `operationalDeps.operationalAssignedTasks()` 가
  `gradings(student_id → sheet_id)` + `exam_sheet_problems(sheet_id → problem_id)` 를 읽어
  첫 세트 문항만 남긴다. 과제 하나 = 시험지 하나 (`taskId = exam_sheet:<sheetId>`).
- 왜 이렇게 했나: EXEC-045 §3 은 「기존 배정된 과제에서 첫 세트 허용 문항만 사용한다」고
  했는데, **저장소에 문제은행 문항을 학생에게 배정하는 표가 없다.**
  `student_worksheets` 는 초등 단원 학습지(단원·학기·레벨)이고 문항 id 가 없다.
  문제은행 쪽에서 학생과 문항을 잇는 실제 연결은 위 둘뿐이다.
- 범위로는 가장 좁고 안전하다 — 학생은 **자기가 받은 시험지의 문항만** 열 수 있다.
  서버 API 와 `apply_learning_action()` 이 **각각** 다시 확인한다 (두 겹).
- **한계 (숨기지 않는다):** 「아직 풀지 않은 과제」는 잡히지 않는다. 제출 기록이 생겨야 열린다.
- 표를 새로 만들지 않았다. GPT 가 다른 연결을 쓰라고 하면 그때 바꾼다.
- 되돌리면: 운영에서 과제가 하나도 잡히지 않아 학생 화면이 빈다.

### D-158 — 학생에게 가는 문항 모양은 **더하는 목록**이다 (R045-04 §7.1)

- 상태: `CONFIRMED` (GPT 탐침 P03)
- 무엇을: `forStudent()` 가 `Omit<…,'answer'>` + spread 였던 것을 **허용 목록**으로 뒤집었다
  (`STUDENT_PROBLEM_FIELDS`). 서버 전용 칸은 `SERVER_ONLY_PROBLEM_FIELDS` 에 적는다 —
  `answer` · `answerImagePath` · **`imagePath`**.
- 왜: 정답만 빼고 나머지를 다 보내서, 운영 조회가 들고 온 **해설 그림 경로**가
  학생 payload 에 그대로 남았다 (`private/answers/…`). 「빼는 목록」은 칸이 늘 때마다
  새는 쪽으로 틀린다.
- 저장소 경로는 **하나도** 보내지 않는다. 원문 그림은 서버가 서명한 임시 주소
  (`problem-images` 버킷 · 2시간, `app/api/grade/[code]` 와 같은 방식)로만 간다.
  **해설 그림은 서명하는 길 자체를 만들지 않았다.**
- 되돌리면: 새 칸이 조용히 학생에게 따라 나간다.

### D-159 — 객관식 자유 입력은 **유효 토큰만** 받는다 — 「미지원」은 오답이 아니다

- 상태: `CONFIRMED` (GPT 탐침 P08)
- 무엇을: `parseChoiceTokens()` 를 새로 두고, `norm(answer)` 의 글자를 `'1'..'5'` 로
  **걸러 내던** 것을 없앴다. 전부 보기 번호여야 받는다.
  `gradeAnswerDetailed()` 가 `{result, why, unsupportedInput}` 를 돌려준다.
- 왜: `'30'` 이 `['3']` 으로 걸러져, 정답이 `③` 인 문항에서 **맞음으로 채점됐다.**
- 받는다: `③` · `③, ⑤` · `⑤③` · `3` · `3,5` · `3 5`
  못 읽는다: `30` · `35x` · `6` · `0` · `33`(같은 번호 두 번) · `③번`
- 빈 제출은 **미지원이 아니라** 빈 제출이다 (`wrong`). 둘을 가른다.
- 되돌리면: 읽을 수 없는 입력이 맞음·틀림으로 기록된다.

### D-160 — 도움 기록은 **자산·판·구간을 payload 에 적는다**. 원요청과 서버 검증을 가른다

- 상태: `CONFIRMED` (R045-04 §7.2)
- 무엇을: `payloadOf(help)` 가 `content_ref` · `asset_version` · `segment_key` 를 적고,
  학생 **원요청**(`observed_requested`)과 서버가 승인 구간으로 **잘라 검증한**
  관측(`observed_verified`)을 **따로** 적는다. 되읽을 때 상태로 쓰는 것은 검증한 쪽뿐이다.
- `supabaseStore.loadAttempt()` 는 그 둘이 없으면 **던진다** — 전에는 없는 값을 읽어
  `contentRefId: ''` · `segmentKey: 'full'` 로 **만들어** 복원했다.
  빈 값으로 복원하지 않는다. 없으면 없다고 올린다.
- 같이 고친 것: `loadAttempt` 가 `source_kind` · `source_ref` 를 읽어 **과제 식별자를 되살린다.**
  전에는 `emptyAttempt` 의 `taskId` 자리에 `problem_id` 를 넘겨 과제 `task-X` 가 `101` 이 됐다.
- 되돌리면: 도움 시점의 근거가 사라지고, 재접속 뒤 과제가 문항 번호로 바뀐다.

### D-161 — 장면의 초는 **숫자여야** 한다. `Number()` 로 바꾸지 않는다 (R045-04 §7.4)

- 상태: `CONFIRMED` (GPT 탐침 P07)
- 무엇을: `supabaseContent.sceneSeconds()` 를 새로 두고
  `Number.isFinite(Number(scene.start))` 를 없앴다. 자료형(`typeof === 'number'`) ·
  유한성 · `0 <= start < end` · (길이를 알면) `end <= duration` 을 **각각** 본다.
- 왜: `null` 과 `''` 가 **0 으로 바뀌어** 통과해 `0–0` 구간이 만들어졌다. `true` 는 1 이 된다.
- 구간은 그래도 **승인 명세에서만** 온다 (D-162). 조회한 `scenes` 로 구간을 만들지 않는다.
- 되돌리면: 초가 없는 장면이 0초 구간으로 학생에게 나간다.

### D-162 — 첫 세트 승인은 **서버 전용 버전 있는 명세 파일**로 한다

- 상태: `OPEN — 사람이 채워야 한다` (EXEC-045 §4 「검수 입력」 · REVIEW §8-5)
- 무엇을: `lib/learning/approval.ts` + `lib/learning/approvals/first-set.approval.json`.
  관계 한 줄 = (원문 × 자산 × 자산판 × 구간) 하나의 승인.
  `supabaseContent.relationsFor()` 는 이제 **항상 빈 배열**이다 — 조회가 관계를 만들지 않는다.
- 학생에게 나가는 조건: 그 조합이 명세에 있고 · `exposure.verdict === 'safe'` 이고 ·
  구간이 없으면 `wholeFileSafe === true`. **셋 중 하나라도 아니면 나가지 않는다.**
- 확인 문항은 **검수된 문제은행의 다른 문항** id 로만 가리킨다. 명세에 정답을 적지 않고
  채점은 서버가 그 문항의 `answer_text` 로 한다. 원문 자신을 확인 문항으로 넣으면 **거부**한다.
- 모양이 틀린 줄은 **던진다.** 조용히 버리면 「승인이 없다」와 「승인을 못 읽었다」가
  같아 보이기 때문이다.
- **지금 `relations` 는 빈 배열이다.** 노출 검수 기준(§4)은 글로 왔지만 세 후보에 대한
  **실제 판정은 아직 없다.** 그래서 운영 관계는 0개이고 영상이 학생에게 나가지 않는다.
  비어 있는 것을 「검수 중」이나 「통과」로 적지 않는다.
- 되돌리면: 검수 기록 없이도 유형이 겹치는 영상이 관계 목록에 다시 생긴다.

### D-163 — 저장 SQL 을 **045 로 고쳤다.** 043 은 폐기한다

- 상태: `OPEN — 운영 미실행` (EXEC-045 §2 · REVIEW §4·§5)
- 무엇을: `docs/sql/migrations/045_learning_actions.sql` (+ `_rollback.sql`).
  `043_*.sql` 두 개는 머리에 「실행하지 않습니다」를 적고 기록으로만 둔다.
- 고친 것 열 가지
  1. **서버 전용으로 닫았다** — `public` · `anon` · `authenticated` 를 모두 회수하고
     `service_role` 에만 `grant execute`. 역할 기본권한에 기대지 않는다.
  2. **호출자를 함수 안에서 본다** — `learning_caller_is_server()`.
     `current_user` 는 DEFINER 안에서 **함수 소유자**이므로 쓰지 않고,
     요청 JWT 의 role claim 과 `session_user` 의 역할 소속을 본다.
  3. `p_graded` 는 **서버 API 가 채점한 값**이다. 043 의 「DB 함수가 채점을 정한다」는
     주석이 사실과 달랐다. 대신 채점을 실을 수 있는 `kind` 를 `answer` · `confirm` 으로 제한.
  4. **중복·충돌을 판정한 뒤에** 시도를 만든다. 중복은 `updated_at` 도 바꾸지 않는다.
  5. **중복 동등성에 문맥을 넣었다** — `kind` · 문항 · `source_kind` · `source_ref` · `run_id`.
  6. **시도 유일키에 과제를 넣었다** —
     `(student, problem, source_kind, coalesce(source_ref,''), run)`.
  7. `v_changed || '…'` → `array_append`.
  8. applied · duplicate · conflict 의 **반환 모양을 맞췄다** (`graded` 가 셋 다 있다).
  9. **같은 행동 키를 advisory lock 으로 직렬화**한다. 부분 유일키만으로는
     「중복이냐 충돌이냐」가 정해지지 않는다.
  10. `search_path = ''` + 모든 이름을 스키마 한정.
- 더한 것: 설치 전에 **동명 객체의 칸을 확인하고 다르면 멈춘다.**
  충돌 수신의 받은 문맥을 `received_context` 에 남긴다 (payload 를 고치지 않는다).
  `exam_sheet` 출처면 **그 학생이 받은 시험지·그 시험지의 문항**인지 SQL 에서 한 겹 더 본다.
- **원장님이 지금 실행할 SQL 은 없다.** GPT 승인 뒤 원장님이 실행한다.
- 되돌리기: `045_learning_actions_rollback.sql` — 차단 · 이번 묶음 정리 · 기능 철수
  **세 단계**. psql 전용 문법을 쓰지 않는다. 기본은 전부 주석 처리다.

### D-164 — 되돌리기 1단계는 **권한 회수만으로는 소유자를 막지 못한다**

- 상태: `CONFIRMED` (격리 PostgreSQL 17.6 실행으로 발견)
- 무엇을: 1단계가 권한을 빠짐없이 회수하는 것에 더해, `learning_caller_is_server()` 를
  **항상 거짓**으로 바꿔 둔다. 소유자든 `service_role` 이든 그 자리에서 멈춘다.
- 왜: 격리 PG 에서 실제로 돌려 보니 **회수를 다 해도 함수 소유자는 계속 부를 수 있었다**
  (`applied` 가 떴다). 운영에서는 서버가 소유자가 아니라 `service_role` 로 들어오므로
  회수로 막히지만, **「차단」이라고 적은 단계가 누구에게는 안 막힌다면 그건 차단이 아니다.**
- 되살리는 법: `045_learning_actions.sql` 을 다시 실행한다 (§4 가 검사 함수를, §6 이 권한을
  돌려 놓는다). 표·자료는 손대지 않으므로 그대로다. 격리 PG 에서 이 경로까지 확인했다.
- 되돌리면: 1단계가 소유자에게는 차단이 아니게 된다.

### D-165 — 저장 SQL 을 **격리 PostgreSQL 17.6 에서 실제로 돌렸다** (EXEC-045 §5)

- 상태: `CONFIRMED` — 항목 **34/34 통과**, 그 안의 SQL 검증 **51항목** 통과
- 무엇을: `scripts/pg-learning-test.cjs` + `pg-learning-fixture.sql` + `pg-learning-verify.sql`.
  쓰고 버리는 클러스터를 `initdb` 로 만들어 **127.0.0.1 에만** 열고, 설치 → 검증 →
  재적용(멱등) → 호출자 검사 → 동시 요청 → 되돌리기 3단계 →
  **기본 execute 직접권한 있음·없음 두 설정**을 돌린 뒤 폴더째 지운다.
- 쓴 것: EnterpriseDB PostgreSQL 17.6 **바이너리 압축본** (설치 프로그램이 아니다).
  레지스트리·서비스·시작프로그램을 건드리지 않았고 `package.json` 도 바꾸지 않았다.
  운영 키·운영 설정·실제 자료를 쓰지 않았다. 외부 포트·터널을 열지 않았다.
- **한계 (숨기지 않는다):** fixture 는 045 가 **실제로 가리키는 칸만** 만든 합성 자료다.
  운영 스키마 전체와 맞는다는 증거가 아니다. 운영 DB 에서 돌린 것이 아니다.
- 되돌리면: SQL 검증이 글자 대조로만 남는다.

### D-166 — 「기다렸다」를 타이밍으로 주장하지 않는다. 잠금은 `pg_locks` 로 본다

- 상태: `CONFIRMED` (일부러 망가뜨려 보고 발견)
- 무엇을: 동시 요청 직렬화의 근거를 **두 세션의 타이밍**에서 `pg_locks` 조회로 바꿨다.
  검증 C15 가 같은 트랜잭션에서 `hashtextextended(학생|producer|행동id)` 키의 advisory
  잠금이 실제로 잡혀 있는지 본다.
- 왜: 처음 판정은 「1.5초 뒤에도 세션2 가 아무것도 안 찍었으면 기다리는 중」이었다.
  그런데 **advisory lock 을 지운 사본에서도 그 판정이 통과했다** — psql 이 아직 실행을
  시작하지 않은 것을 「기다림」으로 오해한 것이다. 통과하는 검사가 아무것도 재지 않았다.
- 같이 고친 것: 중복 문맥 검사도 처음에는 **지워도 통과했다.** `problem_ref` 가 payload 에도
  들어가서 payload 비교만으로 걸렸기 때문이다. payload 에 없는 칸(`run_id` · `kind` ·
  `source_ref`)만 바꾸는 경우(C11~C13)를 따로 두어 실제로 재게 했다.
  그리고 권한 겹과 호출자 검사 겹을 **갈라** 재게 했다 — 둘 다 걸리면 하나를 지워도 통과한다.
- 되돌리면: 아무것도 재지 않는 검사가 통과로 남는다.

### D-167 — 학생 화면이 **운영 모드에서 열린다.** 기존 로그인을 그대로 쓴다

- 상태: `CONFIRMED` (원장님 지시 2026-10-29)
- 무엇을: `app/learning/page.tsx` 의 `if (state.mode === 'operational') return <차단>` 전면 차단을
  없앴다. 운영에서 입장하지 못했으면 **기존 로그인**(`/auth/login`)으로 보낸다 —
  새 로그인을 만들지 않는다. 서버가 돌려준 거부 사유(`unknown_student` ·
  `lookup_failed` · `inactive_student` · `not_configured`)를 사람 말로 적어 준다.
- 토큰: 학습 API 를 부르는 **네 곳 모두** 토큰을 붙인다 (`learningFetch`).
  운영 학생 인증은 Bearer 토큰 → auth uid → `students.session_uid` 이므로,
  머리글이 없으면 운영에서 401 이다 (2026-09-22 에 호출부 11곳을 고친 것과 같은 이유).
- **왜 `apiFetch` 가 아닌가:** `lib/apiFetch.ts` 는 `lib/supabase.ts` 를 모듈 최상단에서
  가져오고, 그 파일은 설정이 없으면 **화면이 뜨기도 전에 던진다**(`supabaseUrl is required`).
  로컬 체험판에는 설정이 **일부러** 없다 → 학생 화면이 하얗게 빈다.
  `lib/learning/clientFetch.ts` 는 **동적 import + try/catch** 로 그것만 다르게 하고,
  하는 일(토큰 붙이기)은 같다.
- 학부모 로그인으로는 열리지 않는다 — 학습 행동의 주체는 학생이다 (`parent_session_uid` 를
  보지 않는다). 화면이 그 사실을 적어 준다.
- 되돌리면: 운영에서 학생 화면이 다시 아예 열리지 않는다.

### D-168 — 확인 문항 **그림**이 서명된 주소로 학생까지 간다

- 상태: `CONFIRMED`
- 무엇을: `ConfirmActionItem` 에 `imageUrl?` 을 더하고, 운영 확인 문항에 **서명된 임시 주소**를
  같이 보낸다. 화면이 그린다.
- 왜: 운영 확인 문항은 문제은행 문항이고 **본문이 그림**이다 (`stem` 이 빈 글자).
  그림을 안 보내면 학생 화면에 「문항 102」라는 **글자만** 뜨고 문제를 볼 수 없다.
- 저장소 경로가 아니라 서명된 주소만 넣는다. 그림이 없으면 **칸을 만들지 않는다** —
  빈 글자로 채우지 않는다. 못 불러오면 화면이 그 사실을 적는다.
- 되돌리면: 운영 확인 문항이 글자만 뜨고 학생이 풀 수 없다.

### D-169 — 유튜브 도움은 **창이 열려 있던 시간만** 기록한다

- 상태: `CONFIRMED`
- 무엇을: `YouTubeHelp` 가 `method: 'window_elapsed'` + `windowElapsedMs` 만 보낸다.
  `coveragePct` · `coveredSeconds` · `watchedRanges` · `completed` · `playedSeconds` 를
  **만들지 않는다.**
- 왜: iframe 안의 재생은 이 화면이 **셀 수 없다.** 몇 초를 봤는지, 건너뛰었는지, 끝까지
  봤는지 알 길이 없다. 그런데 「도움을 열었다」는 사실 자체는 기록에 필요하다
  (도움 뒤 재풀이를 가려내는 근거다). 그래서 **재는 것만** 보낸다.
- 서버가 `unmeasuredOf()` 로 `coverage_pct`·`covered_seconds` 를 미측정으로 적고,
  강사 요약이 「도움 관측 없음」으로 보인다. 「0초 봤다」가 만들어지지 않는다.
- 구간은 유튜브 `start`·`end` 로 **보여 주기만** 한다. 지켜졌다는 보장이 아니므로
  관측으로 쓰지 않는다.
- 실패하면 **같은 봉투**로 다시 보낸다 (R042-01).
- 되돌리면: 유튜브 도움이 아예 기록되지 않거나, 재지 않은 초가 만들어진다.

### D-170 — **첫 세트 확인 화면** (원장 전용). 원장님이 JSON 을 쓰지 않는다

- 상태: `CONFIRMED` (화면·API 완성) / `OPEN` (승인 줄은 아직 0건)
- 무엇을: `app/teacher/learning-first-set/page.tsx` + `app/api/learning/first-set/route.ts`.
  원문 · 영상 · 확인 문제를 **한 화면에서 같이** 보고, 눌러서 승인 명세를 만든다.
- 인가 (safe-change §1·§4)
  · 화면은 `app/teacher/` 아래 → `AccessGate` 를 받는다
  · 화면 안에서 `if (!isAdmin())` 로 한 번 더 막는다
  · **API 도 `adminOnly: true`** — 강사가 주소로 직접 불러도 막힌다
  · 로컬 체험판에서는 `app/api/learning/teacher` 와 같은 방식으로 시험 강사 쿠키를 받는다
  · 사이드바 `원장 전용` 묶음 + **사용 매뉴얼**을 같이 고쳤다
- 정답: 이 화면에만 나온다. 노출 검수는 「이 영상이 이 원문의 답을 드러내는가」를
  판단하는 일이라 판단하는 사람이 그 답을 봐야 한다.
  **학생 경로에는 가지 않는다** — 그쪽은 `forStudent()` 허용 목록을 지난다.
  해설 그림은 **있는지만** 알려 주고 주소를 만들지 않는다.
- 구간 초가 없는 장면은 **고를 수 없다** (없는 초를 0으로 채우지 않는다).
  확인 문제로 원문 자신은 고를 수 없다.
- 저장: 로컬에서는 명세 파일에 쓰고, 읽기 전용 파일시스템(Vercel)에서는 **글자를 돌려준다** —
  화면이 내려받기를 준다. 어느 쪽이었는지 응답에 적는다. 조용히 실패하지 않는다.
- **이 화면은 운영 DB 에 쓰지 않는다.**
- 되돌리면: 승인이 다시 손으로 쓰는 JSON 이 된다.

### D-171 — 045 를 **두 트리에 같게** 반영했다. 042 의 제 작업은 보존했다

- 상태: `CONFIRMED`
- 무엇을: `question-webapp-dev-122db1` 의 045 작업을 `learning-integration-042` 에 반영했다.
  학습 모듈 · 학생 화면 · 직원 API/화면 · SQL · 시험 · 증거 · 대장 **44개 파일**.
- **충돌 둘은 덮지 않았다.** `components/teacher/Sidebar.tsx` 와
  `app/teacher/manual/page.tsx` 는 042 쪽이 더 새롭다 — 수업 시각화 · 학교 자료집 ·
  시험지 분석 · QR 채점 · 출결관리 · 변경 기록 메뉴와 훨씬 자세한 매뉴얼이 들어 있다.
  그래서 **042 판을 그대로 두고 내 줄만 더했다** (메뉴 2줄 · 매뉴얼 항목 1개).
  `package.json` 의 `test:twin:files` 도 042 목록을 보존하고 빠진 둘만 더했다.
- 확인: 두 트리 모두 **시험 906/906 · 내 경로 타입 오류 0 · `next build` exit 0**.
  042 빌드 출력에 `/api/learning/{act,first-set,session,teacher}` ·
  `/learning` · `/learning/teacher` · `/teacher/learning-first-set` 가 모두 있다.
- **대량 병합·전면 reset·다른 트리 폐기를 하지 않았다** (GPT_REVIEW §10).
  042 는 여전히 `question-webapp-dev-122db1` 를 포함하고 21 commit 앞서 있다.
- 되돌리면: 두 트리가 다시 갈라진다.

### D-144 — 저장 성공은 **서버가 확인한 뒤에만** 표시한다 (R042-01)

- 상태: `CONFIRMED` (GPT_REVIEW_042 §4 R042-01 · EXEC-043 §2-A)
- 무엇을: 화면이 보내기 전에 `dirty=false` 로 두고 서버가 거절해도 `savedAt` 을 찍던 것을 고쳤다.
  확인 전에는 내리지 않고, 실패하면 **미확정 관측 1건**(`pending`)을 들고 있다가
  **같은 actionId·occurredAt·payload** 로 다시 보낸다. 화면에 「저장 안 됨」을 적는다.
- 왜: 400·403·409·500·망 끊김이 전부 **저장 완료처럼** 보였다.
- 경계: 새 범용 큐를 만들지 않는다. 이 화면의 미확정 **1건**만 관리한다.
  봉투를 재사용하지 않는 경우에는 「두 번 반영되지 않습니다」라고 쓰지 않는다.
- 되돌리면: 저장 실패가 다시 성공으로 보인다.

### D-145 — `after_help` 를 **이벤트 지문에서 뺀다** (R042-02)

- 상태: `CONFIRMED` (EXEC-043 §2-B)
- 무엇을: `after_help` 는 원요청의 뜻이 아니라 **이력 해석**이므로 지문에 넣지 않는다.
  저장 칸(`AnswerRecord.afterHelp`)도 없애고 `isAfterHelp()` 로 **볼 때마다 계산**한다.
  시각 비교는 문자열이 아니라 `Date.parse` 로 **실제 시점**을 본다.
- 왜: 답(10:02) 저장 뒤 도움(10:01)이 늦게 도착하면, **바이트 동일한 재전송**이
  `409 conflict · changedFields=['after_help']` 가 됐다.
- 효과: 재전송은 `duplicate`, 분석은 늦은 근거를 반영한다. 승인 계획은 자동으로 바뀌지 않는다.
- 규칙: 같은 시각이면 **뒤로 보지 않는다**(순서를 알 수 없으므로).
  읽을 수 없는 시각은 「도움 뒤」로 올리지 않는다.
- 되돌리면: 늦게 온 기록이 지난 요청의 뜻을 바꾼다.

### D-146 — 완료·coverage 는 **서버가 유효 구간으로** 센다 (R042-03)

- 상태: `CONFIRMED` (EXEC-043 §2-C)
- 무엇을: 승인 구간 밖만 보냈을 때 `completed` 가 살아남지 않는다.
  학생이 보낸 주장은 `completedClaimed` 로 **따로** 남고, `completed` 는
  유효 구간 × `COMPLETE_PCT` 로 서버가 센다. 구간을 모르면 **비워 둔다**(미확인).
- 또: `focusLostSeconds`(반복 포함 숨김 재생)와 `coveredSeconds`(서로 다른 구간)는
  **척도가 다르다.** 같은 10초를 숨긴 채 두 번 본 `숨김 20 · unique 10` 을
  400 으로 거절하던 것을 고쳤다. 비교는 같은 척도인 `playedSeconds` 와만 한다.
- 되돌리면: 구간 밖만 봐도 「시청 완료」가 남고, 정상 관측이 거절된다.

### D-147 — 런처가 **loopback 을 고정**한다 (R042-04)

- 상태: `CONFIRMED` (EXEC-043 §1)
- 무엇을: `next dev` 에 `--hostname 127.0.0.1` 을 박고, `--hostname`·`--host`·`-H`·
  `--experimental-https` 를 넘기면 **멈춘다**.
- 왜: Next 기본 hostname 은 `0.0.0.0` 이다. 「127.0.0.1 에만 열린다」는 안내가
  **보장되지 않았다.** (바깥에서 실제로 붙는 것을 본 것은 아니다.)
- 확인: `netstat` 이 `TCP 127.0.0.1:3200 LISTENING` 을 보인다.
- 되돌리면: 안내와 실제가 다시 어긋난다.

### D-148 — 콘텐츠·인증을 **provider 로 가르고 자동 fallback 을 막는다**

- 상태: `CONFIRMED` (EXEC-043 §3-A·§3-B)
- 무엇을: `ContentProvider`·`StudentAuthProvider` 를 두고 모드로 고른다.
  운영인데 설정이 없으면 `NotConfiguredError`·`deny: 'not_configured'` 로 **멈춘다** —
  시연 카탈로그·시험 세션으로 조용히 넘어가지 않는다.
  운영 어댑터는 시연 파일을 **값으로 import 하지 않는다**(시험이 소스를 읽어 확인).
- 인증에서 `session_uid`·`user_id`·`students.id` **세 이름을 섞지 않는다.**
  우리 기록이 가리키는 것은 `students.id` 다.
- 운영 어댑터가 만드는 관계는 검수 기록이 없어 **지금 거의 항상 빈 배열**이다.
  없는 검수를 만들어 넣지 않는다.
- 되돌리면: 운영에서 시연 자료가 새어 나갈 길이 생긴다.

### D-149 — 학습 기록 DDL 초안: 표 2개 · 부분 유일키 · RPC 한 번

- 상태: `OPEN` (초안 · **운영 실행 미승인**)
- 무엇을: `docs/sql/migrations/043_learning_actions.sql`.
  `learning_attempts` · `learning_actions` 2개와 `apply_learning_action()` RPC.
- **UNIQUE 와 「충돌도 둘 다 보존」의 양립**: 유일키를 `where is_canonical` 부분 인덱스로 건다.
  처음 받아들인 줄만 유일하고, 충돌 줄(`is_canonical=false`)은 쌓인다.
- **트랜잭션**: SDK write 를 여러 번 부르지 않는다. RPC 한 번이 중복판정·기록·상태를 끝낸다.
- **학생에게 insert 정책을 주지 않는다.** 쓰기는 `SECURITY DEFINER` 함수로만.
  `verdict`·`graded`·`is_canonical` 을 서버가 정한다.
- **기존 운영 표를 고치지 않는다** — `gradings`·`grading_answers`·`video_watch_logs`·
  `learning_notes` 등에 `alter`·`drop`·`insert`·`update` 가 한 줄도 없다. 참조만 한다.
- **되돌리기는 3단계**: ①함수 권한만 거둠 → ②`run_id`+시험계정 UUID 범위만 삭제 →
  ③표 삭제(기본안 아님). 범위 없는 전체 삭제를 제시하지 않는다.
- 아직: **PostgreSQL 엔진으로 돌려 보지 않았다.** 격리 PG 환경이 없고
  원장님 운영 DB 를 첫 쓰기 시험장으로 쓰지 않는다. 시험은 SQL **글자 검사**다.

### D-150 — 자동 채점은 **기존 QR 경로 규칙을 옮겨 쓴다**

- 상태: `CONFIRMED` (EXEC-043 §3-A)
- 무엇을: `lib/learning/grading.ts`. `app/grade/[code]` 의 `norm`·`choiceDigits` 를 그대로.
  `choice` 는 숫자 집합 비교, `number` 는 공백·쉼표만 지우고 비교,
  `image`·`is_essay` 는 **자동 채점하지 않는다.**
- 왜: 규칙이 두 벌이 되면 어긋난다. 단순 문자열 비교로 수학 답안을 맞다고 주장하지 않는다.
- 시험이 **원문 두 파일을 읽어** 같은 규칙인지 대조한다. 운영 연결 때
  `grade/[code]` 가 이 파일을 import 하도록 바꾼다 (지금은 두 벌이다).
- 되돌리면: 학습 화면과 QR 채점의 판정이 갈린다.

### D-138 — 학생 기록을 **행동 단위 덧붙이기**로 바꾼다 (R041-01)

- 상태: `CONFIRMED` (GPT_REVIEW_041 R041-01 · EXEC-042 §3-A 지시)
- 무엇을: `firstResult`·`retryResult`·`stuckAxis` 같은 **덮어쓰는 칸**을 없애고,
  학생의 행동 하나를 한 줄로 쌓는다(`answers`·`stuckReports`·`helpOpened`·`confirmSubmissions`).
  「첫 결과」·「마지막 결과」·「도움 뒤 결과」는 `summarize()` 로 **계산**한다.
  행동마다 client 가 `actionId`+`occurredAt` 을 만들고, 재전송은 같은 값을 보낸다.
  처리 순서를 ①범위 확정 → ②중복·충돌 판정 → ③새 행동일 때만 변경 → ④한 트랜잭션으로 바꿨다.
- 왜: 041 은 같은 요청을 다시 보내면 발생시각이 새로 생겨 **충돌**로 보였고,
  충돌이라면서 **저장된 값은 이미 바뀌어** 있었다. 정상 재시도도 충돌로 셌다.
- 되돌리면: 정상 재시도가 다시 충돌로 쌓이고, 첫 제출이 덮인다.
- 되돌리는 법: `lib/learning/contract.ts` 의 목록 칸을 옛 단일 칸으로,
  `engine.applyAction` 을 옛 `putAttempt → recordEvent` 순서로. `store.transact` 를 지운다.

### D-139 — 도움 뒤 결과를 **넷으로 갈라** 적는다 (R041-02)

- 상태: `CONFIRMED` (EXEC-042 §3-B)
- 무엇을: `successAfterHelp: boolean|null` 한 칸을 없애고
  `outcomes { confirmPassed, sourceSolvedAfterHelp, delayedRecheckPassed, mastery, notes }` 로.
  `mastery` 는 **언제나 null** 이다. 「뒤」는 서버가 시각을 견줘 정한다.
  계획 초안이 **끝낸 일을 다시 시키지 않는다** — `(완료)` 와 `남은 일:` 로 나눠 적는다.
- 왜: 학생이 확인 문제를 맞히고 원문도 다시 맞혀도 `null` 이었고 계획이 바이트 동일이었다.
- 곁들여: 「오답 2회 = 같은 오개념 2회」 단정 제거 · 카드를 video 로 적던 것 수정 ·
  카드 「읽었습니다」의 `windowElapsedMs: 0` 을 `self_report` 로 (재지 않은 0 을 만들지 않는다).
- 되돌리면: 학생이 다 해도 강사 화면에 변화가 안 보이고, 끝낸 일을 또 권한다.

### D-140 — 승인 구간 **밖은 서버도 자른다**, 기록은 자동으로 (R041-03)

- 상태: `CONFIRMED` (EXEC-042 §3-C)
- 무엇을: 화면은 구간 밖 seek 을 되돌리고(시작 전→시작, 끝 뒤→끝+정지),
  서버는 `clampToSegment()` 로 **교집합만** 남긴다. 남는 것이 없으면 0 이 아니라 **미측정**.
  본 구간(`watchedRanges`)을 저장해 재진입 때 이어 센다.
  `본 만큼 기록하기` 버튼을 없애고 멈춤·탭 이동·10초마다 자동 저장한다.
  관측값은 범위·자료형·합계 일치까지 검사하고 **말이 안 되면 거절**한다 (0 으로 고치지 않는다).
- 왜: 041 은 구간 밖 재생이 coverage 로 들어갔고, 170초로 옮기면 거기 그대로 남았다.
  기록이 학생의 버튼 누르기에 달려 있었고, 재진입 때 0 부터 다시 셌다.
- 되돌리면: 구간 밖이 다시 세어지고, 안 누르면 기록이 안 남는다.

### D-141 — 파일을 **통째로 내려준다**는 사실을 검수에 넣는다 (R041-03 안전)

- 상태: `CONFIRMED` (EXEC-042 §3-C)
- 무엇을: 자산마다 `wholeFileSafeFor`(전체를 내려줘도 안전한 원문 목록)를 두고,
  `ApprovedRelation.wholeDeliverySafe` 로 넘겨 `disqualify` 에서 본다.
  영상은 그것이 승인된 원문에서만 쓴다.
- 왜: **화면이 구간만 보여 주는 것은 보장이 아니다.** 주소를 알면 파일 전체를 볼 수 있다.
  「구간을 걸었으니 안전」을 근거로 쓰면 안 된다.
- 효과: 증명영상은 어느 원문에서도 전체 전달 미승인 → 증명 원문(`demo-p-0107-2`)은
  **검수된 카드**로 간다. 학습이 멈추지 않는다.
- 하지 않은 것: 영상 185편 재편집 · 새 스트리밍 장치 (042 §3-C 가 금지한 확대).
- 되돌리면: 구간만 걸고 전체 파일을 내보내는 상태로 돌아간다.

### D-142 — 시험 인증은 **명시적 로컬 demo 모드에서만** 산다 (R041-04)

- 상태: `CONFIRMED` (EXEC-042 §3-D)
- 무엇을: `lib/learning/mode.ts`. `NODE_ENV=production` 이면 **무조건 꺼짐**(환경변수로도 못 켬),
  아니면 `LEARNING_DEMO_MODE=1` 일 때만 켜짐. 켜는 법은 `npm run dev:learning-demo`.
  꺼지면 시험 입장 코드·시험 강사 쿠키·파일 저장소 접근이 전부 막힌다.
  운영 강사 경로는 기존 `denyIfNotStaff` 로 가고, 통과해도 **501 미연결**로 답한다.
  검수 내부 사유는 demo 에서만 학생에게 보인다(`blockedHidden`).
- 왜: `NODE_ENV=production` 에서 시험 강사 쿠키가 **통했다**. 운영에 올라가면 뒷문이 된다.
- 검사 **순서**가 핵심이다 — `production` 을 먼저 본다. 바꾸지 말 것.
- 아직 안 된 것: 직원 인가의 **통과 쪽**은 운영 설정이 없어 확인하지 못했다.
  학생 운영 인증(`student_login`)은 미연결이다. **한 줄 교체로 끝났다고 적지 않는다.**
- 되돌리면: 운영 빌드에 시험 뒷문이 열린다.

### D-143 — 학습 기록 저장은 **새 표 2개**로 보인다 (4개 아님)

- 상태: `OPEN` (초안 · 운영 적용 미승인)
- 무엇을: `LEARNING_STORAGE_REUSE_MAP_042.md` 에 운영 열과 대조했다.
  영상 관측은 `video_watch_logs` (`watched_ranges` 까지 이미 있다), 문항 채점은
  `grading_answers` 로 **재사용**. 모자란 것은 막힌 지점·행동 식별자·확인 행동·
  **같은 문항 여러 번 제출**(PK 가 `(grading_id, no)` 라 한 번만 쓴다).
  → `learning_attempts` · `learning_actions` **2개**.
- 근거: `SCHEMA_SNAPSHOT_039.json` (2026-10-24 원장님 1회 실행). 이번에 운영 재조회 **0회**.
- 확인하지 못한 것: RLS **정책 본문**을 못 봤다. 정책 이름·명령만 있다.
  그래서 「`tla_read_active` 가 학생에게 열려 있다」는 **이름에서 온 추측**이다.
- 다음: `OPS_REQUEST_042.md` 의 **B** 승인 뒤 DDL 글자를 쓴다. 지금은 쓰지 않았다.

### D-137 — §63 검사를 「최대 번호 고정」에서 「028 구역에 번호 없음」으로 바꾼다

- 상태: `CONFIRMED` (Claude 판단 · **GPT 에 보고함**, 승인 전 되돌릴 수 있음)
- 무엇을: `lib/twin/exec028.test.ts` 의 `새 D 번호를 만들지 않았다 (§63)` 를
  `028 운영 결과에 D 번호를 붙이지 않았다 (§63)` 로 바꿨다.
  `assert.equal(Math.max(...nums), 126)` 를 빼고, 대신
  ① 「운영 체크포인트」 구역 안에 `### D-` 가 0개 ② 그 구역에 `### CP-` 가 있음
  ③ `D-126` 이 남아 있음 ④ 126 이하 번호가 125개 그대로임 을 본다.
- 왜: §63 의 지시는 「**이번(028) 운영 결과는** 번호 없는 체크포인트로 기록하라」였다
  (옛 검사의 주석에도 「이번」이라고 적혀 있다). 그런데 단정을 **파일 전체의 최대값**에 걸어
  둬서, 뒤 회차가 지시대로 결정을 남기면 무조건 깨졌다. 실제로 041 의 D-127~132 와
  2026-10-27 다른 세션의 D-133~136 에서 깨졌다. AGENTS.md 의 「바꾸면 기록한다」와도 부딪힌다.
- **느슨해진 것이 아니다 — 측정했다.** 028 시점 대장을 복원해 옛 검사와 나란히 돌렸다.

  | 상황 | 옛 검사 | 새 검사 |
  |---|---|---|
  | 정상 (028 시점) | pass | pass |
  | 체크포인트 구역에 `D-999` 삽입 | fail | fail |
  | 체크포인트 구역에 `D-99` 삽입 (최대값 안 바뀜) | **pass** | **fail** |
  | `D-126` 삭제 | fail | fail |
  | 체크포인트 구역 삭제 | fail | fail |
  | `D-120` 삭제 (최대값 안 바뀜) | **pass** | **fail** |

  옛 검사가 잡던 것은 모두 잡고, **옛 검사가 놓치던 두 가지를 더 잡는다.**
- 경계: GPT_EXEC_042 §6 은 「기존 테스트를 삭제·약화하지 않는다」고 했다. 이 변경은 약화가
  아니라고 보지만 **판단은 GPT 가 한다.** 되돌리라고 하면 그대로 되돌린다.
- 되돌리는 법: `exec028.test.ts` 의 그 시험을 옛 본문으로 바꾼다. 되돌리면 D-127 이상이
  존재하는 한 항상 빨간 채로 남는다.

---

## 제안 — student-qa 스킬에서 가져올 검수 장치

> 원장님 지시(2026-10-27, StudyCheck 본 세션): 「제안으로 적어줘」. **결정이 아니라 제안이다.**
> 학습 흐름·정답 차단 정책(D-017)을 바꾸지 않고, 코드·DB 는 고치지 않았다.
> 출처: 쎄쎄쎄 스킬팩의 `student-qa` 스킬(`~/.claude/skills/student-qa/` —
> `SKILL.md` · `references/답변_규칙.md` · `references/검증자_문구.md` · `scripts/qa_check.py`).
> 그 스킬은 «원장님이 읽고 보내는 답변 초안» 용이라 통째로 붙이지 않고 장치만 가져온다.
> 아래 «§» 번호는 `docs/AI_QUESTION_APP_CLAUDE_HANDOFF.md` 의 절이다.

### D-133 — 힌트팩은 독립 풀이와 기계 대조를 통과해야 공개한다

- 상태: `OPEN` (제안)
- 제안: 힌트팩(§6.2)을 만든 모델과 **다른 호출**이 힌트팩을 보지 않고 원문 문제만 받아 처음부터 푼다.
  출력은 `판정(단일정답/복수정답의심/문항오류/판독불가) · 정답 · 확신(높음/보통/낮음)` 세 줄로 고정한다.
  이 답을 문제은행 정답과 **프로그램이** 맞춰 보고, 다르거나 판정이 «단일정답»이 아니거나 확신이
  «높음»이 아니면 그 힌트팩은 공개하지 않고 보류한다.
- 이유: 쌍둥이 생성은 이미 독립 검토(`prompts/twin-review-v1.1.md`)를 두는데 힌트팩에는 아직 없다.
  같은 모델이 두 번 풀면 같이 틀릴 수 있으므로 «두 답 일치 = 맞음»으로 보지 않고, 어긋날 때 멈추는 장치로만 쓴다.
  문제은행 정답 자체가 틀린 문항(라이트쎈 정답 그림 밀림 사례 2026-10-27)을 찾는 덤도 있다 — «문항오류» 판정은 교재 결함으로 따로 알린다.
- 연결: §6.3 «기존 정답과 내부 풀이가 충돌함» 예외를 실제로 만드는 장치다.

### D-134 — 공개 전 점검기: 정답 노출·학생 정보·길이·AI 말투

- 상태: `OPEN` (제안)
- 제안: 힌트 글을 내보내기 전에 프로그램이 거른다. 하나라도 걸리면 보류.
  - 최종 정답·정답 번호·정답과 같은 최종 수치·완성된 마지막 식이 들어 있음 (D-017, §2.1 목록 그대로)
  - 학생 이름·학교·전화번호 모양
  - 단계 힌트 길이 상한 초과
  - «정답은 ~», «결론적으로», «즉:», 화살표·점 목록·이모지 같은 단정·AI 말투
- 이유: §6.3 «정답 노출 검사에 걸림» 이 이름만 있고 검사기는 아직 없다. student-qa 의 `qa_check.py`
  (단정 표현·이름·길이·AI 티 검사, 자가검사 41/41)를 규칙 출발점으로 쓸 수 있다.
- 주의: 낱말 검사라 놓치거나 과하게 걸릴 수 있다. 통과는 «맞다»가 아니라 «꼴을 지켰다»는 뜻이다.
  검사기를 만들면 일부러 정답을 흘린 힌트로 **실패하는지** 먼저 시험한다.

### D-135 — 보류 목록을 남겨 조용히 사라지지 않게 한다

- 상태: `OPEN` (제안)
- 제안: D-133·D-134 에서 보류된 건을 날짜 · 문항 · 사유 한 줄로 쌓고, 강사 화면에서는 이 목록만 본다.
- 이유: D-126 «승인은 남기되 준비는 시스템이» 와 §6.3 «예외만 검수» 에 맞는다.
  보류가 한 번도 안 나오면 점검이 느슨하다는 신호로 본다.

### D-136 — (2차, 사진 질문) 이미 답이 달린 질문·다른 AI 캡처 처리

- 상태: `OPEN` (제안, 2차 범위 — §6.1)
- 제안 ①: 강사가 이미 답한 질문에는 AI 가 겹쳐 답하지 않는다. 학생이 이어 물으면 «추가로 물은 것»에만 답하고,
  강사가 단 답의 이어 묻기는 강사 대화로 남긴다. 보내기 직전에 그 사이 강사 답이 달렸는지 한 번 더 확인한다.
- 제안 ②: 사진이 정본이다. 학생이 적은 문항 번호가 사진과 다르면 사진을 따른다.
  학생이 다른 AI 답을 캡처해 «이거 맞아요?» 하면 캡처 속 설명은 근거로 쓰지 않고 문제만 본다.
- 이유: 현재 설계 문서 어디에도 «이미 답함» 처리가 없다.
