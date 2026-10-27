---
name: school-profile
description: 학교 자료집 추가·갱신 — 학교알리미 공시(OpenAPI 숫자 지표 + 교육과정 편제표·학사일정 첨부)를 학교별 한 장(data/school-profiles/<학교>.json → school_profiles 표 → /teacher/schools 화면)으로 정리한다. "학교 자료집", "학교알리미", "○○구 학교 추가", "○○고 자료집 넣어줘", "수학 편제", "편제표", "학교 정보 정리", "공시 갱신", "수행평가 정리해줘", "○○중 수행평가", "평가계획", "반영 비율" 같은 말이 나오면 쓴다. Use when adding or refreshing per-school profile pages (student counts, math curriculum by grade, exam calendar, math assessment plan / 수행평가) from Korean 학교알리미 public disclosures in StudyCheck.
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

## 앱에서 바로 추가 (2026-10-27~) — 먼저 이걸 쓴다
선생님이 `/teacher/schools` 의 **「학교 추가」** 에서 학교급 → 시도 → 시군구 → 학교를 누르면 몇 초 만에 한 장이 생긴다.
학교 화면의 **「학교알리미에서 숫자 새로 받기」** 는 숫자만 다시 받는다. 미리 정리해 둘 필요가 없다.
| 무엇 | 경로 |
|---|---|
| 학교알리미 호출·조립 | `lib/schoolinfo.ts` — `listSidos/listSigungus/listSchools`, `fetchSchool`, `mergeProfile` |
| 학교 찾기 API | `app/api/school-profiles/lookup/route.ts` (GET `step=sido·sigungu·school`, 직원) |
| 만들기·새로 받기 API | `app/api/school-profiles/import/route.ts` (POST `{shl, level, sigungu}` 또는 `{school_name}`, 직원) |
- 인증키: Vercel 환경변수 **`SCHOOLINFO_API_KEY`**. 없으면 「인증키가 서버에 아직 없어요」가 뜬다.
  **2026-10-27 원장님이 넣음 — 운영에서 신원고로 동작 확인**(전교생 737 · 32학급 · 교원 73 · 신입생 244, 편제 3개 학년과 손으로 적은 한 줄은 그대로).
  공개 견본 키 `sample` 도 실제 값을 주지만 **한 번에 20곳까지만** 준다 → 운영에 쓰지 않는다(시험용으로만).
- 다시 받을 때의 열쇠는 `stats.schoolinfo = {shl, adrcd(행정동 10자리), level}`. OpenAPI 지역 코드는 adrcd 앞 2자리/5자리.
- **★ `mergeProfile` 은 사람이 정리한 것을 덮지 않는다**: `math_curriculum`, `exam_calendar`, `notes`, `stats.achievement`,
  손으로 적은 한 줄(`highlights` 중 자동 이름이 아닌 것). 자동 이름: 교내 Wee클래스 · 창의적체험활동 동아리 · 학생 자율동아리 · 「YYYY 신입생」.
- 올해 공시가 비어 있으면 작년 것을 쓴다(`source_year` 에 실제로 쓴 해).
- 편제가 빈 한 장에는 「아직 정리 전이에요」 카드가 뜬다 → 아래 순서로 사람이(Claude가) 채운다.
- OpenAPI 칸 뜻 (고양일고 손 정리값과 숫자까지 맞대 확인함):
  | apiType | 칸 → 자료집 |
  |---|---|
  | 0 기본정보 | `SCHUL_NM` 공식이름 · `SHL_IDF_CD` · `SCHUL_CODE`(다른 항목과 잇는 열쇠) · `ADRCD_CD`/`ADRCD_NM` · `FOND_SC_CODE` · `HS_KND_SC_NM` · `COEDU_SC_CODE` · `DGHT_SC_CODE` |
  | 09 학생수 | `COL_S1~6` 학년 학생 · `COL_C1~6` 학급 · `COL_1~6` 학급당 · `7` 은 특수학급 · `COL_S_SUM` 전교생(특수 포함) · `COL_C_SUM` · `COL_SUM` · `TEACH_CAL` 교원 1인당 · `JU_ORG_NM` 교육지원청 |
  | 22 교원 | `COL_S` 교원 총계 |
  | 51 입학생 | `ALL_SUM` · `MAN_SUM` · `WOMAN_SUM` |
  | 56 동아리 | `CREAT_EXPER_ACT_CCCLU_FGR` 창체동아리 수 · `CREAT_EXPER_ACT_STDNT_FGR` 참여 · `STDNT_SLCTL_CCCLU_FGR`/`STDNT_SLCTL_FGR` 자율동아리 |
  | 61 상담 | `WEE_CINSTL_YN` |
