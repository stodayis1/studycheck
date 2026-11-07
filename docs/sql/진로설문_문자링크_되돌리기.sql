-- 진로설문_문자링크.sql 되돌리기
--
-- ★ student_phone 에 학생 번호를 적기 시작한 뒤에 되돌리면 **그 번호가 사라진다.** 먼저 백업:
--     select id, name, student_phone from public.students where student_phone is not null;
-- ★ career_links 를 지우면 이미 보낸 문자 속 링크가 모두 「없는 링크」가 된다.
--   (설문 답·동의는 career_surveys · career_consents 에 있으므로 남는다)

drop table if exists public.career_links;
alter table public.students drop column if exists student_phone;

-- 확인 (둘 다 0줄)
select tablename from pg_tables where schemaname = 'public' and tablename = 'career_links';
select column_name from information_schema.columns where table_name = 'students' and column_name = 'student_phone';
