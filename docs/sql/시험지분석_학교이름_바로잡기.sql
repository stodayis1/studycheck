-- 시험지 분석 — 잘못 읽힌 학교 이름 바로잡기 (2026-11-09)
--
-- 무엇이 잘못됐나
--   파일명 「2025년고양중…」에서 연도가 학교 이름에 붙어 있어, 올리기 창이 학교를
--   「년고양중」으로 짐작해 채웠고 그대로 저장됐다. 빨간 칸이 아니라 그럴듯한 글자라
--   아무도 안 봤다. (짐작 규칙은 lib/examAnalysis.ts 에서 고쳤다 — 앞에 붙은 「년」을 뗀다.)
--
-- 왜 고쳐야 하나
--   학교 이름은 글자 그대로 맞춰 쓴다. 「년고양중」으로 남으면 이 시험지는 고양중 학생들의
--   시험대비·적중 대조에 **영원히 안 걸린다** (AGENTS.md 5번). 에러도 안 난다.
--
-- 바꾸는 것 — 시험지 2건 (papers 2행 + files 2행)
--   ① 2025 2학기 기말 중1 : '년고양중'    → '고양중'
--   ② 2025 2학기 중간 고1 : '고양일고등고' → '고양일고'   (2026-10-05 에 같은 식으로 들어간 것)
--   파일 이름도 같이 고친다. (storage_path 는 uuid 라 건드릴 것이 없다. 두 시험지 모두
--   문항·매칭이 0건이라 source_key 를 다시 지을 일도 없다. 2026 고양일고 시험지와는
--   연도가 달라 겹치지 않는다.)
--
-- 되돌리기: docs/sql/시험지분석_학교이름_바로잡기_되돌리기.sql

begin;

update public.exam_papers
   set school_name = '고양중'
 where id = '90435be0-c1b0-4192-82ff-0ea4dd0d780a'
   and school_name = '년고양중';

update public.exam_paper_files
   set file_name = replace(file_name, '_년고양중_', '_고양중_')
 where paper_id = '90435be0-c1b0-4192-82ff-0ea4dd0d780a'
   and file_name like '%\_년고양중\_%';

update public.exam_papers
   set school_name = '고양일고'
 where id = '9208eb91-93f5-4f22-bf48-0a470a24382b'
   and school_name = '고양일고등고';

update public.exam_paper_files
   set file_name = replace(file_name, '_고양일고등고_', '_고양일고_')
 where paper_id = '9208eb91-93f5-4f22-bf48-0a470a24382b'
   and file_name like '%\_고양일고등고\_%';

commit;

-- 확인 — 「년」으로 시작하는 학교 이름이 하나도 없어야 한다
select id, exam_year, term, exam_type, school_name, grade
  from public.exam_papers
 where school_name ~ '^(년|월|일|학기|학년)';

select p.school_name, p.grade, p.exam_year, f.kind, f.file_name
  from public.exam_paper_files f join public.exam_papers p on p.id = f.paper_id
 where p.id in ('90435be0-c1b0-4192-82ff-0ea4dd0d780a', '9208eb91-93f5-4f22-bf48-0a470a24382b');

-- 학교 이름 전체 훑기 — 낯선 이름이 또 있는지 눈으로 본다
select school_name, count(*) from public.exam_papers group by 1 order by 1;
