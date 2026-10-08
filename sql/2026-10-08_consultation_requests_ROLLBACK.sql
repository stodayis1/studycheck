-- 되돌리기 — 2026-10-08_consultation_requests.sql 로 만든 표를 통째로 지운다.
-- ⚠ 그동안 쌓인 상담 요청 기록도 함께 사라진다. 남겨야 하면 먼저 백업:
--   create table consultation_requests_backup as select * from public.consultation_requests;

drop table if exists public.consultation_requests;
