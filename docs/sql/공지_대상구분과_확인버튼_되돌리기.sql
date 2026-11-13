-- 되돌리기 — 공지 대상 구분과 확인 버튼을 떼고 예전 모습으로.
-- 적용: docs/sql/공지_대상구분과_확인버튼.sql
--
-- ★ 앱을 먼저 되돌린 뒤에 이것을 돌린다. 순서가 바뀌면 화면이 없는 칸을 찾다가 빈다.
-- ★ 확인 기록(announcement_acks)은 지워진다. 남겨 두려면 아래 「표 지우기」 줄을 빼고 돌린다.

begin;

-- ③ 읽기 정책을 예전 모습으로 (누구나 활성 공지를 다 읽던 때)
drop policy if exists public_read_active on public.announcements;
create policy public_read_active on public.announcements for select
  using ((is_active = true) or (select public.is_staff()));

-- ② 확인 기록 표 지우기
drop table if exists public.announcement_acks;

-- ① 칸 떼기
alter table public.announcements drop constraint if exists announcements_audience_chk;
alter table public.announcements
  drop column if exists audience,
  drop column if exists needs_ack;

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select count(*) as 남은칸 from information_schema.columns
where table_schema = 'public' and table_name = 'announcements'
  and column_name in ('audience', 'needs_ack');
-- 0 이면 맞다.

select to_regclass('public.announcement_acks') as 확인표;
-- null 이면 맞다.
