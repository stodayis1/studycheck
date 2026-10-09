-- 공휴일 표 (스터디체크) — 지금까지 화면 코드에 손으로 박혀 있던 공휴일 목록을 DB 한 곳으로 모은다.
--   · 코드에 박아두면 대체공휴일이 빠져도 아무도 모른다 (2026-10-05 대체공휴일 누락 사고)
--   · 2026 설날이 1/28~30(2025년 날짜)으로 잘못 들어가 있던 것도 이 참에 바로잡는다
-- kind: public(법정공휴일) / substitute(대체공휴일) / temporary(임시공휴일)
-- 학원 자체 휴원일은 여기가 아니라 기존 academy_calendar(type='holiday')에 그대로 둔다.

create table if not exists public.holidays (
  date date primary key,
  name text not null,
  kind text not null default 'public',
  source text,                      -- 'manual' 또는 'api:특일정보'
  updated_at timestamptz not null default now()
);

alter table public.holidays enable row level security;
drop policy if exists holidays_read on public.holidays;
drop policy if exists holidays_write on public.holidays;
-- 공휴일은 숨길 정보가 아니다. 읽기는 로그인한 사람 모두, 쓰기는 직원만.
-- 학생·학부모 화면 달력에도 공휴일이 보여야 하므로 읽기는 전원 허용
create policy holidays_read  on public.holidays for select using (true);
create policy holidays_write on public.holidays for all using ((select public.is_staff())) with check ((select public.is_staff()));

insert into public.holidays (date, name, kind, source) values
  ('2026-01-01','신정','public','manual'),
  ('2026-02-16','설날 연휴','public','manual'),
  ('2026-02-17','설날','public','manual'),
  ('2026-02-18','설날 연휴','public','manual'),
  ('2026-03-01','삼일절','public','manual'),
  ('2026-03-02','삼일절 대체공휴일','substitute','manual'),
  ('2026-05-01','근로자의 날','public','manual'),
  ('2026-05-05','어린이날','public','manual'),
  ('2026-05-24','부처님오신날','public','manual'),
  ('2026-05-25','부처님오신날 대체공휴일','substitute','manual'),
  ('2026-06-03','지방선거일','temporary','manual'),
  ('2026-06-06','현충일','public','manual'),
  ('2026-07-17','제헌절','public','manual'),
  ('2026-08-15','광복절','public','manual'),
  ('2026-08-17','광복절 대체공휴일','substitute','manual'),
  ('2026-09-24','추석 연휴','public','manual'),
  ('2026-09-25','추석','public','manual'),
  ('2026-09-26','추석 연휴','public','manual'),
  ('2026-10-03','개천절','public','manual'),
  ('2026-10-05','개천절 대체공휴일','substitute','manual'),
  ('2026-10-09','한글날','public','manual'),
  ('2026-12-25','성탄절','public','manual'),
  -- 2027은 날짜가 확실한 것만. 대체공휴일은 자료마다 달라서 공식 API(특일 정보)로 채운 뒤 넣는다.
  ('2027-01-01','신정','public','manual'),
  ('2027-02-06','설날 연휴','public','manual'),
  ('2027-02-07','설날','public','manual'),
  ('2027-02-08','설날 연휴','public','manual'),
  ('2027-03-01','삼일절','public','manual'),
  ('2027-05-01','근로자의 날','public','manual'),
  ('2027-05-05','어린이날','public','manual'),
  ('2027-06-06','현충일','public','manual'),
  ('2027-07-17','제헌절','public','manual'),
  ('2027-08-15','광복절','public','manual'),
  ('2027-09-14','추석 연휴','public','manual'),
  ('2027-09-15','추석','public','manual'),
  ('2027-09-16','추석 연휴','public','manual'),
  ('2027-10-03','개천절','public','manual'),
  ('2027-10-09','한글날','public','manual'),
  ('2027-12-25','성탄절','public','manual')
on conflict (date) do nothing;

select count(*) as rows, min(date) as first, max(date) as last from public.holidays;
