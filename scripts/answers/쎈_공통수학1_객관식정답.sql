-- 쎈 공통수학1 — 자르기가 못 읽고 넘어간 객관식 1문항을 글자 정답으로
-- ①~⑤ 로 넣는다 (app/api/grade/[code] 의 choiceDigits 가 그것만 읽는다).
update problems p set answer_kind = 'choice', answer_text = v.txt
from (values
  ('46596'::bigint, '②')
) as v(id, txt)
where p.id = v.id;
