-- 「학습지과제_여러개.sql」을 되돌린다. ★ 그 칸에 쌓인 값도 같이 사라진다.
alter table public.class_sessions drop column if exists hw_worksheet_ids;
