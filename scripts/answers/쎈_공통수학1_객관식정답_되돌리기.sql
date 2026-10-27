-- 위 넣기의 되돌리기 (1문항)
update problems set answer_kind = 'image', answer_text = null
where id in (
  '46596'::bigint
);
