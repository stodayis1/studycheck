-- 이너프원 2026 2학기: 등록분을 실제 PDF 에 맞게 보정 (2026-10-03)
--
-- 왜 하나
--   이너프원 PDF 9권을 문항 단위로 세어 보니(총 5,115문항) 앱에 등록된 것과 두 군데가 달랐다.
--   원장님 확인: "PDF 기준으로 고친다."
--
-- 무엇이 바뀌나
--   1) 신원중 중3 「상」 이차함수(2) 1회차·2회차 : 50문항 → 40문항  (PDF 는 40문항씩)
--        · inner_enough 2줄
--        · 이미 학생에게 배정된 exam_prep_assignments 16줄(8명 × 2회차)의 문항 수도 40 으로 맞춘다.
--          (16줄 모두 아직 완료 전이라 점수 기록에는 영향이 없다 — 2026-10-03 조회로 확인)
--   2) 타학교 중3 책에는 3회차까지 있는데 2회차까지만 등록되어 있던 것을 추가
--        · 도래울중 중3 표준 : 대푯값과 산포도 3회차(50), 산점도와 상관관계 3회차(50)
--        · 원흥중   중3 표준 : 원과 직선 3회차(50)
--        등록 날짜는 같은 책의 2회차와 똑같이 넣는다. 그래야 「이 시험용으로 올린 묶음」에 같이 묶인다.
--   지우는 것은 없다.
--
-- 안 건드리는 것 (알아둘 것)
--   · 새로 넣은 3회차는 학생에게 자동으로 배정되지 않는다. 필요하면 「시험배정」에서 배정한다.
--   · student_exam_prep.total_steps(이차함수(2), 8명 × 2줄, 지금 2)는 그대로 둔다.
--     40문항이면 새로 배정할 때는 1단계로 잡히지만, 이미 진행 중인 학생의 단계 수를 바꾸면
--     진도 표시가 흔들릴 수 있어 손대지 않았다.
--
-- 실행 방법
--   Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여넣고 Run  (여러 번 실행해도 안전하다)

begin;

-- 1) 신원중 중3 상 · 이차함수(2) 1·2회차 → 40문항
update public.inner_enough
set problem_count = 40
where school_name = '신원중' and grade = '3' and level = '상'
  and unit_name = '이차함수(2)' and sub_unit_name in ('1회차', '2회차')
  and created_at >= '2026-09-01' and problem_count = 50;

update public.exam_prep_assignments
set question_count = 40, updated_at = now()
where school = '신원중' and grade = '중3' and group_key = '신원중3 상'
  and unit_name = '이차함수(2)' and round_label in ('1회차', '2회차')
  and question_count = 50 and completed_at is null;

-- 2) 3회차 추가 — 같은 단원 2회차 줄을 본떠 넣는다 (이미 있으면 넣지 않는다)
insert into public.inner_enough
  (school_name, grade, level, unit_no, unit_name, sub_unit_no, sub_unit_name, problem_count, created_at)
select s.school_name, s.grade, s.level, s.unit_no, s.unit_name, '3회차', '3회차', 50, s.created_at
from public.inner_enough s
where s.created_at >= '2026-09-01' and s.grade = '3' and s.level = '표준' and s.sub_unit_name = '2회차'
  and ( (s.school_name = '도래울중' and s.unit_name in ('대푯값과 산포도', '산점도와 상관관계'))
     or (s.school_name = '원흥중'   and s.unit_name = '원과 직선') )
  and not exists (
    select 1 from public.inner_enough x
    where x.school_name = s.school_name and x.grade = s.grade and x.level = s.level
      and x.unit_name = s.unit_name and x.sub_unit_name = '3회차' and x.created_at >= '2026-09-01'
  );

commit;

-- 확인: 아래가 580 / 650 / 600 / 16 이면 정상
--   (신원중3 상 = PDF 1권 B 580문항, 도래울중3 = 500+100, 원흥중3 = 550+50, 배정 16줄이 40문항)
select
  (select sum(problem_count) from public.inner_enough
    where school_name = '신원중' and grade = '3' and level = '상' and created_at >= '2026-09-01')   as 신원중3상,
  (select sum(problem_count) from public.inner_enough
    where school_name = '도래울중' and grade = '3' and level = '표준' and created_at >= '2026-09-01') as 도래울중3,
  (select sum(problem_count) from public.inner_enough
    where school_name = '원흥중' and grade = '3' and level = '표준' and created_at >= '2026-09-01')  as 원흥중3,
  (select count(*) from public.exam_prep_assignments
    where group_key = '신원중3 상' and unit_name = '이차함수(2)' and question_count = 40)            as 배정40문항;
