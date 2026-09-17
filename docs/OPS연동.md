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

## 주의

- **키가 서로 얽혀 있다.** StudyCheck의 키를 바꾸면 OPS 쪽 `STUDYCHECK_*` 환경변수도 바꿔야 하고,
  OPS의 키를 바꾸면 StudyCheck의 `OPS_*`도 바꿔야 한다. 한쪽만 바꾸면 연동이 조용히 끊긴다.
- 2026-09-16 키 교체는 **StudyCheck 프로젝트만** 했다. OPS 프로젝트의 legacy 키는 아직 살아 있다.
