-- 되돌리기 — 2026-11-11 에 넣은 중1·중2 2학기 기말 배정과 시험일정을 지운다.
-- 짝: docs/sql/중1중2_2학기기말_시험교재배정.sql
--
-- ★ 2학기 기말 목차(level 이 '1-2기말…' · '2-2기말…')에 달린 배정은 그때 넣은 것뿐이다.
--   그 전 배정은 level 이 '상' · '중' · '하' · '표준' 이라 여기 걸리지 않는다.
--   선생님이 그 뒤에 손으로 더 배정했다면 그것도 같이 지워지니, 지우기 전에 아래 세어 보기를 먼저 돌릴 것.

-- 세어 보기 (지우기 전에)
select st.grade, st.name, count(*) as 지워질행
from public.student_exam_prep ep
join public.students st on st.id = ep.student_id
join public.inner_enough ie on ie.id = ep.inner_enough_id
where ie.level like '%-2기말%' and ie.grade in ('1','2')
group by st.grade, st.name order by st.grade, st.name;

-- 1) 배정 지우기
delete from public.student_exam_prep ep
using public.inner_enough ie
where ie.id = ep.inner_enough_id
  and ie.level like '%-2기말%'
  and ie.grade in ('1','2');

-- 2) 시험일정 지우기 (그때 넣은 여섯 줄만)
delete from public.exam_schedule
where exam_name = '2학기 기말고사'
  and created_by = '윤지혜'
  and (school_name, grade, exam_date) in (
    ('신원중','1','2026-12-07'::date), ('고양중','1','2026-12-04'::date),
    ('신원중','2','2026-12-07'::date), ('고양제일중','2','2026-11-25'::date),
    ('목암중','2','2026-12-14'::date), ('원흥중','2','2026-12-08'::date)
  );
