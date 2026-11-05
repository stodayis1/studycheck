-- 고1교재_과정이름_바로잡기.sql 되돌리기 (2026-11-05)
--
-- 그 7권을 다시 '고1' 로 돌린다. 개념 체크(progress_checks)는 처음부터 안 건드렸으므로 그대로다.
-- 되돌리면 그 교재들의 월간보고서 진도율은 다시 「집계 전」이 된다.

begin;

update public.student_textbooks set grade = '고1'
 where id in (
   'c53ae742-8c6f-469f-96ea-0b40db4a7a2f',
   'b5cac79e-79fe-4a4b-85b0-0c3881d47849',
   '41bb14cf-9e0c-447e-a1b7-d7be770e8c01',
   'dae793ed-2c5d-429c-806b-9397753ce1d6',
   '240c1407-3609-4b97-9de0-ad9c82440f6d',
   '63eaf90d-432b-403f-9d53-71748d633a71',
   '81103a95-925e-4573-81f8-e8f061dd6f5e'
 );

commit;

-- 확인 — 7 이어야 한다
-- select count(*) from public.student_textbooks where grade = '고1';
