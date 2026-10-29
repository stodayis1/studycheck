---
name: safe-change
description: StudyCheck 앱 코드를 바꾸는 작업을 끝내기 전에 반드시 거치는 안전 점검표. 새 화면(page)·사이드바 메뉴·API route·Supabase 테이블/RLS 정책/마이그레이션을 만들거나, 버튼 이름·화면 규칙을 바꿀 때 쓴다. Use before finishing ANY change to app code — new screen, menu, API route, Supabase table/RLS/migration, or renamed buttons/rules. 트리거 예: "화면 추가", "페이지 만들어줘", "메뉴 만들어줘", "기능 추가", "API 만들어", "라우트 추가", "테이블 추가", "칸 추가", "정책 바꿔", "권한", "고쳐줘", "버튼 이름 바꿔".
---

# 새 화면·메뉴·API·DB 변경 시 안전 점검표

운영 중인 실서비스(학생 ~220명)다. **데이터가 사라지는 변경은 절대 금지.**
아래는 지금까지 실제로 구멍이 났던 자리들이다. 해당하는 묶음만 골라 하나씩 확인하고 끝낸다.
근거 문서: `AGENTS.md`, `docs/보안.md`, `docs/배포와백업.md`, `docs/OPS연동.md`.

## 1. 화면(page)

- [ ] **선생님 화면은 `app/teacher/` 아래에 둔다.** `app/teacher/layout.tsx` → `components/teacher/AccessGate.tsx`가
      선생님이 아니면(익명 세션인 학생·학부모 포함) 화면 대신 「선생님 전용 화면이에요」 안내만 보여 준다.
      `middleware.ts`/`proxy.ts`는 **없다** — 서버 쪽 경로 차단은 없고 이 클라이언트 관문이 전부다.
      `app/teacher` 밖에 직원용 화면을 만들면 이 관문을 못 받는다.
- [ ] 이 관문은 **화면을 가릴 뿐 데이터를 막지 않는다.** 데이터는 RLS(브라우저 직접 조회) 또는
      API의 `denyIfNotStaff`(서버)가 막아야 한다. 둘 중 하나는 반드시 있어야 한다.
- [ ] **원장 전용 화면**은 화면 안에서 한 번 더 막는다.
      ```tsx
      if (!isAdmin()) return <Shell><div className="p-10 text-center text-gray-500">관리자만 접근할 수 있습니다.</div></Shell>
      ```
      (예: `app/teacher/worksheets/books/page.tsx`)
- [ ] **「다른 강사에게만 숨기기」는 `isAdmin()`이 아니라 `currentUser?.role === 'admin'`으로 본다.**
      `isAdmin()`은 「관리자모드」 토글(`hooks/useAuth.ts`의 adminMode)까지 봐서, 원장님이 강사모드로
      살피는 동안 원장님께도 사라진다(아래 「자주 하는 실수」 참고).
- [ ] 저장이 upsert라면 **빈 칸으로 열어서 덮어쓰지 않는지** 확인한다. 기존 기록이 있으면 그걸 열고,
      저장 직전에 DB를 한 번 더 봐서 「새로 쓰는 중인데 이미 기록이 있으면」 멈춘다.

## 2. Next.js 16 함정

- [ ] Next.js 16이다. 막히면 `node_modules/next/dist/docs/`를 먼저 읽는다(설치돼 있을 때).
- [ ] `params`는 **Promise**다.
      ```ts
      // 서버(route handler, server page)
      export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
        const { code } = await params
      // 클라이언트 page
      const { code } = use(params)   // import { use } from 'react'
      ```
- [ ] `useSearchParams()`는 **Suspense 경계**가 필요하다. 간단한 화면이면 state로 처리하는 편이 낫다.
      꼭 쓰면 `<Suspense>`로 감싼다(예: `app/teacher/gradings/answers/page.tsx`).
- [ ] production 빌드는 `console.*`를 지운다(`next.config.ts` `removeConsole`, `error`만 남김).
      운영에서 추적할 로그는 `console.error`로 남긴다.

## 3. 사이드바 메뉴 · 사용 매뉴얼

- [ ] 메뉴는 `components/teacher/Sidebar.tsx`의 `ITEM`에 `{ href, label, icon }`을 추가하고
      `buildNavGroups(admin, showBulk)` 안의 알맞은 묶음(수업 / 학생 / 과제 · 평가 / 보고 / 원장 전용 /
      가끔 쓰는 것)에 넣는다. 원장 전용 화면은 **`if (admin)` 안의 '원장 전용' 묶음**에만 넣는다.
