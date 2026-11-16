-- 고등커리큘럼_볼사람_추가.sql 되돌리기 — 이름 목록 없이 「원장 + 고등학생 담당 강사」로 돌린다.

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
        or (u.role = 'teacher' and exists (
          select 1 from public.students s
          where s.teacher_name = u.name and s.is_active and s.grade like '고%'
        ))
      )
  );
$$;

delete from public.app_settings where key = 'high_curriculum_teachers';
