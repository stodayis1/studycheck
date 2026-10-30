-- 시간표변경요청_2026-10-29.sql 되돌리기
-- ★ 표를 지우면 올라온 요청 기록도 같이 사라진다. 먼저 남은 요청이 있는지 본다:
--     select status, count(*) from public.schedule_change_requests group by 1;
drop table if exists public.schedule_change_requests;
