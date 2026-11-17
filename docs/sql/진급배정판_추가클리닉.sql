-- 진급 배정판에 **추가 클리닉** 칸을 더한다.
-- 원장님 2026-11-17 「월수금 클리닉 시간(이규숙쌤)을 8-9시 타임에도 넣어줘.
--   근무시간을 9시까지로 잡았거든. 그때 더 남는 애들이나 추가로 부를애들 부르는 것으로 하게」
--
-- 지금 타임은 「키움쌤 수업 + 채움쌤 클리닉」이 한 묶음이라, 거기 안 들어가는
-- **따로 부르는 클리닉**을 적을 자리가 없었다. 그래서 칸을 하나 더 둔다(비워 둬도 된다).
-- 뜻(열쇠 → 요일·시각)은 lib/moveAssign.ts 의 EXTRA 에 있다.
--
-- 되돌리기: docs/sql/진급배정판_추가클리닉_되돌리기.sql
-- ★ 지우는 변경이 없다 — 칸 하나를 **더하기만** 한다. 지금 있는 배정은 그대로다.

alter table public.class_move_assign add column if not exists extra_slot text;

comment on column public.class_move_assign.extra_slot is
  '따로 부르는 추가 클리닉 (lib/moveAssign.ts 의 EXTRA — 월·수·금 20:00~21:00 채움쌤). 비어 있으면 안 부른다.';

-- 확인 — 칸이 생겼고, 지금 있는 줄은 모두 비어 있어야 한다
select column_name, data_type, is_nullable from information_schema.columns
 where table_name = 'class_move_assign' and column_name = 'extra_slot';
select count(*) as 전체, count(extra_slot) as 추가클리닉_정해진줄 from public.class_move_assign;
