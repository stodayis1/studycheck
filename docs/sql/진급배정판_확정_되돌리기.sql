-- 되돌리기 — docs/sql/진급배정판_확정.sql 로 더한 칸 셋을 뺀다.
--
-- ★ 칸을 빼면 **손으로 누른 확정 기록이 사라진다.** 코드를 먼저 되돌리고(확정 칸을 안 쓰는
--   판으로), 기록이 아깝지 않을 때만 돌린다. 앱은 칸이 없어도 뜬다 — 확정이 모두
--   「계획」으로 보이고, 반영된 요청으로 저절로 확정되는 것은 그대로 보인다.

alter table public.class_move_assign
  drop column if exists confirmed_at,
  drop column if exists confirmed_by_name,
  drop column if exists confirmed_note;

-- 확인 — 0 이어야 한다
select count(*) as 남은칸 from information_schema.columns
 where table_schema = 'public' and table_name = 'class_move_assign'
   and column_name in ('confirmed_at', 'confirmed_by_name', 'confirmed_note');
