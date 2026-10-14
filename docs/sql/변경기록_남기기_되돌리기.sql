-- 「변경기록_남기기.sql」을 되돌린다. ★ 쌓인 기록도 같이 사라진다.
begin;
drop trigger if exists audit_students on public.students;
drop trigger if exists audit_schedules on public.schedules;
drop function if exists public.write_audit_log();
drop table if exists public.audit_log;
commit;