- 이 컨테이너에서 Node 로 시험할 때는 프록시를 켠다: `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt SCHOOLINFO_API_KEY=sample node --import ./scripts/ts-resolve.mjs <시험.mts>`

## 데이터 출처와 무엇을 뽑는지
1. **학교알리미 OpenAPI** — 숫자 지표. 손으로 옮기지 않는다(15곳 중 한 곳쯤은 틀리고, 틀려도 아무도 모른다).
   - 학년별·학급별 학생수 → `stats.total / classes / perClass / byGrade[] / special`
   - 직위별 교원 현황 → `stats.teachers / studentsPerTeacher`
   - 동아리·상담(Wee클래스)·입학생 → `highlights[]` (`{label, value}` 한 줄씩, 예: 「2026 신입생」「266명 (남 84 · 여 182)」)
   - 개요 → `official_name, region, office, foundation(공립/사립), school_type, coed`
2. **학교알리미 공시 첨부** — 「학교교육과정 편성·운영 및 평가에 관한 사항」
   - 수학 편제표 → `math_curriculum[]` (학년별 `grade, revision, terms[{term, subject, units}], picks[{label, term, options, note}], note`)
   - 학사일정·평가계획 → `exam_calendar` (`rounds[{label, dates, note}]`, `mock[]`, `terms[]`, `note`)
3. **교과별 학업성취사항(성취도)** — `stats.achievement` (`{year, rows[{grade, term, subject, avg, sd, students, dist}], note}`)
   - `year` 는 **성적 연도**(보통 4월 공시에 지난해 것이 올라온다). `dist` 는 A~E 비율(%) 5칸, 3단계 과목은 A~C 3칸.
   - 표에 칸을 새로 만들지 않으려고 `stats`(jsonb) 안에 둔다. 비어 있으면 화면에 성취도 칸이 안 나온다.
   - **★ 자동으로 가져올 수 없다 (2026-10-27 확인).**
     - OpenAPI(`/openApi.do`, apiType 목록은 `/js/new/dev/openApi.js` 의 `case`)에 교과별 학업성취 항목이 **없다**.
     - 공개용 데이터(`/ng/go/pnnggo_a01_l2.do`, 내려받는 파일)에도 **없다**.
     - 학교 화면의 표 조각(`/ei/pp/Pneipp_b44_s0p.do`, GS_HANGMOK_CD=44 · JG_BURYU_CD=JG040 · JG_HANGMOK_CD=15)은
       **자동입력 방지 숫자(캡차)** 를 먼저 묻는다. 사람이 보라고 막아 둔 것이므로 **뚫으려 하지 않는다.**
     지역 비교 화면(「항목별 공시정보」 `pneiss_a05_s1.do`)도 같은 캡차(`/capcha.do`)를 거친다. 공공데이터포털에도 파일이 보이지 않는다.
   - 그래서 **사람이 캡차만 풀고, 읽고 옮기는 일은 Claude가 한다.** 추천 순서:
     1. **표 글자 붙여넣기 (가장 정확)** — 원장님이 바로가기 → 「학업성취사항 → 교과별 학업성취 사항」 → 숫자 입력 → 표를 끌어 선택·복사 →
        대화창에 붙여넣기. 여러 학교를 한 번에 붙여도 된다(줄 맨 앞에 학교 이름).
     2. **화면 캡처** — 붙여넣기가 어려울 때. 흐린 칸은 되묻는다.
     3. **원장님 브라우저를 같이 쓰기** — 데스크톱 앱 + Claude in Chrome 세션이면 Claude가 화면을 열고 **캡차 숫자는 원장님이 직접 입력**, 표는 Claude가 읽는다.
     4. **정보공개청구** — 지역 전체를 파일로: 정보공개포털(open.go.kr) → 한국교육학술정보원에 「○○구 고등학교 교과별 학업성취 사항 파일」 청구.
   - 옮긴 뒤 과목 수·학년·학기를 원본과 맞대고, `dist` 합이 100 근처인지 보고, note 에 어디서 옮겼는지 적는다. 캡차를 문자 인식으로 풀지 않는다.
