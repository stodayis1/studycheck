-- 코어테스트_범위표.sql 되돌리기 (2026-11-05)
--
-- ★ 표를 통째로 지운다. 범위는 원장님이 주신 표에서 옮겨 적은 것이라 다시 넣을 수 있다
--   (docs/sql/코어테스트_범위표.sql 을 다시 실행하면 그대로 돌아온다).
--   학생 기록은 한 줄도 들어 있지 않으므로 지워도 잃는 자료는 없다.

begin;

drop policy if exists everyone_read on public.core_test_ranges;
drop policy if exists staff_all     on public.core_test_ranges;
drop table if exists public.core_test_ranges;

commit;
