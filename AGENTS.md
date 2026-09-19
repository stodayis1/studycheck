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
5. **문제 이미지 자르기(crop)는 교재마다 다르다.** 쎈/쎈B는 위 37px을 잘라야 하지만
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

사이드바 메뉴는 `components/teacher/Sidebar.tsx`에서 조립한다. 원장 전용 메뉴는 `isAdmin()`으로 감싼다.

## 더 읽을 것

- `docs/문제은행.md` — 교재 구조, 유형 코드, 쌍둥이 문제, 이미지 경로, 새 교재 넣는 법
- `docs/채점플로우.md` — 출제 → 인쇄 → QR → 채점 → 재출제
- `docs/초등레벨학습지.md` — 70점 미만 재도전 규칙, 단원 통과 판정, 처리 기록
- `docs/보안.md` — RLS 모델, 인증 규칙, 키 교체 절차
- `docs/OPS연동.md` — 수학OPS와 어떻게 붙어 있는지
- `docs/배포와백업.md` — 환경변수, 배포, 백업, 장애 대처
- `docs/운영매뉴얼.md` — 원장님이 직접 보실 안내 (개발 지식 없이 읽는 문서)
<!-- END:studycheck-handover -->
