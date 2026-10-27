-- 박주원 「중3 모의고사 1부/2부」 배정 되돌리기
-- 주의: 진도체크가 이미 찍혔으면 멈춘다. 기록을 지울 생각이 아니면 그대로 두는 게 맞다.

begin;

do $$
declare n int;
begin
  select count(*) into n from progress_checks pc
    join student_textbooks st on st.id = pc.student_textbook_id
   where st.student_id = '2c6e8e00-d220-4b0e-9abb-5a3bcc922b2b'
     and st.grade = '중3모의고사';
  if n > 0 then
    raise exception '진도체크가 %건 찍혀 있다. 지울 생각이면 이 블록을 지우고 다시 돌릴 것.', n;
  end if;
end $$;

delete from student_textbooks
 where student_id = '2c6e8e00-d220-4b0e-9abb-5a3bcc922b2b'
   and grade = '중3모의고사'
   and textbook_name in ('중3 모의고사 1부', '중3 모의고사 2부');

commit;
