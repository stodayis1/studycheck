-- 학교 자료집 — 학교 한 곳당 한 줄.
--
-- 왜 표로 두는가 — 학교알리미 공시 첨부(편제표·학사일정)는 학교마다 표 모양이 달라서
-- 화면에서 그때그때 읽어 올 수가 없다. 사람이 한 번 읽어 넣고, 화면은 그 값을 그리기만 한다.
-- 공시는 1년에 한 번 바뀌므로 실시간일 이유도 없다.
--
-- ★ school_name 은 반드시 normalizeSchool()(lib/school.ts) 을 거친 값이다 —
--   「고양일고」이지 「고양일고등학교」가 아니다. 그래야 students.school,
--   exam_schedule.school_name 과 같은 키로 묶인다. 어기면 아무 데도 안 걸리고 에러도 안 난다.
--
-- 되돌리기: docs/sql/학교자료집_표_만들기_되돌리기.sql

create table if not exists public.school_profiles (
  id          uuid primary key default gen_random_uuid(),

  -- 묶는 키
  school_name   text not null unique,        -- normalizeSchool() 거친 짧은 이름 (「고양일고」)
  school_level  text not null,               -- '초' | '중' | '고'
  official_name text,                        -- 「고양일고등학교」 — 제목·출처 표기용

  -- 공시 기준 연도. 같은 학교의 옛 자료는 남기지 않는다(덮어쓴다).
  source_year int not null,

  -- 개요
  region       text,                         -- '경기도 고양시 덕양구'
  office       text,                         -- '경기도고양교육지원청'
  foundation   text,                         -- '공립' | '사립'
  school_type  text,                         -- '일반고' | '특수목적고등학교' …
  coed         text,                         -- '남녀공학' | '남' | '여'

  -- 숫자 지표(학교알리미 OpenAPI 값). 학교급마다 칸이 달라 jsonb 로 둔다.
  stats        jsonb not null default '{}'::jsonb,

  -- 수학 편제 — 학년별 과목·단위·선택. 이 자료집의 핵심이다.
  math_curriculum jsonb not null default '[]'::jsonb,

  -- 정기시험·학력평가·방학
  exam_calendar   jsonb not null default '{}'::jsonb,

  -- 동아리·상담·특색사업처럼 한 줄씩 붙는 것
  highlights      jsonb not null default '[]'::jsonb,

  -- 선생님이 손으로 덧붙이는 메모(공시에 없는 것 — 내신 난이도 체감 등)
  notes           text,

  -- 어디서 왔는지. 공공누리 출처표시 의무가 있어 화면 아래에 그대로 적는다.
  sources         jsonb not null default '[]'::jsonb,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists school_profiles_level_idx
  on public.school_profiles (school_level, school_name);

alter table public.school_profiles enable row level security;

-- ★ 학생·학부모도 authenticated 다(익명 로그인). using (true) 로 쓰면 그들에게도 열린다.
--   공시자료라 민감하진 않지만 선생님용 화면이므로 지금은 직원만 본다.
--   is_staff() 는 반드시 (select ...) 로 감싼다 — 안 그러면 행마다 돈다.
drop policy if exists school_profiles_staff_read on public.school_profiles;
create policy school_profiles_staff_read on public.school_profiles
  for select to authenticated
  using ((select public.is_staff()));

-- 쓰기는 원장만. 서버 API(service role)는 RLS를 우회하므로 이 정책과 무관하다.
drop policy if exists school_profiles_admin_write on public.school_profiles;
create policy school_profiles_admin_write on public.school_profiles
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 확인 — 정책 2개가 나와야 한다
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'school_profiles'
 order by policyname;
