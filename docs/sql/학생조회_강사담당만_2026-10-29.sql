-- 강사는 본인 담당 학생만, 주임은 담당 학년까지 (원장님 2026-10-29)
--
-- 왜
--   students 조회 정책이 is_staff() 하나였다. is_staff() 는 admin·teacher·staff 를 다 참으로
--   보기 때문에, **강사 계정도 재원·휴원 196명 전부를 읽을 수 있었다.** 화면(canViewStudent)
--   에서만 본인 담당으로 걸러 보여 줬을 뿐이라, 학생관리를 열면 브라우저 안에는 전원의
--   이름·학교·보호자 전화번호·상담메모까지 내려와 있었다.
--
-- 바뀌는 범위 (적용 전 미리 계산한 값 — 지금 화면에 보이는 숫자와 같다)
--   원장·행정(김정은·승민정)  196행  … 그대로
--   신애진(중등주임)           102행  … 중1~중3 전체. 강사모드 화면은 지금처럼 본인 37명
--   김은수 33 · 박경미 30 · 윤주희 30 · 조윤희 26 · 이규숙 17 · 주한 14 · 최대호 0
--   학생·학부모                본인 1행 … 그대로 (session_uid / parent_session_uid)
--
-- 수정(UPDATE)도 같이 좁힌다. 화면은 isEditable 로 막고 있었지만 DB 는 안 막고 있어서,
-- 강사 계정 토큰으로 남의 학생 정보를 고칠 수 있었다. 주임은 보기 전용이다(화면과 같은 규칙).
--
-- ★ 느려지지 않게: 계정을 보는 부분은 (select ...) 로 감싸 행마다 돌지 않게 한다.
--   memory/rls-is-staff-must-be-wrapped 참고.

-- 1. 내가 전체를 봐도 되는 사람인가 (원장·행정)
create or replace function public.can_see_all_students()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin', 'staff')
  );
$$;

-- 2. 내 이름 (students.teacher_name 과 글자로 맞춘다). 직원 계정이 아니면 null.
create or replace function public.my_staff_name()
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select u.name from public.users u
  where u.id = auth.uid() and u.role in ('admin', 'teacher', 'staff');
$$;

-- 3. 내가 주임으로 맡은 학년. 아니면 빈 배열.
create or replace function public.my_supervisor_grades()
returns text[] language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(u.supervisor_grades, '{}'::text[]) from public.users u where u.id = auth.uid();
$$;

-- 조회
-- ★ 담당 강사 칸은 「조윤희, 이규숙」처럼 쉼표로도, 「조윤희 이규숙」처럼 띄어쓰기로도 적힌다.
--   lib/teachers.ts 의 splitTeachers 와 **같은 구분자**를 써야 한쪽만 안 보이는 일이 없다.
drop policy if exists staff_or_own on public.students;
create policy staff_or_own on public.students for select using (
  (select public.can_see_all_students())
  or (
    (select public.my_staff_name()) is not null
    and (select public.my_staff_name()) = any (
      regexp_split_to_array(coalesce(teacher_name, ''), '[,，、·/[:space:]]+')
    )
  )
  or btrim(coalesce(grade, '')) = any (coalesce((select public.my_supervisor_grades()), '{}'::text[]))
  or session_uid = (select auth.uid())
  or parent_session_uid = (select auth.uid())
);

-- 수정 (주임 범위는 넣지 않는다 — 주임은 보기 전용)
drop policy if exists staff_update on public.students;
create policy staff_update on public.students for update using (
  (select public.can_see_all_students())
  or (
    (select public.my_staff_name()) is not null
    and (select public.my_staff_name()) = any (
      regexp_split_to_array(coalesce(teacher_name, ''), '[,，、·/[:space:]]+')
    )
  )
);
