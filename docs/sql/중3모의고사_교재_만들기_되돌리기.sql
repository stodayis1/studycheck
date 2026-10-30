-- 「중3 모의고사 1부/2부」 되돌리기
-- 주의: 이 회차에 이미 진도체크가 찍혔다면 먼저 지워야 한다(아래 1번에서 건수를 먼저 확인할 것).

begin;

-- 0) 진도체크가 남아 있으면 멈춘다 (실수로 기록을 지우지 않도록)
do $$
declare n int;
begin
  select count(*) into n from progress_checks pc
    join concepts c on c.id = pc.concept_id
   where c.grade = '중3모의고사';
  if n > 0 then
    raise exception '진도체크가 %건 남아 있다. 기록을 지울 생각이면 이 블록을 지우고 다시 돌릴 것.', n;
  end if;
end $$;

-- 1) 배정된 교재가 있으면 먼저 지운다
delete from student_textbooks
 where grade = '중3모의고사'
   and textbook_name in ('중3 모의고사 1부', '중3 모의고사 2부');

-- 2) 회차 지우기
delete from concepts where grade = '중3모의고사';

-- 3) 교재 목록에서 지우기
delete from textbook_catalog
 where school_level = '중등' and textbook_type = '유형서'
   and textbook_name in ('중3 모의고사 1부', '중3 모의고사 2부');

commit;
