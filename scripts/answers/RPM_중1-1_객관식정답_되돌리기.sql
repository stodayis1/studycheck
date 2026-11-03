-- 위 넣기의 되돌리기 (17문항)
update problems set answer_kind = 'image', answer_text = null
where id in (
  '59638'::bigint,
  '59673'::bigint,
  '59791'::bigint,
  '59901'::bigint,
  '59964'::bigint,
  '59979'::bigint,
  '60081'::bigint,
  '60115'::bigint,
  '60163'::bigint,
  '60250'::bigint,
  '60339'::bigint,
  '60383'::bigint,
  '60401'::bigint,
  '60441'::bigint,
  '60584'::bigint,
  '60593'::bigint,
  '60601'::bigint
);
