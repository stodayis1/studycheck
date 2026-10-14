-- 「이도윤_중복계정_합치기.sql」을 되돌린다 — 지운 값 그대로 다시 넣고 수업을 돌려놓는다.

begin;

-- ⑤ 중복 학생 행 되살리기
insert into students (id, user_id, name, school, grade, class_group_id, parent_user_id,
  created_at, updated_at, class_time, teacher_name, parent_name, parent_phone, is_active,
  login_id, password_hint, textbook_grade, wise_step, session_uid, intake_notes, assigned_seen,
  student_last_login_at, parent_last_login_at, ops_student_id, on_leave, leave_start_date,
  leave_end_date, parent_session_uid, leave_reason)
values ('3db529d6-c8eb-4a8b-b6ad-d73bd3259854', null, '이도윤', '신원6', '6학년', null, null,
  '2026-10-14T10:42:15.263679+00:00', '2026-10-14T10:42:15.263679+00:00',
  '수17:00·2교시, 금17:00·2교시', '이규숙', '', '', true,
  '이도윤', null, 'B', 'W', null, null, true,
  null, null, null, false, null, null, null, null);

-- ④ 시간표
insert into schedules (id, student_id, day_of_week, start_time, is_active, created_at, periods) values
  ('113b2584-2894-4cb7-857b-1c02df05a006', '3db529d6-c8eb-4a8b-b6ad-d73bd3259854', '수', '17:00:00', true, '2026-10-14T10:42:15.381675+00:00', 2),
  ('6a74c970-a9a3-496c-8647-91483b3f8161', '3db529d6-c8eb-4a8b-b6ad-d73bd3259854', '금', '17:00:00', true, '2026-10-14T10:42:15.445243+00:00', 2);

-- ③ 교재
insert into student_textbooks (id, student_id, concept_id, textbook_name, textbook_type, status,
  memo, assigned_at, submitted_at, created_at, grade, semester, progress_percent,
  delete_requested_by, delete_requested_at, autostep_level, autostep_enabled, autostep_start_date, ssenb_step) values
  ('1a2da914-3886-4018-9400-16a7d4d08502', '3db529d6-c8eb-4a8b-b6ad-d73bd3259854', null, '개념+유형라이트', '개념서', 'assigned',
   null, '2026-10-14T12:02:58.358539+00:00', null, '2026-10-14T12:02:58.358539+00:00', '초6', 2, null, null, null, null, false, null, null),
  ('b4aab5dd-5441-45f0-8c0a-0a3e05c9cd2c', '3db529d6-c8eb-4a8b-b6ad-d73bd3259854', null, '디딤돌 연산', '연산서', 'assigned',
   null, '2026-10-14T12:03:18.683438+00:00', null, '2026-10-14T12:03:18.683438+00:00', '중1', 1, null, null, null, null, false, null, null);

-- ② 진도체크
insert into progress_checks (id, student_id, concept_id, check_count, updated_at, student_textbook_id, session_id) values
  ('8a9a5cd9-5011-4547-b5ff-913a58580007', '3db529d6-c8eb-4a8b-b6ad-d73bd3259854', '30c27d7f-d481-4d4e-b04d-6e3c8772c151', 1, '2026-10-14T12:03:56.325485+00:00', '1a2da914-3886-4018-9400-16a7d4d08502', '3293f501-0373-4a1a-a782-d9e6a181d1fb'),
  ('1cd625fe-7cb0-4b65-ac87-bfc1625b0d92', '3db529d6-c8eb-4a8b-b6ad-d73bd3259854', 'd9a4b3ff-8a24-4562-9736-d38316f0049b', 1, '2026-10-14T12:03:56.334800+00:00', '1a2da914-3886-4018-9400-16a7d4d08502', '3293f501-0373-4a1a-a782-d9e6a181d1fb');

-- ① 수업과 학습일지를 중복 계정으로 되돌리기
update class_sessions set student_id = '3db529d6-c8eb-4a8b-b6ad-d73bd3259854'
  where id = '3293f501-0373-4a1a-a782-d9e6a181d1fb';
update learning_notes set student_id = '3db529d6-c8eb-4a8b-b6ad-d73bd3259854'
  where id = '76977603-9b52-42d2-a5c4-bdbe96ae95a7';

commit;
