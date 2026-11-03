-- ⚠️⚠️ **이 파일은 실행하지 않습니다 — 045 되돌리기가 대신합니다.** (2026-10-29)
--
-- 짝이 되는 설치본(043)이 폐기됐다. 되돌리기는
-- `docs/sql/migrations/045_learning_actions_rollback.sql` 을 본다 —
-- 차단 · 이번 묶음 정리 · 기능 철수를 **세 단계로** 갈라 두었다 (045 §2).
--
-- 이 파일은 기록으로만 둔다. 실행하지 마십시오.

-- 043_learning_actions_rollback.sql — 되돌리기 (초안)
--
-- 상태: **초안이다. 실행하지 않았다.**
--
-- 043 §3-C 가 못 박은 것
--   「rollback 은 그 범위만 정리. `DROP TABLE` 이나 전체 `WHERE is_test` 삭제를
--    기본안으로 쓰지 않는다.」
--   「사용 전 중단/비활성화도 구분한다.」
--
-- 그래서 세 단계로 나눈다. **위에서부터** 필요한 만큼만 쓴다.

-- ════════════════════════════════════════════════════════════════════
-- 1단계 — 멈추기만 한다 (자료를 지우지 않는다)
-- ════════════════════════════════════════════════════════════════════
--
-- 새 기록이 들어오지 못하게 함수 권한을 거둔다.
-- 이미 쌓인 것은 그대로 두고 읽을 수 있다. **가장 먼저 이것만 해 본다.**

-- revoke execute on function public.apply_learning_action(
--   uuid, bigint, text, text, text, text, text, text, timestamptz, jsonb, text, uuid)
--   from authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════
-- 2단계 — **이번 run 의 기록만** 치운다
-- ════════════════════════════════════════════════════════════════════
--
-- `run_id` 를 **반드시** 적는다. 비워 두면 아무것도 지우지 않는다.
-- 시험 계정 UUID 까지 함께 걸어 두 겹으로 막는다.

-- \set run_id '여기에-이번-run_id'
-- \set s1 '시험계정-UUID-1'
-- \set s2 '시험계정-UUID-2'
--
-- delete from public.learning_actions
--  where run_id = :'run_id'
--    and student_id in (:'s1'::uuid, :'s2'::uuid);
--
-- delete from public.learning_attempts
--  where run_id = :'run_id'
--    and student_id in (:'s1'::uuid, :'s2'::uuid);
--
-- 지우기 전에 **몇 줄인지 먼저 센다**:
-- select count(*) from public.learning_actions
--  where run_id = :'run_id' and student_id in (:'s1'::uuid, :'s2'::uuid);

-- ════════════════════════════════════════════════════════════════════
-- 3단계 — 표를 아예 없앤다 (**기본안이 아니다**)
-- ════════════════════════════════════════════════════════════════════
--
-- 1·2단계로 충분하지 않고, 이 기능을 완전히 접기로 **정했을 때만** 쓴다.
-- 이 표들은 기존 운영 객체를 참조만 하므로 지워도 기존 기능에 영향이 없다.
-- 그래도 지우기 전에 2단계로 내용을 먼저 확인한다.

-- drop function if exists public.apply_learning_action(
--   uuid, bigint, text, text, text, text, text, text, timestamptz, jsonb, text, uuid);
-- drop table if exists public.learning_actions;
-- drop table if exists public.learning_attempts;

-- ════════════════════════════════════════════════════════════════════
-- 건드리지 않는 것
-- ════════════════════════════════════════════════════════════════════
--
-- 이 되돌리기는 다음에 **손대지 않는다**:
--   gradings · grading_answers · video_watch_logs · learning_notes ·
--   lesson_videos · problems · standard_types · type_learning_assets · students
--
-- 설치 때도 그 표들을 고치지 않았으므로 되돌릴 것이 없다.
