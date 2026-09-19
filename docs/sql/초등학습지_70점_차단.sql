-- 초등 레벨학습지 70점 미만 차단 (DB 규칙)
--
-- ⚠️ 새 학습지관리 화면(재도전/오답유사/예외요청 버튼)이 Vercel에 배포된 "뒤에" 실행할 것.
--    옛 화면은 완료 처리 실패를 확인하지 않고 다음 레벨 학습지를 만들어서, 먼저 켜면 학습지가 꼬인다.
--
-- 규칙: 초등 본 학습지(main)가 70점 미만이면 passed로 닫을 수 있는 경우는
--   재도전(retry) / 오답유사(similar) / 원장(is_admin)의 예외(override_levelup, override_complete) 뿐.
-- 기록(worksheet_action_logs)은 이 함수가 같이 남긴다 - 기록 부분은 이미 적용돼 있고, 차단 부분만 추가된다.
-- 되돌리려면 raise exception 블록만 빼고 같은 함수를 다시 create or replace 하면 된다.

create or replace function public.worksheet_before_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'passed' and old.status is distinct from 'passed'
     and new.worksheet_type = 'main' and new.grade_level like '초%'
     and new.score is not null and new.score < 70
     and coalesce(new.last_action, '') not in ('retry', 'similar')
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
