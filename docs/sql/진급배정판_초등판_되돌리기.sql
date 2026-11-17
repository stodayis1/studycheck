-- 「진급 배정판 초등 판」 되돌리기 — track 이 다시 '고등'·'중등' 둘만 받게 한다.
--
-- ★ 되돌릴 때는 **코드를 먼저** 되돌린다(초등 탭이 떠 있는 채로 이 줄을 넣으면
--   고르는 순간 저장이 막힌다).
-- ★★ 초등 판으로 저장된 줄이 **한 줄이라도 있으면 CHECK 를 다시 걸 수 없다.**
--   먼저 아래로 몇 줄인지 보고, 지워도 되는지 원장님께 여쭌 뒤에 지운다.
--   (지우면 그동안 맞춰 둔 초등 배정이 사라진다 — 되돌릴 수 없다.)

-- ① 몇 줄이 걸려 있나 — 0 이 아니면 아래 delete 를 쓸지 먼저 정한다
select count(*) as 초등판_줄수 from public.class_move_assign where track = '초등';
select s.name, s.grade, a.teacher_name
from public.class_move_assign a join public.students s on s.id = a.student_id
where a.track = '초등' order by s.grade, s.name;

-- ② 지우기로 정했을 때만 이 줄의 주석을 푼다
-- delete from public.class_move_assign where track = '초등';

-- ③ CHECK 를 되돌린다
begin;

alter table public.class_move_assign drop constraint if exists class_move_assign_track_check;
alter table public.class_move_assign add constraint class_move_assign_track_check
  check (track = any (array['고등'::text, '중등'::text]));

commit;

-- 확인
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.class_move_assign'::regclass and contype = 'c';
