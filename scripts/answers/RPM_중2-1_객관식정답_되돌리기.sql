-- 위 넣기의 되돌리기 (6문항)
update problems set answer_kind = 'image', answer_text = null
where id in (
  '61815'::bigint,
  '62089'::bigint,
  '62160'::bigint,
  '62491'::bigint,
  '62522'::bigint,
  '62579'::bigint
);
