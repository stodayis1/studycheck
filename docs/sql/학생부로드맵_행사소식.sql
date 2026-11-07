-- 학생부 로드맵 소식 — 계열별 박람회·설명회·컨퍼런스 정보와 보낸 기록 (2026-11-07)
--
-- 왜: 원장님 2026-11-07 「모든 사이트, 대학교 사이트, 진로진학 사이트 등을 뒤져서 각 계열로 도움이 될 만한
--     박람회, 컨퍼런스, 설명회 등의 정보를 지속적으로 업로드 … 일주일 또는 이주일에 한 번 해당 학부모·학생에게
--     정보를 공유할 수 있도록 자동화」
--     정한 것: 원장님이 확인 후 발송 · 2주에 한 번 · 문자 + 개인 페이지 링크 · 질문지 낸 학생·학부모에게
--
--   1) career_events      찾은 행사. Claude 가 「검토대기」로 올리고 원장님이 「승인」해야 나간다
--   2) career_news_sends  소식을 보낸 기록 (언제·몇 건·몇 명)
--
-- 안전한가: 표 두 개를 **더하는** 것뿐이다. 기존 표·정책은 건드리지 않는다.
-- 누가 보나: 둘 다 직원만 읽는다. 행사는 직원이 고치고 승인한다. 보낸 기록은 서버 API 만 쓴다.
--   학생·학부모는 개인 링크(/r/<token>)로 **승인된 것 중 자기 계열에 맞는 것만** 서버를 거쳐 본다.
-- 되돌리기: docs/sql/학생부로드맵_행사소식_되돌리기.sql

create table if not exists public.career_events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  host            text,                         -- 주최 (○○대학교 입학처, 한국대학교육협의회 …)
  kind            text not null default '설명회', -- 박람회 · 설명회 · 컨퍼런스 · 캠프 · 체험 · 특강 · 대회 · 기타
  fields          text[] not null default '{}', -- 계열 (lib/careerSurvey.ts CAREER_FIELDS) · '공통' = 모든 계열
  grades          text[] not null default '{}', -- 대상 학년 (중3·고1·고2 …) · 빈 배열 = 학년 무관
  starts_on       date,
  ends_on         date,
  time_text       text,                         -- 「오후 2시~5시」처럼 글로
  place           text,
  online          boolean not null default false,
  url             text not null,                -- 공식 안내 주소 (반드시)
  apply_url       text,
  apply_deadline  date,
  fee             text,                         -- 무료 · 1만 원 …
  summary         text,                         -- 학부모님께 보여 줄 두세 줄
  source_note     text,                         -- 어디서 찾았고 무엇을 확인했는지 (원장님 검토용)
  status          text not null default '검토대기' check (status in ('검토대기', '승인', '제외')),
  found_by        text,                         -- claude · 직원 이름
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (url, starts_on)                       -- 같은 행사를 두 번 올리지 않게
);
create index if not exists career_events_status_idx on public.career_events (status, starts_on);
comment on table public.career_events is
  '학생부 로드맵 소식 — 계열별 박람회·설명회 등. Claude 가 검토대기로 올리고 원장님이 승인해야 나간다.';

create table if not exists public.career_news_sends (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  event_ids   uuid[] not null default '{}',
  recipients  int not null default 0,
  sent        int not null default 0,
  failed      int not null default 0,
  ops_test    boolean not null default false,  -- OPS 테스트 모드라 실제로는 안 나간 경우
  sent_by     text
);
comment on table public.career_news_sends is '학생부 로드맵 소식 문자를 보낸 기록.';

alter table public.career_events     enable row level security;
alter table public.career_news_sends enable row level security;

create policy career_events_staff_read on public.career_events for select to authenticated
  using ((select public.is_staff()));
create policy career_events_staff_insert on public.career_events for insert to authenticated
  with check ((select public.is_staff()));
create policy career_events_staff_update on public.career_events for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy career_news_sends_staff_read on public.career_news_sends for select to authenticated
  using ((select public.is_staff()));
-- delete 정책은 만들지 않는다 (빼려면 status = '제외').

-- 확인
select tablename, policyname, cmd from pg_policies where tablename in ('career_events', 'career_news_sends') order by 1, 2;
