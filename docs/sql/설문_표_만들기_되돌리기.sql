-- 「설문_표_만들기.sql」 되돌리기 — 표를 통째로 없앤다
--
-- ★ 표를 지우면 학부모님이 보내 주신 답도 같이 사라진다.
--   지우기 전에 반드시 내려받아 두실 것:
--     select * from public.survey_responses order by created_at;
begin;

drop table if exists public.survey_responses;

commit;

select tablename from pg_tables where tablename = 'survey_responses';