- [ ] 아이콘은 Tabler 외곽선 아이콘 `ti-*`만 쓴다.
- [ ] 이름이 기존 메뉴와 헷갈리지 않는지 본다(「학습지관리」/「학습지」 → 「학습지 배부」/「학습지 출제」로 바꾼 전례).
      메뉴 이름과 화면 제목을 맞춘다(「시험배정」인데 화면 제목은 「시험대비 관리」였던 전례).
- [ ] **`app/teacher/manual/page.tsx`의 `GROUPS`도 같이 고친다.** 묶음은 사이드바와 같게 유지하고,
      항목은 `{ href, label, icon, summary, steps, notes?, adminOnly? }`. 메뉴 추가·버튼 이름 변경·규칙 변경 모두
      해당한다 — 선생님들이 이걸 보고 일한다. (한 번은 매뉴얼 고치기가 커밋에서 빠져 따로 채웠다: 6e83a86)

## 4. API route (`app/api/*`)

서버 API는 `SUPABASE_SERVICE_ROLE_KEY`(`sb_secret_...`)로 **RLS를 통째로 우회한다.**
인증 검사를 빼먹으면 그 순간 인터넷 전체에 열린다.

- [ ] 핸들러 **첫 줄**에 가드:
      ```ts
      import { denyIfNotStaff } from '@/lib/apiAuth'
      export async function POST(req: Request) {
        const deny = await denyIfNotStaff(req)            // 원장 전용이면 denyIfNotStaff(req, { adminOnly: true })
        if (deny) return deny
      ```
      「누가 했는지」가 필요하면 `staffOrDeny(req)` → `who.deny`, `who.id/name/role/supervisorGrades`
      (신원을 두 번 묻지 않는다). 둘 다 `is_locked`(퇴사) 계정도 막는다.
- [ ] 화면에서 원장 전용이면 **API도 `adminOnly: true`**. 강사가 주소로 직접 불러도 막혀야 한다.
- [ ] 브라우저에서 부를 때는 `fetch` 대신 **`apiFetch`**(`lib/apiFetch.ts`). 토큰을 붙여 준다.
      빼먹으면 화면에서 401이 난다(2026-09-22에 호출부 11곳을 바꿨다).
- [ ] 학생·학부모가 부르는 API는 `denyIfNotStaff`를 못 쓴다. 토큰으로 본인을 확인하고
      **body의 `studentId`/`userId`를 믿지 말고** 토큰 주인으로 덮어쓴다
      (`app/api/push/subscribe`, `app/api/proof-submit` 방식: `auth.getUser(token)` → `students.session_uid`/`parent_session_uid`).
- [ ] cron은 `CRON_SECRET` Bearer 검사(`lib/cronBriefing.ts` `runBriefingCron` 참고). 쿼리스트링 붙은 cron 경로는 피한다
      (2026-10-13 발송 누락 때 의심 원인이라 쿼리 없는 경로로 나눴다).
- [ ] 일부러 열어둔 것은 `api/grade/[code]`, `api/grade/[code]/photo`(QR 자가채점), `api/push/unsubscribe`뿐이다.
      **새로 여는 것은 원장님 확인 없이 하지 않는다.**
- [ ] 다 만든 뒤 가드 빠진 라우트를 훑는다(CI 검사가 아직 없다 — `docs/보안.md` 12번):
      ```bash
      for f in $(find app/api -name route.ts); do grep -qE 'denyIfNotStaff|staffOrDeny' $f || echo $f; done
      ```
      나온 목록에서 cron·create/delete-account·proof-submit·health·push·grade 말고 새 것이 있으면 이유를 확인한다.

## 5. DB · RLS · 마이그레이션

- [ ] **학생·학부모도 `authenticated`다(익명 로그인).** `to authenticated using (true)`는 그들에게도 열린다.
- [ ] 직원 전용 정책은 **괄호로 감싼** 모양으로만:
      ```sql
      alter table public.새표 enable row level security;
      create policy 새표_staff_read on public.새표 for select to authenticated
        using ((select public.is_staff()));
      create policy 새표_admin_write on public.새표 for all to authenticated
        using ((select public.is_admin())) with check ((select public.is_admin()));
      ```
      맨몸 `is_staff()`는 행마다 호출돼 앱 전체가 느려진다(2026-10-04 정책 60개 → 470ms가 4ms로).
      만든 뒤 아래가 **0**인지 확인:
      ```sql
      select count(*) from pg_policies where schemaname='public'
        and (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
      ```
- [ ] 학생 본인 것 정책은 **학생 칸과 학부모 칸 둘 다** 본다(2026-09-22 학부모 세션 분리 이후):
      ```sql
      using ((select public.is_staff()) or student_id in (select id from public.students
        where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
      ```
      `session_uid`만 쓰면 학부모 화면이 조용히 빈다.
