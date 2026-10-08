-- 원장님 상담 요청 — 강사가 "이 학생은 원장님이 상담해 주세요"라고 요청하면 원장 대시보드에 뜬다.
-- 기존 consultations 표는 건드리지 않고 새 표만 추가.
-- RLS는 consultations와 동일하게 staff 전용. is_staff()는 (select ...)로 감싸 행마다 재평가되지 않게 한다.

create table if not exists public.consultation_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  reason text,
  status text not null default 'open',              -- open: 상담 대기 / done: 처리 완료
  requested_by uuid,                                 -- 요청한 강사(users.id)
  requested_by_name text,                            -- 계정이 바뀌어도 누가 요청했는지 남게 이름도 보관
  created_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz
);

create index if not exists consultation_requests_open_idx
  on public.consultation_requests(status, created_at desc);
create index if not exists consultation_requests_student_idx
  on public.consultation_requests(student_id);

alter table public.consultation_requests enable row level security;

drop policy if exists staff_only on public.consultation_requests;
create policy staff_only on public.consultation_requests
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

-- 확인용
select count(*) as rows_now from public.consultation_requests;
