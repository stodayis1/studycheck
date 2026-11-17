-- docs/sql/진급배정판_추가클리닉.sql 되돌리기.
--
-- ★ 칸을 지우면 **누구를 추가 클리닉에 부르기로 했는지가 같이 사라진다.**
--   되돌리기 전에 먼저 떠 둔다:
--
--     select s.name, s.grade, a.extra_slot from public.class_move_assign a
--       join public.students s on s.id = a.student_id
--      where a.extra_slot is not null order by s.name;
--
-- 화면에서만 감추려면 이 파일을 쓰지 말고 lib/moveAssign.ts 의 EXTRA 를 비우면 된다 —
-- 칸은 그대로 두는 쪽이 안전하다.

alter table public.class_move_assign drop column if exists extra_slot;

-- 확인 (0 이어야 한다)
select count(*) as 남은칸 from information_schema.columns
 where table_name = 'class_move_assign' and column_name = 'extra_slot';
