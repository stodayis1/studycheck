-- docs/sql/진급배정판_중등선생님_추가.sql 되돌리기.
-- 2026-11-16 상태(최대호·이규숙 두 분)로 돌린다. 그러면 중등 선생님 세 분은
-- 진급 배정판과 고등 커리큘럼이 **둘 다** 안 보인다.
--
-- 세 분만 빼고 그 뒤에 더한 사람은 남기려면 아래 update 대신 이렇게 한다:
--   update public.app_settings
--      set value = (select jsonb_agg(x) from (
--            select jsonb_array_elements_text(value) x) t
--            where x not in (select id::text from public.users
--                             where name in ('김은수','박경미','신애진'))),
--          updated_at = now()
--    where key = 'high_curriculum_teachers';

update public.app_settings
   set value = jsonb_build_array(
         '06b81b1d-7c7d-4b21-90aa-74203e47a911',  -- 이규숙
         '9eccc127-65fc-47db-9897-882507526369'   -- 최대호
       ),
       updated_at = now()
 where key = 'high_curriculum_teachers';

-- 확인 — 두 분만 나와야 한다
select u.name from public.app_settings a
  join public.users u on a.value ? u.id::text
 where a.key = 'high_curriculum_teachers' order by u.name;
