-- 진급 배정판을 **고등 커리큘럼과 다른 권한**으로 가른다.
-- 원장님 2026-11-17 「아니 전체 인원을 볼필요가 없어 / 진급 배정판만 보는 권한을 따로 만들자」
--   (초6 27명 중 13명의 담당인 조윤희·윤주희 선생님이 판을 못 보고 계셨다. 그렇다고
--    high_curriculum_teachers 에 넣으면 고등 커리큘럼까지 열린다)
--
-- 두 가지를 만든다
--   ① app_settings 'move_assign_teachers' — **진급 배정판만** 볼 사람 (users.id 목록)
--   ② can_see_move_assign() — 고등 커리큘럼을 볼 사람 **또는** 위 명단에 든 사람
--
-- 그래서 권한이 세 갈래가 된다
--   · 고등 커리큘럼 + 진급 배정판 전체 — 원장님 · 주한 · 최대호 · 이규숙 · 김은수 · 박경미 · 신애진
--   · 진급 배정판의 「초6 → 중등」 탭만  — 조윤희 · 윤주희 (초6 담당)
--   · 아무것도 아님                      — 행정 · 학생 · 학부모
--   (탭을 가리는 것은 화면이 한다 — can_see_high_curriculum() 이 false 면 「중3 → 고등」을
--    안 보여 주고, 서버 API 도 그 사람에게는 고등부 학생을 아예 안 내려 준다)
--
-- 되돌리기: docs/sql/진급배정판_권한분리_되돌리기.sql
-- ★ 지우는 변경이 없다 — 함수와 설정을 **더하고**, 정책 둘을 같은 뜻의 넓은 것으로 바꾼다.

-- ① 진급 배정판만 보는 사람 명단 (조윤희 · 윤주희)
do $$
declare n int;
begin
  select count(*) into n from public.users where name in ('조윤희', '윤주희');
  if n <> 2 then
    raise exception '이름이 2명이 아니라 %명 걸립니다 — 동명이인을 확인하세요', n;
  end if;
end $$;

insert into public.app_settings(key, value, updated_at)
values ('move_assign_teachers',
        (select coalesce(jsonb_agg(id::text order by id::text), '[]'::jsonb)
           from public.users where name in ('조윤희', '윤주희')),
        now())
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ② 진급 배정판을 볼 수 있나
create or replace function public.can_see_move_assign()
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.can_see_high_curriculum()
      or exists (
           select 1 from public.users u
           join public.app_settings a on a.key = 'move_assign_teachers'
           where u.id = auth.uid() and coalesce(u.is_locked, false) = false
             and u.role in ('admin', 'teacher', 'staff')
             and a.value ? u.id::text
         );
$function$;

-- ③ 표 정책을 새 함수로 (고등 커리큘럼 표 curriculum_plan_docs 는 그대로 둔다)
drop policy if exists class_move_assign_read on public.class_move_assign;
create policy class_move_assign_read on public.class_move_assign
  for select to authenticated
  using ((select public.can_see_move_assign()));

drop policy if exists class_move_assign_write on public.class_move_assign;
create policy class_move_assign_write on public.class_move_assign
  for all to authenticated
  using ((select public.can_see_move_assign()))
  with check ((select public.can_see_move_assign()));

-- 확인 ① 명단 두 분
select u.name from public.app_settings a join public.users u on a.value ? u.id::text
 where a.key = 'move_assign_teachers' order by u.name;

-- 확인 ② 정책이 새 함수를 보는지
select policyname, cmd, qual from pg_policies
 where schemaname = 'public' and tablename = 'class_move_assign' order by policyname;

-- 확인 ③ 맨몸 is_staff()/is_admin() 0건
select count(*) as 맨몸정책 from pg_policies where schemaname = 'public'
  and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
