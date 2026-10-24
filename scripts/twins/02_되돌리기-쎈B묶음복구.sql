-- 위 되살리기의 되돌리기 (2026-10-24)
-- 되살린 것은 「twin_id 는 있는데 twin_group 이 비어 있던」 문항뿐이고,
-- 그 값은 least(id, twin_id) 다. 그 규칙으로 들어간 것만 도로 비운다.
-- (공통수학2 묶음은 findings 로 다시 이어 붙인 것이라 값이 달라 여기 안 걸린다.)

update public.problems
   set twin_group = null
 where twin_id is not null
   and twin_group = least(id, twin_id)
   and grade in ('중2', '중3')
   and book in ('쎈', '쎈B');