4. **수행평가 — 교과별(학년별) 교수·학습 및 평가계획 (공시 4-가)** → `stats.assessment` (2026-10-27~)
   - 형식(`lib/schoolProfile.ts` 의 `Assessment`): `{year, plans[{grade, term, subject, examRatio, perfRatio, essayRatio,
     exams[{label, points, ratio, when}], tasks[{label, kind, points, ratio, when, elements[]}], page, note}], note}`.
     성취도처럼 `stats` 안에 두므로 **표(DB 칸)를 새로 만들지 않는다.** `mergeProfile` 이 덮지 않는다. 화면은 「○○학년도 수학 수행평가」 카드.
   - **캡차 없이 받아진다.** 학교마다 학년별 PDF(전 과목, 150~180쪽)가 학기마다(4월 = 1학기, 9월 = 2학기) 올라온다.
     ```
     python .claude/skills/school-profile/scripts/fetch_eval_plan.py <SHL_IDF_CD> <폴더>      # 받고 수학 「반영 비율」 쪽 후보까지
     python .claude/skills/school-profile/scripts/check_assessment.py <assessment.json> <폴더>  # 옮긴 값 ↔ 원문 쪽 대조
     ```
     부르는 주소: 목록 `POST /ei/pp/Pneipp_b43_s0p.do` (GS_HANGMOK_CD=43 · JG_BURYU_CD=JG040 · JG_HANGMOK_CD=14, 응답 cp949,
     숨은 칸 `JG_CHASU` 가 차수), 파일 `POST /servlets/EiFileDownLoad.do` (`FILE_SEQ` 0,1,2…). 받은 PDF 는 git 에 넣지 않는다.
   - 파일 모양은 학교마다 다르다: 화수중은 학년별 PDF 3개(150~180쪽), **신원중은 전 학년 한 파일(507쪽)**.
     받기 스크립트는 「수학과 평가 세부 계획」 머리말마다 그 뒤 첫 「평가의 종류와 반영 비율」 쪽을 「머리말→표」로 알려 준다
     (신원중 60→65, 232→237, 410→413). 한 파일이면 학년은 표 내용(단원)으로 맞춘다 — 머리말 순서가 1·2·3학년이었다.
   - 표에 「전기학교 반영비율」 같은 줄이 더 있으면(신원중 3학년) 해당 plan 의 `note` 에 원문 그대로 적는다.
   - 읽는 곳: 수학 「평가 세부계획」의 **「평가의 종류와 반영 비율」 표** 한 쪽. 정기시험(1차·2차 × 선택형·논술형)과 수행평가 영역마다
     만점·반영비율·시기, 논술형 반영비율 합, 성취기준, 평가요소가 다 있다.
   - **그림으로 한 번 보고 옮긴다**(pymupdf 로 그 쪽을 PNG). 글자 뽑기는 칸이 섞여 나온다 — 값은 그림 표에서, 글자는 대조용.
     시기·영역 이름은 **원문 그대로**(「12월2주」처럼 붙여 쓴 것도 그대로 — 점검기는 띄어쓰기를 무시한다).
   - `page` 는 「<파일 이름> <N>쪽」, N 은 **PDF 파일 안의 순서**(화수중 3학년은 84번째 쪽에 「- 63 -」이 인쇄돼 있었다 → 둘 다 적음).
   - 점검기: 영역 이름·방식·N점·N%·시기가 그 쪽에 글자 그대로 있는지, 정기+수행 = 100, 수행 영역 합 = 수행 비율, 정기 칸 합 = 정기 비율.
     **값을 다른 칸에 잘못 붙인 것(1차 시기를 2차에)은 못 잡는다** → 카드를 그림 표와 한 번 맞대 본다.
     일부러 틀린 사본에서 실패하는 것 확인함(화수중: 정상 101/101, 네 군데 바꾼 사본 63/101).
   - 학생·학부모 안내문이 필요하면 계정 스킬 `performance-notice`(원문 값만 쓰고 대조)를 이 값·원문으로 돌린다.
