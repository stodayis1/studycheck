-- 「월간코멘트_표_만들기.sql」 되돌리기 — 표를 통째로 없앤다
--
-- ★ 표를 지우면 그동안 써 둔 코멘트도 같이 사라진다.
--   이미 링크를 찍은 리포트는 그 안(report_links.data)에 글이 박혀 있어 그대로 남는다.
begin;

drop table if exists public.monthly_report_comments;

commit;

select tablename from pg_tables where tablename = 'monthly_report_comments';
