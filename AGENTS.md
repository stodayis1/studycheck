<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:studycheck-handover -->
# StudyCheck — 작업 인수인계

> 수학의지혜 학원의 학생·학부모·선생님용 통합 앱. 이 문서는 **처음 이 저장소를 여는 사람(사람이든 AI든)** 이
> 바로 작업을 이어받을 수 있게 쓴 것이다. 세부 내용은 `docs/` 참고.

## 한 줄 요약

Next.js 16 + Supabase. Vercel 배포. 학생 ~220명. 운영 중인 실서비스이므로 **데이터가 사라지는 변경은 절대 금지**.

- 배포 주소: https://studycheck-five.vercel.app
- Supabase 프로젝트: `cggskjxsyrvuhsldgkoj` (조직 `수학의지혜`, Pro 플랜, ap-northeast-2)
- 자매 앱: **수학OPS** (`sumath-admin` 저장소 / Supabase `rofnofcgkewbabnijcsu`) — DB가 완전히 분리돼 있고 API로만 연동

## 반드시 알아야 할 함정

1. **Next.js 16이다.** 14가 아니다. route handler와 page의 `params`가 `Promise`다.
   - 서버: `const { code } = await params`
   - 클라이언트: `const { code } = use(params)`
   - `useSearchParams()`는 Suspense 경계가 필요하다. 간단한 화면이면 그냥 state로 처리하는 게 낫다.
2. **`next.config.ts`에 `typescript.ignoreBuildErrors: true`, `eslint.ignoreDuringBuilds: true`가 켜져 있다.**
   저장소에 기존 타입 에러가 여러 개 있어서 빌드가 그냥 통과한다. 내가 만든 에러인지 원래 있던 에러인지
   `git diff`로 확인할 것.
3. **`tsconfig`의 `strictNullChecks`가 꺼져 있다.** 그래서 `{ok:true}|{ok:false}` 같은 판별 유니온이
   **좁혀지지 않는다.** 헬퍼는 유니온 대신 `NextResponse | null` 같은 형태로 만들 것 (`lib/apiAuth.ts` 참고).
4. **Supabase는 한 번에 1000행만 준다.** 전체를 읽어야 하면 `.range()`로 페이지를 돌리거나
   `fetchAllRows`(`lib/utils.ts`)를 쓸 것.
5. **학교 이름은 반드시 `normalizeSchool()`(`lib/school.ts`)을 거쳐 저장한다.**
   시험대비는 `students.school = exam_schedule.school_name` 문자열 비교로 대상을 찾는다.
   「신원중학교」로 저장된 학생은 「신원중」 시험일정에 **영원히 안 걸린다** — 에러도 안 난다.
   초등학교→초·중학교→중·고등학교→고로 모은다. OPS(`src/lib/school.ts`)에 같은 사본이 있으니
   한쪽만 고치지 말 것.
6. **문제 이미지 자르기(crop)는 교재마다 다르다.** 쎈/쎈B는 위 37px을 잘라야 하지만
   **베이직쎈은 자르면 문제 지문이 날아간다.** `docs/문제은행.md` 참고.

## 로그인·권한 구조 (가장 헷갈리는 부분)

| 역할 | 인증 방식 | Supabase 역할 |
|---|---|---|
| 선생님·직원·원장 | Supabase Auth (이메일+비밀번호) | `authenticated` + `public.users.role` = admin/teacher/staff |
| 학생·학부모 | **익명 로그인** 후 `student_login` RPC로 신원 확인 | `authenticated` (익명) |

**→ 여기서 사고가 난다: 학생도 `authenticated`다.**
RLS 정책을 `for select to authenticated using (true)`로 쓰면 **학생·학부모까지 다 읽힌다.**
직원 전용 테이블은 반드시 `using (public.is_staff())`를 쓸 것.

- `is_staff()` = users.role in (admin, teacher, staff)
- `is_admin()` = users.role = admin
- 학생 본인 것만 보게 하는 정책: `student_id in (select id from students where session_uid = auth.uid())`
- `student_login`은 SECURITY DEFINER RPC. 이름 + 보호자 전화 뒷4자리로 검증하고 `students.session_uid`에
  익명 uid를 기록한다. **15분에 5회 실패하면 잠긴다** (`student_login_attempts`).

## 서버 API 규칙

`app/api/*`는 `SUPABASE_SERVICE_ROLE_KEY`(현재는 `sb_secret_...`)로 RLS를 우회한다.
**따라서 인증 검사를 빼먹으면 그 API는 인터넷 전체에 열린다.**

```ts
import { denyIfNotStaff } from '@/lib/apiAuth'

export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req)   // 원장 전용이면 { adminOnly: true }
  if (deny) return deny
  ...
}
```

브라우저 쪽에서는 `fetch` 대신 `apiFetch`(`lib/apiFetch.ts`)를 쓴다. 로그인 토큰을 자동으로 붙여준다.

