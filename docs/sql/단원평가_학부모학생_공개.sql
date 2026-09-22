-- 학부모·학생 앱에서 '본인 학생의 학교 단원평가'만 볼 수 있게 연다
--
-- 왜 필요한가: exams 테이블은 지금 직원 전용이다(정책 staff_all = is_staff()).
--   그래서 학부모 대시보드에 단원평가 카드를 붙여도 빈 배열만 와서 아무것도 안 보인다.
--
-- 무엇을 여는가: **학교시험 + 단원평가 행만** 연다.
--   입학테스트·진단평가·코어테스트 점수와 레벨은 계속 직원만 본다. 열고 싶으면 그때 따로 정한다.
--   본인 확인은 학생 세션(session_uid) 또는 학부모 세션(parent_session_uid) 둘 다 받는다
--   (학부모세션분리_1 에서 만든 칸).
--
-- ⚠️ 실행 전에 학부모세션분리_1_칸추가와정책확대.sql 이 먼저 적용돼 있어야 한다
--    (parent_session_uid 칸이 없으면 이 파일은 에러가 난다).
--
-- 되돌리기: drop policy student_read_unit_exam on public.exams;
--           행을 만들거나 지우지 않으므로 데이터에는 아무 영향이 없다.

begin;

-- 기존 정책은 그대로 둔다(직원 전체 권한). 읽기 정책이 하나 더 붙으면 OR로 합쳐진다.
drop policy if exists student_read_unit_exam on public.exams;

create policy student_read_unit_exam on public.exams
for select
using (
  exam_type = '학교시험'
  and title = '단원평가'
  and student_id in (
    select id from public.students
    where session_uid = (select auth.uid())
       or parent_session_uid = (select auth.uid())
  )
);

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
-- 정책이 2개(staff_all, student_read_unit_exam) 보이면 정상
--
-- select polname, polcmd::text, pg_get_expr(polqual, polrelid)
-- from pg_policy where polrelid = 'public.exams'::regclass;
--
-- 실제 확인은 학부모 앱으로 로그인해서 대시보드에 「학교 단원평가」 카드가 뜨는지 보면 된다.
-- (초등이면서 단원평가 기록이 있는 학생만 카드가 나온다. 예: 초6 안준혁·오현승·유정환·임지원·
--  최다빈·홍채은, 초5 강채경·권윤채·이선호·임유하 등)
