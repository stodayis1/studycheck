-- 중3 2학기 기말고사 이너프원 — 버전별 목차와 학생 배정
--
-- 원장님 2026-10-19
--   「오늘부터 중3 기말고사 대비 이너프원 배부할거야 / 목차를 학생 학습일지에 반영해줘
--     순서는 목차대로」  (중3 기말고사 이너프원 버전별 목차.pdf)
--
-- 어디에 들어가나
--   inner_enough        = 이너프원 목차(학교·학년·버전·단원·회차). 모든 학교가 함께 쓴다.
--   student_exam_prep   = 학생별 배부. 학습일지의 「시험대비 진도」·「시험대비 과제」가 이걸 읽는다.
--
-- ★ 단원번호(unit_no)를 1부터 다시 매기지 않고 **이어서** 붙인다.
--   시험대비 배정 화면은 (학교·학년·버전)만으로 목록을 뽑고 unit_no 로 정렬한다 —
--   중간고사 범위와 한 목록에 섞인다. 1부터 다시 매기면 「삼각비(1)·원과 직선·삼각비(2)…」
--   처럼 엇갈려 보인다. 이어 붙이면 기말 목차가 **아래쪽에 목차 순서 그대로** 모인다.
--     신원중 상/중 7 → 8~12   원흥중 6 → 7~9   도래울중 6 → 7~9   고양중 4 → 5~9
--
-- ★ 원흥중만 다르다 — 「원주각의 성질 1~3회차」는 **이미 있다.**
--   2학기 중간(9/29) 범위에 들어 있었는데 김준희 학생이 진도 0 으로 못 하고 넘어갔다.
--   똑같은 것을 새로 만들면 목차가 두 벌이 된다. 그래서 새로 만들지 않고, 그 배정의
--   시험일만 기말(11/16)로 옮긴다. 진도가 0 이라 잃는 기록이 없다.
--
-- ★ 고양중 목차의 「원과 직선 2회차」가 두 번 적혀 있었다(1,2,2).
--   다른 버전이 모두 3회차까지 있고 고양중만 2회차가 둘일 이유가 없어 **3회차 오타**로 보고
--   1·2·3회차로 넣었다. 아니면 되돌리기로 지우고 다시 넣으면 된다. (대상: 윤서진 학생)
--
-- 시험일 — exam_schedule(10월 가정통신문) 그대로
--   신원중3·고양중3 11/13 · 원흥중3 11/16 · 도래울중3 11/23
begin;

-- ① 목차 — (학교, 버전, 단원번호, 단원, 회차수) 만 적고 회차는 펼쳐 넣는다.
--   54줄을 손으로 적으면 한 줄이 틀려도 안 보인다. 적는 자리를 18줄로 줄였다.
insert into public.inner_enough
  (school_name, grade, level, unit_no, unit_name, sub_unit_no, sub_unit_name, problem_count)
select v.school, '3', v.level, v.uno::text, v.unit, r || '회차', r || '회차', 50
from (values
  -- 신원중 상 (중간 7 → 8~12)
  ('신원중','상', 8,'원과 직선',2), ('신원중','상', 9,'원주각의 성질',3),
  ('신원중','상',10,'원주각의 활용',3), ('신원중','상',11,'대푯값과 산포도',2),
  ('신원중','상',12,'산점도와 상관관계',2),
  -- 신원중 중 (중간 7 → 8~12)
  ('신원중','중', 8,'원과 직선',3), ('신원중','중', 9,'원주각의 성질',3),
  ('신원중','중',10,'원주각의 활용',3), ('신원중','중',11,'대푯값과 산포도',2),
  ('신원중','중',12,'산점도와 상관관계',2),
  -- 원흥중 (중간 6 → 7~9. 「원주각의 성질」은 이미 있어서 안 만든다)
  ('원흥중','표준',7,'원주각의 활용',3), ('원흥중','표준',8,'대푯값과 산포도',2),
  ('원흥중','표준',9,'산점도와 상관관계',2),
  -- 도래울중 (중간 6 → 7~9)
  ('도래울중','표준',7,'원과 직선',3), ('도래울중','표준',8,'원주각의 성질',3),
  ('도래울중','표준',9,'원주각의 활용',3),
  -- 고양중 (중간 4 → 5~9)
  ('고양중','표준',5,'원과 직선',3), ('고양중','표준',6,'원주각의 성질',3),
  ('고양중','표준',7,'원주각의 활용',3), ('고양중','표준',8,'대푯값과 산포도',2),
  ('고양중','표준',9,'산점도와 상관관계',2)
) as v(school, level, uno, unit, cnt)
cross join lateral generate_series(1, v.cnt) as r;

-- 신원중 상 버전 — 10명 × 12회차
insert into public.student_exam_prep
  (student_id, inner_enough_id, exam_date, assigned_by, status, progress_step, total_steps)
