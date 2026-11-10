-- 쎈풀이영상_중1-2.sql 되돌리기
begin;
delete from lesson_videos where grade = '중1-2' and kind = '대표예제' and order_label ~ '^\d\d-풀이\d\d$';
commit;
