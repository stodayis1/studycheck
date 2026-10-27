-- 위의 되돌리기 — 다시 옛 값으로 (옛 값이 틀린 값이므로 보통 쓸 일이 없다)
update problems p set answer_kind = v.kind, answer_text = v.txt
from (values
  ('59886'::bigint, '-3', 'number'),
  ('60084'::bigint, '2', 'number'),
  ('60129'::bigint, '12', 'number'),
  ('60156'::bigint, '3', 'number'),
  ('60470'::bigint, '2', 'number'),
  ('60579'::bigint, '4', 'number'),
  ('60580'::bigint, '3', 'number'),
  ('60610'::bigint, '16', 'number')
) as v(id, txt, kind)
where p.id = v.id;
