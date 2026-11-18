-- 학습지 자동 완료 — 초등 레벨학습지 70점 미만 **막이를 푼다** (원장님 2026-11-18)
--
-- 왜
--   원장님 「아예 스터디체크에서는 학습지 관리를 별도로 안하고, 매쓰홀릭에서 긁어서 올린것만
--   알아서 결과로 올리면 되는거니까 굳이 수기로 또 입력하거나 재도전 배정을 하거나 안해도
--   될거잖아」 · 「다 닫자 — 재도전 배정 안 함」.
--   재도전 학습지는 선생님이 매쓰홀릭에서 내시고(「다시풀기」·「오답과제」) 그것이 다시
--   긁혀 들어온다. 스터디체크에서 배정할 일이 없다.
--
--   11/12~11/18 에 점수가 들어온 314건 중 304건은 이미 저절로 닫혔고, 남은 10건이 모두
--   이 막이에 걸린 것이었다(초등 본 학습지 70점 미만 5건 · 초등 오답유사 5건).
--
-- ★ 순서: **이 SQL 을 먼저** 돌리고 앱을 배포한다. 반대로 되어도 점수는 안 사라진다 —
--   앱이 트리거 거절(P0001)을 알아보고 예전처럼 'scored' 로 되돌려 넣는다(점수만은 남긴다).
-- ★ 점수를 보고 그리는 화면은 그대로다 — 「70점 못 넘기고 멈춘 단원」·「70점 미만 처리」
--   표는 상태가 아니라 **점수**를 보므로 계속 보인다. 막이만 없애는 것이다.
-- ★ 처리 기록(worksheet_action_logs)을 남기는 부분은 **그대로 둔다** — 그게 이 트리거의
--   본래 일이다. 지우면 누가 무엇을 눌렀는지 자취가 사라진다.
--
-- 되돌리기: docs/sql/학습지_자동완료_되돌리기.sql

create or replace function public.worksheet_before_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- ★ 2026-11-18: 초등 70점 미만 막이를 **뺐다**. 아래 raise exception 블록이 있던 자리다.
  --   (되돌리려면 docs/sql/학습지_자동완료_되돌리기.sql 을 돌린다 — 그 블록이 그대로 들어 있다.)
  if new.status is distinct from old.status then
    insert into public.worksheet_action_logs
      (worksheet_id, student_id, event, action, from_status, to_status, score, current_level,
       grade_level, unit, semester, worksheet_type, actor_id, actor_name)
    values
      (new.id, new.student_id, 'status', new.last_action, old.status, new.status, new.score, new.current_level,
       new.grade_level, new.unit, new.semester, new.worksheet_type, auth.uid(),
       (select name from public.users where id = auth.uid()));
  end if;
  new.last_action := null;
  return new;
end $$;

-- 확인 ────────────────────────────────────────────────────────────────────
-- ★ 주석을 빼고 본다. 함수 안에 「70점 미만」·「raise exception」이라고 **적어 둔 주석**이
--   있어서, 글자만 찾으면 막이가 없는데도 있다고 나온다 (2026-11-18 에 실제로 그랬다).
with src as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'worksheet_before_update'
), 주석뺀것 as (
  select string_agg(l, chr(10)) as code
  from src, lateral regexp_split_to_table(replace(def, chr(13), ''), chr(10)) as l
  where btrim(l) !~ '^--'
)
select
  (select count(*) from 주석뺀것 where code ilike '%raise exception%')      as 남은_막이,      -- 0 이어야 한다
  (select count(*) from 주석뺀것 where code ilike '%worksheet_action_logs%') as 기록_남김;      -- 1 이어야 한다

-- 트리거가 아직 붙어 있나
select tgname, tgenabled from pg_trigger
where tgrelid = 'public.student_worksheets'::regclass and not tgisinternal;

-- 점수가 있는데 안 닫힌 줄 — 날마다 브리핑 예약이 쓸어 담는다(lib/worksheetSweep.ts)
select count(*) as 점수있는데_안닫힌것 from public.student_worksheets
where score is not null and status <> 'passed';
