-- 문제은행: 교재 쪽 번호 칸 추가 (2026-09-22)
--
-- 왜 하나
--   학습지에는 1, 2, 3… 으로 번호를 다시 매겨 인쇄한다. 그래서 문항 그림에 들어 있던
--   교재 원본 번호(0232 같은 것)는 학생이 헷갈려서 지우기로 했다.
--   대신 선생님은 언제든 "이 문제가 그 교재 몇 쪽 몇 번인지" 바로 찾을 수 있어야 하므로
--   번호(local_no)에 더해 **쪽 번호**를 저장한다.
--
-- 어디에 보이나
--   · 학습지 인쇄 화면의 정답표
--   · QR 채점 화면 / 채점 결과 화면의 「출처」
--   · 문제은행 4단 화면의 문항 카드
--
-- 실행 방법
--   Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여넣고 Run
--   (여러 번 실행해도 안전하다)

alter table public.problems
  add column if not exists page_no integer;

comment on column public.problems.page_no is '교재에 인쇄된 쪽 번호 (없으면 null)';

-- 교재·쪽으로 찾아볼 때를 위한 색인
create index if not exists problems_book_page_idx
  on public.problems (book, grade, semester, page_no);
