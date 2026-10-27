---
name: school-profile
description: 학교 자료집 추가·갱신 — 학교알리미 공시(OpenAPI 숫자 지표 + 교육과정 편제표·학사일정 첨부)를 학교별 한 장(data/school-profiles/<학교>.json → school_profiles 표 → /teacher/schools 화면)으로 정리한다. "학교 자료집", "학교알리미", "○○구 학교 추가", "○○고 자료집 넣어줘", "수학 편제", "편제표", "학교 정보 정리", "공시 갱신" 같은 말이 나오면 쓴다. Use when adding or refreshing per-school profile pages (student counts, math curriculum by grade, exam calendar) from Korean 학교알리미 public disclosures in StudyCheck.
---

# 학교 자료집 추가·갱신

## 목적
상담 중에 띄워 놓고 그대로 읽어 드릴 수 있는 **학교별 한 장**을 만든다. 학생수·학급당 인원,
학년별 수학 편제(어떤 과목을 몇 단위/학점 배우는지), 정기시험 날짜를 모은다.
공시 첨부(편제표·학사일정)는 학교마다 표 모양이 달라 화면에서 실시간으로 읽을 수 없으므로
**사람(또는 AI)이 한 번 읽어 JSON으로 넣고, 화면은 그리기만 한다.** 공시는 1년에 한 번 바뀐다.

## 언제 쓰나
- 새 지역·새 학교의 자료집을 추가할 때 (예: 「일산동구 고등학교 넣어줘」)
- 새 학년도 공시가 나와 기존 학교를 갱신할 때 (`source_year` 바뀜, 옛 자료는 덮어쓴다)
- 「확인하지 못했다」로 남겨 둔 칸을 학교 확인 후 채울 때

## 관련 파일
| 무엇 | 경로 |
|---|---|
| 학교별 원본 JSON | `data/school-profiles/<줄임이름>.json` (예: `고양일고.json`) |
| 값의 모양(타입) | `lib/schoolProfile.ts` — `SchoolProfile`, `MathYear`, `MathTerm`, `MathPick`, `ExamCalendar`, `SchoolStats`, `Highlight`, `Source` |
| 넣는 스크립트 | `scripts/upload-school-profile.mjs` |
| 표 만들기 / 되돌리기 | `docs/sql/학교자료집_표_만들기.sql` / `docs/sql/학교자료집_표_만들기_되돌리기.sql` |
| API | `app/api/school-profiles/route.ts` (GET 직원, PUT 원장 전용) |
| 화면 | `app/teacher/schools/page.tsx`(목록), `app/teacher/schools/[name]/page.tsx`(한 장) |
| 메뉴·매뉴얼 | `components/teacher/Sidebar.tsx`(「학생」 묶음 `ITEM.schools`), `app/teacher/manual/page.tsx` |

## 데이터 출처와 무엇을 뽑는지
1. **학교알리미 OpenAPI** — 숫자 지표. 손으로 옮기지 않는다(15곳 중 한 곳쯤은 틀리고, 틀려도 아무도 모른다).
   - 학년별·학급별 학생수 → `stats.total / classes / perClass / byGrade[] / special`
   - 직위별 교원 현황 → `stats.teachers / studentsPerTeacher`
   - 동아리·상담(Wee클래스)·입학생 → `highlights[]` (`{label, value}` 한 줄씩, 예: 「2026 신입생」「266명 (남 84 · 여 182)」)
   - 개요 → `official_name, region, office, foundation(공립/사립), school_type, coed`
2. **학교알리미 공시 첨부** — 「학교교육과정 편성·운영 및 평가에 관한 사항」
   - 수학 편제표 → `math_curriculum[]` (학년별 `grade, revision, terms[{term, subject, units}], picks[{label, term, options, note}], note`)
   - 학사일정·평가계획 → `exam_calendar` (`rounds[{label, dates, note}]`, `mock[]`, `terms[]`, `note`)
3. `sources[]` — 공공누리 출처표시 의무가 있어 화면 아래에 그대로 나온다. 기존 파일처럼 두 줄을 적는다:
   `{"name":"학교알리미 공시","detail":"학교교육과정 편성·운영 및 평가에 관한 사항 (2026)"}`,
   `{"name":"학교알리미 OpenAPI","detail":"학년별·학급별 학생수 / 직위별 교원 현황 / 동아리 / 상담 / 입학생 (2026)"}`
