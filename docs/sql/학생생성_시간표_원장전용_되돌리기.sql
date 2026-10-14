-- 「학생생성_시간표_원장전용.sql」을 되돌린다 — 선생님도 다시 할 수 있게.

begin;

-- ── students ───────────────────────────────────────────────────────────────
drop policy if exists admin_only_insert on public.students;
create policy staff_insert on public.students
  for insert to authenticated
  with check ((select public.is_staff()));

-- ── schedules : 다시 ALL 정책 하나로 ───────────────────────────────────────
drop policy if exists staff_read on public.schedules;
drop policy if exists admin_insert on public.schedules;
drop policy if exists admin_update on public.schedules;
drop policy if exists admin_delete on public.schedules;

create policy staff_all on public.schedules
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

commit;
