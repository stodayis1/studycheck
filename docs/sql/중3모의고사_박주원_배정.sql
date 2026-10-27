-- 박주원 학생에게 「중3 모의고사 1부/2부」 배정
-- 먼저 docs/sql/중3모의고사_교재_만들기.sql 을 돌려야 한다.
-- 되돌리기: docs/sql/중3모의고사_박주원_배정_되돌리기.sql

begin;

insert into student_textbooks (student_id, concept_id, textbook_name, textbook_type, grade, semester, status)
values
  ('2c6e8e00-d220-4b0e-9abb-5a3bcc922b2b', null, '중3 모의고사 1부', '유형서', '중3모의고사', 1, 'assigned'),
  ('2c6e8e00-d220-4b0e-9abb-5a3bcc922b2b', null, '중3 모의고사 2부', '유형서', '중3모의고사', 2, 'assigned');

commit;

-- 확인
-- select textbook_name, grade, semester, status from student_textbooks
--  where student_id='2c6e8e00-d220-4b0e-9abb-5a3bcc922b2b' and grade='중3모의고사';
