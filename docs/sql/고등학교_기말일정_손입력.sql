-- 고등학교 2학기 기말(2차 정기시험) 일정 손입력
--
-- 원장님 2026-11-07 「백양고는 시험이 아직 안떴네 / 방학만 있고」 → 「기말날짜 찾은거 달력에 넣어줘」
--
-- ★ 왜 손으로 넣나
--   이 네 학교는 시험을 **나이스 학사일정에 올리지 않는다**(학교 홈페이지에만 올린다).
--   그래서 매주 화요일 자동 받아오기(OPS /api/school-calendar/sync)로는 영원히 안 들어온다.
--   자동 받아오기는 source='neis' 인 줄만 지우고 다시 넣으므로, 아래 source='manual' 줄은
--   다음 갱신에도 그대로 남는다.
--
-- ★ 어디서 읽었나 (2026-11-07 확인)
--   백양고      https://paikyang-h.goegy.kr  학사일정 화면
--   신원고      https://sinwon-h.goegy.kr    학사일정 화면
--   고양동산고  2026.02.25 공지 「2026학년도 학사일정」 그림 (화면 달력은 4월까지만 채워져 있음)
--   고양국제고  2026.02.26 공지 「2026학년도 학사일정」 PDF
--   뒤 두 곳은 2월에 낸 연간 계획이라 그 뒤 바뀌었을 수 있다 — 시험 2주 전 가정통신문으로 한 번 더 맞춘다.
--
-- ★ 3학년
--   네 학교 모두 12월 시험은 1·2학년만이다(3학년은 수능 뒤라 따로 없거나 11월에 끝난다).
--   신원고·고양국제고는 11월에 3학년 시험이 따로 있어 줄을 나눠 넣는다.
--   고양동산고는 학사일정에 3학년 시험이 아예 없어 1·2학년으로만 넣는다.

insert into public.school_schedule_periods
  (school, kind, event_name, start_date, end_date, grade1, grade2, grade3, source)
values
  -- 백양고 — 2차 정기시험(1,2학년). 주말을 사이에 두고 두 토막이다
  ('백양고',     'exam', '2차 정기시험', '2026-12-02', '2026-12-04', true,  true,  false, 'manual'),
  ('백양고',     'exam', '2차 정기시험', '2026-12-07', '2026-12-08', true,  true,  false, 'manual'),
  -- 신원고
  ('신원고',     'exam', '2차 정기시험(3학년)', '2026-11-24', '2026-11-25', false, false, true,  'manual'),
  ('신원고',     'exam', '2차 정기시험', '2026-12-07', '2026-12-11', true,  true,  false, 'manual'),
  -- 고양동산고 — 역시 두 토막
  ('고양동산고', 'exam', '2차 정기시험', '2026-12-09', '2026-12-11', true,  true,  false, 'manual'),
  ('고양동산고', 'exam', '2차 정기시험', '2026-12-14', '2026-12-15', true,  true,  false, 'manual'),
  -- 고양국제고
  ('고양국제고', 'exam', '2차 정기시험(3학년)', '2026-11-23', '2026-11-26', false, false, true,  'manual'),
  ('고양국제고', 'exam', '2차 정기시험', '2026-12-08', '2026-12-11', true,  true,  false, 'manual');

-- 확인 — 8줄이 들어갔는지, 학교 이름이 students.school 과 같은 꼴인지
select school, event_name, start_date, end_date, grade1, grade2, grade3, source
  from public.school_schedule_periods
 where source = 'manual' and kind = 'exam'
 order by start_date, school;
