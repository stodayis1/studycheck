-- 고등 커리큘럼을 볼 선생님을 이름으로 더한다 (2026-11-16)
--
-- 왜: 원장님 2026-11-16 — 고등 학생을 맡은 강사(주한) 말고도 최대호·이규숙 선생님이 봐야 한다.
--     두 분은 지금 담당 고등학생이 없어 「고등 학생을 맡은 강사」 기준에 안 걸린다.
--
-- 어떻게: app_settings 의 key 'high_curriculum_teachers' 에 users.id 목록을 둔다.
--     can_see_high_curriculum() = 원장 or 고등학생 담당 강사 or 이 목록에 있는 잠기지 않은 직원.
--     사람을 더하거나 빼려면 이 목록만 고치면 된다(앱 배포 필요 없음):
--       update public.app_settings set value = value || '["<users.id>"]'::jsonb, updated_at = now()
--        where key = 'high_curriculum_teachers';
--
-- 안전한가: 볼 사람을 **더하는** 쪽이다. 데이터는 그대로다.
-- 되돌리기: docs/sql/고등커리큘럼_볼사람_추가_되돌리기.sql

insert into public.app_settings(key, value, updated_at)
values ('high_curriculum_teachers',
        (select coalesce(jsonb_agg(id::text order by name), '[]'::jsonb) from public.users where name in ('최대호', '이규숙')),
        now())
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.can_see_high_curriculum()
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and coalesce(u.is_locked, false) = false
      and (
        u.role = 'admin'
        or (u.role in ('admin','teacher','staff') and exists (
          select 1 from public.app_settings a
          where a.key = 'high_curriculum_teachers' and a.value ? u.id::text
        ))
        or (u.role = 'teacher' and exists (
          select 1 from public.students s
          where s.teacher_name = u.name and s.is_active and s.grade like '고%'
        ))
      )
  );
$$;

-- 확인: 볼 수 있는 사람 이름
select u.name from public.users u
 where coalesce(u.is_locked,false) = false and (u.role = 'admin'
   or exists (select 1 from public.app_settings a where a.key='high_curriculum_teachers' and a.value ? u.id::text)
   or (u.role='teacher' and exists (select 1 from public.students s where s.teacher_name=u.name and s.is_active and s.grade like '고%')))
 order by 1;
