-- 교재로 푸는 학습지를 **학생 앱에 띄우기** 위한 배부표
--
-- 왜 필요한가
--   지금은 학생이 시험지에 닿는 길이 **인쇄물의 QR 하나뿐**이다.
--   교재를 펴 놓고 푸는 학습지는 종이가 필요 없는데도 QR 을 주려고 종이를 뽑아야 했다.
--   선생님이 「누구에게 냈다」를 적어 둘 자리가 없어서 그렇다 — 그 자리를 만든다.
--
-- 무엇을 만드나
--   exam_sheet_targets : 어떤 시험지를 어떤 학생에게 냈는지. 그것뿐이다.
--   기존 표는 하나도 건드리지 않는다. (되돌리려면 맨 아래 한 줄)

begin;

create table if not exists public.exam_sheet_targets (
  id          uuid primary key default gen_random_uuid(),
  sheet_id    uuid not null references public.exam_sheets(id) on delete cascade,
  student_id  uuid not null references public.students(id)    on delete cascade,
  assigned_at timestamptz not null default now(),
  due_date    date,
  unique (sheet_id, student_id)
);

-- 학생 앱은 '내 것'을, 선생님 화면은 '이 시험지를 받은 사람'을 찾는다
create index if not exists exam_sheet_targets_student_idx
  on public.exam_sheet_targets (student_id, assigned_at desc);
create index if not exists exam_sheet_targets_sheet_idx
  on public.exam_sheet_targets (sheet_id);

alter table public.exam_sheet_targets enable row level security;

-- 직원은 전부. ★ is_staff() 는 반드시 (select ...) 로 감싼다 — 안 그러면 행마다 돈다
drop policy if exists staff_all on public.exam_sheet_targets;
create policy staff_all on public.exam_sheet_targets
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

-- 학생·학부모는 **자기 것만** 본다 (학생도 Supabase 에서는 authenticated 다)
drop policy if exists own_read on public.exam_sheet_targets;
create policy own_read on public.exam_sheet_targets
  for select using (
    student_id in (
      select s.id from public.students s
      where s.session_uid = (select auth.uid())
         or s.parent_session_uid = (select auth.uid())
    )
  );

commit;

-- 확인 — 정책 2개가 나와야 하고, is_staff() 는 (select ...) 안에 있어야 한다
select policyname, cmd, qual from pg_policies
where schemaname = 'public' and tablename = 'exam_sheet_targets';

-- 되돌리려면
--   drop table public.exam_sheet_targets;
