-- 격리 로컬 시험용 **합성** 기반 스키마 (GPT-EXEC-021 §169~§175)
--
-- ⚠ 이 파일은 **운영에 실행하지 않는다.** 폐기 가능한 로컬 PostgreSQL 에만 쓴다.
--    운영 DB 에는 이미 이 테이블들이 있고, 여기 정의는 그 실물이 아니다.
--
-- 왜 필요한가
--   `쌍둥이_설치.sql` 은 StudyCheck 의 기존 객체를 전제로 한다. 그것들이 없으면
--   설치가 되지 않아 42P10 을 **실제 엔진에서** 재현할 수 없다.
--   그래서 설치가 참조하는 최소한을 합성으로 만든다.
--
-- ════════════════════════════════════════════════════════════════════
-- 무엇이 **대역(stand-in)** 인가 — 이것으로 증명되지 않는 것 (§196)
-- ════════════════════════════════════════════════════════════════════
--   - `auth.uid()` · `auth.users` : Supabase GoTrue 가 아니라 세션 설정을 읽는 대역이다.
--   - `public.is_admin()` · `public.is_staff()` : AGENTS.md 에 적힌 규칙
--     (role = admin / role in (admin,teacher,staff)) 대로 만든 대역이다.
--   - `anon` · `authenticated` · `service_role` : 이름만 같은 로컬 역할이다.
--     Supabase 의 실제 역할 설정·PostgREST 연결·JWT 검증은 재현하지 않는다.
--   - `public.problems` · `standard_types` · `users` · `students` : 설치와 검증이
--     읽는 칼럼만 갖춘 최소 표다. 운영 스키마 전체가 아니다.
--
--   → 따라서 이 환경의 통과는 **SQL 문법·ON CONFLICT 추론·게시 함수 동작**의
--     증거이지, **Supabase 인증·RLS 통합의 증거가 아니다.**

-- ── Supabase 역할 이름을 로컬에 만든다 ──────────────────────────────
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$roles$;

grant usage on schema public to anon, authenticated, service_role;

-- ── auth 스키마 대역 ────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key
);

-- Supabase 와 같은 **모양**으로 만든다 — 요청 JWT claims 의 sub 를 읽는다.
-- 실제 GoTrue 토큰 검증은 여기 없다 (대역).
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- ── StudyCheck 기존 표 (설치·검증이 읽는 칼럼만) ────────────────────
create table public.users (
  id   uuid primary key,
  role text not null
);

create table public.students (
  id          bigserial primary key,
  name        text,
  session_uid uuid
);

create table public.standard_types (
  code          text primary key,
  grade         text,
  chapter_title text,
  type_title    text
);

create table public.problems (
  id           bigserial primary key,
  twin_id      bigint,
  type_code    text,
  answer_text  text,
  answer_kind  text,
  is_essay     boolean,
  image_path   text,
  book         text,
  step         text,
  difficulty   text
);

-- ── 권한 판정 함수 대역 (AGENTS.md 의 규칙 그대로) ──────────────────
create function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role = 'admin')
$$;

create function public.is_staff() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role in ('admin','teacher','staff'))
$$;

grant execute on function public.is_admin()  to anon, authenticated, service_role;
grant execute on function public.is_staff()  to anon, authenticated, service_role;

grant select on public.problems, public.standard_types to authenticated;
