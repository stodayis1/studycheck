-- 중1·중2 2학기 기말 — 시험일정 넣기 + 시험교재(이너프원) 배정
--
-- 왜 (2026-11-11, 원장님 「시험대비 배정에 왜 중3뿐이 없냐」):
--   배정 화면은 **이미 배정된 것만** 보여 준다. 그런데
--     · 중3 : 439건 (시험일 11/13~11/25) → 보임
--     · 중2 : 462건이 전부 10/06 중간고사 → 지난 시험이라 숨겨짐
--     · 중1 : 0건
--   즉 2학기 기말 배정이 중3만 돼 있었다. 목차(inner_enough)와 학생별 버전은 들어가 있고
--   **배정(student_exam_prep)만 비어 있다.**
--
--   그리고 스터디체크 exam_schedule 에는 중학교가 **3학년만** 있었다. 중1·중2 기말 날짜는
--   OPS 의 school_calendar(나이스 학사일정)에만 있어서 화면이 「새 시험이 잡혔다」고 알리지도 못했다.
--
-- 시험일 출처: OPS school_calendar (나이스), kind='exam', 각 학교 시작일.
--   신원중 1·2학년 12/07~12/09 · 고양중 1학년 12/04 · 고양제일중 2학년 11/25~11/30
--   목암중 2학년 12/14~12/16 · 원흥중 2학년 12/08~12/10
--   ★ 지축중은 나이스에 시험 일정이 **하나도 없다**(휴업일·방학만).
--     원장님께 여쭈어 12/08~12/10 로 받아 따로 넣었다 (아래 1-2 줄).
--     지축중은 앞으로도 학사일정 자동 수집에 안 들어오니 매번 손으로 넣어야 한다.
--
-- 되돌리기: docs/sql/중1중2_2학기기말_시험교재배정_되돌리기.sql

-- ── 1) 시험일정 ────────────────────────────────────────────────────────────
insert into public.exam_schedule (school_name, grade, exam_name, exam_date, created_by)
select v.school, v.grade, '2학기 기말고사', v.d::date, '윤지혜'
from (values
  ('신원중','1','2026-12-07'), ('고양중','1','2026-12-04'),
  ('신원중','2','2026-12-07'), ('고양제일중','2','2026-11-25'),
  ('목암중','2','2026-12-14'), ('원흥중','2','2026-12-08')
) as v(school, grade, d)
where not exists (
  select 1 from public.exam_schedule e
  where e.school_name = v.school and e.grade = v.grade and e.exam_name = '2학기 기말고사'
);

-- 1-2) 지축중 — 나이스에 없어 원장님께 받은 날짜 (2026-12-08 ~ 12-10)
insert into public.exam_schedule (school_name, grade, exam_name, exam_date, created_by)
select '지축중', '2', '2학기 기말고사', '2026-12-08'::date, '윤지혜'
where not exists (
  select 1 from public.exam_schedule
  where school_name = '지축중' and grade = '2' and exam_name = '2학기 기말고사'
);

-- ── 2) 시험교재 배정 ───────────────────────────────────────────────────────
-- 목차에 적힌 순서(단원 번호 → 회차) 그대로 넣는다 — 원장님 「목차 쓰여있는 순서대로만 배정하면됨」.
-- 학생이 어느 버전인지는 app_settings.exam_prep_version 의 '2026-2-기말' 에 적혀 있다.
-- total_steps 는 화면과 같은 규칙: 문항수 ÷ 30, 최소 1.
insert into public.student_exam_prep
  (student_id, inner_enough_id, exam_date, assigned_by, status, progress_step, total_steps)
select s.id, ie.id, es.exam_date, '윤지혜', 'assigned', 0,
       greatest(1, round(ie.problem_count / 30.0)::int)
from public.students s
cross join (select value -> '2026-2-기말' as m from public.app_settings where key = 'exam_prep_version') v
join public.inner_enough ie
  on ie.school_name = s.school
 and ie.grade = substr(s.grade, 2, 1)
 and ie.level = (v.m ->> s.name)
left join public.exam_schedule es
  on es.school_name = s.school
 and es.grade = substr(s.grade, 2, 1)
 and es.exam_name = '2학기 기말고사'
where s.is_active
  and coalesce(s.is_test, false) = false
  and s.grade in ('중1', '중2')
  and not exists (
    select 1 from public.student_exam_prep ep
    where ep.student_id = s.id and ep.inner_enough_id = ie.id
  )
order by s.name, ie.unit_no, ie.sub_unit_name;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select st.grade, count(*) as 배정행, count(distinct st.id) as 학생수,
       min(ep.exam_date) as 가장이른시험, max(ep.exam_date) as 가장늦은시험,
       count(*) filter (where ep.exam_date is null) as 시험일없음
from public.student_exam_prep ep
join public.students st on st.id = ep.student_id
join public.inner_enough ie on ie.id = ep.inner_enough_id
where ie.level like '%-2기말%' and ie.grade in ('1','2')
group by st.grade order by st.grade;
-- 중1 23명 368행 · 중2 36명 544행쯤 나오면 맞다 (윤수지는 버전이 안 적혀 있어 빠진다).
