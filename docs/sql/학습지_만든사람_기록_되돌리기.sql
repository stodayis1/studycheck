-- 「학습지_만든사람_기록.sql」 되돌리기 — 더한 칸을 뺀다
--
-- ★ 칸을 빼면 그동안 기록된 「만든 사람」도 같이 사라진다. 학습지 자체는 그대로다.
begin;

drop index if exists public.exam_sheets_created_by_idx;

alter table public.exam_sheets
  drop column if exists created_by,
  drop column if exists created_by_name;

commit;

select column_name from information_schema.columns
where table_name = 'exam_sheets' order by ordinal_position;
