-- 학교가 빈칸이던 재원생 7명 채우기 (2026-10-09)
--
-- 왜 비어 있었나: 원장님이 2026-09-19 에 **OPS 학생목록**에 학교를 입력하셨다.
--   학생 정보 연동은 「스터디체크 → OPS」 한 방향이라 OPS 에 넣은 값은 반대로 오지 않는다.
--   스터디체크 쪽 students.updated_at 이 등록일(2026-05-15)에서 한 번도 움직이지 않은 것으로
--   확인했다 — 누가 지운 것이 아니라 애초에 채워진 적이 없다.
--
-- 값은 원장님이 직접 적어 주신 것이고, OPS 에 들어 있는 값과 **정확히 일치**한다.
-- 학교 이름은 lib/school.ts 규칙(초등학교→초·중학교→중·고등학교→고)에 이미 맞는 모양이다.
--
-- 되돌리기: docs/sql/빈_학교_채우기_되돌리기.sql

begin;

update public.students st set school = v.school
  from (values
  ('f54874ae-ecb2-44f5-9b52-32d34ef65dcb'::uuid, '신원중'),  -- 최서현 중1
  ('a6888181-71fd-4a62-8427-8e4e4dd8ac50'::uuid, '지축중'),  -- 최건희 중2
  ('f6ee4395-865d-4274-821a-31c359fa3467'::uuid, '원흥중'),  -- 김준희 중3
  ('e0e86e98-ad28-4425-bcde-d67c93176668'::uuid, '신원중'),  -- 노우석 중3
  ('ee9086e5-d57f-4afe-af29-b0ad2689e3ea'::uuid, '신원중'),  -- 신성우 중3
  ('30bf9181-265a-4463-86fe-f7734207b23c'::uuid, '신원중'),  -- 이은서 중3
  ('e6813358-1b72-45f5-b731-f8cc32d1cf0b'::uuid, '신원초')   -- 홍성준 초6
) as v(id, school)
 where v.id = st.id;

-- 확인 — 빈 학교 0명이어야 한다
select count(*) as 학교_빈_재원생 from public.students
 where is_active and coalesce(nullif(trim(school), ''), '') = '';

commit;
