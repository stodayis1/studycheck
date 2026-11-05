-- 채움쌤_칸추가와_정책확대.sql 되돌리기 (2026-11-05)
--
-- ★ 정책만 되돌린다. **칸(clinic_teacher_name)은 지우지 않는다** —
--   지우면 선생님들이 적어 둔 채움쌤이 전부 사라진다. 칸은 남아 있어도 아무 일도 안 한다.
--   정말 칸까지 지워야 하면 맨 아래 줄의 주석을 직접 푸시고, **그 전에 백업**하세요:
--     select id, name, clinic_teacher_name from public.students where clinic_teacher_name is not null;
--
-- 되돌리면 채움쌤에게는 그 학생이 **안 보이게** 된다(키움쌤·주임·원장님은 그대로).

begin;

drop policy if exists staff_or_own on public.students;
create policy staff_or_own on public.students for select
  using (
    (select public.can_see_all_students())
    or ((select public.my_staff_name()) is not null
        and (select public.my_staff_name()) = any (
          regexp_split_to_array(coalesce(teacher_name, ''), '[,，、·/[:space:]]+')))
    or (btrim(coalesce(grade, '')) = any (coalesce((select public.my_supervisor_grades()), '{}'::text[])))
    or (session_uid = (select auth.uid()))
    or (parent_session_uid = (select auth.uid()))
    or (is_test and (select public.is_staff()))
  );

drop policy if exists staff_update on public.students;
create policy staff_update on public.students for update
  using (
    (select public.can_see_all_students())
    or ((select public.my_staff_name()) is not null
        and (select public.my_staff_name()) = any (
          regexp_split_to_array(coalesce(teacher_name, ''), '[,，、·/[:space:]]+')))
    or (is_test and (select public.is_staff()))
  );

commit;

-- 칸까지 지우려면 (백업 뒤에):
-- alter table public.students drop column if exists clinic_teacher_name;
