-- docs/sql/진급배정판_권한분리.sql 되돌리기.
-- 진급 배정판을 다시 **고등 커리큘럼과 같은 권한**으로 돌린다.
-- 그러면 조윤희·윤주희 선생님은 판을 못 보신다(배정 기록 자체는 그대로 남는다).

drop policy if exists class_move_assign_read on public.class_move_assign;
create policy class_move_assign_read on public.class_move_assign
  for select to authenticated
  using ((select public.can_see_high_curriculum()));

drop policy if exists class_move_assign_write on public.class_move_assign;
create policy class_move_assign_write on public.class_move_assign
  for all to authenticated
  using ((select public.can_see_high_curriculum()))
  with check ((select public.can_see_high_curriculum()));

-- 명단은 비워 둔다 (지우지 않고 빈 목록으로 — 다시 켜기 쉽게)
update public.app_settings set value = '[]'::jsonb, updated_at = now()
 where key = 'move_assign_teachers';

-- 함수는 남겨도 아무 데서도 안 쓰이지만, 깨끗이 치우려면:
--   drop function if exists public.can_see_move_assign();
--   ★ 먼저 쓰는 데가 없는지 본다:
--     select policyname, tablename from pg_policies
--      where coalesce(qual,'') || coalesce(with_check,'') like '%can_see_move_assign%';

-- 확인 — 정책이 can_see_high_curriculum 을 보고, 명단이 비어 있어야 한다
select policyname, qual from pg_policies
 where schemaname='public' and tablename='class_move_assign' order by policyname;
select value from public.app_settings where key = 'move_assign_teachers';
