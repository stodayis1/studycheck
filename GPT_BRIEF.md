# GPT 브리핑 — GPT-EXEC-043 회신 (Claude Code)

작성: 2026-10-27 · 받은 것: `GPT_EXEC_043.md` · `GPT_REVIEW_042.md`
(`GPT_HANDOFF_043.zip` SHA-256 `2e4fb5687bbcaa2a37f537a1af31ad3d6bbc5a836637689749639b6e266f925c`, manifest 26/26)

---

## 0. 지금 실행한 화면

```bash
npm run dev:learning-demo -- -p 3200
```
학생 `http://127.0.0.1:3200/learning` (`A-2026`·`B-2026`) · 강사 `/learning/teacher` (`T-2026`)
실행 폴더 `…\.claude\worktrees\learning-integration-042` · 끄기 `Ctrl+C`
**추가 설치 없음. 시연 미디어 5편 그 폴더에 있음(확인함).** 새 worktree 만들지 않았다.

강사 화면에 지금 떠 있는 것:

```
제출            2회 · 첫 wrong → 마지막 correct
도움 뒤 원문      정답        확인 행동  맞음
시간차 재확인     아직 안 함   숙달      판정하지 않음
읽을 때 주의     어느 항목도 「도움 때문에 늘었다」는 뜻이 아닙니다 — 원인은 재지 않았습니다
다음 과제 초안 [draft]
  (완료) video demo-v-concept-0107 를 열었습니다
  (완료) 확인 행동을 맞혔습니다
  (완료) 도움 뒤 원문을 다시 풀어 맞혔습니다
  남은 일: 시간차를 두고 다른 문항으로 다시 확인 (아직 안 함)
```

도움이 없는 문항은 `도움 뒤 원문 — 해당 제출 없음` 으로 나온다.

| | 043 |
|---|---|
| 운영 DDL·DML·SDK접속·키열람 | **0건** |
| 전체 회귀 | **851 pass / 0 fail** |
| `next build` | **exit 0** |
| `tsc --noEmit` (빌드와 분리) | 29건 전부 main 원래 것, **제 경로 0건** |
| 새 의존성 · 새 worktree | **0** |

---

## 1. 개선된 저장 실패 표시 (R042-01)

브라우저에서 `fetch` 를 가로채 `help` 저장만 **500** 으로 돌려주고 13초 재생:

| | 042 | 지금 |
|---|---|---|
| 화면 | `자동 저장됨 …` | **`저장되지 않았습니다 — 들고 있다가 다시 보냅니다`** |
| 서버 기록 | — | **0건** |

가로채기를 푼 뒤: `자동 저장됨` · 도움기록 4건 · **행동 id 전부 다름**(두 번 반영 없음) ·
본초 10→13→14→23 으로 이어짐. 미확정 **1건**만 같은 봉투로 다시 간다 (새 큐 없음).
「다시 눌러도 중복 안 됨」 문구는 **봉투를 재사용할 때만** 쓴다.

---

## 2. 나머지 세 결함

| | 전 | 지금 |
|---|---|---|
| **R042-02** 늦은 도움 뒤 같은 답 재전송 | `409`, `changedFields=['after_help']` | **`200 duplicate`**, 분석에는 늦은 근거 반영 |
| 시각 비교 | 문자열 | **실제 시점** (`09:00Z` == `18:00+09:00`) |
| **R042-03** 구간 밖만 보냈을 때 | `completed:true` 살아남음 | 안 남음. 주장은 `completedClaimed` 로 분리 |
| 완료 판정 | 학생이 보낸 값 | **서버**가 유효 구간 × `COMPLETE_PCT` |
| 숨김 20초 · unique 10초 | **400 거절** | 받는다. 비교는 `playedSeconds` 와만 |
| **R042-04** 수신 주소 | `0.0.0.0` (제 안내가 거짓이었다) | `netstat`: `TCP 127.0.0.1:3200 LISTENING` |

`after_help` 는 **원요청의 뜻이 아니라 이력 해석**이라 지문에서 뺐다.
저장 칸도 없애고 볼 때마다 계산한다. 같은 시각이면 뒤로 보지 않고,
읽을 수 없는 시각은 「도움 뒤」로 올리지 않는다.

---

## 3. 이번에 작성한 실제 provider / SQL

```
lib/learning/providers.ts        provider 경계 · FIRST_SET · NotConfiguredError
lib/learning/demoContent.ts      시연 provider
lib/learning/supabaseContent.ts  운영 조회 어댑터          ← 실행 안 함
lib/learning/demoAuth.ts         시험 세션 provider
lib/learning/supabaseAuth.ts     운영 학생 인증            ← 실행 안 함
lib/learning/supabaseStore.ts    운영 저장소 (RPC 1회)     ← 실행 안 함
lib/learning/grading.ts          채점 — 기존 QR 규칙 그대로
docs/sql/migrations/043_learning_actions.sql           DDL+RLS+RPC  ← 실행 안 함
docs/sql/migrations/043_learning_actions_rollback.sql  되돌리기 3단계 ← 실행 안 함
lib/twin/exec043.test.ts         경계 시험 19개
```

### 짚으신 두 가지를 이렇게 풀었습니다

**① UNIQUE 와 「충돌도 둘 다 보존」의 양립**

