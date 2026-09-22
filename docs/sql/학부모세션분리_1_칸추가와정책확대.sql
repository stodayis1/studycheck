-- 학부모 세션 분리 ① 칸 추가 + 정책 확대
--
-- 문제: students.session_uid 한 칸을 학생 앱과 학부모 앱이 같이 쓴다. student_login이 로그인할 때마다
--       덮어쓰기 때문에, 나중에 로그인한 쪽이 먼저 로그인한 쪽을 밀어낸다. 밀려난 쪽은 RLS가 막아서
--       대시보드에 데이터가 안 잡히고 로그인 화면으로 튕긴다.
--       2026-09-22 기준 재원생 192명 중 54명이 학생·학부모 양쪽 다 로그인한 적 있고, 그중 52명이
--       최근 30일 안이다. 즉 52가정이 지금 서로를 밀어내고 있다.
--
-- ⚠️ 실행 순서 (지키지 않으면 학부모 화면이 빈다)
--    1) 이 파일           ← 지금 여기. 칸 추가 + 정책 확대만. **동작은 하나도 안 바뀐다**
--                            (parent_session_uid가 전부 NULL이라 OR 조건이 항상 false)
--    2) 앱 배포           ← app/api/push/subscribe 가 두 칸을 모두 보도록 고친 것
--    3) 학부모세션분리_2_로그인함수.sql  ← 그때부터 학부모 uid가 새 칸에 들어간다
--
-- 되돌리기: 이 파일은 되돌릴 필요가 없다(넓히기만 해서 기존 동작을 그대로 포함한다).
--           굳이 되돌리려면 각 정책의 `or parent_session_uid = ...` 부분만 빼면 된다.
--           데이터는 지우지 않는다. 컬럼도 남겨두면 아무 영향이 없다.

-- ── 칸 추가 ────────────────────────────────────────────────────────────────
alter table public.students add column if not exists parent_session_uid uuid;

comment on column public.students.session_uid        is '학생 앱 로그인 세션(익명 uid). student_login이 기록';
comment on column public.students.parent_session_uid is '학부모 앱 로그인 세션(익명 uid). student_login(p_role=parent)이 기록';

-- 한 브라우저에서 학생·학부모를 번갈아 로그인하면 같은 uid가 두 칸에 다 들어갈 수 있다.
-- 일부러 지우지 않는다 — 지우면 기기를 함께 쓰는 가정이 서로를 다시 밀어내게 된다.

-- ── 본인 확인 헬퍼 (현재 정책에선 안 쓰이지만 코드/향후 정책용으로 같이 확대) ──
create or replace function public.owns_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and auth.uid() is not null
      and (s.session_uid = auth.uid() or s.parent_session_uid = auth.uid())
  );
$function$;

-- ── students 본인 읽기 ─────────────────────────────────────────────────────
alter policy staff_or_own on public.students
  using (
    is_staff()
    or session_uid = (select auth.uid())
    or parent_session_uid = (select auth.uid())
  );

-- ── 학생 연결 테이블 10개 (정책 구조는 그대로, 안쪽 조건만 넓힌다) ─────────
alter policy staff_or_own_student on public.class_sessions
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.exam_prep_assignments
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.feedbacks
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.learning_notes
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.progress_checks
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.schedules
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.student_exam_prep
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.student_textbooks
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.student_worksheets
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

alter policy staff_or_own_student on public.video_watch_logs
  using (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (is_staff() or student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

-- ── 알림 답글은 feedbacks를 한 번 더 타고 들어간다 ─────────────────────────
alter policy staff_or_own_via_feedback on public.feedback_replies
  using (is_staff() or feedback_id in (select id from public.feedbacks
    where student_id in (select id from public.students
      where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid()))))
  with check (is_staff() or feedback_id in (select id from public.feedbacks
    where student_id in (select id from public.students
      where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid()))));

-- ── 확인용 ─────────────────────────────────────────────────────────────────
-- 아래가 12줄 나오고 전부 parent_session_uid를 포함해야 한다.
--
-- select c.relname, p.polname
-- from pg_policy p join pg_class c on c.oid = p.polrelid
-- where pg_get_expr(p.polqual, p.polrelid) ilike '%parent_session_uid%'
-- order by 1;
