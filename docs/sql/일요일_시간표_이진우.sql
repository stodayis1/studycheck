-- 일요일 수업 시간표 — 이진우(고1) 배정
--
-- 원장님 2026-10-17
--   「지금 일요일 수업 시간표가 없네 / 일요일에 오는 학생있거든
--     고1 이진우학생은 화목7-10시 일요일 9-12시로 배정해줘야해
--     오늘 토요일인데 시간표에 이진우 학생이 뜬다」
--
-- 왜 이런 일이 생겼나
--   schedules.day_of_week 는 그냥 글자라서 '일' 을 넣는 데 아무 제약이 없다
--   (이미 윤민아 학생이 화17:30·목17:30·일09:00 로 들어가 있다).
--   막혀 있던 건 **화면의 요일 고르는 칸**이었다 — 학생관리·반관리·학습일지 모두
--   ['월','화','수','목','금','토'] 여서 일요일을 고를 수가 없었다. 그건 코드에서 고쳤다.
--
-- 이 파일이 바꾸는 것 — 이진우 학생 한 명
--   · 토 09:00 줄을 지운다 (오늘 토요일 시간표에 떠서 결석으로 눌릴 뻔했다)
--   · 일 09:00 3교시 줄을 넣는다 (09-12시. 윤민아 학생과 같은 시간)
--   · 화·목 19:00 3교시는 **이미 맞다** — 손대지 않는다
--   · class_time 글자를 「고등 화목토2반」 → 「고등 화목일2반」 로 고친다 (표시용)
--   · 수학OPS 쪽 schedule_days ['화','목','토'] → ['화','목','일'] 은 OPS 프로젝트에서
--     따로 돌려야 한다 (DB 가 완전히 분리돼 있다). 아래 주석에 문장을 적어 뒀다.
begin;

delete from public.schedules
where student_id = (select id from public.students where name = '이진우' and is_active)
  and day_of_week = '토';

insert into public.schedules (student_id, day_of_week, start_time, periods, is_active)
select id, '일', '09:00'::time, 3, true
from public.students where name = '이진우' and is_active;

update public.students
set class_time = '고등 화목일2반', updated_at = now()
where name = '이진우' and is_active and class_time = '고등 화목토2반';

commit;

-- 확인
select s.name, sc.day_of_week, sc.start_time, sc.periods
from public.schedules sc join public.students s on s.id = sc.student_id
where s.name = '이진우' order by sc.day_of_week;

-- ★ 수학OPS(rofnofcgkewbabnijcsu) 에서 돌릴 것 — 학생목록 카드가 schedule_days 로 요일을 그린다
-- update public.students set schedule_days = array['화','목','일']
-- where id = '8dd542a8-5540-4d19-b76c-307abafd0f3f';
