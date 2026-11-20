-- 2026-05-27 평가 기록 중복 줄 정리 되돌리기 (원장님 2026-11-20)
-- 지운 줄을 **같은 id 로** 되살리고, 채운 제목을 다시 비운다.
-- ★ 학생 이름은 적지 않는다. 줄 id 로만 가리킨다.

insert into public.exams (id, student_id, exam_type, exam_date, title, unit_name, level, score, total_score, memo, teacher_name, semester)
values ('766104f9-fe32-4dd5-8517-eaf0bb53e1ac', '07a66269-59ee-4675-96f9-fc79c8f2dfbc',
        '코어테스트', '2026-05-27', null, null, null, 92, 100, null, '윤지혜', null)
on conflict (id) do nothing;

update public.exams set title = null
where id in ('4cb02f57-bfff-41a8-9923-06ebe5a62cb5', '0155bdfb-10bf-4979-b4fd-be27ee879552')
  and title = '6학년 평가';

-- 확인 — 네 줄로 돌아와야 한다
select exam_type, coalesce(title, '(비어 있음)') title, score
from public.exams
where student_id = '07a66269-59ee-4675-96f9-fc79c8f2dfbc'
  and exam_date = '2026-05-27'
order by created_at;
