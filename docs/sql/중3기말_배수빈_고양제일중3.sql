-- 배수빈(중3) 을 고양제일중3 버전으로 따로 뺀다
--
-- 원장님 2026-10-19
--   「목차가 같긴 한데 수빈이는 고양제일중3 으로 따로 뺀 파일을 다시 적용하자」
--
-- 어떤 상황이었나
--   배수빈 학생만 학교가 **고양제일중**인데 신원중 「중」 버전 명단에 들어 있었다
--   (중3기말_이너프원_목차.sql 에서 그대로 배부했다). 목차 내용은 신원중 중과 같지만
--   · 시험일이 다르다 — 신원중3 11/13 · 고양제일중3 **11/25**
--   · 시험대비 배정 화면은 **학생의 학교**로 교재 목록을 찾는다. 학교가 고양제일중인데
--     목차가 신원중에만 있으면, 나중에 회차를 더 붙이려 할 때 화면에 안 뜬다.
--   그래서 고양제일중3 목차를 따로 만들고 그쪽으로 옮긴다.
--
-- ★ 거두는 배정은 **진도 0 인 것만** 지운다. 이미 푼 기록은 건드리지 않는다.
--   중간고사(10/6) 때 쓰던 신원중 교재 배정은 지난 기록이라 그대로 둔다.
begin;

-- ① 고양제일중3 목차 — 신원중 중 버전과 같은 13회차 (단원번호는 1부터, 3학년 목차가 없었다)
insert into public.inner_enough
  (school_name, grade, level, unit_no, unit_name, sub_unit_no, sub_unit_name, problem_count)
select '고양제일중', '3', '표준', v.uno::text, v.unit, r || '회차', r || '회차', 50
from (values
  (1,'원과 직선',3), (2,'원주각의 성질',3), (3,'원주각의 활용',3),
  (4,'대푯값과 산포도',2), (5,'산점도와 상관관계',2)
) as v(uno, unit, cnt)
cross join lateral generate_series(1, v.cnt) as r;

-- ② 신원중 중 기말 배정을 거둔다
delete from public.student_exam_prep ep
using public.students s, public.inner_enough ie
where ep.student_id = s.id and ep.inner_enough_id = ie.id
  and s.name = '배수빈' and s.is_active
  and ie.school_name = '신원중' and ie.level = '중'
  and ep.exam_date = '2026-11-13' and ep.progress_step = 0;

-- ③ 고양제일중3 으로 다시 배부 (기말 11/25)
insert into public.student_exam_prep
  (student_id, inner_enough_id, exam_date, assigned_by, status, progress_step, total_steps)
select s.id, ie.id, '2026-11-25'::date, '윤지혜', 'assigned', 0, 2
from public.students s
cross join public.inner_enough ie
where s.name = '배수빈' and s.is_active
  and ie.school_name = '고양제일중' and ie.grade = '3' and ie.level = '표준'
  and not exists (select 1 from public.student_exam_prep x
                  where x.student_id = s.id and x.inner_enough_id = ie.id);

commit;

-- 확인
select ie.school_name 교재, ie.unit_no 번호, ie.unit_name 단원, ie.sub_unit_name 회차, ep.exam_date 시험일
from public.student_exam_prep ep
join public.students s on s.id = ep.student_id
join public.inner_enough ie on ie.id = ep.inner_enough_id
where s.name = '배수빈' and ep.exam_date >= '2026-11-01'
order by ie.unit_no::int, ie.sub_unit_no;
