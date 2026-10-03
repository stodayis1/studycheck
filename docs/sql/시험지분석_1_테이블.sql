-- 시험지 분석 (2026-10-03)
--
-- 왜 하나
--   학교 시험이 끝날 때마다 하던 「시험지 수합 → 정답 → 변별문항 손풀이 → 총평 → 이너프원 매칭
--   → 블로그」 업무를 노션 대신 StudyCheck 안에서 관리하고, 타이핑한 기출문제를 문제은행
--   (problems)에 쌓기 위한 표 4개 + 파일 보관함 1개를 만든다.
--
-- 무엇이 바뀌나
--   · 새 표 4개: exam_papers / exam_paper_files / exam_questions / exam_enough_matches
--   · 기존 problems 표에 칸 2개 추가: source_key, source_meta  (기존 27,359행은 전부 NULL 로 남는다)
--   · 새 비공개 보관함(Storage bucket): exam-analysis
--   · 2026 2학기 중간고사 학교 7건 + 도래울중 중3 18번 자리표시 문항 1건
--   지우거나 고치는 것은 없다. 전부 추가만 한다.
--
-- 권한
--   새 표 4개는 RLS 를 켜고 **정책을 하나도 만들지 않는다.**
--   → 브라우저(학생·학부모·선생님 모두)에서는 직접 읽고 쓸 수 없고, 서버(app/api/exam-analysis)만
--     service_role 키로 접근한다. 서버가 직원인지 확인한 뒤에만 내준다.
--   보관함도 정책이 없다 → 서버가 만들어 준 임시 주소로만 올리고 내려받는다.
--
-- 실행 방법
--   Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여넣고 Run
--   (여러 번 실행해도 안전하다)

-- ───────────────────────── 1. 학교별 시험지 ─────────────────────────
create table if not exists public.exam_papers (
  id                uuid primary key default gen_random_uuid(),
  exam_year         integer  not null,
  term              smallint not null,                 -- 학기 (1 / 2)
  exam_type         text     not null check (exam_type in ('중간고사', '기말고사')),
  school_name       text     not null,
  grade             text     not null,                 -- '중1' '중2' '중3'
  exam_name         text,
  exam_scope        text,                              -- 시험 범위
  exam_end_date     date,
  work_due_date     date,                              -- 선생님 작업 기한
  blog_from_date    date,                              -- 블로그 업로드 시작 예정
  priority          text not null default '보통' check (priority in ('높음', '보통', '낮음')),
  assignee          text,                              -- 담당 선생님
  note              text,

  answers_text      text,                              -- 정답표 (한 줄에 「번호 정답」)
  discriminating_nos text[] not null default '{}',     -- 변별문항 번호 2~3개

  -- 시험 총평
  review_difficulty   text check (review_difficulty in ('쉬움', '보통', '어려움', '매우 어려움')),
  review_units        text,                            -- 주요 출제 단원
  review_hard_types   text,                            -- 까다로웠던 유형
  review_mistakes     text,                            -- 실수하기 쉬운 부분
  review_next_points  text,                            -- 다음 시험 대비 포인트
  review_blog_summary text,                            -- 블로그용 요약문

  -- 선생님 체크리스트: upload / answers / discriminating / handsolve / review / needs_check / done
  tasks             jsonb not null default '{}'::jsonb,

  match_status      text not null default '대기' check (match_status in ('대기', '진행중', '완료')),
  blog_status       text not null default '대기' check (blog_status in ('대기', '작성중', '업로드완료')),
  blog_url          text,
  blog_uploaded_on  date,
  blog_note         text,

  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (exam_year, term, exam_type, school_name, grade)
);
comment on table public.exam_papers is '시험지 분석: 학교·학년별 시험 1건. 정답표·총평·체크리스트·블로그 상태를 같이 담는다.';

