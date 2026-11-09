-- 되돌리기 — 시험지분석_학교이름_바로잡기.sql 을 되돌린다 (2026-11-09)
-- 그 시험지 2건만 원래 이름으로 돌린다. 다른 고양중·고양일고 시험지는 건드리지 않는다.

begin;

update public.exam_papers
   set school_name = '년고양중'
 where id = '90435be0-c1b0-4192-82ff-0ea4dd0d780a'
   and school_name = '고양중';

update public.exam_paper_files
   set file_name = replace(file_name, '_고양중_', '_년고양중_')
 where paper_id = '90435be0-c1b0-4192-82ff-0ea4dd0d780a'
   and file_name like '%\_고양중\_%';

update public.exam_papers
   set school_name = '고양일고등고'
 where id = '9208eb91-93f5-4f22-bf48-0a470a24382b'
   and school_name = '고양일고';

update public.exam_paper_files
   set file_name = replace(file_name, '_고양일고_', '_고양일고등고_')
 where paper_id = '9208eb91-93f5-4f22-bf48-0a470a24382b'
   and file_name like '%\_고양일고\_%';

commit;

select id, school_name, grade from public.exam_papers
 where id in ('90435be0-c1b0-4192-82ff-0ea4dd0d780a', '9208eb91-93f5-4f22-bf48-0a470a24382b');
