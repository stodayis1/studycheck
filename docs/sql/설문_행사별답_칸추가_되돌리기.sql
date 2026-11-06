-- 「설문_행사별답_칸추가.sql」 되돌리기 — answers 칸을 없앤다.
--
-- ★ 이 칸을 지우면 **별점·상담 체크·동의 기록이 같이 사라진다.**
--   지우기 전에 반드시 내려받아 두실 것:
--     select id, survey_key, student_name, created_at, answers
--     from public.survey_responses where answers <> '{}'::jsonb order by created_at;
begin;

alter table public.survey_responses drop column if exists answers;

commit;

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'survey_responses';
