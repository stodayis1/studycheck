-- 되돌리기 — 초등 레벨학습지 70점 차단을 **다시 건다**.
-- 적용: docs/sql/초등학습지_70점_차단_해제.sql
--
-- ★ 순서 — **앱을 먼저 되돌리고** 이것을 실행한다.
--   앱이 아직 「점수가 들어오면 닫는다」인 채로 이걸 걸면, 초등 70점 미만에서
--   update 가 에러로 떨어져 매쓰홀릭 긁어 넣기가 멈춘다.
--
-- 내용은 docs/sql/초등학습지_70점_차단.sql 과 같다.

create or replace function public.worksheet_before_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'passed' and old.status is distinct from 'passed'
     and new.worksheet_type = 'main' and new.grade_level like '초%'
     and new.score is not null and new.score < 70
     and coalesce(new.last_action, '') not in ('retry', 'retry_down', 'similar')
     and not (coalesce(new.last_action, '') in ('override_levelup', 'override_complete') and public.is_admin())
  then
    raise exception '초등 레벨학습지 70점 미만은 재도전 또는 오답유사로만 넘길 수 있어요 (예외는 원장 승인)'
      using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    insert into public.worksheet_action_logs
      (worksheet_id, student_id, event, action, from_status, to_status, score, current_level,
       grade_level, unit, semester, worksheet_type, actor_id, actor_name)
    values
      (new.id, new.student_id, 'status', new.last_action, old.status, new.status, new.score, new.current_level,
       new.grade_level, new.unit, new.semester, new.worksheet_type, auth.uid(),
       (select name from public.users where id = auth.uid()));
  end if;
  new.last_action := null;
  return new;
end $$;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select count(*) as 막는줄
from pg_proc where proname = 'worksheet_before_update'
  and prosrc like '%초등 레벨학습지 70점 미만은%';
-- 1 이면 다시 걸렸다.
