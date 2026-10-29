-- 학생 시간표 변경 요청 (원장님 2026-10-29)
--
-- 「학생시간표 변경은 담당 강사가 요청으로 눌러서 내가 확인하면 변경되게」
--
-- 시간표(schedules) 쓰기는 2026-10-14 부터 원장님 전용이다. 그래서 선생님은 수업 시간이
-- 바뀌어도 말로 전할 수밖에 없었고, 말은 자주 잊힌다. 교재 삭제요청과 같은 꼴로
-- **요청을 남기고 알림을 보내고, 원장님이 「반영」을 누를 때 비로소 시간표가 바뀌게** 한다.
--
-- want 는 [{"day":"월","time":"16:00","periods":2}, ...] 꼴이다. before_text·want_text 는
-- 사람이 읽는 글로 굳혀 둔다 — 나중에 시간표가 또 바뀌어도 「무엇을 바꾸자고 했는지」가 남는다.

create table if not exists public.schedule_change_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  requested_by uuid references public.users(id),
  requested_by_name text,
  requested_at timestamptz not null default now(),
  before_text text,
  want jsonb not null,
  want_text text,
  note text,
  status text not null default 'open',     -- open | applied | rejected
  decided_by text,
  decided_at timestamptz,
  decided_note text
);

create index if not exists schedule_change_requests_open_idx
  on public.schedule_change_requests (status, requested_at desc);

alter table public.schedule_change_requests enable row level security;

-- 조회: 원장은 전부, 선생님은 본인이 올린 것만
drop policy if exists scr_select on public.schedule_change_requests;
create policy scr_select on public.schedule_change_requests for select using (
  (select public.is_admin()) or requested_by = (select auth.uid())
);

-- 올리기: 본인 이름으로, **내가 볼 수 있는 학생**에 대해서만.
--   아래 exists 는 students 정책을 그대로 타므로(강사=담당 학생), 남의 학생으로는 올릴 수 없다.
drop policy if exists scr_insert on public.schedule_change_requests;
create policy scr_insert on public.schedule_change_requests for insert with check (
  requested_by = (select auth.uid())
  and exists (select 1 from public.students s where s.id = student_id)
);

-- 결정(반영·거절): 원장만
drop policy if exists scr_update on public.schedule_change_requests;
create policy scr_update on public.schedule_change_requests for update using (
  (select public.is_admin())
);

-- 취소: 원장 또는 올린 사람
drop policy if exists scr_delete on public.schedule_change_requests;
create policy scr_delete on public.schedule_change_requests for delete using (
  (select public.is_admin()) or requested_by = (select auth.uid())
);
