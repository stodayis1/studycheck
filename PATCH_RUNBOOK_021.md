# PATCH_RUNBOOK_021 — 게시 RPC 42P10 수정 적용 안내

작성 2026-09-28 · GPT-EXEC-021

> ## ⚠ 지금은 **운영 실행 미승인** 상태입니다
>
> 이 문서는 **무엇을 어떤 순서로 실행할지 정해 둔 것**이고, 아직 실행하실 단계가 아닙니다.
> 실제 DB 객체(게시 함수)를 바꾸는 패치이므로 **GPT 검수 → 별도 실행 승인** 뒤에 하십시오.
>
> **원장님의 다음 행동: 021 결과물을 GPT에게 전달. 그 전에는 운영 SQL 추가 실행 없음.**

---

## 1. 무슨 일이 있었나

GPT_EXEC_020에 따라 `POSTINSTALL_TO_RUN_017.sql` 을 1회 실행하셨고, 다음에서 멈췄습니다.

```text
ERROR:  42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
PL/pgSQL function public.admin_set_practice_publication(uuid,boolean) line 53 at SQL statement
```

`[4-9] 안전 승인 후 게시` 지점입니다. **성공으로 기록하지 않습니다.**

017은 전체가 `begin ... rollback` 이라 검증용 데이터가 커밋되지는 않지만,
**검증이 끝까지 간 것도 아닙니다.** 마지막 `rollback` 문장까지 실행됐다는 뜻도 아닙니다.

### 원인

설치 SQL 안에서 **인덱스와 게시문이 어긋나 있었습니다.**

| 위치 | 내용 |
|---|---|
| `docs/sql/쌍둥이_설치.sql` 362~363행 | `create unique index tla_practice_uidx on public.type_learning_assets (practice_id) **where practice_id is not null**` |
| 같은 파일 805행 | `on conflict (practice_id)` — **조건이 빠져 있음** |

PostgreSQL은 conflict target에 인덱스의 조건이 함께 적혀 있어야 그 **부분** 유일 인덱스를
충돌 판단에 씁니다. 조건이 없으면 쓸 인덱스를 찾지 못해 42P10을 냅니다.

**중복 데이터가 있어야 나는 오류가 아닙니다.** 표가 비어 있어도, 게시를 처음 눌러도 바로 납니다.

- 이번 42P10은 앞선 42501(역할 복원 누락)과 **다른 문제**입니다.
- SQL Editor의 `Run without RLS` 선택이나 학생의 행동과는 **무관**합니다.
- 014 설치가 성공했던 것은 사실이고 그대로 둡니다. 설치 성공이 모든 실행 분기를 검증했다는
  뜻은 아니었습니다.

---

## 2. 무엇을 고치나

`public.admin_set_practice_publication(uuid, boolean)` **한 함수의 한 줄**입니다.

```diff
-    on conflict (practice_id)
+    on conflict (practice_id) where practice_id is not null
```

**하지 않는 것**

- 인덱스 삭제·재생성, 새 전역 UNIQUE 추가, 테이블/열 제약 변경
- `ON CONFLICT ON CONSTRAINT` 로 바꾸기 (그 이름은 제약이 아니라 부분 인덱스입니다)
- `DO NOTHING` 으로 게시 갱신을 무시하기, 수동 SELECT 후 INSERT/UPDATE 로 동시성 정책 바꾸기
- 42P10을 예외로 삼키거나 notice로 낮추기, 검증의 게시 구간 삭제·건너뛰기
- RLS 해제, private 스키마 권한 부여, 기존 권한 확대
- 운영 표 비우기, 테스트 데이터를 구분하지 않고 지우기

함수 안의 관리자 확인 · 잘못된 인자 거부 · `FOR UPDATE` · 안전승인 검사 · retired 차단 ·
상태 전이 · 최초 게시자/시각 · 변경 이력은 **그대로**입니다.

---

## 3. 적용 경로 — 두 가지를 구분합니다

### (가) 기존 운영 환경 — **기준선 재설치 없이 패치만**

014 설치는 이미 성공해 있습니다. **다시 설치하지 않습니다.**

```text
[이미 되어 있음]  INSTALL_TO_RUN_014.sql        ← 다시 실행하지 않습니다
        ↓
[승인 뒤 1회]     PATCH_PUBLICATION_021.sql     ← 이번에 추가되는 단계
        ↓
[승인 뒤 1회]     POSTINSTALL_TO_RUN_017.sql    ← 무변경. 전체 검증
```

### (나) 새 설치 환경 — **기준선 → 패치 → 검증**

```text
INSTALL_TO_RUN_014.sql   (014 기준선, 원본 보존)
        ↓
PATCH_PUBLICATION_021.sql (021 증분 패치)
        ↓
POSTINSTALL_TO_RUN_017.sql (무변경, 전체 검증)
```

### 왜 설치 SQL 자체를 고치지 않나

이미 실행된 설치 파일의 **역사를 바꾸지 않습니다.** 014를 고쳐 두면 「원장님이 실행하신 것」과
「저장소에 있는 것」이 달라지고, 나중에 무엇이 운영에 들어갔는지 알 수 없게 됩니다.
그래서 014·017은 원본으로 남기고, 차이는 **021 증분 패치**로 둡니다.

