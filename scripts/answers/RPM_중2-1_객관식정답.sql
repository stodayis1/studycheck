-- RPM 중2 — 자르기가 못 읽고 넘어간 객관식 6문항을 글자 정답으로
-- ①~⑤ 로 넣는다 (app/api/grade/[code] 의 choiceDigits 가 그것만 읽는다).
update problems p set answer_kind = 'choice', answer_text = v.txt
from (values
  ('61815'::bigint, '③'),
  ('62089'::bigint, '②'),
  ('62160'::bigint, '④'),
  ('62491'::bigint, '④'),
  ('62522'::bigint, '②'),
  ('62579'::bigint, '⑤')
) as v(id, txt)
where p.id = v.id;