- [ ] 서버만 쓰는 표는 **정책을 아예 안 만든다**(= 앱에서 접근 불가, service_role만). 예: `push_subscriptions`, `exam_papers`.
- [ ] **조이기 전에 누가 읽는지 전수조사**: `grep -rn "from('테이블명')" app components lib`.
      브라우저가 직접 읽고 있으면 조이는 순간 그 화면이 조용히 빈다(`ssenb_problem_map`은 학생 대시보드가 직접 읽는다).
- [ ] **지우는 변경 금지.** `drop table`/`drop column`/조건 없는 `delete`/`truncate` 쓰지 않는다. 칸 추가·정책 확대처럼
      **추가만** 하는 방향으로, 동작이 안 바뀌는 단계부터 순서대로 배포한다(학부모세션분리 1→앱 배포→2 순서 참고).
- [ ] SQL은 `docs/sql/<한글이름>.sql` + **`docs/sql/<한글이름>_되돌리기.sql`** 짝으로 남긴다. 파일 끝에 확인 쿼리
      (`select tablename, policyname, cmd from pg_policies where tablename='…'`)를 둔다.
- [ ] **Supabase는 한 번에 1000행만 준다.** 전체가 필요하면:
      ```ts
      import { fetchAllRows } from '@/lib/utils'
      const rows = await fetchAllRows(() => supabase.from('exams').select('*').order('exam_date', { ascending: false }).order('id'))
      ```
      (빌더를 **함수로** 넘긴다 — 내부에서 `.range()`를 붙여 돈다. 페이지가 밀리지 않게 `.order('id')`처럼
      유일한 정렬을 끝에 붙인다 — `app/teacher/exams/page.tsx` 방식.) 지금 1000행 아래인 표도 곧 넘는다.
- [ ] `tsconfig`의 `strictNullChecks`가 꺼져 있어 `{ok:true}|{ok:false}` 유니온이 좁혀지지 않는다.
      헬퍼는 `NextResponse | null` 같은 형태로 만든다(`lib/apiAuth.ts`).

## 6. 학교 이름 · OPS 연동

- [ ] 학교 이름을 **저장하는 모든 자리**(신규 등록·수정·엑셀 업로드·시험일정·스크립트)는
      `normalizeSchool()`(`lib/school.ts`)을 거친다. 「신원중학교」로 저장되면 「신원중」 시험일정에 영원히 안 걸린다 — 에러도 없다.
- [ ] 업로드 스크립트는 이름이 「…학교」로 끝나면 **멈추게** 한다(`scripts/upload-school-profile.mjs` 방식).
- [ ] `lib/school.ts`를 고치면 OPS(`sumath-admin`)의 `src/lib/school.ts`도 같이 고친다. 한쪽만 고치지 않는다.
- [ ] 학생 정보(학교·학년·휴원)는 양쪽에서 고칠 수 있다. 한쪽만 바꾸면 조용히 어긋난다(`docs/OPS연동.md`).
      `is_active=false`는 퇴원일 수도 휴원일 수도 있다 — **`on_leave`를 같이 본다.**

## 7. 타입 에러 확인 (빌드는 에러가 있어도 통과한다)

`next.config.ts`에 `typescript.ignoreBuildErrors: true`, `eslint.ignoreDuringBuilds: true`. 기존 에러가 여러 개 있다.
**내가 만든 에러만** 골라 본다.

```bash
npm install                     # node_modules 가 없으면
npx tsc --noEmit 2>&1 | grep -F -f <(git diff --name-only HEAD; git ls-files --others --exclude-standard)
```
걸린 줄이 원래 있던 것인지 애매하면 바뀌기 전 결과와 견준다(작업물을 잃지 않게 stash 대신 사본으로):
```bash
git worktree add /tmp/sc-base HEAD && (cd /tmp/sc-base && npm ci && npx tsc --noEmit > /tmp/before.txt 2>&1)
npx tsc --noEmit > /tmp/after.txt 2>&1; diff <(sed 's/([0-9,]*)//' /tmp/before.txt | sort) <(sed 's/([0-9,]*)//' /tmp/after.txt | sort)
git worktree remove /tmp/sc-base
```

## 8. 배포 전후 확인

