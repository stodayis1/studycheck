-- note_polish_log — 자동 교정이 무엇을 고쳤는지 남긴다 (2026-10-13)
--
-- 왜: 밤 8시 자동 발송이 **사람 없이** 선생님 글을 고친다. 무엇을 고쳤는지 남지 않으면
--     나중에 「이 문장 내가 이렇게 안 썼는데」가 나왔을 때 확인할 길이 없다.
--     고친 것과 **안 고치고 건너뛴 것(기계 검사 탈락)** 을 함께 남긴다 —
--     건너뛴 것은 원장님이 직접 보고 고르셔야 하는 목록이기도 하다.
--
-- 되돌리기: docs/sql/자동교정_기록표_되돌리기.sql

create table if not exists public.note_polish_log (
  id            uuid primary key default gen_random_uuid(),
  session_date  date        not null,
  kind          text        not null,              -- 'progress'(진도) | 'notice'(알림장)
  ref_id        uuid        not null,              -- class_sessions.id 또는 feedbacks.id
  student_name  text,
  teacher_name  text,
  before_text   text        not null,
  after_text    text        not null,
  why           text,
  applied       boolean     not null default false, -- 실제로 고쳤나
  skip_reason   text,                               -- 안 고쳤으면 그 이유(기계 검사)
  source        text        not null default 'auto',-- 'auto'(밤 자동) | 'manual'(원장님이 고름)
  created_at    timestamptz not null default now()
);

create index if not exists note_polish_log_date_idx on public.note_polish_log (session_date desc);

-- ★ 학생·학부모도 authenticated 다. 직원만 읽게 막아야 한다(AGENTS.md).
alter table public.note_polish_log enable row level security;

drop policy if exists staff_read on public.note_polish_log;
create policy staff_read on public.note_polish_log
  for select to authenticated using ((select public.is_staff()));

-- 쓰기는 서버(service_role)만 한다 — 정책을 안 만들면 authenticated 는 못 쓴다.

comment on table public.note_polish_log is
  '수업일지 오타·문장 자동 교정 기록. 고친 것과 기계 검사에서 걸러 안 고친 것을 함께 남긴다.';