4. `notes` — 공시에 없는 설명, 그리고 **확인 못 한 것**을 적는 자리 (화면에 초록 글씨로 그대로 나온다).

※ 저장소에는 OpenAPI를 불러오는 스크립트가 **없다**(지난번엔 작업 중에 직접 호출해 JSON에 적었다).
API 키도 저장소·`.env.local` 에 정해진 이름이 없다 — 필요하면 원장님께 받는다.

## 저장 형식·테이블
- 표 `public.school_profiles` — 학교 한 곳당 한 줄, `school_name` unique, upsert(onConflict `school_name`)로 덮어쓴다.
- `stats / math_curriculum / exam_calendar / highlights / sources` 는 jsonb (학교마다 칸이 달라서).
- 필수: `school_name`, `school_level`('초'|'중'|'고'), `source_year`.
- RLS: 읽기 `(select public.is_staff())`, 쓰기 `(select public.is_admin())`. **`using (true)` 금지** — 학생·학부모도 authenticated다.
- 표는 이미 운영 DB에 있다. 되돌리기 SQL은 **넣어 둔 자료가 전부 사라지므로** 쓰지 않는다.

## 단계별 순서
1. **대상 고르기** — 우리 학생이 다니는 학교부터. 화면 목록도 우리 학생 수가 많은 학교가 위로 온다.
2. **기존 파일을 본보기로 복사** — 편제가 잘 채워진 `data/school-profiles/화정고.json`·`고양일고.json`(정기시험까지 있음).
   파일 이름 = `school_name` = 줄임이름.
3. **OpenAPI 숫자 채우기** — 위 표의 칸으로. 한 곳은 알려진 값과 대조해 검산(지난번 고양일고로 맞춰 봄).
4. **편제표 읽기 (핵심, 가장 틀리기 쉬움)**
   - 순서로 짐작하지 않는다. 학년·학기 열을 **표 칸 주소로** 맞춘다.
   - `.hwp`: 레코드에서 표 칸의 (행,열) 주소(colAddr)를 읽는다.
   - PDF: 선을 보고 칸을 되살린다. `pdftotext -layout` 은 믿지 않는다
     (신원고가 「공통수학1 4 3 22 8 / 공통수학2」처럼 섞여 나와 학년이 틀릴 뻔했다).
   - **단위 합계로 검산** (화정고 4+4+4+4+3 = 이수 19).
   - 과목은 전원 공통이면 `terms`, 고르는 것이면 `picks`(`label: '택3'`, `options: ['확률과 통계(3)', …]`).
   - 교육과정이 학년마다 다를 수 있으니 `revision`('2022 개정' 등)은 학년마다 붙인다.