- [ ] `main`에 push하면 Vercel이 자동 배포한다. **DB 변경이 앱보다 먼저인지 나중인지** 순서를 정해 두고 지킨다.
- [ ] 환경변수만 바꿨으면 push가 없으니 Vercel **Redeploy**. 새 변수는 Production and Preview 둘 다 체크.
- [ ] `vercel.json`의 `"regions": ["icn1"]`은 건드리지 않는다(DB가 서울).
- [ ] 배포 뒤 바뀐 화면을 **역할별로** 눈으로 연다: 원장 / 강사 / 학생 / 학부모. 최소한 학생 로그인 · 선생님 학생관리 ·
      바꾼 화면. 막아야 할 것이 실제로 막히는지도 본다(81cb573은 익명 세션으로 막히는 것과,
      일부러 망가뜨린 사본에서 열리는 것을 둘 다 확인했다).
- [ ] 화면이 비면 → Vercel **Instant Rollback**. 특정 화면만 데이터가 사라지면 → 최근 RLS 변경 의심, `pg_policies` 확인.

## 9. 「느려요 · 버벅대요」 소리가 나올 때

원장님이 「현저히 느려지고, 버벅댄다」고 하시면 **코드를 읽기 전에 숫자부터 잰다.** 느린 자리는
거의 늘 둘 중 하나다 — ① DB 가 같은 걸 또 읽는다 ② 글자 하나 칠 때마다 화면을 다 다시 그린다.

- [ ] **DB 쪽** — `pg_stat_statements` 를 먼저 본다(`total_exec_time desc`). 어느 화면이 범인인지 바로 보인다.
      ```sql
      select total_exec_time::numeric(12,0) tot_ms, calls, mean_exec_time::numeric(10,1) mean_ms,
             left(regexp_replace(query,'\s+',' ','g'),120) q
      from pg_stat_statements order by total_exec_time desc limit 20;
      ```
      `fetchAllRows` 로 표를 통째로 읽는 화면은 **페이지마다 표 전체를 다시 훑는다**(`LIMIT 1000 OFFSET 7000`
      도 seq scan 이다). 8페이지면 표를 여덟 번 훑는 셈이다 — 그래서 학습일지의 `class_sessions`·
      `learning_notes` 통째 읽기가 이 앱 DB 시간 1·2위였다(166일 동안 9,474초 + 6,670초).
- [ ] **그리는 쪽 — 한 번 그리는 데 몇 ms 인지 잰다.** 눈으로 보고 「빠른 것 같다」 하지 말고 재서 적는다.
      운영 데이터를 받아 와 「예전 방식 / 고친 방식」을 같은 자리에서 돌려 견준다.
- [ ] **컴포넌트를 다른 컴포넌트 안에 정의해 `<Foo />` 로 쓰지 않는다.**
      ```tsx
      function 큰화면() {
        function Card({ ... }) { ... }          // ← 그릴 때마다 새로 만들어진다
        return <>{list.map((x) => <Card key={x.id} ... />)}</>   // ✗ 리액트가 「다른 종류」로 보고
      }                                                          //   카드 전부를 지우고 새로 만든다
      ```
      부모 state 를 많이 쓰는 카드는 바깥으로 빼기도 어렵다 — 그럴 때는 **그냥 함수로 불러 쓴다**:
      `{list.map((x) => <Fragment key={x.id}>{Card({ ... })}</Fragment>)}`
      (학습일지 카드 119장이 글자 하나마다 전부 지워지고 새로 그려지고 있었다 — 2026-10-28)
- [ ] **수천 행 배열을 `.find()`·`.filter()`·`.sort()` 로 찾지 않는다.** `useMemo` 로 한 번 `Map` 을 만든다.
      색인 만드는 규칙은 `lib/` 에 한 벌 두고(예: `lib/noteIndex.ts`), **예전 방식과 같은 답이 나오는지**
      운영 데이터로 대조하는 스크립트를 같이 남긴다(`scripts/check-note-index.mjs`).
      - `.find()` 는 **처음 만난 것**을 준다 → 색인도 먼저 들어온 것을 남긴다(`if (!m.has(k)) m.set(k, v)`).
      - `filter().sort(desc)[0]` 은 **같은 값이면 먼저 있던 것**이 이긴다(JS sort 는 순서를 지킨다)
        → 색인에서도 `>` 만 쓴다(`>=` 로 쓰면 답이 달라진다).
      - 실측: 학습일지 한 번 그릴 때 93.4ms → 0.49ms (색인 만드는 데 3.1ms, 자료가 바뀔 때만).
- [ ] 30초마다 도는 자동 새로고침이 있으면(학습일지 `refreshTodayStatus`) 그때도 화면을 다 다시 그린다.
      타이핑 중에 한 번씩 멈칫하는 느낌의 범인이다. 그리는 비용을 줄이면 같이 낫는다.

## 10. 같은 주소에 `?칸=값`만 바꿔 들어가게 만들 때

