-- 진로 설문을 문자 링크로 받기 — 학생 번호 칸 · 개인 링크 표 (2026-11-07)
--
-- 왜: 원장님 2026-11-07 「안내를 나가려면 스터디체크 로그인을 해야 하잖아 … 그냥 문자로 설문을 보내는 게
--     좋을 거 같아. 설명회 설문조사처럼. 학생도 마찬가지로 문자로. 기록된 내용은 스터디체크에 반영되게」
--     학생 본인 번호는 스터디체크에도 OPS 에도 없어서 → 「학생 번호 칸 새로 만들기」(원장님 선택)
--
--   1) students.student_phone  학생 본인 휴대폰 (학생관리에서 적는다. OPS 에는 아직 없다)
--   2) career_links            학생·학부모마다 따로 주는 설문 링크 (/c/<token>, 로그인 없이 연다)
--
-- 안전한가: 칸 하나와 표 하나를 **더하는** 것뿐이다. 기존 행·정책은 건드리지 않는다.
-- 누가 보나: career_links 는 직원만 읽는다. 쓰기는 서버 API(service_role)만 — 쓰기 정책 없음.
--   링크 주인 확인은 /api/career/link/<token> 이 토큰으로 한다(QR 채점 /api/grade/<code> 와 같은 자리).
-- 되돌리기: docs/sql/진로설문_문자링크_되돌리기.sql

alter table public.students add column if not exists student_phone text;
comment on column public.students.student_phone is
  '학생 본인 휴대폰. 진로 설문 등 학생에게 직접 보내는 문자에 쓴다(2026-11-07). OPS 에는 아직 없는 칸.';

create table if not exists public.career_links (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,          -- 주소 끝 글자 (/c/<token>) — 추측할 수 없게 12자 무작위
  student_id  uuid not null references public.students(id) on delete cascade,
  respondent  text not null check (respondent in ('student', 'parent')),
  form        text not null check (form in ('pre1', 'pre2')),
  survey_key  text not null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,                   -- 마지막으로 문자를 보낸 때
  opened_at   timestamptz,                   -- 처음 연 때
  unique (student_id, respondent, survey_key)
);
comment on table public.career_links is
  '진로 설문 개인 링크. 학생·학부모마다 하나. 문자로 보내고 로그인 없이 연다.';

alter table public.career_links enable row level security;
create policy career_links_staff_read on public.career_links for select to authenticated
  using ((select public.is_staff()));
-- 쓰기 정책은 일부러 만들지 않는다 (서버 API 만 쓴다).

-- 확인
select column_name from information_schema.columns where table_name = 'students' and column_name = 'student_phone';
select tablename, policyname, cmd, qual from pg_policies where tablename = 'career_links';
