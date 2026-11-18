-- 「진급 배정판 초등 시간 바꾸기」 되돌리기 — new_time 칸을 뗀다.
--
-- ★ 되돌릴 때는 **코드를 먼저** 되돌린다(화면에 시간 칸이 떠 있는 채로 이 줄을 넣으면
--   고르는 순간 저장만 막힌다).
-- ★★ 칸을 떼면 그동안 맞춰 둔 **바꾼 시간이 전부 사라진다 — 되돌릴 수 없다.**
--   먼저 아래로 몇 줄이 들어 있는지 보고, 지워도 되는지 원장님께 여쭌다.

-- ① 무엇이 들어 있나
select count(new_time) as 시간바꾼줄 from public.class_move_assign;
select s.name, s.grade, a.teacher_name, a.new_time
from public.class_move_assign a join public.students s on s.id = a.student_id
where a.new_time is not null order by s.grade, s.name;

-- ② 지우기로 정했을 때만 이 줄의 주석을 푼다
-- begin;
-- alter table public.class_move_assign drop column if exists new_time;
-- commit;

-- 값만 비우고 칸은 두는 길(더 안전하다) — 이쪽을 쓰려면 위 대신 이 줄
-- update public.class_move_assign set new_time = null where new_time is not null;

-- 확인
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'class_move_assign' order by ordinal_position;
