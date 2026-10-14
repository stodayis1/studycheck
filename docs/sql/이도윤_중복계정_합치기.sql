-- 이도윤 학생의 **중복 계정**을 없애고, 오늘 수업 기록만 본계정으로 옮긴다 (원장님 2026-10-14).
--
-- 무슨 일이 있었나
--   2026-10-14 19:42 에 이규숙 선생님이 「학생 추가」로 이도윤을 하나 더 만들었다.
--   그 계정으로 오늘(10/14) 수업일지를 쓰셨다.
--
--   본계정  1aa28b6f…  초6 · 신원초 · 조윤희 이규숙 · 보호자 010-8308-5665 · OPS 연결됨
--   중복    3db529d6…  6학년 · 신원6 · 이규숙 · 보호자 번호 없음 · OPS 연결 없음
--
-- 무엇을 하나
--   ① 10/14 수업 기록과 학습일지 → 본계정으로 옮긴다 (본계정엔 10/14 기록이 없어 겹치지 않는다)
--   ② 진도체크 2건 → 지운다. 같은 개념이 본계정에 이미 있다(10/14 이전에 찍힌 것)
--   ③ 교재 2권 → 지운다. 「개념+유형라이트 초6-2」와 「디딤돌 연산 중1-1」 둘 다 본계정에 이미 있다
--   ④ 시간표 2줄 → 지운다
--   ⑤ 중복 학생 행 → 지운다
--
-- ★ 되돌리려면 docs/sql/이도윤_중복계정_합치기_되돌리기.sql 을 쓴다. 지운 값이 그대로 들어 있다.

begin;

-- ① 오늘 수업과 학습일지를 본계정으로
update class_sessions set student_id = '1aa28b6f-e575-4332-8fc0-aa97767a1fd8'
  where id = '3293f501-0373-4a1a-a782-d9e6a181d1fb';
update learning_notes set student_id = '1aa28b6f-e575-4332-8fc0-aa97767a1fd8'
  where id = '76977603-9b52-42d2-a5c4-bdbe96ae95a7';

-- ② 진도체크 — 본계정에 같은 개념이 이미 있다. 옮기면 한 개념이 두 줄이 된다.
delete from progress_checks
  where id in ('8a9a5cd9-5011-4547-b5ff-913a58580007', '1cd625fe-7cb0-4b65-ac87-bfc1625b0d92');

-- ③ 교재 — 본계정에 같은 교재가 이미 있다.
delete from student_textbooks
  where id in ('1a2da914-3886-4018-9400-16a7d4d08502', 'b4aab5dd-5441-45f0-8c0a-0a3e05c9cd2c');

-- ④ 시간표
delete from schedules
  where id in ('113b2584-2894-4cb7-857b-1c02df05a006', '6a74c970-a9a3-496c-8647-91483b3f8161');

-- ⑤ 중복 학생 행
delete from students where id = '3db529d6-c8eb-4a8b-b6ad-d73bd3259854';

commit;

-- 확인
-- select id, name, grade, school, teacher_name, parent_phone from students where name = '이도윤';
-- select session_date, session_type, progress_content from class_sessions
--   where student_id = '1aa28b6f-e575-4332-8fc0-aa97767a1fd8' and session_date >= '2026-10-12';
