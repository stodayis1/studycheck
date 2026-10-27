-- 객관식(choice)인데 정답이 「3」 「2,5」 처럼 숫자로 들어간 1839문항 → ①~⑤ 로 바꾼다 (2026-10-27)
--
-- 왜: QR 채점(app/api/grade/[code]/route.ts choiceDigits)은 ①~⑤ 글자만 정답으로 읽는다.
--   숫자로 들어간 문항은 정답 번호가 빈 목록이 되어 **학생이 무엇을 골라도 오답**으로 채점된다.
--   답지(app/api/answer-key)도 같은 방식이라 정답 표시가 비었다. 2026-10-27 까지 채점 기록은 0건(피해 없음).
-- 교재: 개념+유형 개념편 1 · 개념+유형 유형편 477 · RPM 1361
-- 되돌리기: 객관식_숫자정답_되돌리기.sql
update problems
set answer_text = replace(translate(answer_text, '12345', '①②③④⑤'), ',', ', ')
where answer_kind = 'choice' and answer_text ~ '^[1-5](,[1-5])*$';
