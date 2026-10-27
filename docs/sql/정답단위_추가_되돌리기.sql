-- 위 정답단위_추가.sql 의 되돌리기. 칸을 지우면 적어 둔 단위도 함께 사라진다.
alter table public.problems drop column if exists answer_unit;