- [ ] **`<Link>` 로 같은 경로에 쿼리만 바꿔 가면 화면이 다시 켜지지 않는다**(soft navigation).
      `useEffect(..., [])` 가 다시 안 돌아서 「눌렀는데 아무 일도 안 일어난다」가 된다.
      → 통째로 다시 켜야 하면 `<a href="...?칸=1">`, 아니면 쿼리를 읽지 말고 **화면 안의 state(탭)** 로 가른다.
      (사이드바 「삭제요청 N」 뱃지 → 과정관리 화면에서 두 번 겪었다 — 2026-10-28)
- [ ] 배포 확인을 **묶음(chunk) 글자 찾기**로 할 때: **내 컴퓨터에서 빌드한 파일 이름을 운영에 그대로
      대입하지 않는다.** 버셀이 붙이는 이름이 달라서 404 가 나고, 「아직 배포가 안 됐다」로 잘못 읽는다.
      화면 주소를 열어 **그 화면이 실제로 불러오는 묶음 목록**을 받아 하나씩 뒤진다:
      ```bash
      curl -s https://studycheck-five.vercel.app/teacher/학습관리주소 -o /tmp/p.html
      for c in $(grep -oE '/_next/static/chunks/[A-Za-z0-9._-]+\.js' /tmp/p.html | sort -u); do
        echo "$c $(curl -s https://studycheck-five.vercel.app$c | grep -c '찾을글자')"; done
      ```
      `app/teacher/*` 화면도 로그인 없이 묶음을 내려준다(`AccessGate` 는 화면만 가린다) — 그래서 이 방법이 통한다.
- [ ] **새 화면**이면 더 쉽다. 배포 전에는 그 주소가 404, 배포 뒤에는 200 이다. 그걸로 확인한다.

## 11. 「눌렀더니 사라졌는데 다시 뜬다」 — 조용한 실패

화면에서 지우거나 고치는 단추는 **서버가 거절해도 화면만 바뀌면 거짓말을 한다.** 원장님은 지운 줄 알고
다음 일로 넘어가고, 새로고침하면 그대로 다시 떠 있다. 실측: 과정관리 교재 삭제 44건 중 15건이 409 로
막혔는데 화면에서는 전부 사라졌다 (2026-10-28).

- [ ] `supabase.from(...).delete()/update()/insert()` 는 **`const { error } =` 로 받아서 확인한다.**
      `await` 만 하고 넘어가면 실패가 어디에도 안 남는다. 실패했으면 `setState` 를 **하지 않고** 사유를 말한다.
- [ ] 실패 사유를 사람 말로 바꿔 준다. `error.code` 로 가른다 — `23505` 중복, `23503` 다른 기록이 붙어 있음,
      `42501` 권한(RLS).
- [ ] 막혔을 때 **대신 할 일**을 같은 자리에 둔다 (교재 삭제가 막히면 「완료로 두기」).
- [ ] **한 번 누르면 끝나는 단추에는 되돌리는 길을 같은 자리에 둔다.** 강사는 하루에 수십 번 누르고,
      다른 학생 것과 헷갈린다. 「완료」에 되돌리기가 없어서 원장님이 DB 로 고쳐 달라고 하셨다 (2026-10-28, 강윤우 초능력연산).
      되돌릴 수 없는 부분이 있으면(완료 때 올라간 회독) **확인창에 미리 적는다.**
- [ ] 「지워지나」는 눈으로 보지 말고 **운영 로그로 센다.** 성공은 204, 막힌 건 409 다:
      ```sql
      -- query_logs (edge_logs)
      select splitByChar(' ', event_message)[1] as method, splitByChar(' ', event_message)[3] as status, count(*)
      from logs where source='edge_logs' and event_message like 'DELETE%student_textbooks%'
      group by method, status
      -- 왜 막혔는지는 같은 초의 postgres_logs 에 제약 이름까지 찍힌다
      ```

### 교재를 지우면 진도는 왜 안 지워지나 (이 저장소 고유)

`progress_checks.student_textbook_id` 는 **SET NULL** 이다. 교재를 지워도 진도 행은 남고 교재 연결만 끊어진다.
그런데 `progress_checks_uniq_null_tb` (student_id, concept_id) WHERE student_textbook_id IS NULL 때문에,
그 학생·개념에 「교재 없는 진도」가 이미 있으면 **연결을 끊는 순간 중복이 되어 삭제가 막힌다.**
「교재 없는 진도」는 교재를 완료 처리할 때 `markSemesterMastered` 가 학기 전체를 한 번에 반영하면서 생긴다.
→ 즉 **완료 처리를 거친 교재는 사실상 지워지지 않는다** (2026-10-28 기준 364권). 이건 사고가 아니라 안전장치다.
지우는 길을 뚫지 말고, 「완료로 두기」로 보내라.

