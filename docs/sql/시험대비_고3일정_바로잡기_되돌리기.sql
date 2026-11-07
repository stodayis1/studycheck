-- 되돌리기 — 2026-11-07 의 「고3 일정 바로잡기」를 원래대로
--
-- 되돌리면 고3 줄이 다시 1·2학년과 같은 날짜가 된다(= 10/08 에 넣었던 그 상태).
-- 지웠던 세 줄은 그때 값(created_by '10월 가정통신문')으로 되살린다.

-- 1) 고친 날짜를 1·2학년 날짜로 되돌린다
update public.exam_schedule set exam_date = '2026-12-07'
 where school_name = '신원고'   and grade = '3' and exam_name = '2학기 기말고사';
update public.exam_schedule set exam_date = '2026-12-14'
 where school_name = '봉일천고' and grade = '3' and exam_name = '2학기 기말고사';

-- 2) 지웠던 고3 줄을 되살린다
insert into public.exam_schedule (school_name, grade, exam_name, exam_date, created_by)
values
  ('고양일고',   '3', '2학기 기말고사', '2026-12-07', '10월 가정통신문'),
  ('백양고',     '3', '2학기 기말고사', '2026-12-02', '10월 가정통신문'),
  ('고양동산고', '3', '2학기 기말고사', '2026-12-09', '10월 가정통신문');

-- 3) 넣었던 고양국제고를 뺀다
delete from public.exam_schedule
 where school_name = '고양국제고' and exam_name = '2학기 기말고사';

-- 확인
select school_name, grade, exam_date from public.exam_schedule
 where exam_name = '2학기 기말고사' order by school_name, grade;
