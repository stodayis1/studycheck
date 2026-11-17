-- 진급 배정판·고등 커리큘럼을 **볼 사람에 중등 선생님 세 분**을 더한다.
-- 원장님 2026-11-17 「권한 명단에 세분 더해줘」
--   (「초6 → 중등」 탭을 김은수·박경미·신애진 선생님께 보여드리려고. 원장님께
--    「이 명단에 더하면 고등 커리큘럼도 같이 보입니다」를 알려 드리고 고르신 길이다)
--
-- 명단은 app_settings.high_curriculum_teachers (users.id 목록)이고,
-- public.can_see_high_curriculum() 이 그 목록을 본다 (`a.value ? u.id::text`).
-- 이 명단은 `class_move_assign`(진급 배정판)과 `curriculum_plan_docs`(고등 커리큘럼)의
-- RLS 정책에 함께 쓰인다.
--
-- 되돌리기: docs/sql/진급배정판_중등선생님_추가_되돌리기.sql
--
-- ★ 있는 것을 **덮지 않고 더한다** — 2026-11-16 에 넣은 최대호·이규숙 선생님이 빠지면 안 된다.

-- ① 이름이 정확히 세 분에게만 걸리는지 먼저 본다 (동명이인이면 멈춘다)
do $$
declare n int;
begin
  select count(*) into n from public.users where name in ('김은수', '박경미', '신애진');
  if n <> 3 then
    raise exception '이름이 3명이 아니라 %명 걸립니다 — 동명이인을 확인하세요', n;
  end if;
end $$;

-- ② 기존 목록 + 세 분 (중복은 저절로 하나로)
update public.app_settings
   set value = (
         select jsonb_agg(distinct x order by x)
           from (
             select jsonb_array_elements_text(value) as x
             union
             select u.id::text from public.users u where u.name in ('김은수', '박경미', '신애진')
           ) t
       ),
       updated_at = now()
 where key = 'high_curriculum_teachers';

-- 확인 — 다섯 분(최대호·이규숙·김은수·박경미·신애진)이 나와야 한다
select u.name, u.role, coalesce(u.is_locked, false) as 잠김
  from public.app_settings a
  join public.users u on a.value ? u.id::text
 where a.key = 'high_curriculum_teachers'
 order by u.name;
