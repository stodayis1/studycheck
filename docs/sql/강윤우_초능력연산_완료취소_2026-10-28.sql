-- 강윤우(초3) 초능력연산 초3 2학기 — 강사가 다른 학생 것과 헷갈려 「완료」를 잘못 눌렀다.
-- 원장님 요청(2026-10-28)으로 진행중으로 되돌린다.
--
-- 안전 확인: 이 교재는 연산서라 완료 처리해도 학기 진도 일괄반영(markSemesterMastered)이 돌지 않는다.
--   적용 전 실측 — 이 교재에 달린 진도 0건, 이 학생의 오늘 바뀐 진도 0건. 즉 상태 한 칸만 되돌리면 끝이다.
update student_textbooks set status = 'assigned'
where id = '09cb9d34-cec8-4586-b5f2-6c81446d886e' and status = 'completed';