**예외 — 일부러 인증 없이 열어둔 것:**
- `app/api/grade/[code]` : 학생이 QR을 찍고 스스로 채점하는 경로. 시험지 코드(6자리)를 알아야만 접근된다.
- `app/api/push/*` : 푸시 구독

## 주요 화면

```
app/
  auth/login            로그인 (3역할 공용)
  teacher/              선생님 화면 — layout.tsx가 사이드바를 붙인다
    dashboard students learning-notes assignments exams curriculum
    reports work-status exam-prep announcements settings
    exam-analysis/      시험지 분석 (학교별 수합·정답·총평·이너프원 매칭) + 기출문제 → 문제은행 반영
    worksheets/         학습지 출제 첫 화면 (교재연계/문제은행/목적별)  ※원장 전용
      books/            시중교재 고르기
      textbooks/        교과서 (아직 문항 없음)
    problem-bank/       문제은행 4단 화면 (과정→단원트리→유형→출제조건)  ※원장 전용
    gradings/           채점결과 + 오답/쌍둥이/유사 재출제  ※원장 전용
      print/            A4 2단 인쇄 시험지 (QR 포함)
  student/  parent/     학생·학부모 화면 (하단 탭)
  grade/[code]          QR 채점 화면 (로그인 불필요)
  camp/                 방학특강 현황판 (공개, PIN은 클라이언트에 노출됨 — 주의)
```

사이드바 메뉴는 `components/teacher/Sidebar.tsx`의 `buildNavGroups`에서 묶음(수업/학생/과제·평가/보고/원장 전용)별로
조립한다. 원장 전용 메뉴는 '원장 전용' 묶음에 넣는다. 아이콘은 Tabler 외곽선 아이콘(`ti-*`)만 쓴다.

**선생님용 사용 매뉴얼**은 `app/teacher/manual/page.tsx`에 있다 (사이드바 「사용 매뉴얼」). 메뉴를 추가하거나
화면 버튼 이름·규칙을 바꾸면 매뉴얼 문구도 같이 고칠 것 — 선생님들이 이걸 보고 일한다.

## 더 읽을 것

- `docs/문제은행.md` — 교재 구조, 유형 코드, 쌍둥이 문제, 이미지 경로, 새 교재 넣는 법
- `docs/시험지분석.md` — 학교 시험지 수합·총평·이너프원 매칭, 타이핑한 기출을 그림으로 구워 문제은행에 넣는 법
- `docs/채점플로우.md` — 출제 → 인쇄 → QR → 채점 → 재출제
- `docs/카톡브리핑.md` — 학부모 카톡 수업 브리핑(매일 오전 11시 자동), 알림톡 템플릿 원문, 1000자 한도
- `docs/초등레벨학습지.md` — 70점 미만 재도전 규칙, 단원 통과 판정, 처리 기록
- `docs/보안.md` — RLS 모델, 인증 규칙, 키 교체 절차
- `docs/OPS연동.md` — 수학OPS와 어떻게 붙어 있는지
- `docs/배포와백업.md` — 환경변수, 배포, 백업, 장애 대처
- `docs/운영매뉴얼.md` — 원장님이 직접 보실 안내 (개발 지식 없이 읽는 문서)
<!-- END:studycheck-handover -->

## 교재 PDF 한 권을 넣는다는 것 (2026-10-22 추가)

문제은행의 목적은 유형 분류가 아니라 **문항별 쌍둥이·유사문제를 시중교재 사이에서 찾아 주는 것**이다.
그래서 PDF 한 권은 **네 단계가 끝나야 끝난 것**이다.

1. 자르기 (문제·정답 그림)
2. 유형 분류 (`standard_types` 안에서만)
3. **기존 교재 문항과 쌍둥이·유사 대조** ← 자주 빠뜨린다
4. 업로드 → QR 채점 확인 → 교재 목록 보고

3번은 기계가 못 한다. 선택지가 우연히 같은 것까지 걸리므로 **그림을 눈으로 읽어야** 한다.
`scripts/twins/` 참고 (한 유형을 한 장에 모아 읽고, 쌍둥이는 `problems.twin_group` 에 같은 번호를 넣는다).
같은 문제가 교재 서너 권에 실리므로 짝이 아니라 **묶음**이다.

## 스킬 — 반복 작업 설명서 (2026-10-27 추가)

반복되는 작업은 `.claude/skills/<이름>/SKILL.md` 에 순서·규칙을 적어 둔다. 이 저장소를 여는 세션은 모두 자동으로 읽는다.

| 스킬 | 언제 |
|---|---|
| `twin-matching` | 쌍둥이·유사문제 대조 (교재 넣기 3단계) |
| `crop-fix` | 잘못 잘린 문제·정답 그림 찾기·고치기 (새 교재 자른 직후 점검 포함) |
| `answer-text` | 정답 그림 → 글자 정답 (QR 자동 채점용) |
| `concept-video` | 개념·증명 강의 영상: 대본 → 영상 → 썸네일 → 유튜브 → 앱 연결 |
| `school-profile` | 학교알리미 → 학교 자료집 |
| `safe-change` | 화면·메뉴·API·DB를 고칠 때 마무리 전 안전 점검표 |
| `visual-aids` | 수업 시각화(입체·공간 단원 3D 자료) 만들기·고치기 — 선생님 요청은 「요청 기록」에 적고 반영 |