5. **학교알리미 바로가기 주소** — `sources[]` 의 「학교알리미 공시」 줄에 `url` 을 붙인다:
   `https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=<학교 UUID>` (이게 정식 주소. 옛 `HG_CD=` 주소도 이리로 넘어간다)
   - **전국 어디든 도구로 찾는다** (같은 폴더 `scripts/find_schools.py`, 표준 라이브러리만):
     ```
     python .claude/skills/school-profile/scripts/find_schools.py 경기 "고양시 일산동구" 고 --check --json out.json
     python .claude/skills/school-profile/scripts/find_schools.py 경기 - 중 --name 백석     # 구를 모르면 -
     ```
     `--check` 가 주소마다 열어 학교 이름을 확인한다. 시도 코드는 바뀌므로(2026 「전남광주통합특별시」) 도구가 화면에서 읽는다.
   - 도구가 부르는 주소 (직접 부를 때) — 캡차 없이 지역 단위로 한 번에 나온다:
     ```
     # 시군구 코드 (경기 4100000000 → 고양시 덕양구 4128100000, 일산동구 4128500000, 일산서구 4128700000)
     curl -sS https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0_sigungu_json.do --data SIDO_CODE=4100000000
     # 학교 목록 → [{SHL_IDF_CD, SHL_NM}]   HG_JONGRYU_GB: 02 초 · 03 중 · 04 고 · 05 특수/기타
     curl -sS https://www.schoolinfo.go.kr/ei/ss/pneiss_a03_s0_school_json.do \
       --data 'HG_JONGRYU_GB=04&SIDO_CODE=4100000000&GUGUN_CODE=4128100000'
     ```
     `SHL_NM`(「고양일고등학교」)을 JSON 의 `official_name` 과 맞춰 붙인다.
   - **주소마다 열어 보고 `<title>` 이 「<학교명> 학교정보 | 학교알리미」인지 확인한 뒤** 넣는다. 짐작 금지.
   - 학교알리미 화면은 **EUC-KR(cp949)** 이다. 읽을 때 `iconv -f cp949 -t utf-8`.
   - 화면 맨 위 「학교알리미에서 성취도 보기」 버튼이 이 주소로 간다. 성취도 표까지 바로 여는 주소는 없다(캡차 때문) —
     버튼 옆에 「학업성취사항 → 교과별 학업성취 사항 → 숫자 입력」 안내가 뜬다. `url` 이 없으면 첫 화면 + 검색 안내.
6. `sources[]` — 공공누리 출처표시 의무가 있어 화면 아래에 그대로 나온다. 기존 파일처럼 두 줄을 적는다:
   `{"name":"학교알리미 공시","detail":"학교교육과정 편성·운영 및 평가에 관한 사항 (2026)"}`,
   `{"name":"학교알리미 OpenAPI","detail":"학년별·학급별 학생수 / 직위별 교원 현황 / 동아리 / 상담 / 입학생 (2026)"}`
