-- 정답에 단위가 붙은 문항을 자동 채점하려고 단위를 따로 둔다 (원장님 2026-10-27)
--   answer_kind='number' · answer_text='8' · answer_unit='cm'
--   → 학생은 숫자만 치고, 채점은 숫자만 비교한다. 화면에는 「8 cm」로 보인다.
-- 지금까지는 단위가 붙으면 글자 정답으로 못 넣어 전부 학생 자기채점(그림)이었다.
alter table public.problems add column if not exists answer_unit text;
comment on column public.problems.answer_unit is
  '정답에 붙는 단위(cm · ° · % · 개 · 원 …). answer_kind=''number'' 일 때만 쓴다. 채점은 숫자만 비교한다.';
