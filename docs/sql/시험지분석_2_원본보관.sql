-- 시험지 분석: 원본 파일 보관 (2026-10-03)
--
-- 왜 하나
--   모든 시험지는 원본(학교에서 받은 시험지, 한글 HWP 작업 원본)을 따로 보관하고
--   원장님만 열어 볼 수 있어야 한다.
--
-- 무엇이 바뀌나
--   · exam_paper_files.kind 에 '원본' 을 쓸 수 있게 한다 (지금은 6가지만 허용)
--   · 보관함 exam-analysis 가 한글(HWP) 파일도 받게 한다
--   자료를 지우거나 고치지 않는다. 허용 목록만 넓힌다.
--
-- 권한
--   '원본' 은 서버(app/api/exam-analysis)가 원장 계정에게만 내준다.
--   선생님에게는 「원본 n개 보관됨」 개수만 보이고, 열기·지우기는 안 된다.
--   표·보관함은 여전히 정책이 없어 브라우저에서 직접 읽을 수 없다 (1번 SQL 과 같음).
--
-- 실행 방법
--   Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여넣고 Run
--   (여러 번 실행해도 안전하다)

-- 1) 파일 구분에 '원본' 추가
alter table public.exam_paper_files drop constraint if exists exam_paper_files_kind_check;
alter table public.exam_paper_files
  add constraint exam_paper_files_kind_check
  check (kind in ('문제', '정답', '해설', '문제정답해설', '손풀이', '원본', '기타'));

-- 2) 보관함이 한글 파일도 받게 (브라우저는 HWP 를 '일반 파일'로 올린다)
update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'image/png', 'image/jpeg', 'application/octet-stream'
]
where id = 'exam-analysis';

-- 확인: 아래 결과가 1 / 1 이면 정상
select
  (select count(*) from pg_constraint
    where conname = 'exam_paper_files_kind_check'
      and pg_get_constraintdef(oid) like '%원본%')                                  as 원본구분,
  (select count(*) from storage.buckets
    where id = 'exam-analysis' and 'application/octet-stream' = any(allowed_mime_types)) as 한글파일허용;