-- ───────────────────────── 2. 첨부 파일 ─────────────────────────
create table if not exists public.exam_paper_files (
  id             uuid primary key default gen_random_uuid(),
  paper_id       uuid not null references public.exam_papers(id) on delete cascade,
  kind           text not null check (kind in ('문제', '정답', '해설', '문제정답해설', '손풀이', '기타')),
  file_name      text not null,                        -- 올린 사람이 붙인 원래 파일명 (한글)
  storage_path   text not null unique,                 -- 보관함 안 경로 (영문·숫자만)
  mime_type      text,
  file_size      integer,
  question_label text,                                 -- 손풀이: 문항번호 ('18번', '서술형2')
  name_ok        boolean not null default true,        -- 파일명 규칙에 맞았는지
  uploaded_by    text,
  created_at     timestamptz not null default now()
);
create index if not exists exam_paper_files_paper_idx on public.exam_paper_files (paper_id);
comment on table public.exam_paper_files is '시험지 분석: 시험지 PDF·손풀이 이미지. 실제 파일은 Storage exam-analysis 에 있다.';

-- ───────────────────────── 3. 타이핑한 기출문항 ─────────────────────────
create table if not exists public.exam_questions (
  id              uuid primary key default gen_random_uuid(),
  paper_id        uuid not null references public.exam_papers(id) on delete cascade,
  question_no     text not null,                       -- '18' 또는 '서술형2'
  sort_order      integer not null default 0,
  q_type          text not null default '객관식' check (q_type in ('객관식', '단답형', '서술형')),
  body            text,                                -- 문제 본문 ($…$ 안은 수식)
  choices         jsonb not null default '[]'::jsonb,  -- 보기 ①~⑤
  answer          text,
  solution        text,                                -- 해설
  unit_name       text,                                -- 단원명
  sub_unit_name   text,                                -- 세부단원명
  type_code       text references public.standard_types(code),   -- 문제은행 유형
  level           smallint check (level between 1 and 6),        -- 학원 공통 난이도
  difficulty      text check (difficulty in ('하', '중', '상')),
  is_discriminating boolean not null default false,
  source_memo     text,
  is_public       boolean not null default false,      -- 블로그 등 외부 공개에 써도 되는지
  figure_path     text,                                -- 문항 그림 (Storage exam-analysis)
  figure_is_whole boolean not null default false,      -- true: 그림 한 장이 문제 전체 (타이핑 대신)

  bank_status     text not null default '미반영' check (bank_status in ('미반영', '반영요청', '반영완료')),
  problem_id      bigint references public.problems(id),
  reflected_at    timestamptz,
  reflected_by    text,
  source_key      text not null unique,                -- 2026_2학기중간_도래울중_중3_18번

  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (paper_id, question_no)
);
create index if not exists exam_questions_paper_idx on public.exam_questions (paper_id, sort_order);
comment on table public.exam_questions is '시험지 분석: 타이핑한 기출문항. 원장이 「반영」하면 그림으로 구워 problems 에 1행이 생긴다 (problem_id).';

-- ───────────────────────── 4. 이너프원 매칭 ─────────────────────────
create table if not exists public.exam_enough_matches (
  id                uuid primary key default gen_random_uuid(),
  paper_id          uuid not null references public.exam_papers(id) on delete cascade,
  question_id       uuid references public.exam_questions(id) on delete set null,
  question_no       text,                              -- 문항을 아직 타이핑하지 않았을 때 번호만
  enough_book       text,                              -- 이너프원 교재명
  enough_unit       text,                              -- 이너프원 단원명
  enough_problem_no text,                              -- 이너프원 문항번호
  match_level       text not null default '유형 유사' check (match_level in ('쌍둥이', '매우 유사', '유형 유사', '참고')),
  memo              text,
  use_in_blog       boolean not null default false,
  created_by        text,
  created_at        timestamptz not null default now()
);
create index if not exists exam_enough_matches_paper_idx on public.exam_enough_matches (paper_id);
comment on table public.exam_enough_matches is '시험지 분석: 기출문항 ↔ 이너프원 교재 문항 비교 기록.';

-- ───────────────────────── 5. 권한 ─────────────────────────
-- 정책을 만들지 않는다 = 브라우저에서는 아무도 못 읽는다 (서버만).
alter table public.exam_papers          enable row level security;
alter table public.exam_paper_files     enable row level security;
alter table public.exam_questions       enable row level security;
alter table public.exam_enough_matches  enable row level security;

