-- 학생·학부모에게 ① 코어테스트 점수 ② 오토스텝 페이지 범위를 연다
--
-- ① 코어테스트
--    지금은 단원평가만 열려 있다(2026-09-22 student_read_unit_exam).
--    여기에 코어테스트를 더한다. 학교 중간·기말 내신 성적(school_exams)과 진단평가·입학테스트는
--    학원 관리용이므로 **계속 직원만** 본다.
--    - 단원평가 = exams(exam_type='학교시험', title='단원평가')  ← 이미 열려 있던 것, 그대로 유지
--    - 코어테스트 = exams(exam_type='코어테스트')                ← 이번에 더하는 것
--                   title이 '본고사' / '예비 1회' / '예비 2회'로 들어간다
--
-- ② 오토스텝 페이지 범위
--    학생 대시보드가 autostep_concept_page_map을 읽는데 그 표는 직원 전용이라
--    조회 결과가 늘 비어 있었다 → 과제 페이지 범위(P.6~13 같은 표시)가 학생에게 안 보였다.
--    이 표는 '개념 ↔ 교재 몇 쪽' 대응표일 뿐 학생 개인정보가 없으므로 로그인한 사용자에게 연다.
--    (concepts처럼 아무나가 아니라 authenticated로 좁힌다 — 학생·학부모는 로그인하면 authenticated다)
--
-- 되돌리기: 맨 아래 주석 참고. 데이터는 만들지도 지우지도 않는다.

begin;

-- ── ① 코어테스트 + 단원평가 ────────────────────────────────────────────────
drop policy if exists student_read_unit_exam on public.exams;
drop policy if exists student_read_own_exam on public.exams;

create policy student_read_own_exam on public.exams
for select
using (
  (
    (exam_type = '학교시험' and title = '단원평가')   -- 초등 학교 단원평가
    or exam_type = '코어테스트'                       -- 학원 코어테스트(본고사·예비)
  )
  and student_id in (
    select id from public.students
    where session_uid = (select auth.uid())
       or parent_session_uid = (select auth.uid())
  )
);

-- ── ② 오토스텝 페이지 범위 ─────────────────────────────────────────────────
-- 기존 staff_all(is_staff())은 그대로 두고 읽기 정책만 하나 더 붙인다(OR로 합쳐진다).
drop policy if exists authenticated_read_page_map on public.autostep_concept_page_map;

create policy authenticated_read_page_map on public.autostep_concept_page_map
for select
to authenticated
using (true);

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
-- 1) 정책이 붙었는지
--   select c.relname, p.polname, p.polcmd::text
--   from pg_policy p join pg_class c on c.oid = p.polrelid
--   where c.relname in ('exams','autostep_concept_page_map') order by 1, 2;
--
-- 2) 실제 확인은 학생 앱으로 로그인해서
--    - 대시보드에 「학원 코어테스트」 카드가 뜨는지
--    - 과제에 페이지 범위(P.6~13)가 나오는지
--
-- 되돌리기:
--   drop policy authenticated_read_page_map on public.autostep_concept_page_map;
--   -- 코어테스트만 도로 닫으려면 student_read_own_exam을 지우고 단원평가만 있던 예전 정책으로:
--   -- create policy student_read_unit_exam on public.exams for select using (
--   --   exam_type='학교시험' and title='단원평가' and student_id in (
--   --     select id from public.students
--   --     where session_uid=(select auth.uid()) or parent_session_uid=(select auth.uid())));
