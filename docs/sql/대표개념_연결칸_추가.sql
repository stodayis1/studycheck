-- 유형에 **대표개념**을 걸 수 있게 칸 하나 추가
--
-- 왜
--   자기주도학습에서 문항마다 '이건 무슨 개념인지'와 개념 동영상을 띄우려 한다.
--   문항은 27,359개(99.9%)가 유형코드를 갖고 있으므로 **유형에 한 번 걸면 전부 연결된다.**
--   그런데 type_learning_assets 에 개념을 가리킬 칸이 없었다.
--
-- 기존 칸은 건드리지 않는다. 되돌리기는 맨 아래.

begin;

alter table public.type_learning_assets
  add column if not exists concept_id uuid references public.concepts(id) on delete set null;

create index if not exists tla_concept_idx
  on public.type_learning_assets (concept_id);
-- 한 유형에 대표개념 줄은 하나만
create unique index if not exists tla_type_concept_uniq
  on public.type_learning_assets (type_code)
  where asset_type = 'concept';

commit;

-- 되돌리려면
--   drop index if exists public.tla_type_concept_uniq;
--   drop index if exists public.tla_concept_idx;
--   alter table public.type_learning_assets drop column if exists concept_id;
