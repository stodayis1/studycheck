-- 「쌍둥이 묶음」 되돌리기 (2026-10-22)
-- twin_id 는 건드리지 않았으므로 칸만 지우면 원래대로 돌아간다.
drop index if exists problems_twin_group_idx;
alter table public.problems drop column if exists twin_group;
