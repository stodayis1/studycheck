-- 쌍둥이를 「짝」에서 「묶음」으로 (2026-10-22)
--
-- 왜 하나
--   같은 문제가 교재 3~4권에 실린다. twin_id 는 칸이 하나라 짝 하나밖에 못 담는데,
--   앱은 이미 「쌍둥이 문제 0~3개 추가」를 받게 돼 있다(app/api/book-pick/route.ts).
--   같은 묶음 번호를 가진 문항끼리 서로 쌍둥이로 본다.
--
-- twin_id 는 지우지 않는다 — 기존 쎈↔쎈B 4,025쌍이 그대로 들어 있고,
-- 혹시 못 고친 코드가 있어도 전처럼 돈다.

alter table public.problems add column if not exists twin_group bigint;
create index if not exists problems_twin_group_idx on public.problems (twin_group);

comment on column public.problems.twin_group is
  '쌍둥이 묶음 번호. 같은 값을 가진 문항끼리 서로 쌍둥이(숫자만 다른 같은 문제)다. 묶음 번호는 그 묶음에서 가장 작은 id 를 쓴다.';

-- 기존 짝(쎈↔쎈B)을 묶음으로 옮긴다 — 두 문항 중 작은 id 를 묶음 번호로
update public.problems p
   set twin_group = least(p.id, p.twin_id)
 where p.twin_id is not null
   and p.twin_group is null;
