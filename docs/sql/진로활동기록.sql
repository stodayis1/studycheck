-- 진로·활동 기록 표 세 개 추가 (2026-11-07)
--
-- 왜: 원장님 2026-11-07 「학생의 모든 활동을 기록하고 관리할거야. 탐구보고서를 썼다면 어떤 주제로
--     썼고 만들어왔는지 모두 기록. 세부특기사항도 기록할수 있으면 모두 기록.
--     그전에 … 개인정보제공 동의 꼭 넣어줘. 처음 입학할 때 넣긴했지만 이것도 별도로 가지고 있어야지」
--
--   1) career_consents     진로·활동 정보 수집 동의 (입학 동의와 별도로 보관)
--   2) career_surveys      진로 설문 답 (예비고1 = 현 중3, 예비고2 = 현 고1)
--   3) student_activities  탐구보고서·세특·수행평가·동아리 등 활동 기록
--
-- 안전한가: 표를 **새로 더하는** 것뿐이다. 기존 표·행·정책은 건드리지 않는다.
-- 누가 보나: 세 표 모두 **직원만** 읽는다((select public.is_staff())).
--   · 동의·설문은 학생·학부모가 앱에서 내지만 **서버 API(/api/career)만** 쓴다 — 쓰기 정책이 없다.
--   · 활동 기록은 직원이 적고 고친다. 지우기는 deleted_at 을 채우는 것뿐이다(행을 지우는 정책 없음).
-- 되돌리기: docs/sql/진로활동기록_되돌리기.sql

-- 1) 동의 ─────────────────────────────────────────────
create table if not exists public.career_consents (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  signer_role     text not null check (signer_role in ('student', 'parent')),
  signer_name     text,
  consent_version text not null,              -- 동의서 문구 판 (lib/careerSurvey.ts CONSENT_VERSION)
  required_agreed boolean not null,           -- [필수] 진로·학교 활동 정보
  optional_agreed boolean not null default false, -- [선택] 학교생활기록부 기재 내용(세특 등)
  agreed_at       timestamptz not null default now(),
  revoked_at      timestamptz,                -- 철회하면 채운다 (행은 남긴다 — 언제 동의·철회했는지가 증빙)
  user_agent      text
);
create index if not exists career_consents_student_idx on public.career_consents (student_id, agreed_at desc);

comment on table public.career_consents is
  '진로·활동 기록용 개인정보 수집·이용 동의. 입학 동의와 별도. 철회해도 행은 남긴다(증빙).';

-- 2) 설문 답 ──────────────────────────────────────────
create table if not exists public.career_surveys (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  survey_key  text not null,                  -- 예: 2026-겨울-예비고1
  respondent  text not null check (respondent in ('student', 'parent')),
  answers     jsonb not null default '{}'::jsonb,
  consent_id  uuid references public.career_consents(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, survey_key, respondent)
);

comment on table public.career_surveys is
  '진로 설문 답. 학생·학부모가 따로 낸다. 문항 정의는 lib/careerSurvey.ts.';

-- 3) 활동 기록 ────────────────────────────────────────
create table if not exists public.student_activities (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  kind            text not null,              -- 탐구보고서 · 세특 · 수행평가 · 동아리 · 진로활동 · 독서 · 대회·행사 · 기타
  school_year     int,                        -- 학년도 (2026)
  semester        int check (semester in (1, 2)),
  grade_at        text,                       -- 그때 학년 (고1). 학년이 올라가도 기록은 그대로
  subject         text,                       -- 과목 (수학, 공통수학1 …)
  title           text not null,              -- 주제·제목
  detail          text,                       -- 내용. 세특이면 학생부 문구 그대로
  status          text,                       -- 계획 · 작성 중 · 완성 · 제출
  activity_date   date,
  source          text not null default 'teacher' check (source in ('teacher', 'student', 'parent', 'survey')),
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                 -- 지우기 = 이 칸을 채움 (행은 남김)
);
create index if not exists student_activities_student_idx on public.student_activities (student_id, created_at desc);

comment on table public.student_activities is
  '학생 활동 기록(탐구보고서·세특 등). 지우기는 deleted_at 만 채운다.';

-- RLS ─────────────────────────────────────────────────
alter table public.career_consents    enable row level security;
alter table public.career_surveys     enable row level security;
alter table public.student_activities enable row level security;

-- ★ 학생·학부모도 authenticated(익명 로그인)다. 반드시 is_staff() 로 막고, (select …) 로 감싼다.
create policy career_consents_staff_read on public.career_consents for select to authenticated
  using ((select public.is_staff()));
create policy career_surveys_staff_read on public.career_surveys for select to authenticated
  using ((select public.is_staff()));

create policy student_activities_staff_read on public.student_activities for select to authenticated
  using ((select public.is_staff()));
create policy student_activities_staff_insert on public.student_activities for insert to authenticated
  with check ((select public.is_staff()));
create policy student_activities_staff_update on public.student_activities for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
-- delete 정책은 일부러 만들지 않는다.

-- 확인 ────────────────────────────────────────────────
select tablename, policyname, cmd from pg_policies
 where tablename in ('career_consents', 'career_surveys', 'student_activities') order by 1, 2;
-- 맨몸 is_staff() 가 없는지 (0 이어야 한다)
select count(*) from pg_policies where schemaname = 'public'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
