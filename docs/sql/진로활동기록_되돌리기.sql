-- 진로활동기록.sql 되돌리기
--
-- ★ 이 표들에는 동의 기록·설문 답·세특이 쌓인다. 쓰기 시작한 뒤에 되돌리면 **그 기록이 사라진다.**
--   먼저 백업을 뜬다:
--     select * from public.career_consents;  select * from public.career_surveys;  select * from public.student_activities;
--   (Supabase 표 화면에서 CSV 로 내려받아 둔다.)
--   쓰기 전(행 0개)이라면 그냥 지워도 된다:
--     select (select count(*) from public.career_consents) c, (select count(*) from public.career_surveys) s,
--            (select count(*) from public.student_activities) a;

drop table if exists public.career_surveys;
drop table if exists public.career_consents;
drop table if exists public.student_activities;

-- 확인 (0줄이어야 한다)
select tablename from pg_tables where schemaname = 'public'
  and tablename in ('career_consents', 'career_surveys', 'student_activities');