`INSTALL_RUNBOOK_014.md` 도 **고치지 않았습니다** — 과거에 이미 수정돼 있던 것처럼
보이게 만들지 않습니다.

`INSTALL_TO_RUN_021.sql`, `POSTINSTALL_TO_RUN_021.sql`, 전체 설치 제거용 `ROLLBACK_021.sql`
은 **만들지 않았습니다.**

---

## 4. 승인이 나면 — 실행 순서

### 4-1. 패치 실행 (1회)

Supabase → StudyCheck 프로젝트 → SQL Editor → `PATCH_PUBLICATION_021.sql` 전체 붙여넣고 Run.

파일 하나가 `begin ... commit` 한 덩어리입니다. 안에서 이렇게 갑니다.

| 순서 | 무엇을 |
|---|---|
| [1] | 대상 함수가 예상한 시그니처·인자명·반환형·언어·보안설정인지 확인 |
| [2] | 본문이 **014 원본** 또는 **이 패치의 수정본** 과 글자까지 같은지 확인 |
| [3] | 인덱스 `tla_practice_uidx` 가 예상한 부분 유일 인덱스인지 확인 (이름만 보지 않음) |
| [4] | 바꾸기 전 상태 기록 (OID · 소유자 · 권한 · 보안속성 · 표 RLS · 정책) |
| [5] | `create or replace function` 으로 본문만 교체 (`drop` 하지 않음) |
| [6] | 바꾼 뒤 다시 읽어 **본문 말고는 아무것도 달라지지 않았는지** 확인 |

**성공하면** 이런 notice 가 나옵니다.

```text
NOTICE:  [021] 게시 RPC 본문을 교체했습니다 (on conflict 에 조건 추가).
NOTICE:  [021] 확인 완료 — 상태 needs_patch, OID·소유자·권한·보안설정·RLS·정책 모두 그대로입니다.
NOTICE:  [021] 인덱스 tla_practice_uidx: unique·valid·immediate, 키 practice_id, 조건 (practice_id IS NOT NULL)
```

**두 번 실행하셔도** 안전합니다. 두 번째는 이렇게 나오고 아무것도 바꾸지 않습니다.

```text
NOTICE:  [021] already_applied — 함수가 이미 수정본입니다. 아무것도 바꾸지 않습니다.
```

**중단되면** `★ 패치 중단:` 으로 시작하는 오류가 나옵니다. 그 경우 **아무 변경도 남지 않습니다**
(`commit` 에 이르지 못하기 때문입니다). 오류 문구를 그대로 전해 주시면 됩니다.
함수 본문이 알려진 두 가지와 다르면 **덮어쓰지 않고 멈춥니다** — 누가 무엇을 바꿨는지
먼저 확인해야 하기 때문입니다.

### 4-2. 전체 검증 (1회)

`POSTINSTALL_TO_RUN_017.sql` 을 **고치지 않고** 전체 붙여넣고 Run.

- 이 파일은 전체가 `begin ... rollback` 이라 검증용 데이터가 남지 않습니다.
- `_twin_verify_cfg` 임시 표에 대해 RLS 확인창이 뜨면 **`Run without RLS`** 를 고르십니다
  (임시 표라서 RLS 정책이 없고, 이 선택은 검증 결과에 영향이 없습니다).
- 끝까지 가면 `════════ 모든 검증 통과 — 롤백합니다 ════════` 가 나옵니다.

### 4-3. 무엇이 성공인가

| 보이는 것 | 판정 |
|---|---|
| 패치에서 `[021] 확인 완료` notice + 오류 없음 | 패치 적용됨 |
| 017에서 `모든 검증 통과` + 오류 없음 | 검증 통과 |
| 어디서든 `ERROR` | **실패**. 다음 단계로 넘어가지 않고 문구를 전해 주십니다 |

RAISE NOTICE 상세가 Supabase UI에 안 보일 수 있습니다. 그때는 **오류 없이 끝났는지**만
확인하시면 됩니다 — 실패는 예외로 중단되므로 조용히 넘어가지 않습니다.

---

## 5. 되돌리려면

이 패치는 함수 본문 한 줄만 바꿉니다. 되돌리는 것은 **014 원본 본문으로 다시 `create or
replace` 하는 것**이고, 그러면 42P10이 다시 납니다 (즉 게시 기능이 다시 막힙니다).

- 되돌릴 이유가 생기면 GPT에 먼저 알리고, 되돌리는 SQL도 같은 방식(사전확인 → 교체 →
  사후확인)으로 따로 만듭니다. 이번 산출물에는 넣지 않았습니다.
- 전체 설치를 제거하는 `ROLLBACK_014.sql` 은 **이번 일과 무관합니다.** 실행하지 않습니다.

---

## 6. 이 패치로 증명되지 않는 것

- **Supabase 인증·RLS 통합**: 로컬 시험의 `auth.uid()`·`is_admin()`·역할은 대역입니다.
- **운영 카탈로그의 현재 상태**: 운영 DB를 조회하지 않았습니다. 그래서 패치가 **실행 시점에
  스스로** 함수와 인덱스를 확인하고, 예상과 다르면 멈춥니다.
- 로컬 시험은 PostgreSQL 15.12 · 17.10 · 18.4에서 돌렸습니다. **운영이 어느 버전인지는
  확인하지 않았습니다** (조회하지 않기로 했으므로).
