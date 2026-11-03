-- RPM 중1 — 자르기가 못 읽고 넘어간 객관식 17문항을 글자 정답으로
-- ①~⑤ 로 넣는다 (app/api/grade/[code] 의 choiceDigits 가 그것만 읽는다).
update problems p set answer_kind = 'choice', answer_text = v.txt
from (values
  ('59638'::bigint, '④'),
  ('59673'::bigint, '③'),
  ('59791'::bigint, '③'),
  ('59901'::bigint, '①, ⑤'),
  ('59964'::bigint, '③'),
  ('59979'::bigint, '⑤'),
  ('60081'::bigint, '③'),
  ('60115'::bigint, '⑤'),
  ('60163'::bigint, '④'),
  ('60250'::bigint, '①'),
  ('60339'::bigint, '②'),
  ('60383'::bigint, '③'),
  ('60401'::bigint, '②'),
  ('60441'::bigint, '⑤'),
  ('60584'::bigint, '③'),
  ('60593'::bigint, '⑤'),
  ('60601'::bigint, '①')
) as v(id, txt)
where p.id = v.id;