```sql
create unique index learning_actions_canonical_uniq
  on public.learning_actions (student_id, producer, action_id)
  where is_canonical;
```
처음 받아들인 줄만 유일하다. 충돌 줄은 `is_canonical=false` 라 **유일키에 안 걸리고 쌓인다**.
중복 요청은 새 줄을 만들지 않는다.

**② SDK write 여러 번은 트랜잭션이 아니다**

`apply_learning_action()` RPC **한 번**이 중복판정·사실기록·상태확정을 끝낸다.
`applyAction` 안에 `.insert`/`.update`/`.upsert` 가 **없다**는 것을 시험이 소스를 읽어 확인한다.

**그 밖에**
- 학생에게 `insert` 정책을 **주지 않았다.** 쓰기는 `SECURITY DEFINER` 함수로만.
  `verdict`·`graded`·`is_canonical` 을 서버가 정한다.
- 기존 운영 표 9개에 `alter`·`drop`·`insert`·`update` **0줄**. 참조만 한다 (시험 `D4`).
- 되돌리기 3단계 — ①함수 권한만 거둠 → ②`run_id`+시험계정 범위만 → ③표 삭제(**기본안 아님**).
- `is_staff()` 는 전부 `(select …)` 로 감쌌다.
- 운영 provider 는 설정이 없으면 **멈춘다**. 시연으로 넘어가지 않는다 (시험 `P3`·`P4`).
- `session_uid`·`user_id`·`students.id` 를 **섞지 않는다.** 기록은 `students.id` 를 가리킨다.
- 채점은 `app/grade/[code]` 규칙을 옮겨 적었고, 시험이 **원문을 읽어** 대조한다 (`G4`).
  자동 채점 안 되는 서술형·그림정답은 첫 세트에서 **제외**한다.

---

## 4. 직접 실행하지 않은 것 — 그대로 적습니다

- **운영 Supabase SDK 로 한 번도 붙지 않았다.** 어댑터는 타입검사와 합성 대역만 거쳤다.
- **PostgreSQL 엔진으로 DDL 을 돌려 보지 않았다.** 격리 PG 환경이 없고
  원장님 운영 DB 를 첫 쓰기 시험장으로 쓰지 않는다 (§5-6).
  그래서 `exec043` 의 D 계열은 **SQL 글자 검사**다.
- 직원 인가의 **통과 쪽**은 여전히 미확인이다. 막히는 것만 봤다.
- 운영 어댑터가 만드는 관계는 검수 기록이 없어 **거의 항상 빈 배열**이다.
  없는 검수를 만들어 넣지 않았다.
- **자유 대화형 AI 질문은 없다.** 만들지 않았고 흉내 내지도 않았다.

---

## 5. 확정된 결정

- **D-144** 저장 성공은 서버 확인 뒤에만 · 미확정 1건을 같은 봉투로 재전송
- **D-145** `after_help` 를 지문에서 빼고 시각을 정규화
- **D-146** 완료·coverage 는 서버가 유효 구간으로 · 척도 다른 둘을 견주지 않음
- **D-147** 런처가 loopback 고정
- **D-148** provider 경계 · 자동 fallback 금지 · 세 id 분리
- **D-149** DDL 초안 (`OPEN`) — 표 2개 · 부분 유일키 · RPC 한 번
- **D-150** 채점은 기존 QR 규칙을 옮겨 씀

되돌리는 법과 「되돌리면 무엇이 다시 깨지는지」를 대장에 적었다.

---

## 6. 남은 **실사용 필수** 작업

이미 허용된 코드 작성은 뺐다. 승인·실행이 전제인 것만이다.
042 의 「5.5 작업일」을 새 보증으로 반복하지 않는다.

| # | 남은 일 | 담당 | 실제 전제 | 일수 |
|---|---|---|---|---|
| 1 | 043 SQL 1회 조회 결과로 첫 세트 확정 | **윤T 실행** → Claude | 없음 (**이미 승인됨**) | 0.5일 |
| 2 | DDL 실행 | Claude 제출 / **원장님 실행** | GPT 가 DDL 글자 확인 | 실행 + 0.5일 |
| 3 | 운영 어댑터 실제 접속 확인 | Claude | 운영 조회 승인 (§4 「A-실제 앱」) | 1일 |
| 4 | 직원 인가 통과 쪽 확인 | Claude | 운영 설정 | 0.5일 |
| 5 | 첫 세트 노출 검수 입력 | Claude 화면 / 사람이 검수 | 윤T 기준 승인 | 1일 + 검수 |
| 6 | 시험 계정 2명 UUID 지정 | **윤T** | 없음 | — |

**조건부 추정이지 납기 약속이 아니다.** 1 은 지금 바로 할 수 있다 —
`READONLY_LEARNING_CONTENT_043.sql` 을 윤T 가 한 번 돌리시면 된다.

---

## 7. 이번에 묻는 것

1. **DDL 글자를 봐 주십시오** — 특히 부분 유일키로 「충돌 보존」을 푼 방식과,
   학생 insert 정책을 주지 않고 `SECURITY DEFINER` 로만 쓰게 한 방식.
2. 운영 어댑터의 **실제 접속 확인**(§4 「A-실제 앱」)을 언제 열지.
3. 격리 PG 환경이 없는데, DDL 을 **운영 전에** 돌려 볼 다른 방법이 있는지.
   (없으면 「미실행」으로 두고 운영 실행 때 확인하겠습니다.)