-- ───────────────────────── 6. 문제은행에 출처 칸 추가 ─────────────────────────
alter table public.problems
  add column if not exists source_key  text,
  add column if not exists source_meta jsonb;

comment on column public.problems.source_key  is '기출 출처 열쇠 (예: 2026_2학기중간_도래울중_중3_18번). 교재 문항은 null';
comment on column public.problems.source_meta is '기출 출처 정보 (source_type, source_year, source_term, source_exam_type, source_school_name, source_grade, source_problem_no …)';

-- 같은 기출문항이 두 번 들어가지 못하게 막는다 (null 은 몇 개든 괜찮다)
create unique index if not exists problems_source_key_uidx
  on public.problems (source_key) where source_key is not null;

-- ───────────────────────── 7. 파일 보관함 ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-analysis', 'exam-analysis', false, 52428800,
        array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- ───────────────────────── 8. 2026 2학기 중간고사 초기 자료 ─────────────────────────
insert into public.exam_papers
  (exam_year, term, exam_type, school_name, grade, exam_name, exam_end_date,
   work_due_date, blog_from_date, priority, note, created_by)
values
  (2026, 2, '중간고사', '도래울중',   '중3', '2026 2학기 중간고사', '2026-09-29', '2026-10-16', '2026-10-17', '높음', '우선 진행', '초기자료'),
  (2026, 2, '중간고사', '지축중',     '중2', '2026 2학기 중간고사', '2026-09-29', '2026-10-16', '2026-10-17', '보통', null, '초기자료'),
  (2026, 2, '중간고사', '고양제일중', '중2', '2026 2학기 중간고사', '2026-09-30', '2026-10-16', '2026-10-17', '보통', null, '초기자료'),
  (2026, 2, '중간고사', '원흥중',     '중2', '2026 2학기 중간고사', '2026-09-30', '2026-10-16', '2026-10-17', '보통', '중2·중3 중 실제로 하는 학년만 쓰면 됩니다', '초기자료'),
  (2026, 2, '중간고사', '원흥중',     '중3', '2026 2학기 중간고사', '2026-09-30', '2026-10-16', '2026-10-17', '보통', '중2·중3 중 실제로 하는 학년만 쓰면 됩니다', '초기자료'),
  (2026, 2, '중간고사', '신원중',     '중2', '2026 2학기 중간고사', null,         '2026-10-16', '2026-10-17', '보통', '시험 종료일 확인 필요', '초기자료'),
  (2026, 2, '중간고사', '신원중',     '중3', '2026 2학기 중간고사', null,         '2026-10-16', '2026-10-17', '보통', '시험 종료일 확인 필요', '초기자료')
on conflict (exam_year, term, exam_type, school_name, grade) do nothing;

-- 검증용 자리표시 문항 (실제 문제를 지어내지 않는다)
insert into public.exam_questions
  (paper_id, question_no, sort_order, q_type, body, answer, solution, is_discriminating, source_key, created_by)
select p.id, '18', 18, '객관식',
       '[기출문제 본문 입력 예정]', '[정답 입력 예정]', '[해설 입력 예정]', true,
       '2026_2학기중간_도래울중_중3_18번', '초기자료'
from public.exam_papers p
where p.exam_year = 2026 and p.term = 2 and p.exam_type = '중간고사'
  and p.school_name = '도래울중' and p.grade = '중3'
on conflict (source_key) do nothing;

-- ───────────────────────── 확인 ─────────────────────────
-- 아래 결과가 7 / 1 / 1 / 0 이면 정상 (마지막 0 = 새 표에 정책이 없다 = 서버 전용)
select
  (select count(*) from public.exam_papers where exam_year = 2026 and term = 2)            as 시험지,
  (select count(*) from public.exam_questions)                                             as 문항,
  (select count(*) from storage.buckets where id = 'exam-analysis' and public = false)     as 보관함,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename in ('exam_papers','exam_paper_files','exam_questions','exam_enough_matches')) as 정책수;
