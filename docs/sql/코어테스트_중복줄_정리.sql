-- 2026-05-27 평가 기록 중복 줄 정리 (원장님 2026-11-20)
--
-- ★ 학생 이름은 적지 않는다 (원장님 2026-11-20). 줄 id 로만 가리킨다.
--
-- 한 학생의 5/27 기록에 5분 사이(04:48~04:53)에 네 줄이 들어갔다.
--   진단평가 88 (Lv4.0) · 진단평가 90 (Lv4.5) · 코어테스트 92(회차 없음) · 코어테스트 본고사 88
--
-- 원장님 확인: 진단평가 두 줄은 **6학년 과정 평가**이고, 코어테스트는 **본고사 88 하나**다.
--   · 진단평가 두 줄은 제목이 비어 있어 화면에서 무엇인지 알 수 없었다 → 제목을 채운다.
--   · 회차 없는 코어테스트 92 는 3분 뒤 「본고사 88」로 다시 적은 것이다 → 지운다.
--
-- 되돌리기: docs/sql/코어테스트_중복줄_정리_되돌리기.sql
-- 2026-11-20 운영에 적용 완료.

update public.exams set title = '6학년 평가'
where id in ('4cb02f57-bfff-41a8-9923-06ebe5a62cb5', '0155bdfb-10bf-4979-b4fd-be27ee879552')
  and exam_type = '진단평가' and title is null;

delete from public.exams
where id = '766104f9-fe32-4dd5-8517-eaf0bb53e1ac'
  and exam_type = '코어테스트' and title is null and score = 92 and exam_date = '2026-05-27';

-- 확인 — 세 줄이 남고, 코어테스트는 「본고사 88」 하나여야 한다
select exam_type, coalesce(title, '(비어 있음)') title, score, level
from public.exams
where student_id = '07a66269-59ee-4675-96f9-fc79c8f2dfbc'
  and exam_date = '2026-05-27'
order by created_at;
