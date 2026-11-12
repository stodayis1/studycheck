# GPT 브리핑 — 운영 설치 승인 요청 (Claude Code · 2026-11-12)

이 파일은 통째로 복사해 GPT 에 붙여넣는 용도다. 설명 없이 그대로 읽히게 썼다.

---

## 0. 지금 사실 — 코드는 운영에 올라갔고, DB 는 안 올라갔다

운영(`studycheck-five.vercel.app`) 에서 방금 확인한 응답:

| 주소 | 응답 | 뜻 |
|---|---|---|
| `/learning` | 200 | 학생 화면 열린다 |
| `/teacher/learning-first-set` | 200 | 원장 전용 검수 화면 열린다 |
| `/api/learning/first-set` | 401 | 인가가 살아 있다 (무인증 차단) |

운영 Supabase(`cggskjxsyrvuhsldgkoj`) `public` 스키마를 읽어 확인한 것:

- `learning_attempts` · `learning_actions` — **없다.** 045 SQL 미실행.
- `type_learning_assets` — 있다. **0 행.**
- `lesson_videos` 1003 행 · `problems` 38,372 행 · `students` 235 행 (실서비스 운영 중)

→ **지금 학생이 질문앱을 쓰면 풀이 기록이 저장되지 않는다.** 이것이 유일한 막힌 곳이다.

## 1. 요청 — 045 SQL 운영 실행 승인

파일: `docs/sql/migrations/045_learning_actions.sql` (적용) · `045_learning_actions_rollback.sql` (되돌리기)
`043_learning_actions.sql` 은 **실행하지 않는다** (결함 7건 때문에 045 로 대체).

### 이 SQL 이 만드는 것 — 전부 새것이다

- 표 2개: `public.learning_attempts` · `public.learning_actions`
- 유일키 2개 · 보조 색인 3개
- RLS 정책 4개 (학생 본인 읽기 · 직원 전체)
- 함수 2개: `public.learning_caller_is_server()` · `public.apply_learning_action(...)`

### 기존 데이터를 건드리지 않는다는 근거

- `drop table` · `truncate` · `delete from` · `alter ... drop` — **0건.** (파일 전체 grep)
- 파일에 있는 `drop` 은 `drop policy if exists` 4줄뿐이고, 바로 다음 줄에서 같은 이름으로
  `create policy` 한다 (재실행 가능하게 만든 꼴). **대상은 이번에 새로 만드는 두 표의 정책뿐.**
- 머리말에 명시된 불가침 목록: `gradings` · `grading_answers` · `video_watch_logs` ·
  `learning_notes` · `lesson_videos` · `problems` · `standard_types` · `type_learning_assets` ·
  `exam_sheets` · `exam_sheet_problems` — 읽기만 하고 고치지 않는다.
- `begin;` 으로 시작하는 한 트랜잭션. 중간에 깨지면 아무것도 남지 않는다.
- 0단계에 선행 점검(preflight)이 있어, 같은 이름의 표가 **모양이 다르게** 이미 있으면
  `create table if not exists` 로 조용히 넘어가지 않고 **멈춘다.**

### 격리 PostgreSQL 에서 이미 돌렸다

실제 PostgreSQL 을 띄워 적용·되돌리기를 돌렸고, 그 과정에서 **되돌리기 1단계 결함**
(소유자가 암묵적 EXECUTE 를 유지하는 것)을 찾아 고쳤다. 고의로 망가뜨린 사본에서
검사가 실패하는지도 확인했다 — 세 겹의 방어를 지웠는데 31/31 이 그대로 통과하던 것을
찾아내 C11~C15 검사를 더했다.

### 함수 인가 모양

`apply_learning_action` 은 `SECURITY DEFINER` + `set search_path = ''` 이고,
`public` · `anon` · `authenticated` 에서 EXECUTE 를 명시적으로 회수하고 `service_role` 에만 준다.
함수 첫 줄에서 `learning_caller_is_server()` 로 호출자를 다시 확인한다
(`SECURITY DEFINER` 안의 `current_user` 는 호출자가 아니라 소유자이므로 그것으로 판별하지 않는다).

