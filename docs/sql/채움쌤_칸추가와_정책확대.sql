-- 채움쌤(클리닉 담임) 칸을 더하고, 학생 조회·수정 정책을 그 칸까지 넓힌다 (2026-11-05)
-- 되돌리기: 채움쌤_칸추가와_정책확대_되돌리기.sql
--
-- 원장님 2026-11-05
--   메인 담임 = **키움쌤**(students.teacher_name) — 실력을 키운다. 진도와 전체 방향
--   클리닉 담임 = **채움쌤**(students.clinic_teacher_name) — 빈 곳을 채운다
--   「채움쌤도 학생 학습일지 같이 쓰고 볼수 있어야해」
--
-- ★ 칸만 더하면 **채움쌤에게 그 학생이 안 보인다.** 지금 두 정책이 teacher_name 한 칸만
--   보기 때문이다. 그래서 정책을 같이 넓힌다 — 이걸 빼먹으면 화면이 조용히 빈다.
-- ★ 학습일지(class_sessions)·알림장은 직원이면 쓸 수 있으므로, **학생이 보이면 쓰기는 따라온다.**
--   따로 손댈 정책이 없다.
-- ★ 더하기만 한다. 지우거나 좁히는 것이 없어서, 앱을 배포하기 **전에** 실행해도 아무 일이 없다.
--   (칸이 없는 채로 새 앱이 올라가면 학생 화면이 멈추므로 이 SQL 을 먼저 실행한다.)

begin;

alter table public.students add column if not exists clinic_teacher_name text;

comment on column public.students.teacher_name        is '키움쌤(메인 담임). 여러 명이면 쉼표·공백으로';
comment on column public.students.clinic_teacher_name is '채움쌤(클리닉 담임). 보는 범위·쓰는 범위는 키움쌤과 같다';

-- 조회 — 지금 정책에 **채움쌤 줄 하나만** 더한다. 나머지는 그대로다.
drop policy if exists staff_or_own on public.students;
create policy staff_or_own on public.students for select
  using (
    (select public.can_see_all_students())
    or ((select public.my_staff_name()) is not null
        and (select public.my_staff_name()) = any (
          regexp_split_to_array(coalesce(teacher_name, ''), '[,，、·/[:space:]]+')))
    -- ★ 채움쌤(클리닉 담임)도 자기 학생이 보여야 한다 (원장님 2026-11-05)
    or ((select public.my_staff_name()) is not null
        and (select public.my_staff_name()) = any (
          regexp_split_to_array(coalesce(clinic_teacher_name, ''), '[,，、·/[:space:]]+')))
    or (btrim(coalesce(grade, '')) = any (coalesce((select public.my_supervisor_grades()), '{}'::text[])))
    or (session_uid = (select auth.uid()))
    or (parent_session_uid = (select auth.uid()))
    or (is_test and (select public.is_staff()))
  );

-- 수정 — 같은 방식으로 한 줄만 더한다.
drop policy if exists staff_update on public.students;
create policy staff_update on public.students for update
  using (
    (select public.can_see_all_students())
    or ((select public.my_staff_name()) is not null
        and (select public.my_staff_name()) = any (
          regexp_split_to_array(coalesce(teacher_name, ''), '[,，、·/[:space:]]+')))
    or ((select public.my_staff_name()) is not null
        and (select public.my_staff_name()) = any (
          regexp_split_to_array(coalesce(clinic_teacher_name, ''), '[,，、·/[:space:]]+')))
    or (is_test and (select public.is_staff()))
  );

commit;

-- 확인
-- select policyname, cmd from pg_policies where schemaname='public' and tablename='students' order by 1;
-- select count(*) from public.students where clinic_teacher_name is not null;   -- 처음엔 0
--
-- ★ 맨몸 is_staff()/is_admin() 가 섞이면 줄마다 다시 돌아 앱 전체가 느려진다. 아래가 0 이어야 한다.
-- select count(*) from pg_policies where schemaname='public'
--   and (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
