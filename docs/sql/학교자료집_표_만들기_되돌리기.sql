-- 되돌리기 — 학교 자료집 표를 없앤다.
--   적용: docs/sql/학교자료집_표_만들기.sql
--
-- ※ 표를 지우면 **넣어 둔 학교 자료가 전부 사라진다.** 공시를 다시 읽어 넣어야 한다.
--   자료는 두고 화면만 내리고 싶으면 이 파일을 쓰지 말고 사이드바 메뉴만 빼면 된다.

drop policy if exists school_profiles_admin_write on public.school_profiles;
drop policy if exists school_profiles_staff_read  on public.school_profiles;
drop index  if exists public.school_profiles_level_idx;
drop table  if exists public.school_profiles;

-- 확인 — 아무것도 안 나와야 한다
select tablename from pg_tables where schemaname = 'public' and tablename = 'school_profiles';
