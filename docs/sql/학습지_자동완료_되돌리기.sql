-- 「학습지 자동 완료」 되돌리기 — 초등 레벨학습지 70점 미만 막이를 **다시 세운다**.
--
-- ★ 되돌릴 때는 **코드를 먼저** 되돌린다(또는 되돌릴 배포를 먼저 올린다).
--   앱이 아직 「다 닫는다」 쪽이면, 이 막이를 세우는 순간 초등 70점 미만 점수 채우기가
--   트리거에 걸린다. 앱은 그 거절을 알아보고 'scored' 로 되돌려 넣으니 **점수는 남지만**,
--   선생님 화면에는 「완료」 눌러야 하는 줄이 다시 생긴다.
-- ★ 이미 닫힌 줄(passed)은 이 SQL 로 **되돌아가지 않는다.** 되돌려야 하면 아래 ③을 보고
--   원장님께 확인받은 뒤에만 손댄다 — 점수·상태 줄은 함부로 바꾸지 않는다.

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

-- 확인 ────────────────────────────────────────────────────────────────────
-- ① 막이가 돌아왔나 — **1** 이어야 한다
select count(*) as 막이
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'worksheet_before_update'
  and pg_get_functiondef(p.oid) like '%70점 미만%';

-- ② 자동 완료로 닫힌 초등 70점 미만 줄 — 되돌릴지 원장님께 **먼저 여쭌다**
select s.name, w.grade_level, w.unit, w.current_level, w.score, w.submitted_at::date
from public.student_worksheets w join public.students s on s.id = w.student_id
where w.worksheet_type = 'main' and w.grade_level like '초%'
  and w.score < 70 and w.status = 'passed'
order by w.submitted_at desc limit 50;
