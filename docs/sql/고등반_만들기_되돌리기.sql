-- 고등반_만들기.sql 되돌리기
--
-- ★ 반을 지우면 그 반에 넣은 학생의 class_group_id 가 비워진다(ON DELETE SET NULL) — 반 편성이 사라진다.
--   지우기 전에 편성을 뽑아 둔다:
--     select s.name, s.grade, g.name as 반 from public.students s join public.class_groups g on g.id = s.class_group_id
--      where g.curriculum_grade is not null order by g.sort_order, s.name;
--   화면만 내리고 싶으면 이 SQL 은 돌리지 말고 앱 배포만 되돌린다.

delete from public.class_groups where curriculum_grade is not null;
drop index if exists public.class_groups_curriculum_uq;
alter table public.class_groups drop column if exists sort_order;
alter table public.class_groups drop column if exists class_key;
alter table public.class_groups drop column if exists curriculum_grade;
