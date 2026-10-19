-- 「중3기말_배수빈_고양제일중3.sql」 되돌리기 — 배수빈 학생을 신원중 중 버전으로 되돌린다
begin;

-- ① 고양제일중3 배정과 목차를 치운다 (배정 먼저 — 순서를 바꾸면 빈칸을 가리킨다)
delete from public.student_exam_prep ep
using public.inner_enough ie
where ep.inner_enough_id = ie.id
  and ie.school_name = '고양제일중' and ie.grade = '3' and ie.level = '표준';

delete from public.inner_enough
where school_name = '고양제일중' and grade = '3' and level = '표준';

-- ② 신원중 중 기말 배정을 다시 붙인다
insert into public.student_exam_prep
  (student_id, inner_enough_id, exam_date, assigned_by, status, progress_step, total_steps)
select s.id, ie.id, '2026-11-13'::date, '윤지혜', 'assigned', 0, 2
from public.students s
cross join public.inner_enough ie
where s.name = '배수빈' and s.is_active
  and ie.school_name = '신원중' and ie.grade = '3' and ie.level = '중'
  and ie.unit_no in ('8','9','10','11','12')
  and not exists (select 1 from public.student_exam_prep x
                  where x.student_id = s.id and x.inner_enough_id = ie.id
                    and x.exam_date = '2026-11-13'::date);

commit;