5. **학사일정** — 정기시험 날짜가 공시에 있으면 `exam_calendar.rounds`. 없으면 `{}` 로 두고 notes에 적는다.
6. **올리기** (저장소 루트, `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 필요)
   ```
   node scripts/upload-school-profile.mjs data/school-profiles/능곡고.json   # 한 학교
   node scripts/upload-school-profile.mjs                                    # 폴더 전체
   ```
   끝에 `넣음 N건 · 실패 M건 · 표에 모두 K개 학교` 가 찍힌다. 실패가 있으면 종료코드 1.
7. **화면 확인** — `/teacher/schools` 목록에 뜨는지, `/teacher/schools/<학교>` 에서 편제·시험·출처·우리 학생 이름이 나오는지.
8. 커밋 — 본문에 어느 학교를 채웠고 무엇을 확인 못 했는지 적는다(지난 커밋들처럼).

## 학교 이름 규칙 (normalizeSchool)
- `school_name` 은 반드시 `normalizeSchool()`(`lib/school.ts`) 결과: 「고양일고」(O) 「고양일고등학교」(X).
  `students.school`·`exam_schedule.school_name` 과 같은 키여야 우리 학생·시험일정과 걸린다. 어긋나도 에러가 안 난다.
- 규칙: 공백 제거 → 여자중학교→여중, 여자고등학교→여고 → 초등학교→초, 중학교→중, 고등학교→고 → 끝의 학년 숫자 제거 → ALIAS(오금초→고양오금초).
- 공식 명칭은 `official_name` 에 따로 적는다.
- 주의: 업로드 스크립트는 「…학교」로 끝나는 이름만 막고 **normalizeSchool 을 돌리지 않는다**(PUT API는 돌린다).
  공백·「여자고」 같은 것은 직접 맞춘다. 외국어고는 기존 파일이 `고양외국어고`(「고양외고」 아님) — 학생 기록과 같은지 확인.
- OPS(`sumath-admin` 의 `src/lib/school.ts`)에 같은 사본이 있다. 규칙을 바꾸면 양쪽 다.

## 편제 정보가 없거나 확인이 안 될 때
- **짐작으로 채우지 않는다.** notes 에 「…확인하지 못했습니다」라고 이유와 함께 적는다.
  실제 예: 고양동산고·무원고 3학년 선택 묶음, 고양외국어고 학점(편제표 칸이 합쳐져 과목·순서만 옮김),
  고양고 학과별 배치, 백양고 3학년.
- 학점/단위를 모르면 `units` 를 빼면 된다(화면에서 과목만 나옴).
- 숫자만 먼저 올릴 수도 있다 — 그때는 `math_curriculum: []` 로 두고 notes 에 「정리 중」(a5d0dd0 때 9곳이 그랬다).
- 정기시험 날짜가 공시에 없으면 `exam_calendar: {}` + notes 「정기시험 날짜는 이 학교 공시에 들어 있지 않아 비워 뒀습니다.」

## 진행 현황 (2026-10-27 기준, 2026 공시)
- **경기 고양시 덕양구 고등학교 15곳 완료, 15곳 모두 수학 편제 채움**:
  고양고·고양동산고·고양외국어고·고양일고·능곡고·도래울고·무원고·백양고·서정고·성사고·신원고·행신고·향동고·화수고·화정고
- 정기시험 날짜(`exam_calendar.rounds`)가 있는 곳은 고양일고 하나뿐.
- 중학교·초등학교, 덕양구 밖 지역은 아직 없다.
- 커밋: e117b40(화면·표·스크립트, 고양일고) → a5d0dd0(15곳 숫자, 6곳 편제) → 81cb573(15곳 편제 완료).

## 끝났다고 말하기 전 확인
- [ ] 파일 이름 = `school_name` = normalizeSchool 결과, `official_name` 따로 있음
- [ ] 업로드 출력에 실패 0건, 「표에 모두 K개 학교」가 기대 수와 같음
- [ ] 편제는 칸 주소로 맞췄고 단위 합계 검산을 했음
- [ ] 확인 못 한 칸은 비우고 notes 에 「확인하지 못했다」를 적음 (짐작 0)
- [ ] `sources` 두 줄, `source_year` 맞음
- [ ] 화면 한 장에서 우리 학생 이름이 보임(안 보이면 학교 이름 불일치 의심)
- [ ] 아래 진행 현황과 규칙 추가 기록을 갱신함

## 자주 하는 실수
- `pdftotext -layout` 결과를 그대로 믿고 학년을 잘못 붙인다.
- 숫자 지표를 공시 화면에서 손으로 옮겨 적는다 → OpenAPI 값을 쓴다.
- 「…고등학교」로 저장 → 스크립트가 멈춘다. 「고양 일고」처럼 공백이 들어가면 **안 멈추고** 조용히 어긋난다.
- 편제가 애매한데 다른 학교를 본떠 채운다.
- 새 정책을 만들며 `using (true)` 를 쓴다.
- 되돌리기 SQL을 「다시 만들기」 용도로 돌려 자료를 날린다.
- 메뉴·화면 문구를 바꾸고 `app/teacher/manual/page.tsx` 를 안 고친다.

## 규칙 추가 기록
> 작업하다 새 규칙이 생기면 여기 날짜와 함께 한 줄씩 추가하고, 위 본문의 해당 자리에도 반영한다.
- 2026-10-27 스킬 처음 만듦 (지금까지의 커밋·문서 기준)