## 12. 「이건 강사에게 안 보여야 한다」 — 화면에서 가리는 것은 가린 게 아니다

원장님이 「○○는 강사에게 보이면 안 된다」고 하시면, **가려야 할 문이 세 개**다. 하나만 닫으면
눈에는 안 보이지만 데이터는 그대로 내려간다.

| 문 | 어떻게 닫나 | 안 닫으면 |
|---|---|---|
| ① 화면 | `canViewStudent()` 로 거르기, 메뉴를 `isAdmin()` 묶음에 넣기 | 눈에 보인다 |
| ② DB 정책(RLS) | `students` 조회·수정 정책 | 브라우저 개발자도구에 전원이 들어 있다 |
| ③ 서버 API | `app/api/*` 는 **service_role 이라 RLS 를 비껴간다** | API 한 번으로 전원이 내려온다 |

### ③ 이 제일 많이 빠진다
`app/api/*` 는 service_role 키로 돌기 때문에 **RLS 를 아무리 조여도 그대로 전체를 읽는다.**
학생 명단·기록을 내려주는 API 는 `staffOrDeny(req)` 로 요청한 사람을 받고
`staffCanSeeStudent(who, student)`(`lib/teachers.ts`) 로 **한 번 더** 걸러야 한다.

```ts
const who = await staffOrDeny(req)
if (who.deny) return who.deny
const students = (all ?? []).filter((s) => staffCanSeeStudent(who, s))
```

- 브라우저가 보낸 `studentIds` 를 그대로 믿지 않는다. 받은 id 도 같은 함수로 거른다.
- 2026-10-29 에 `attendance-overview`·`weekly`·`ops-makeups` 세 곳이 이 상태였다.
  화면은 담당 학생만 보여 주는데 API 응답에는 재원생 196명 전원의 이름·수업시간이 들어 있었다.
- 규칙은 **한 곳**에 둔다. `staffCanSeeStudent` 는 `students` 조회 정책과 같은 규칙이다 —
  한쪽만 고치면 화면이 조용히 비거나 조용히 샌다.

### 반대 방향도 본다 — 조여서 조용히 비는 곳
정책을 조이면 **브라우저에서 명단을 만들던 코드**가 소리 없이 짧아진다.
- 2026-10-29: 시험일정을 올리면 그 학교·학년 학부모에게 알림을 보내는데, 대상 명단을
  브라우저에서 만들고 있었다. 주임 선생님이 담당 학년 밖 학교 일정을 올리면 **알림이 조용히
  안 간다.** → 대상을 서버에서 찾게 옮겼다(`PushTarget.schoolGrades`).
- 조이기 전에 `from('students')` 를 전부 세어, 그 목록이 **누구에게 쓰이는지**를 하나씩 본다.

### 원장 전용 화면을 선생님에게 열 때 (2026-10-29 반배정 시간표)
막는 것과 **같은 자리**를 본다. 범위를 좁히는 것은 `canViewStudent()` 한 줄로 끝나지만,
그 화면이 **딸려 받는 표**가 남는다.
- 반배정 시간표는 `schedules` 를 전부 받고 있었다(정책상 직원에게는 다 열려 있다).
  행 수 632 와 student_id 가지 수만 세도 **학원 전체 인원**이 나온다.
  → 학생을 먼저 받고 **그 학생들 것만** `in('student_id', 100개씩)` 으로 받게 바꿨다.
    주한 선생님은 632줄이 아니라 41줄만 받는다.
- 인원·범례·요일 인원처럼 **세는 값이 전부 거른 뒤 목록에서 나오는지** 하나씩 짚는다.
- 메뉴 이름도 본다. 「반배정 시간표」는 전체가 보이는 줄로 읽힌다 — 선생님 쪽은 「내 시간표」.

### 「전체 인원」은 숫자로도 샌다
이름을 안 보여도 **학교별 인원을 다 더하면 전체 재원생 수**가 된다(학교 자료집, 2026-10-27).
인원수 대신 「있나 없나」만 내보낸다.

### 다른 앱(수학OPS)도 같이 본다
두 앱은 DB 가 다르고 정책도 따로다. 한쪽만 조이면 반만 지켜진다.
- OPS `/api/db` 는 table 이름을 받아 service_role 로 select·insert·update·delete·rpc 를
  돌려 주던 **범용 창구**였고 `teacher` 까지 통과했다. students 는 물론 payroll·settlements
  까지 읽고 고칠 수 있었다(2026-10-29 에 원장·행정 전용으로 막음).
  → 이런 범용 API 를 보면 **역할 목록부터** 본다.
