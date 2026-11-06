-- 신입상담_알림기록.sql 되돌리기 (2026-11-06)
--
-- ★ 표를 지우면 **누구에게 알렸는지 기록이 사라진다.** 크론이 다시 돌면 이미 알린 학생에게
--   같은 알림이 한 번 더 간다(기준일이 CATCHUP_DAYS 안쪽인 학생만).
--   수학OPS 전달사항에 이미 꽂힌 줄은 그대로 남는다 — 그건 OPS 쪽 자료다.

begin;

drop policy if exists staff_all on public.new_student_consult_notices;
drop table if exists public.new_student_consult_notices;

commit;
