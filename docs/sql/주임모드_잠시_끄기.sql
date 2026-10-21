-- 김은수·박경미 선생님을 **본인 담당 학생만** 보이게 (학년주임 모드는 나중에)
--
-- 원장님 2026-10-21
--   「김은수 선생님, 박경미 강사는 본인 담당 학생만 보이게 하자.
--     학년주임 모드는 좀 나중에 쓸께」
--
-- supervisor_grades 를 비우면 그 계정은 **주임 계정이 아니게** 된다
-- (hooks/useAuth.ts · isSupervisorAccount). 주임모드 토글 자체가 사라지고,
-- 모든 화면에서 담당 학생만 보인다 — 평가관리·수업일지·반 관리 다 같은 규칙을 쓴다.
--
-- ★ 지우는 것이 아니라 **비우는** 것이라, 나중에 쓰실 때 학년만 다시 넣으면 그대로 돌아온다.
-- ★ 신애진 선생님(중1·2·3)은 **그대로 둔다** — 원장님이 두 분만 말씀하셨다.
begin;

update public.users set supervisor_grades = '{}'
where name in ('김은수', '박경미');

commit;

-- 확인
select name, role, supervisor_grades from public.users
where name in ('김은수','박경미','신애진') order by name;