- 화면 역할 확인이 없는 페이지도 같이 찾는다. OPS `/attendance` 는 주소만 치면 열렸다.
  `getProfile()` 뒤에 `can.viewStudents(profile.role)` 같은 확인이 있는지 본다.

### 조인 것을 어떻게 확인하나 (눈으로 보지 말고 재기)
계정마다 **실제로 몇 행이 읽히는지** JWT 를 흉내 내어 센다. 적용 전 미리 계산한 값과 같아야 한다.

```sql
create or replace function public._probe(p uuid) returns bigint language plpgsql as $$
declare n bigint; begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.students;
  execute 'reset role'; return n;
end $$;
select u.name, public._probe(u.id) from users u;   -- 끝나면 drop function
```

- MCP 로 보는 역할은 **표 주인이라 RLS 를 통째로 비껴간다.** `set local role authenticated`
  없이 센 숫자는 아무 의미가 없다.
- 「남의 학생이 한 명이라도 보이나」를 `bool_or` 로 같이 세어, 거짓이어야 통과다.
- 수정(UPDATE) 정책도 같이 잰다. 남의 학생 0행·내 학생 1행이어야 한다.
- 학생·학부모 계정도 잰다. 각자 1행(형제면 2행)이어야 한다 — 같이 조이다 학생 앱을 막는 일이 흔하다.

### 선생님이 못 하게 막았으면, 대신 할 길을 같은 자리에 만든다
막기만 하면 그 일은 **말로 전해지고 잊힌다.** 교재 삭제요청·시간표 변경요청이 그래서 생겼다.
요청 표(`*_requests`)를 만들고, ① 올리면 원장님께 푸시 ② 사이드바 뱃지 ③ 원장님이 「반영」을
누를 때 실제로 바뀌고 ④ 결과를 올린 선생님께 알린다. 한 학생에 열린 요청은 한 건까지 둔다 —
두 건이 쌓이면 원장님은 무엇을 반영할지 알 수 없다.

## 자주 하는 실수 (실제 있었던 일)

- **학생이 주소창으로 선생님 화면에 들어왔다** (2026-10-27, 81cb573). `useAuth`가 `users`에 없는 익명 세션을
  `role: 'teacher'`로 메워서 `/teacher/dashboard`와 공지 본문이 그대로 보였다. → `useAuth`·`AccessGate`에서 막음.
- **인증 없는 API** (2026-09-22). `push/send`(전체 학부모에게 임의 푸시), `generate-feedback`·`parse-records`
  (학원 AI 키가 외부 프록시로), `sync-absence-to-ops`(OPS 비밀키 대리 첨부), `push/subscribe`(남의 studentId로 구독 →
  남의 알림 수신). `sync-student-to-ops`는 그 전(09-16)까지 누구나 OPS 학생 정보를 바꿀 수 있었다.
- **맨몸 `is_staff()` 정책 60개로 앱 전체가 느렸다** (2026-10-04). `(select public.is_staff())`로 감싸 해결.
- **학부모가 학생에게 밀려 화면이 비었다** (2026-09-22). 한 칸(`session_uid`)에 둘 다 덮어쓰던 것 → `parent_session_uid` 분리,
  정책 12개를 넓힘. 하나라도 빠뜨리면 그 화면만 조용히 빈다.
- **1000행에 잘려 지난 점수가 사라졌다** (2026-10-21, 55ba4c3). `exams` 1,355행을 `.select('*')` 한 번으로 읽어
  07-23 이전 355행이 빠졌다. 원장님은 「기능을 없앴냐」고 물으셨다 → `fetchAllRows`.
- **원장님께도 메뉴가 사라졌다** (2026-10-21, c24f180). 「다른 강사들한테 안 보이게」를 `isAdmin()`으로 감쌌더니
  강사모드에서 원장님께도 숨겨졌다 → `currentUser?.role === 'admin'`.
- **빈 칸으로 열려 어제 기록을 덮어썼다** (2026-10-22, de6102a). 수업일지 upsert 창이 오늘 것만 찾아서 빈 칸으로 열렸다.
- **학교 이름이 갈라져 시험대비에서 빠졌다** (2026-10-08 기준 12명). 「신원초등학교」 7명 등 → `normalizeSchool()`.
- **「지웠는데 또 뜬다」 — 삭제가 실패해도 화면에서만 사라졌다** (2026-10-28). 과정관리 교재 삭제가 409 로
  막혔는데 `await supabase...delete()` 결과를 안 봤다. 막힌 15건 중 10건이 진도 33~58회가 쌓인 완료 교재였다 —
  DB 가 막아 준 덕에 살았다. → 결과의 `error` 를 확인하고, 막히면 「완료로 두기」로 보낸다 (11번).
