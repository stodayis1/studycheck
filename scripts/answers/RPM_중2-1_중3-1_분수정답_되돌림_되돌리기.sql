-- 위의 되돌리기 (옛 값이 틀린 값이므로 보통 쓸 일이 없다)
update problems p set answer_kind = v.kind, answer_text = v.txt
from (values
  ('65145'::bigint, '15', 'number'),
  ('65299'::bigint, '8', 'number'),
  ('65300'::bigint, '12', 'number'),
  ('65301'::bigint, '10', 'number'),
  ('65302'::bigint, '5', 'number'),
  ('65312'::bigint, '10', 'number'),
  ('65313'::bigint, '-2', 'number'),
  ('65314'::bigint, '-15', 'number'),
  ('65315'::bigint, '4', 'number'),
  ('65333'::bigint, '5', 'number'),
  ('65334'::bigint, '3', 'number'),
  ('65335'::bigint, '3', 'number'),
  ('65336'::bigint, '6', 'number'),
  ('65371'::bigint, '186', 'number'),
  ('65457'::bigint, '2', 'number'),
  ('65458'::bigint, '14', 'number'),
  ('65460'::bigint, '2', 'number'),
  ('61888'::bigint, '27', 'number')
) as v(id, txt, kind)
where p.id = v.id;