인자 검사: `kind ∈ {open, answer, stuck, help, confirm}` ·
`source_kind ∈ {class_session, worksheet, exam_sheet, standalone}` ·
`graded ∈ {correct, wrong}` 이고 **`answer`·`confirm` 에만** 실린다 ·
`problem_id` 가 정수로 떨어지지 않으면 거부 · payload 가 객체가 아니면 거부.
같은 행동 키는 판정 전에 advisory lock 으로 직렬화한다.

> **묻는 것 ①: 이 SQL 을 운영에 실행해도 되는가.** 실행은 원장님 환경에서 하고,
> 되돌리기 파일이 쌍으로 있다. 반대하면 어느 조각을 어떻게 바꿀지 적어 주면 그대로 고친다.

## 1-b. 후속 지시 중 **하나가 실제로 어긋나 있었다 — 고쳤다** (D-172)

지시: 「개념영상·문제풀이영상·증명영상은 계속 추가되고 있습니다. … 첫 시범의 3편에
영구 고정하거나, 새 영상마다 코드를 수정하는 구조로 만들지 마세요.」

**어긋나 있었다.** `supabaseContent.loadVideos()` 가 이렇게 읽고 있었다:

```
.in('id', [...FIRST_SET_VIDEO_IDS])   // 영상 3편을 코드에 박아 둔 것
```

그리고 **이미 낡아 있었다** (2026-11-12 운영 조회):

| 유형 | 코드가 보던 편수 | 운영 실제 |
|---|---|---|
| `공수1-01-02` | 1 | **3** (개념1·증명1·대표예제1) |
| `공수1-01-07` | 2 | **6** (개념2·증명2·대표예제2) |
| 합 | **3** | **9** |

운영 `lesson_videos` 는 **1003편 전부 활성이고 전부 `type_codes` 가 달려 있다** (유튜브 id 1002편).
유형 기반 조회를 받칠 자료는 이미 완비돼 있었고, 막고 있던 것은 코드뿐이었다.

**고친 것**
- 조회를 `lesson_videos.type_codes` 기반으로 (`.contains('type_codes', [code])`).
  영상↔유형의 단일 출처는 그대로 `lesson_videos` 다 — 새 표를 만들지 않았다.
- 상한을 **전체에서 유형당으로** 옮겼다 (`FIRST_SET.maxVideosPerType`). 전체로 걸면
  유형 하나가 통째로 밀려난다 — 044 §3 이 그렇게 터졌던 자리다.
- 044 가 기록한 3편은 **지우지 않았다.** 조회 필터 역할만 떼고 「검수 상태를 적어 둔 후보」로 남겼다.
  지우면 그 편들의 「노출 검수 안 됨」 같은 사실을 잃는다.
- 기록이 **없는** 영상은 네 검수 칸이 전부 `unknown`(확인문항만 `no`), `priority = 0`,
  `recordedCandidate = false`. **우선순위를 지어내지 않는다.**
- 기록은 있는데 조회되지 않은 편은 다른 영상으로 **메우지 않는다** — 「조회 안 됨」으로 남긴다.

**학생에게 나가는 것은 늘지 않는다.** 관문은 승인 명세이고 `relationsFor()` 는 언제나 빈 배열이다.
넓어진 것은 원장 전용 검수 화면이 보는 **후보**뿐이다. 승인은 여전히 0건이다.

**고치는 중 내가 낸 결함을 시험이 잡았다**: 조회를 못 한 기록 후보에 기록값 `assetExists: 'yes'` 를
적게 돼 있었다 — 행을 읽지도 못했는데 「자료 있음」이라 적는 꼴이다. `'unknown'` 으로 고쳤다.

시험 908/908. **망가뜨려 시험했다** — 고정 조회를 되살리면 4개 실패, 우선순위를 지어내면 1개 실패,
조회 못 한 것에 기록값을 적으면 1개 실패. 원복하면 908/908.

> **묻는 것 ⑥: 유형당 상한 12 가 맞는가.** 지금 두 유형은 3편·6편이라 걸리지 않는다.
> 유형당 영상이 12편을 넘는 곳이 생기면 무엇을 기준으로 고를지 (종류별 대표? 최신?).


## 2. 승인 명세가 아직 0건이다 — 영상이 학생에게 안 나간다

`lib/learning/approvals/first-set.approval.json` 의 `relations: []`.
비어 있으면 영상이 한 편도 나가지 않는다 — 그것이 지금의 사실이고, 일부러 그렇게 뒀다.

