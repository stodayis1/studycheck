-- 초등 레벨학습지 70점 차단을 **푼다** (원장님 2026-11-14).
--
-- 왜
--   「70점 미만 재도전 레벨다운 오답유사도 그냥 안해도 될거 같아. 어차피 선생님들이 알아서
--    하시거든. 그럼 매쓰홀릭에 학습지 제목에 오답유사로 나오니까 그걸로 대체하는게 좋을듯해」
--
--   앱이 재도전을 강제로 배정하던 길을 걷는다. 선생님이 매쓰홀릭에서 오답유사를 내시면
--   제목에 「오답유사」가 찍혀 그대로 학습지가 된다 — 배정을 앱에서 또 하지 않는다.
--
-- ★ 순서 — **이 SQL 을 먼저 적용하고 앱을 배포한다.**
--   거꾸로 하면, 점수가 들어온 초등 70점 미만 학습지를 닫으려다 이 트리거에 막혀
--   update 가 에러로 떨어지고 **매쓰홀릭 긁어 넣기가 통째로 멈춘다.**
--   먼저 적용해도 지금 앱은 그대로 돈다 — 막이가 없어질 뿐, 앱이 아직 닫지 않는다.
--
-- ★ 없애는 것은 **막는 것뿐**이다. 기록(worksheet_action_logs)은 그대로 남긴다.
--   「멈춘 단원」 목록·레벨 현황판은 status 가 아니라 **점수**로 판정하므로(getUnitPass)
--   70점을 못 넘긴 단원은 닫혀도 계속 보인다.
--
-- 되돌리기: docs/sql/초등학습지_70점_차단_해제_되돌리기.sql
-- 원래 파일: docs/sql/초등학습지_70점_차단.sql (되돌리기가 그 내용과 같다)

create or replace function public.worksheet_before_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- ★ 2026-11-14: 여기 있던 「초등 70점 미만 차단」 raise 를 뺐다. 아래 기록은 그대로다.
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
-- 막는 줄이 사라졌는가 (0 이어야 한다)
select count(*) as 막는줄
from pg_proc where proname = 'worksheet_before_update'
  and prosrc like '%초등 레벨학습지 70점 미만은%';

-- 기록하는 줄은 남았는가 (1 이어야 한다)
select count(*) as 기록줄
from pg_proc where proname = 'worksheet_before_update'
  and prosrc like '%worksheet_action_logs%';
