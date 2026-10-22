-- 되돌리기 — 2026-10-22_twin_requests.sql 로 만든 표를 통째로 지운다.
-- ⚠ 쌓인 요청 기록도 함께 사라진다 (이미 문제은행에 넣은 쌍둥이 문항은 problems 에 그대로 남는다).
--   남겨야 하면 먼저 백업: create table twin_requests_backup as select * from public.twin_requests;
-- 넣은 쌍둥이 문항까지 빼려면 따로: select id from problems where book = '쌍둥이';  ← 지우기 전에 반드시 원장님 확인

drop table if exists public.twin_requests;
