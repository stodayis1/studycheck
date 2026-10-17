-- 「일요일_시간표_이진우.sql」 되돌리기 — 이진우 학생을 다시 화·목·토로
begin;

delete from public.schedules
where student_id = (select id from public.students where name = '이진우' and is_active)
  and day_of_week = '일';

insert into public.schedules (student_id, day_of_week, start_time, periods, is_active)
select id, '토', '09:00'::time, 3, true
from public.students where name = '이진우' and is_active;

update public.students
set class_time = '고등 화목토2반', updated_at = now()
where name = '이진우' and is_active and class_time = '고등 화목일2반';

commit;

-- ★ OPS 쪽도 같이
-- update public.students set schedule_days = array['화','목','토']
-- where id = '8dd542a8-5540-4d19-b76c-307abafd0f3f';
