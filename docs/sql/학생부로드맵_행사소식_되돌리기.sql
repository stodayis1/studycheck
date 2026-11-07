-- 학생부로드맵_행사소식.sql 되돌리기
-- ★ 모은 행사·보낸 기록이 사라진다. 쓰기 시작했으면 먼저 CSV 로 내려받아 둔다:
--     select * from public.career_events;  select * from public.career_news_sends;

drop table if exists public.career_news_sends;
drop table if exists public.career_events;

-- 확인 (0줄)
select tablename from pg_tables where schemaname = 'public' and tablename in ('career_events', 'career_news_sends');