7. `notes` — 공시에 없는 설명, 그리고 **확인 못 한 것**을 적는 자리 (화면에 초록 글씨로 그대로 나온다).

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
6. **올리기** — `.env.local` 이 없는 클라우드 세션이면 Supabase 연결(execute_sql)로 **그 칸만** 고친다.
   통째로 덮지 말고 jsonb 를 고쳐 끼운다. 예: sources 의 「학교알리미 공시」 줄에 url 만 더하기
   ```sql
   update public.school_profiles sp set sources = (
     select jsonb_agg(case when e->>'name' = '학교알리미 공시' then e || jsonb_build_object('url', v.url) else e end order by ord)
     from jsonb_array_elements(sp.sources) with ordinality as t(e, ord))
   from (values ('고양일고', 'https://…')) as v(school_name, url)
   where sp.school_name = v.school_name returning sp.school_name;
   ```
   JSON 파일도 **같이** 고친다(파일이 원본이다 — 다음에 스크립트로 올리면 DB 를 파일 내용으로 덮는다).
   스크립트로 올릴 때 (저장소 루트, `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 필요)
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
- 학교알리미 주소(`sources[].url`)는 **15곳 모두 채움** (2026-10-27, JSON·DB 둘 다, 열어서 학교 이름 확인).
- 성취도(`stats.achievement`)는 **15곳 모두 비어 있다** — 자동으로 못 가져온다(위 3번, 캡차). 원장님이 표를 붙여넣어 주시면(1순위) 또는 캡처를 주시면 채운다.
  ※ 클라우드 세션은 환경 설정의 허용 도메인에 `www.schoolinfo.go.kr` 이 있어야 접속된다(2026-10-27 추가함).
- 중학교·초등학교, 덕양구 밖 지역은 아직 없다.
- 수행평가(`stats.assessment`)는 **재원생이 있는 학교만** 한다(원장님 2026-10-27). 중 7곳(신원중·원흥중·고양중·지축중·고양제일중·목암중·도래울중),
  고 5곳(신원고·고양일고·고양동산고·백양고·봉일천고). 신원중 2026 2학기 1~3학년 옮기고 점검 102/102 — DB 반영은 원장님 허락 뒤.
  화수중(재원생 없음)은 시험용으로만 옮겼다(101/101).
  재원생 학교 목록: `select school, count(*) from students where is_active group by school`.
- 커밋: e117b40(화면·표·스크립트, 고양일고) → a5d0dd0(15곳 숫자, 6곳 편제) → 81cb573(15곳 편제 완료).

## 끝났다고 말하기 전 확인
- [ ] 파일 이름 = `school_name` = normalizeSchool 결과, `official_name` 따로 있음
- [ ] 업로드 출력에 실패 0건, 「표에 모두 K개 학교」가 기대 수와 같음
- [ ] 편제는 칸 주소로 맞췄고 단위 합계 검산을 했음
- [ ] 확인 못 한 칸은 비우고 notes 에 「확인하지 못했다」를 적음 (짐작 0)
- [ ] `sources` 두 줄, `source_year` 맞음, 학교알리미 `url` 은 실제로 열어 본 주소
- [ ] 성취도를 넣었으면 `year` 가 성적 연도이고 `dist` 합이 100 근처
- [ ] 수행평가를 넣었으면 `check_assessment.py` 가 「통과 N / 전체 N」이고, 카드를 원문 그림 표와 맞대 봤음
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
- 2026-10-27 성취도 — `stats.achievement` 형식, 학교알리미 바로가기 `sources[].url`(HG_CD), 「학교알리미에서 성취도 보기」 버튼, 코드 짐작 금지
- 2026-10-27 학교알리미 주소 15곳 채움 — SHL_IDF_CD 찾는 json 주소, title 확인, cp949, DB 는 jsonb 부분 수정. 성취도는 OpenAPI·공개용 데이터에 없고 화면은 캡차 → 원장님 캡처로만 채운다
- 2026-10-27 전국 학교 찾기 도구 `scripts/find_schools.py`(지역·이름, --check). 성취도는 「표 붙여넣기 → 캡처 → 브라우저 같이 쓰기(캡차는 원장님) → 정보공개청구」 순. 다른 학원용 사본을 따로 만들어 드림
- 2026-10-27 앱에서 바로 추가 — 「학교 추가」·「숫자 새로 받기」, lib/schoolinfo.ts, SCHOOLINFO_API_KEY(견본 키는 20곳 제한), stats.schoolinfo 열쇠, 사람이 정리한 칸은 덮지 않음, OpenAPI 칸 뜻표
- 2026-10-27 운영 인증키로 「숫자 새로 받기」 동작 확인(신원고). 다른 학원용 사본에 앱 「학교 추가」 본보기 코드·칸 뜻표 넣어 다시 보냄
- 2026-10-27 수행평가 — 공시 4-가 평가계획 PDF 는 캡차 없이 받아진다. `stats.assessment` 형식, fetch_eval_plan.py(받기·쪽 찾기)·check_assessment.py(원문 대조), 화면 카드
- 2026-10-27 수행평가는 재원생이 있는 학교만(원장님). 전 학년 한 파일 PDF(신원중)는 「수학과 평가 세부」 머리말→첫 반영 비율 표로 찾는다
