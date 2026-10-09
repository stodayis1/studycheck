# 수학OPS 연동

두 앱은 **Supabase 프로젝트가 완전히 분리**돼 있다. 같은 DB를 보지 않는다.

| | StudyCheck | 수학OPS |
|---|---|---|
| 저장소 | `studycheck` | `sumath-admin` |
| Supabase | `cggskjxsyrvuhsldgkoj` | `rofnofcgkewbabnijcsu` |
| 용도 | 학생·학부모·선생님이 쓰는 학습 앱 | 원장·직원이 쓰는 학원 운영 관리 |
| 학생 수 | 220 | 211 |

## 연결 고리

`studycheck.students.ops_student_id` → `sumath-admin.students.id`

이 값이 비어 있는 학생(OPS 도입 전부터 있던 학생 등)은 연동에서 조용히 건너뛴다.

## StudyCheck → OPS

| 경로 | 하는 일 | 환경변수 |
|---|---|---|
| `app/api/sync-student-to-ops` | 학생 정보 수정·퇴원 처리를 OPS에 반영 | `OPS_SUPABASE_URL`, `OPS_SUPABASE_SERVICE_ROLE_KEY` |
| `app/api/sync-absence-to-ops` | 결석 정보 전달 | `OPS_SYNC_URL`, `OPS_SYNC_SECRET` |

`sync-student-to-ops`는 **OPS DB에 직접 쓴다**(service_role). 2026-09-16에 직원 인증을 붙였다.
인증 없이 열려 있던 시절엔 누구나 학생 정보를 바꿀 수 있었다.

## OPS → StudyCheck

`sumath-admin/src/app/api/studycheck/*` 에서 반대 방향으로 호출한다.
환경변수 `STUDYCHECK_SUPABASE_URL`, `STUDYCHECK_SUPABASE_SERVICE_ROLE_KEY`, `STUDYCHECK_SYNC_SECRET`.

| 경로 (OPS 쪽) | 하는 일 |
|---|---|
| `api/absences/push-to-studycheck` | OPS에서 등록한 결석·보강 확정을 학습일지에 반영 |
| `api/students/push-to-studycheck` | **학생의 학교·학년**을 반영 (2026-10-09 추가) |

### 휴원은 OPS에서 한다 — StudyCheck 의 is_active=false 가 휴원이다

휴원 시작·종료는 **양쪽 어디서든** 할 수 있다(2026-10-09). 누르면 OPS 는 `on_leave=true` + 휴원시작일을 적고,
`api/studycheck/set-leave` 가 StudyCheck 에 `on_leave=true`, 휴원시작일, 그리고
**`is_active=false`** 를 쓴다. 휴원중엔 담당강사 화면·학생 목록에서 빼려는 **의도된 동작**이다.

→ 그래서 StudyCheck 의 `is_active=false` 는 퇴원일 수도, 휴원일 수도 있다.
  **`on_leave` 를 보지 않고 퇴원이라고 단정하지 말 것.**
  퇴원: `is_active=false` + `on_leave=false` / 휴원: `is_active=false` + `on_leave=true`

반대로 **스터디체크 학생관리**(「재원 / 휴원」 탭)에서 눌러도 OPS 에 반영된다 —
`api/sync-student-to-ops` 가 `on_leave`·`leave_start_date`·`leave_end_date`·`leave_reason` 를 받는다.
★ 이때 `is_active` 는 **보내지 않는다.** OPS 는 휴원생을 `active=true` 로 두므로,
보내면 OPS 에서 퇴원처럼 내려간다. 복귀할 때만 `is_active=true` 를 같이 보낸다.

휴원 사유(`leave_reason`)는 2026-10-09 에 스터디체크에도 칸을 만들어 양쪽이 같아졌다
(docs/sql/휴원사유_칸_추가.sql).

### ★ 학생 정보는 양쪽에서 고칠 수 있다 — 한쪽만 고치면 조용히 어긋난다

학교·학년은 **양방향**이다. 다른 칸(담당강사·시간표·보호자)은 아직 StudyCheck → OPS 한 방향뿐이다.

2026-09-19에 원장님이 **OPS 학생목록**에 일곱 명의 학교를 입력하셨는데, 그때는 OPS → StudyCheck
방향이 없어서 StudyCheck 쪽은 등록일(2026-05-15) 그대로 빈칸이었다. 학교가 비면
`students.school = exam_schedule.school_name` 매칭이 안 되므로 **시험대비 배정이 그 학생에게
영원히 안 걸린다** — 중3 네 명이 11월 시험대비에서 빠질 상황이었다. 에러도 안 났다.
`pushStudentInfoToStudycheck`(`src/lib/studycheckPush.ts`)가 이걸 막는다.

- 빈 값으로는 덮어쓰지 않는다. OPS를 비워 둔 채 저장했다고 StudyCheck 값을 지우면 안 된다.
- 짝은 `students.ops_student_id` (2026-10-09 기준 184명 중 183명 연결).
- 어긋났는지 확인하려면 두 DB의 학교 분포를 맞춰 본다 —
  `select school, count(*) from students where is_active/active group by 1 order by 1`.
  이 방법으로 문지윤(초5)의 OPS 학교가 「신원」으로 끊겨 있던 것을 찾았다.
- ★ 다만 **숫자 차이가 곧 사고는 아니다.** 휴원생은 StudyCheck 에서 `is_active=false` 로
  내려가고(아래 참고) OPS 는 `active=true + on_leave=true` 로 남으므로, 분포를 세면
  휴원생 수만큼 어긋나 보인다. 2026-10-09 에 이걸 퇴원 누락으로 잘못 읽은 적이 있다.
  반드시 `on_leave` 를 함께 보고 판단할 것.

## 주의

- **키가 서로 얽혀 있다.** StudyCheck의 키를 바꾸면 OPS 쪽 `STUDYCHECK_*` 환경변수도 바꿔야 하고,
  OPS의 키를 바꾸면 StudyCheck의 `OPS_*`도 바꿔야 한다. 한쪽만 바꾸면 연동이 조용히 끊긴다.
- 2026-09-16 키 교체는 **StudyCheck 프로젝트만** 했다. OPS 프로젝트의 legacy 키는 아직 살아 있다.
