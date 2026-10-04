-- 시험지 분석: 이너프원 문항 그림을 적중 대조에 붙이기 (2026-10-04)
--
-- 왜 하나
--   적중률을 볼 때 "기출 문항 ↔ 이너프원 문항" 그림을 화면에서 나란히 봐야 한다.
--   지금까지 이너프원은 단원별 문항 수(inner_enough)만 있고 문항 하나하나의 자료가 없었다.
--
-- 무엇이 바뀌나
--   · 새 표 enough_problems : 이너프원 문항 1개 = 1줄 (교재 · 세트 · 번호 · 그림 경로)
--     2026 2학기 9권 5,115문항을 여기에 넣는다 (넣는 것은 scripts/enough-one/upload.mjs 가 한다).
--   · exam_enough_matches 에 칸 1개 추가 : enough_problem_id (어느 이너프원 문항인지)
--   지우거나 고치는 것은 없다. 기존 매칭 기록은 그대로 남고, 그림 연결만 새로 붙는다.
--
-- 권한
--   enough_problems 도 RLS 를 켜고 정책을 만들지 않는다 → 브라우저에서는 아무도 직접 못 읽고
--   서버(app/api/exam-analysis)가 직원에게만 내준다. 그림은 비공개 보관함 exam-analysis 에 있다.
--
-- 실행 방법
--   Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여넣고 Run  (여러 번 실행해도 안전하다)

create table if not exists public.enough_problems (
  id          uuid primary key default gen_random_uuid(),
  edition     text not null,                 -- '2026-2학기'
  book        text not null,                 -- '이너프원 타학교 중3 1권'
  set_no      integer not null,              -- 책 안에서 세트 순번
  unit        text not null,                 -- '삼각비(3)' · '대푯값과 산포도 3회차'
  problem_no  integer not null,              -- 세트 안 문항 번호
  page_no     integer,                       -- PDF 쪽
  image_path  text not null,                 -- Storage exam-analysis 안 경로
  twin_of     text,                          -- 문항 위에 찍힌 출처 표시 (예: 쎈 중등 2-2 P.12 0021번)
  created_at  timestamptz not null default now(),
  unique (edition, book, set_no, problem_no)
);
create index if not exists enough_problems_lookup_idx on public.enough_problems (book, unit, problem_no);
comment on table public.enough_problems is '이너프원 교재 문항 색인 (문항 1개 = 1줄). 적중 대조에서 기출과 그림을 나란히 보는 데 쓴다.';

alter table public.enough_problems enable row level security;      -- 정책 없음 = 서버 전용

alter table public.exam_enough_matches
  add column if not exists enough_problem_id uuid references public.enough_problems(id) on delete set null;

-- 확인: 1 / 1 / 0 이면 정상 (표가 생겼고, 칸이 생겼고, 정책은 없다)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'enough_problems') as 새표,
  (select count(*) from information_schema.columns where table_schema = 'public'
     and table_name = 'exam_enough_matches' and column_name = 'enough_problem_id')                              as 새칸,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'enough_problems')              as 정책수;