- **「완료」를 잘못 눌렀는데 화면에서 되돌릴 길이 없었다** (2026-10-28, 강윤우 초능력연산). 중단에는 「재개」가
  있는데 완료에는 없었다 → 완료 칸에 「되돌리기」 추가. 연산서라 진도표는 안 건드려져서 상태 한 칸만 되돌렸다.
- **화면만 가리고 DB·API 는 열려 있었다** (2026-10-29). 학생관리는 담당 학생만 보여 주는데
  `students` 조회 정책이 `is_staff()` 하나라서, 강사 브라우저에 재원생 196명 전원의 이름·학교·
  보호자 전화번호가 내려와 있었다. 수정 정책도 같아서 남의 학생을 고칠 수도 있었다 (12번).
- **RLS 를 조여도 API 는 그대로였다** (2026-10-29). `attendance-overview`·`weekly`·`ops-makeups`
  는 service_role 이라 정책을 비껴가 전원을 내려줬다 → `staffCanSeeStudent` 로 서버에서 거르기 (12번).
- **OPS 의 범용 창구가 강사에게 열려 있었다** (2026-10-29). `/api/db` 가 table 이름을 받아
  service_role 로 아무 표나 읽고 쓰게 해 주면서 `teacher` 까지 통과시켰다 — payroll 까지 읽혔다 (12번).
- **매뉴얼 고치기가 커밋에서 빠졌다** (2026-10-21, 6e83a86). 메뉴/버튼을 바꾼 커밋에 매뉴얼이 같이 있는지 본다.

## 규칙 추가 기록
> 작업하다 새 규칙이 생기면 여기 날짜와 함께 한 줄씩 추가하고, 위 본문의 해당 자리에도 반영한다.
- 2026-10-27 스킬 처음 만듦 (지금까지의 커밋·문서 기준)
- 2026-10-28 「느려요」는 코드 읽기 전에 pg_stat_statements + 한 번 그리는 시간부터 재기 (9번)
- 2026-10-28 컴포넌트를 컴포넌트 안에 정의해 `<Foo />` 로 쓰면 그릴 때마다 전부 지워진다 → 함수로 부르기 (9번)
- 2026-10-28 수천 행 배열은 useMemo 로 Map 색인, 규칙은 lib 에 한 벌 두고 예전 방식과 대조 (9번)
- 2026-10-28 같은 경로에 쿼리만 바꾸는 `<Link>` 는 화면을 다시 켜지 않는다 (10번)
- 2026-10-28 배포 확인은 **화면 주소가 불러오는 묶음 목록**을 받아 뒤진다. 내 빌드 파일 이름을 운영에 대입하면 404 가 나서 「배포 안 됨」으로 잘못 읽는다 (10번)
- 2026-10-28 화면에서 지우고 고치는 단추는 `const { error } =` 로 받아 확인한다. 실패하면 setState 하지 말고 사유를 말한다 (11번)
- 2026-10-28 교재는 완료 처리를 거치면 사실상 삭제가 막힌다(uniq_null_tb). 지우는 길을 뚫지 말고 「완료로 두기」 (11번)
- 2026-10-28 한 번 누르면 끝인 단추(완료 등)에는 되돌리는 길을 같은 자리에. 못 되돌리는 부분은 확인창에 미리 적는다 (11번)
- 2026-10-29 「강사에게 안 보여야 한다」는 화면·RLS·API **세 겹**을 같이 조인다. API 는 service_role 이라 정책을 비껴간다 (12번)
- 2026-10-29 학생 명단을 내려주는 API 는 `staffOrDeny` + `staffCanSeeStudent` 로 거른다. 브라우저가 보낸 id 도 믿지 않는다 (12번)
- 2026-10-29 조인 뒤에는 JWT 를 흉내 내어 계정별 행 수를 **재서** 확인한다. MCP 기본 역할은 RLS 를 비껴가므로 그냥 센 숫자는 뜻이 없다 (12번)
- 2026-10-29 조이면 브라우저에서 명단을 만들던 알림·발송이 조용히 짧아진다. 대상 찾기를 서버로 옮긴다 (12번)
- 2026-10-29 선생님이 못 하게 막았으면 요청 표 + 푸시 + 뱃지 + 「반영」까지 같은 자리에 만든다 (12번)
- 2026-10-29 OPS 같은 자매 앱도 같은 날 같이 본다. 범용 DB 창구와 역할 확인 없는 화면부터 (12번)
- 2026-10-29 원장 전용 화면을 선생님에게 열 때는 **딸려 받는 표**까지 좁힌다. 행 수로 전체 인원이 새고, 메뉴 이름도 같이 고친다 (12번)
