-- 부스터 특강 선착순 신청 — 되돌리기 (2026-11-19)
--
-- ★★ 이걸 돌리면 **신청자 명단이 통째로 사라진다.** 접수가 이미 시작됐으면 돌리지 말 것.
--    먼저 명단을 받아 두고 돌린다:
--
--      select seat_no, student_name, grade, parent_name, parent_phone, is_enrolled,
--             created_at at time zone 'Asia/Seoul' as 접수시각, status
--        from public.booster_applications a
--        join public.booster_sessions s on s.id = a.session_id
--       where s.slug = 'yebi-jung1-booster-2026-12'
--       order by seat_no;
--
-- ★ 더한 것만 지운다. 기존 표·정책·함수는 건드리지 않는다.

begin;

drop function if exists public.booster_reopen_seat(text, int);
drop function if exists public.booster_status(text);
drop function if exists public.booster_apply(text, text, text, text, text, text, boolean, int);

drop policy if exists booster_apps_admin_write      on public.booster_applications;
drop policy if exists booster_apps_admin_read       on public.booster_applications;
drop policy if exists booster_sessions_admin_write  on public.booster_sessions;
drop policy if exists booster_sessions_staff_read   on public.booster_sessions;

-- 신청이 먼저다 — sessions 를 참조한다
drop table if exists public.booster_applications;
drop table if exists public.booster_sessions;

commit;

-- ── 확인 ──────────────────────────────────────────────────────────────────
-- select count(*) from information_schema.tables
--  where table_schema = 'public' and table_name like 'booster%';   -- 0 이어야 한다
--
-- select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname like 'booster%';       -- 0 이어야 한다
