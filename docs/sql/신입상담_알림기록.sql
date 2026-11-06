-- 신입생 상담 알림을 **언제 보냈는지** 적어 두는 표 (2026-11-06)
-- 되돌리기: 신입상담_알림기록_되돌리기.sql
--
-- 원장님 2026-11-06
--   「신입생 첫 수업 일주일 후 신입상담, 한달 수업 후 적응 상황 상담 알림 뜨게 해줘(자동으로)」
--
-- ★ 이 표가 없으면 **같은 알림이 날마다 쌓인다.** 크론이 매일 아침 돌기 때문이다.
--   한 학생·한 단계(intro/settle)에 한 줄만 들어간다(unique).
-- ★ 알림 자체는 수학OPS 의 전달사항(staff_notes)에 꽂힌다. 여기 ops_note_ids 는
--   「어느 줄을 꽂았는지」를 남겨 두는 것이다 — 잘못 나갔을 때 그 줄만 지울 수 있게.
-- ★ 서버(service_role)만 쓴다. 화면에서 읽을 일이 생기면 그때 정책을 넓힌다.
-- ★ 더하기만 한다. 앱 배포 전에 실행해도 아무 일이 없다.

begin;

create table if not exists public.new_student_consult_notices (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  stage        text not null check (stage in ('intro', 'settle')),
  first_lesson date not null,
  ops_note_ids text[],
  posted_at    timestamptz not null default now(),
  unique (student_id, stage)
);

alter table public.new_student_consult_notices enable row level security;

-- 직원만. (select ...) 로 감싸야 줄마다 다시 안 돈다.
drop policy if exists staff_all on public.new_student_consult_notices;
create policy staff_all on public.new_student_consult_notices for all
  using ((select public.is_staff())) with check ((select public.is_staff()));

commit;

-- 확인
-- select stage, count(*) from public.new_student_consult_notices group by 1;