select s.id, ie.id, '2026-11-13'::date, '윤지혜', 'assigned', 0, 2
from public.students s
cross join public.inner_enough ie
where s.is_active and s.name in ('김민희', '김윤아', '노우석', '박유준', '신성우', '이병목', '이은서', '이현준', '이준민', '김민정')
  and ie.school_name = '신원중' and ie.grade = '3' and ie.level = '상'
  and ie.unit_no in ('8', '9', '10', '11', '12')
  and not exists (select 1 from public.student_exam_prep x
                  where x.student_id = s.id and x.inner_enough_id = ie.id
                    and x.exam_date = '2026-11-13'::date);

-- 신원중 중 버전 — 23명 × 13회차
insert into public.student_exam_prep
  (student_id, inner_enough_id, exam_date, assigned_by, status, progress_step, total_steps)
select s.id, ie.id, '2026-11-13'::date, '윤지혜', 'assigned', 0, 2
from public.students s
cross join public.inner_enough ie
where s.is_active and s.name in ('김규민', '김도윤', '김하음', '류연서', '류휘석', '박서준', '박신영', '배수빈', '백하연', '서우현', '서혜원', '신소민', '이하나', '임재욱', '장태균', '정지후', '최윤우', '허예은', '장주호', '오윤서', '임동규', '강채린', '강보민')
  and ie.school_name = '신원중' and ie.grade = '3' and ie.level = '중'
  and ie.unit_no in ('8', '9', '10', '11', '12')
  and not exists (select 1 from public.student_exam_prep x
                  where x.student_id = s.id and x.inner_enough_id = ie.id
                    and x.exam_date = '2026-11-13'::date);

-- 원흥중 표준 버전 — 1명 × 7회차
insert into public.student_exam_prep
  (student_id, inner_enough_id, exam_date, assigned_by, status, progress_step, total_steps)
select s.id, ie.id, '2026-11-16'::date, '윤지혜', 'assigned', 0, 2
from public.students s
cross join public.inner_enough ie
where s.is_active and s.name in ('김준희')
  and ie.school_name = '원흥중' and ie.grade = '3' and ie.level = '표준'
  and ie.unit_no in ('7', '8', '9')
  and not exists (select 1 from public.student_exam_prep x
                  where x.student_id = s.id and x.inner_enough_id = ie.id
                    and x.exam_date = '2026-11-16'::date);

-- 도래울중 표준 버전 — 1명 × 9회차
insert into public.student_exam_prep
  (student_id, inner_enough_id, exam_date, assigned_by, status, progress_step, total_steps)
select s.id, ie.id, '2026-11-23'::date, '윤지혜', 'assigned', 0, 2
from public.students s
cross join public.inner_enough ie
where s.is_active and s.name in ('이주현')
  and ie.school_name = '도래울중' and ie.grade = '3' and ie.level = '표준'
  and ie.unit_no in ('7', '8', '9')
  and not exists (select 1 from public.student_exam_prep x
                  where x.student_id = s.id and x.inner_enough_id = ie.id
                    and x.exam_date = '2026-11-23'::date);

-- 고양중 표준 버전 — 1명 × 13회차
insert into public.student_exam_prep
  (student_id, inner_enough_id, exam_date, assigned_by, status, progress_step, total_steps)
select s.id, ie.id, '2026-11-13'::date, '윤지혜', 'assigned', 0, 2
from public.students s
cross join public.inner_enough ie
where s.is_active and s.name in ('윤서진')
  and ie.school_name = '고양중' and ie.grade = '3' and ie.level = '표준'
  and ie.unit_no in ('5', '6', '7', '8', '9')
  and not exists (select 1 from public.student_exam_prep x
                  where x.student_id = s.id and x.inner_enough_id = ie.id
                    and x.exam_date = '2026-11-13'::date);

-- ② 원흥중 「원주각의 성질」 — 새로 만들지 않고 시험일만 기말로 옮긴다
update public.student_exam_prep ep
set exam_date = '2026-11-16'
from public.students s, public.inner_enough ie
where ep.student_id = s.id and ep.inner_enough_id = ie.id
  and s.name = '김준희' and s.is_active
  and ie.school_name = '원흥중' and ie.grade = '3' and ie.level = '표준'
  and ie.unit_name = '원주각의 성질'
  and ep.exam_date = '2026-09-29' and ep.progress_step = 0;

commit;

-- 확인 — 학생별로 몇 회차가 붙었는지
select s.name 이름, s.school 학교, ie.level 버전, count(*) 회차수
from public.student_exam_prep ep
join public.students s on s.id = ep.student_id
join public.inner_enough ie on ie.id = ep.inner_enough_id
where ep.exam_date between '2026-11-01' and '2026-11-30' and s.grade = '중3'
group by 1,2,3 order by 3, 1;