**규칙: 작업하다 새 규칙·함정·요령이 생기면 그 자리에서 해당 스킬에 적는다.**
- 원장님이 "이건 이렇게 해", "다음부터는 ~" 라고 하신 것, 실수해서 고친 것, 새로 알게 된 교재별 특이사항이 모두 해당한다.
- 스킬 본문의 알맞은 자리에 반영하고, 맨 아래 「규칙 추가 기록」에 `- YYYY-MM-DD 한 줄 요약` 을 붙인다.
- 그 작업의 커밋에 같이 넣는다 (따로 미루지 않는다). 작업을 마치고 원장님께 보고할 때 "○○ 스킬에 이 규칙 추가함"을 한 줄로 알린다.
- 어느 스킬에도 안 맞는 반복 작업이 세 번째 나오면 새 스킬을 만들고 위 표에 추가한다.
- 계정에 있는 스킬(문제은행 교재 업로드·오토스텝·시험지 분석)은 이 저장소에서 고칠 수 없다. 그쪽 규칙이 생기면 관련 `docs/*.md` 에 적고 원장님께 계정 스킬 갱신이 필요하다고 알린다.

## PR (원장님 2026-10-27)
작업을 올리면 **묻지 말고 PR까지 Claude가 만든다.** 원장님은 GitHub에서 「Merge pull request」만 누른다.
병합(=운영 배포)은 원장님이 따로 허락하신 경우에만 Claude가 한다.

<!-- BEGIN:question-app-rules -->
# 질문 웹앱 작업 규칙 (원장님 지시 · 2026-09-22)

질문 웹앱(`docs/질문웹앱.md`) 관련 작업은 아래를 **매번** 지킨다.

1. **작업 전 `docs/QUESTION_APP_STANDARD.md`를 반드시 읽는다.** 기억에 의존하지 말고 그때그때 다시 읽는다.
2. **학습 흐름과 정답 차단 정책을 임의로 바꾸지 않는다.** 표준 문서에 적힌 대로만 구현한다.
   바꿔야 할 이유가 보이면 코드를 고치지 말고 **먼저 원장님께 말씀드린다.**
3. **DB 또는 기능을 바꾸면 `DECISION_LOG.md`에 기록한다.** 무엇을·왜·되돌리는 법까지.
4. **작업이 끝나면 `REPORT.md`에 쓴다.** 바꾼 파일 / 테스트 결과 / 남은 문제.

**추가 (2026-09-23):** 원장님은 이 대화 내용을 GPT에게 옮겨 설계를 상의하신다.
그래서 작은 결정이 하나 생길 때마다 **`GPT_BRIEF.md`를 갱신한다** — 확정된 결정에 `D번호`로 한 줄 추가하고,
「이번에 묻는 것」을 지금 물어야 할 내용으로 갈아끼운다. 이 파일은 **통째로 복사해 GPT에 붙여넣는 용도**이므로
설명 없이 그대로 읽히게 쓴다.


## 일의 순서 (원장님 지시 · 2026-09-23)  ★ 가장 중요

**기획과 실행 명령은 GPT Work가 내린다. Claude Code는 그 지시를 받아 움직인다.**

앞서 Claude가 먼저 SQL을 만들어 실행까지 갔다가, 뒤이어 온 GPT 지시와 어긋나
같은 테이블을 두 번 만든 일이 있었다. 순서가 엇갈리면 되돌리는 일이 생긴다.

| 하는 일 | 누가 |
|---|---|
| 기획·설계·정책·문항 생성 규칙 | **GPT Work** |
| **실행 명령** (무엇을 언제 실행할지) | **GPT Work** |
| 코드·SQL·문서 **작성** | Claude Code |
| **기술 검증과 충돌 보고** | Claude Code |
| 실제 DB 실행·승인 | 원장님 |

**Claude가 GPT 지시 없이 하지 않는 것**

- 운영 DB 실행 (SQL은 만들어 두고 **실행은 원장님이**, 그 전에 GPT 승인)
- 유료 API 실제 호출
- 배포
- 의존성 추가 (`package.json` 변경)
- 기존 코드·데이터를 바꾸는 작업

**반대로, Claude가 계속 해야 하는 것**

만들고 검증하고 **어긋난 것을 보고하는 일은 멈추지 않는다.** GPT는 저장소와 운영 DB를
볼 수 없으므로, 실제와 맞지 않는 지시가 오면 **실행하기 전에 그 사실을 알린다.**
지금까지 이 방식으로 `problems.id`가 bigint인 점, 제작 대상 179개 유형이 전부 고등인 점,
프롬프트의 학년이 맞지 않는 점을 잡았다. 이건 계속한다.

<!-- END:question-app-rules -->
<!-- END:question-app-rules -->
