-- 학부모 설문(설명회 후기 · 상담 신청 · 바라는 점 · 개설 희망 강좌)
--
-- 원장님 2026-10-24 「그거 설문조사로 앱으로 만들어서 학부모님한테 보내서
--   링크 통해 후기 받는게 나을거 같아」
--
-- 종이 의견 카드(설명회 자리에 두는 A4)와 **같은 항목**이다. 종이로 받은 것과
-- 링크로 받은 것이 한 표에 쌓인다 (source 로 구분).
--
-- ★ 빈 표 하나를 더한다. 지금 자료는 건드리지 않는다.
-- ★ 쓰는 것은 **서버(service_role)만** 한다. 학부모는 로그인이 없어서 익명인데,
--   익명에게 insert 를 열어 주면 누구나 아무 줄이나 넣을 수 있다.
--   그래서 RLS 는 **직원 읽기만** 열고, 제출은 app/api/survey 가 대신 넣는다.
begin;

create table if not exists public.survey_responses (
  id            uuid primary key default gen_random_uuid(),
  -- 어떤 설문인지 (설명회마다 다르게 쓸 수 있게)
  survey_key    text not null default '설명회',
  -- 누가 냈는지
  student_name  text,
  grade         text,
  school        text,
  guardian_name text,
  phone         text,
  study_now     text,          -- 지금 수학 공부를 어떻게 하는지
  -- 설명회 후기
  rating        text,          -- 아주 좋았어요 / 좋았어요 / 보통이에요 / 아쉬웠어요
  helpful       text,          -- 가장 도움이 된 내용
  want_more     text,          -- 더 듣고 싶었던 내용
  -- 상담 신청
  consult       boolean not null default false,
  consult_times text[] not null default '{}',   -- 평일 오전/오후/저녁, 토요일
  consult_how   text[] not null default '{}',   -- 방문 / 전화
  -- 바라는 점
  wish          text,
  -- 개설 희망 강좌
  courses       text[] not null default '{}',
  courses_etc   text,
  -- 후기 공개 동의
  agree_public  boolean not null default false,
  -- 어디로 들어왔나
  source        text not null default 'link' check (source in ('link', 'paper')),
  created_at    timestamptz not null default now()
);

create index if not exists survey_responses_key_at_idx
  on public.survey_responses (survey_key, created_at desc);

comment on table public.survey_responses is
  '학부모 설문 — 설명회 후기·상담 신청·바라는 점·개설 희망 강좌 (원장님 2026-10-24).';

alter table public.survey_responses enable row level security;

-- 직원만 읽는다. 쓰는 것은 서버(service_role)가 RLS 를 지나서 한다.
-- ★ 학생·학부모도 authenticated 라 using (true) 로 쓰면 남의 답까지 다 읽힌다.
drop policy if exists survey_staff_read on public.survey_responses;
create policy survey_staff_read on public.survey_responses
  for select to authenticated
  using ((select public.is_staff()));

commit;

-- 확인
select tablename, rowsecurity from pg_tables where tablename = 'survey_responses';
select polname, polcmd from pg_policy where polrelid = 'public.survey_responses'::regclass;
