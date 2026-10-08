-- 되돌리기 — 2학기 기말고사 일정 21건 삭제 (2026-10-08)
--
-- created_by 로 이번에 넣은 것만 짚어 지운다. 선생님이 화면에서 직접 넣은 일정은
-- created_by 가 그분 이름이라 안 지워진다.

begin;

delete from public.exam_schedule
 where exam_name = '2학기 기말고사'
   and created_by = '10월 가정통신문';

-- 실행하면 「DELETE 21」이 나와야 한다
select count(*) as 남은_2학기기말 from public.exam_schedule where exam_name = '2학기 기말고사';

commit;
