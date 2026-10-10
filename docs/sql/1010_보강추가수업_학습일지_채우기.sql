-- 10/10 보강·추가수업 학습일지를 스터디체크에 채워 넣기 (2026-10-10)
--
-- 왜: 최윤실 선생님이 오늘 OPS 에 적으신 학습일지가 **연동 배포 전**에 저장돼서
--     스터디체크로 넘어오지 않았다. 오늘 이후 저장분은 자동으로 넘어온다.
--     (OPS api/makeups/push-lesson · api/extra-classes/push-to-studycheck)
--
-- 하는 일: 그 날짜(2026-10-10)로 class_sessions 와 learning_notes 를 만든다.
--     코드가 하는 것과 똑같다 — session_type 은 '보강'/'추가수업',
--     memo 는 '[OPS 보강] ...' 로 시작한다(나중에 다시 밀어도 덮어쓸 수 있게 하는 표시).
--
-- ★ 그날 이미 수업·학습일지가 있으면 건드리지 않는다.
-- 되돌리기: docs/sql/1010_보강추가수업_학습일지_채우기_되돌리기.sql

begin;

-- ① 수업(세션) 만들기 — 없는 학생만
insert into public.class_sessions (student_id, session_date, session_type, progress_content, created_by)
select st.id, '2026-10-10'::date, v.label, v.textbook, '수학OPS(' || v.label || ')'
  from (values
    ('김정연', '보강',     '쎈B 5-2'),
    ('신연우', '보강',     null),
    ('이로운', '보강',     '리피트 1-2'),
    ('이선호', '보강',     '쎈B 5-2'),
    ('이하정', '보강',     '쎈B 6-2'),
    ('강시온', '추가수업', '쎈B 6-2'),
    ('박나현', '추가수업', '쎈 1-1'),
    ('이도윤', '추가수업', '개념유형라이트 6-2')
  ) as v(name, label, textbook)
  join public.students st on st.name = v.name and st.is_active
 where not exists (
   select 1 from public.class_sessions c
    where c.student_id = st.id and c.session_date = '2026-10-10');

-- ② 학습일지 — 그 세션에 아직 학습일지가 없는 경우만
insert into public.learning_notes
  (student_id, session_id, attendance, worksheet_unit, worksheet_score,
   worksheet_submitted, textbook_submitted, workbook_done, memo)
select st.id, c.id, '정시', v.worksheet, v.score,
       v.worksheet is not null, v.textbook is not null, false, v.memo
  from (values
    ('김정연', '쎈B 5-2',            null::text, null::int, '[OPS 보강] 10:00 분수의 곱셈 오답, 합동과 대칭 대표문제 B+ 문제 풀이'),
    ('신연우', null,                 '3-2 2단원 레벨학습지 lv2', 92, '[OPS 보강] 10:00 오답유사 진행 완료'),
    ('이로운', '리피트 1-2',          null, null, '[OPS 보강] 10:00 작도와 합동 유형풀이, 서술형 풀이 (오답 미진행)'),
    ('이선호', '쎈B 5-2',            null, null, '[OPS 보강] 10:00 교재 1,2 단원 오답 고쳐지지 않은 부분 고치기 진행했습니다. 일부 B+ 심화 문제 남아있습니다'),
    ('이하정', '쎈B 6-2',            null, null, '[OPS 보강] 10:00 공간과 입체 풀이, 오답'),
    ('강시온', '쎈B 6-2',            null, null, '[OPS 추가수업] 10:00 소수의 나눗셈까지 오답 중 안고친 문제 마무리 / 소수의 나눗셈 남은 개념 중 대표문제 풀이'),
    ('박나현', '쎈 1-1',             null, null, '[OPS 추가수업] 10:00 정수와 유리수의 계산 단원 / 각 개념 별 대표문제 풀고 상문제 일부 풀이'),
    ('이도윤', '개념유형라이트 6-2',   null, null, '[OPS 추가수업] 10:00 원의 둘레와 넓이 개념 4 전까지 오답 고치기 / 개념 5 개념 설명완료')
  ) as v(name, textbook, worksheet, score, memo)
  join public.students st on st.name = v.name and st.is_active
  join public.class_sessions c on c.student_id = st.id and c.session_date = '2026-10-10'
 where not exists (select 1 from public.learning_notes n where n.session_id = c.id);

-- 확인 — 8명이 보여야 한다
select st.name, c.session_type, n.attendance, left(n.memo, 40) as 메모
  from public.class_sessions c
  join public.students st on st.id = c.student_id
  left join public.learning_notes n on n.session_id = c.id
 where c.session_date = '2026-10-10' and c.session_type in ('보강', '추가수업')
 order by st.name;

commit;
