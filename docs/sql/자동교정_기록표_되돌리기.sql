-- 되돌리기 — note_polish_log 삭제 (2026-10-13)
--
-- ★ 표를 지우면 「무엇을 고쳤는지」 기록도 같이 사라진다.
--   자동 교정을 계속 쓸 거라면 지우지 말 것.

drop table if exists public.note_polish_log;
