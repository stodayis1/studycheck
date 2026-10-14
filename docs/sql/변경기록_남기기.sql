-- 학생·시간표를 **누가 언제 어떻게** 바꿨는지 남긴다 (원장님 2026-10-14).
--
-- 왜
--   이도윤 학생 중복 계정을 조사할 때, students 표에 만든 사람·고친 사람 칸이 없어서
--   Supabase 접속 기록을 뒤져 알아냈다. 그 기록은 **24시간만** 남는다 — 하루만 지났어도
--   누가 했는지 영영 알 수 없었다.
--
-- 어떻게
--   트리거로 남긴다. 화면에서 고치든 API 로 고치든 스크립트로 고치든 **빠짐없이** 걸린다.
--   앱 코드를 고치는 방식이면 빠뜨리는 길이 생긴다.
--
-- 무엇을 남기나
--   누가(auth.uid() + 그때의 이름) · 언제 · 어느 표 · 넣기/고치기/지우기 · 어느 줄 ·
--   바뀐 칸만(before/after). 전체를 통째로 남기면 금방 무거워진다.

begin;

create table if not exists public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  table_name  text not null,
  op          text not null,            -- insert · update · delete
  row_id      uuid,
  row_label   text,                     -- 사람이 알아보는 이름(학생 이름 등)
  changed     jsonb                     -- {칸: {before, after}} · 넣기/지우기는 줄 전체
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id);

alter table public.audit_log enable row level security;

drop policy if exists staff_read on public.audit_log;
create policy staff_read on public.audit_log
  for select to authenticated using ((select public.is_staff()));
-- 쓰기 정책은 두지 않는다. 트리거(security definer)만 쓴다.

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
  v_changed jsonb := '{}'::jsonb;
  v_label text;
  k text;
begin
  select name into v_name from public.users where id = v_actor;

  if tg_op = 'UPDATE' then
    -- 바뀐 칸만 담는다
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(new) -> k is distinct from to_jsonb(old) -> k and k <> 'updated_at' then
        v_changed := v_changed || jsonb_build_object(
          k, jsonb_build_object('before', to_jsonb(old) -> k, 'after', to_jsonb(new) -> k));
      end if;
    end loop;
    if v_changed = '{}'::jsonb then
      return new;                       -- 실제로 바뀐 게 없으면 남기지 않는다
    end if;
  elsif tg_op = 'INSERT' then
    v_changed := to_jsonb(new);
  else
    v_changed := to_jsonb(old);
  end if;

  if tg_table_name = 'students' then
    v_label := coalesce((to_jsonb(coalesce(new, old)) ->> 'name'), '');
  else
    v_label := coalesce((to_jsonb(coalesce(new, old)) ->> 'student_id'), '');
  end if;

  insert into public.audit_log (actor_id, actor_name, table_name, op, row_id, row_label, changed)
  values (v_actor, coalesce(v_name, '(앱·스크립트)'), tg_table_name, lower(tg_op),
          (to_jsonb(coalesce(new, old)) ->> 'id')::uuid, v_label, v_changed);

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_students on public.students;
create trigger audit_students
  after insert or update or delete on public.students
  for each row execute function public.write_audit_log();

drop trigger if exists audit_schedules on public.schedules;
create trigger audit_schedules
  after insert or update or delete on public.schedules
  for each row execute function public.write_audit_log();

commit;

-- 보는 법
-- select at, actor_name, table_name, op, row_label, changed
--   from audit_log order by at desc limit 50;