줄 하나 = (원문 1개 × 자산 1개 × 자산판 × 구간) 의 승인.
`exposure.verdict` 가 `safe` 가 아니면 그 관계는 쓰이지 않는다.
`confirmProblemIds` 는 같은 첫 세트 안의 **다른** 문항이어야 한다 (원문 자신은 거부된다).
`segment` 는 실제로 본 초를 적는다 — 순번·영상 길이에서 만들어 적지 않는다.

원장님이 JSON 을 쓰지 않도록 `/teacher/learning-first-set` 화면에서 눌러 만들게 했다.
① 원문(그림+정답) ② 영상·구간 + 노출 판정 ③ 확인 문제 → 「명세에 담기」 → 「승인 명세 만들기」.

> **묻는 것 ②: 세 후보 영상의 노출 판정과 구간 초.** 특히 개념03 의
> 「개념 Check 정답」 장면을 ① 구간으로 잘라낼지 ② 그 영상은 확인 문항을 따로 쓸지.
> 044 결과에 구간 초가 없어서, 누가 어떻게 재서 넣을지도 정해야 한다.

> **묻는 것 ③: 승인을 어디에 저장할지.** 지금은 저장소의 JSON 파일이다.
> Vercel 은 파일시스템이 읽기 전용이라, 화면에서 누르면 글자를 내려받아 Claude 에게
> 전달하는 **왕복 한 번**이 생긴다. `learning_approvals` 표를 만들어 바로 저장하게
> 바꾸면 왕복이 없어진다. 어느 쪽으로 할지.

## 3. 아직 어긋나 있는 것 — 「기존 배정」 (D-157)

운영 과제 읽기를 `gradings` + `exam_sheet_problems` (= **그 학생이 제출한 시험지**) 로 했다.
문제은행 문항을 학생에게 **배정**하는 표가 저장소에 없어서 그렇게 했다.

→ 그래서 **아직 안 푼 과제는 잡히지 않는다.** 복습만 된다.
(참고: 운영 `gradings` 는 현재 5 행, `exam_sheet_problems` 766 행 — 표본이 작다.)

> **묻는 것 ④: 「기존 배정」을 무엇으로 볼지.** 이대로 복습 전용으로 둘지,
> 다른 연결을 쓸지, 배정 표를 새로 만들지.

## 4. 지시와 다르게 하지 않고 남겨 둔 것

`SECURITY DEFINER` 를 유지하라는 §2 지시를 따랐다. 다만 호출자가 `service_role` 뿐이면
그 역할은 **이미 RLS 를 우회**하므로 DEFINER 가 얻는 것이 없고 위험만 남는다.
`SECURITY INVOKER` 면 RLS 가 그대로 적용돼 더 좁다. 지시와 다르므로 바꾸지 않고 둔다.

> **묻는 것 ⑤: DEFINER 를 유지할지, INVOKER 로 좁힐지.**

## 5. 끝난 것 — 더 묻지 않아도 되는 것

- **「어느 트리가 통합본이냐」는 더 이상 문제가 아니다.** 학습 작업 전부가 `main` 에 들어가
  운영에 배포됐다. 화면 레이아웃 수정 한 건(PR #95)이 마지막이다.
- 학생 화면의 운영 모드 전면 차단 제거 · 기존 로그인 토큰 전달 · 확인 문항 그림 표시 ·
  유튜브 도움 열기 기록(`window_elapsed` 만, 본 초를 **만들지 않는다**) — 모두 반영됐다.
- 학생 payload 에 정답·해설 경로·저장소 경로가 **없다** (허용 목록으로 걸러 둠).
  정답은 원장 전용 검수 화면에만 나온다.
- 시험 906/906 · `next build` exit 0 · 이 경로 타입 오류 0.

## 6. 곁에서 발견한 것 (질문앱과 무관, 보고만)

운영 `public.merge_backup_20261008` (125 행) 에 **RLS 가 꺼져 있다.**
익명 키만 있으면 누구나 읽을 수 있다. 2026-10-08 병합 작업의 백업 표로 보인다.
정책 없이 RLS 만 켜면 접근이 전부 막히므로 임의로 켜지 않았다.
선택지: ① 쓸 일이 끝났으면 표를 내린다 ② 보관해야 하면 `(select public.is_staff())` 정책을 붙인다.
