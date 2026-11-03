-- RPM 중1-1 — 분수 답이 숫자 하나로 들어가 있던 8문항을 그림 자기채점으로 되돌린다
-- 해설 PDF 는 분수를 「답 5」 / 「12」 두 줄로 적는데 그 중 한 쪽만 들어가 있었다.
-- 예: 0982 는 실제 답이 31/2 인데 2 로 들어가 있어, 바르게 쓴 학생이 오답이 되고
--     2 라고 쓴 학생이 정답이 됐다. 분수는 학생이 칠 수 없으니 그림을 보고 스스로 채점한다.
update problems set answer_kind = 'image', answer_text = null, answer_unit = null
where id in (
  '59886'::bigint,
  '60084'::bigint,
  '60129'::bigint,
  '60156'::bigint,
  '60470'::bigint,
  '60579'::bigint,
  '60580'::bigint,
  '60610'::bigint
);
