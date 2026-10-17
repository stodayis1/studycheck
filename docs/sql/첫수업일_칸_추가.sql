-- 학생의 **첫 수업일**을 스터디체크에도 둔다 (원장님 2026-10-17).
--
-- 왜
--   아직 수업을 시작하지 않은 학생이 「학습일지 미작성」으로 떴다. 등록하면서 시간표를
--   먼저 넣어 두기 때문이다. 첫 수업일은 수학OPS(students.first_class_date)에만 있고
--   스터디체크에는 칸이 없어서 아무도 안 보고 있었다.
--
--   10/16 기준 다섯 명 — 김동윤·김라윤·장백산(10/19 첫 수업), 장준우·장일우(10/20).
--   세 명은 실제로 그날 미작성 명단에 올라 담당 선생님께 알림까지 갈 뻔했다.
--
-- 어디에 쓰나
--   lib/expectedToday.ts 가 「그날 일지를 써야 하는 학생」을 고를 때 **첫 수업 전이면 뺀다.**
--   값은 OPS 에서 가져와 채운다(없으면 예전처럼 다 센다 — 안전한 쪽으로 기운다).

alter table public.students
  add column if not exists first_class_date date,
  add column if not exists first_class_time time;

comment on column public.students.first_class_date is
  '첫 수업일. 수학OPS students.first_class_date 에서 가져온다. 이 날 전에는 일지를 안 써도 된다.';
