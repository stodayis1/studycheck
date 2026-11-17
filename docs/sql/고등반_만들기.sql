-- 고등 반(공통·W·I·S·E) 만들기 (2026-11-17)
--
-- 왜: 원장님 2026-11-17 — 고등 커리큘럼의 반별 계획을 그 반 학생의 학습일지에 그대로 잇는다.
--     먼저 학생이 어느 반인지 앱이 알아야 한다. 1단계는 반을 만들고 학생을 넣는 데까지다.
--
-- 어디에: 이미 있던 class_groups 표와 students.class_group_id 칸을 쓴다.
--     둘 다 만들어만 두고 쓰지 않던 것이다(2026-11-17 기준 class_groups 0행, class_group_id 가 찬 학생 0명).
--     앱에서 class_group_id 를 읽는 곳은 app/parent/child/page.tsx 의 목업(MOCK_CLASSES) 하나뿐이고,
--     거기는 id 가 안 맞으면 반 이름을 비워 둘 뿐이다.
--
-- 무엇을: class_groups 에 칸 3개를 **더하고**, 고1·고2 × 공통·W·I·S·E 10개 반을 넣는다.
--   curriculum_grade  'g1' | 'g2'  (고등 커리큘럼 화면의 학년 키)
--   class_key         'common' | 'W' | 'I' | 'S' | 'E'
--   sort_order        화면 순서
--
-- 권한: class_groups 는 원래 직원(is_staff) 전용 정책 하나(staff_only)다. 그대로 둔다.
--      학생을 반에 넣는 것은 students 의 기존 수정 정책을 따른다 — 원장·직원은 전체, 강사는 본인 담당 학생만.
--      students 를 고치면 기존 audit_students 트리거가 변경 기록에 남긴다.
--
-- 안전한가: 칸·행을 **더하는** 것뿐이다. 학생 정보는 이 SQL 로 바뀌지 않는다.
-- 되돌리기: docs/sql/고등반_만들기_되돌리기.sql

alter table public.class_groups add column if not exists curriculum_grade text;
alter table public.class_groups add column if not exists class_key text;
alter table public.class_groups add column if not exists sort_order int;

create unique index if not exists class_groups_curriculum_uq
  on public.class_groups (curriculum_grade, class_key) where curriculum_grade is not null;

-- teacher_id 는 비울 수 없는 칸이라 원장님(role admin) 계정으로 둔다. 반 담당이 정해지면 그때 바꾼다.
insert into public.class_groups (name, description, curriculum_grade, class_key, sort_order, teacher_id)
select g.label || ' ' || k.label, '고등 커리큘럼 반 (/teacher/high-curriculum)', g.key, k.key, g.ord * 10 + k.ord,
       (select id from public.users where role = 'admin' order by created_at limit 1)
from (values ('g1', '고1', 1), ('g2', '고2', 2)) as g(key, label, ord)
cross join (values ('common', '공통', 0), ('W', 'W반', 1), ('I', 'I반', 2), ('S', 'S반', 3), ('E', 'E반', 4)) as k(key, label, ord)
on conflict do nothing;

-- 확인 (10행)
select name, curriculum_grade, class_key, sort_order from public.class_groups
 where curriculum_grade is not null order by sort_order;
