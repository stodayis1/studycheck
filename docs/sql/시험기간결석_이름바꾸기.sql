-- 「시험기간」 → 「시험기간 결석」 (2026-10-08)
--
-- 왜: 버튼 이름이 「시험기간」이면 출석인지 결석인지 안 보인다는 원장님 지적.
--     버튼을 「시험기간 결석」으로 바꾸면서 이미 저장된 기록도 같이 옮긴다.
--
-- 안전한가: learning_notes.attendance 에 CHECK 제약이 없다(2026-10-08 확인). 값만 바꾸면 끝이다.
--     토큰 리포트(report_links)의 jsonb 스냅샷은 찍힌 순간의 글자가 얼어 있어 못 바꾸지만,
--     코드가 lib/attendance.ts 의 isExamAbsence() 로 옛 이름도 같이 받아 준다.
--
-- 바꾸기 전 개수: 7건 (2026-10-08 21시 기준)

begin;

update public.learning_notes
   set attendance = '시험기간 결석'
 where attendance = '시험기간';

-- 확인 — '시험기간' 0건, '시험기간 결석' 7건이어야 한다
select attendance, count(*) as 건수
  from public.learning_notes
 where attendance like '시험기간%'
 group by 1;

commit;
