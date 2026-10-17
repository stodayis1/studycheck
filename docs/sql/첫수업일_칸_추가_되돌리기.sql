-- 「첫수업일_칸_추가.sql」을 되돌린다. ★ 채워 둔 값도 같이 사라진다.
alter table public.students
  drop column if exists first_class_date,
  drop column if exists first_class_time;
