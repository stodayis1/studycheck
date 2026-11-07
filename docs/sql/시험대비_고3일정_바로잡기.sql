-- 시험대비(exam_schedule) 2학기 기말 — 고3 날짜 바로잡기 + 고양국제고 넣기
--
-- 원장님 2026-11-07 「고3날짜 고치고 고양국제고 넣어줘」
--
-- ★ 왜 틀어져 있었나
--   시험일정은 「고등학교는 같은 학교면 1·2·3학년 시험일이 모두 같다」는 규칙으로 세 학년을
--   한꺼번에 넣는다(app/teacher/exam-prep/page.tsx handleSaveSchedule). 중간고사까지는 맞지만
--   **2학기 기말은 다르다** — 고3은 수능 뒤라 11월에 일찍 끝내거나 아예 없다.
--   그래서 10/08 에 넣은 2학기 기말 고3 줄이 1·2학년 날짜를 그대로 쓰고 있었다.
--
-- ★ 학교 학사일정에서 읽은 것 (2026-11-07)
--   신원고      고3 11/24~25     · 1,2학년 12/07~11
--   봉일천고    고3 11/23~27     · 1,2학년 12/14~18        (나이스에도 같게 들어 있음)
--   고양국제고  고3 11/23~26     · 1,2학년 12/08~11        (시험일정에 아예 없었다)
--   고양일고    고3 **없음**(11월은 자율교육과정·현장체험학습, 12월은 「2차 정기시험(1,2)」)
--   백양고      고3 **없음**(12월 시험이 「2차 정기시험(1,2학년)」)
--   고양동산고  고3 **없음**(학사일정에 3학년 시험이 없다)
--
-- ★ 없는 시험은 줄을 지운다. 그대로 두면 그 학교 고3에게 **없는 시험의 대비**가 잡힌다
--   (고양일고에 고3 학생이 1명 있다). 지우기 전에 확인했고 고3 배정은 0건이었다.
--   고3이 생기면 학교 공지를 보고 그때 넣는다.

-- 1) 날짜가 틀린 고3 줄을 고친다
update public.exam_schedule set exam_date = '2026-11-24'
 where school_name = '신원고'   and grade = '3' and exam_name = '2학기 기말고사';
update public.exam_schedule set exam_date = '2026-11-23'
 where school_name = '봉일천고' and grade = '3' and exam_name = '2학기 기말고사';

-- 2) 고3 시험이 없는 학교는 줄을 지운다
delete from public.exam_schedule
 where grade = '3' and exam_name = '2학기 기말고사'
   and school_name in ('고양일고', '백양고', '고양동산고');

-- 3) 고양국제고를 넣는다 (학교 이름은 students.school 과 같은 꼴이어야 걸린다 — normalizeSchool)
insert into public.exam_schedule (school_name, grade, exam_name, exam_date, created_by)
values
  ('고양국제고', '1', '2학기 기말고사', '2026-12-08', '학교 학사일정(2026-11-07)'),
  ('고양국제고', '2', '2학기 기말고사', '2026-12-08', '학교 학사일정(2026-11-07)'),
  ('고양국제고', '3', '2학기 기말고사', '2026-11-23', '학교 학사일정(2026-11-07)');

-- 확인
select school_name, grade, exam_date from public.exam_schedule
 where exam_name = '2학기 기말고사' order by school_name, grade;
