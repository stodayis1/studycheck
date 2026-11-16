-- 고등 커리큘럼을 원장님과 고등 강사에게만 (2026-11-16)
--
-- 왜: 원장님 「일단 고등 커리큘럼은 나, 고등 강사들에게만 보이게 해줘」(2026-11-16).
--     고등커리큘럼_표_추가.sql 은 직원 전체(is_staff)에게 열려 있었다.
--
-- 「고등 강사」를 누구로 보나: 따로 적어 둔 칸이 없어서, **지금 담당하는 재원생 중 고등학생(grade 가 「고」로 시작)이
--     한 명이라도 있는 강사**로 본다(students.teacher_name = users.name, is_active, 잠긴 계정 제외).
--     고등 학생을 맡으면 저절로 보이고, 다 넘기면 저절로 안 보인다.
--     2026-11-16 기준 해당: 주한 (고등 14명). 원장(role admin)은 늘 본다.
--
-- 안전한가: 정책을 **좁히는** 변경이다. 이 표를 읽는 곳은 app/teacher/high-curriculum 하나뿐이고(grep 확인),
--     적용할 때 표는 0행이었다. 학생·학부모는 원래도 못 봤다.
-- 되돌리기: docs/sql/고등커리큘럼_고등강사만_되돌리기.sql

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

comment on function public.can_see_high_curriculum() is
  '고등 커리큘럼(/teacher/high-curriculum)을 볼 수 있는가: 원장, 또는 재원 고등학생을 맡은 강사. 사이드바 메뉴도 이것으로 가린다.';

revoke all on function public.can_see_high_curriculum() from public;
grant execute on function public.can_see_high_curriculum() to authenticated;

drop policy if exists curriculum_plan_docs_staff_read on public.curriculum_plan_docs;
drop policy if exists curriculum_plan_docs_staff_insert on public.curriculum_plan_docs;
drop policy if exists curriculum_plan_docs_staff_update on public.curriculum_plan_docs;

drop policy if exists curriculum_plan_docs_high_read on public.curriculum_plan_docs;
create policy curriculum_plan_docs_high_read on public.curriculum_plan_docs
  for select to authenticated using ((select public.can_see_high_curriculum()));

drop policy if exists curriculum_plan_docs_high_insert on public.curriculum_plan_docs;
create policy curriculum_plan_docs_high_insert on public.curriculum_plan_docs
  for insert to authenticated with check ((select public.can_see_high_curriculum()));

drop policy if exists curriculum_plan_docs_high_update on public.curriculum_plan_docs;
create policy curriculum_plan_docs_high_update on public.curriculum_plan_docs
  for update to authenticated using ((select public.can_see_high_curriculum())) with check ((select public.can_see_high_curriculum()));

-- 확인
select tablename, policyname, cmd from pg_policies where tablename = 'curriculum_plan_docs' order by policyname;
