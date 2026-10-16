-- 하루에 **학습지 과제를 여러 개** 낼 수 있게 한다 (원장님 2026-10-16).
--
-- 왜
--   과제배부 화면에 진행중 학습지가 여러 개 떠도 **하나만** 고를 수 있었다.
--   저장 칸(class_sessions.hw_worksheet_range)이 글 한 줄짜리라서다. 안 고른 학습지는
--   학부모 브리핑에도 학생 앱에도 안 나갔고, 달성률도 「학습지 1건」으로만 셌다.
--   10/16 기준 진행중 학습지가 2개 이상인 학생이 19명, 그중 5명은 아예 안 골라서
--   브리핑에 학습지 과제가 빠진 채 나갔다.
--
-- 무엇을 더하나
--   hw_worksheet_ids — 그날 과제로 낸 학습지들의 id. 글(hw_worksheet_range)은 그대로
--   두고 **여러 개를 ' / ' 로 이어** 적는다. 화면·브리핑·학생 앱이 그 글을 그대로 쓰므로
--   표시는 바로 된다. id 목록은 **달성률을 학습지마다 세기 위해** 따로 둔다.

alter table public.class_sessions
  add column if not exists hw_worksheet_ids uuid[];

comment on column public.class_sessions.hw_worksheet_ids is
  '그날 과제로 낸 학습지(student_worksheets) id 들. 글 표시는 hw_worksheet_range 가 한다.';
