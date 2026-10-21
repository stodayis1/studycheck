-- 「주임모드_잠시_끄기.sql」 되돌리기 — 다시 학년주임으로
begin;
update public.users set supervisor_grades = array['중2'] where name = '김은수';
update public.users set supervisor_grades = array['중1'] where name = '박경미';
commit;
