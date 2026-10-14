-- 「죽은_시간표_치우기.sql」을 되돌린다 — 보관해 둔 줄을 그대로 다시 넣는다.
begin;
alter table public.schedules disable trigger audit_schedules;
insert into public.schedules select * from public.schedules_dead_backup
  on conflict (id) do nothing;
alter table public.schedules enable trigger audit_schedules;
drop table public.schedules_dead_backup;
commit;
