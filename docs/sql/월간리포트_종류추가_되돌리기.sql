-- 「월간리포트_종류추가.sql」 되돌리기
--
-- ★ 이미 만든 월간 리포트 링크가 있으면 규칙을 되돌릴 수 없다(그 줄들이 규칙에 걸린다).
--   그 링크를 먼저 지우든지, 그대로 두려면 이 파일을 쓰지 말 것.
begin;
-- delete from public.report_links where report_type = 'monthly_report';
alter table public.report_links drop constraint if exists report_links_report_type_check;
alter table public.report_links add constraint report_links_report_type_check
  check (report_type = any (array[
    'daily'::text, 'monthly'::text, 'quarterly'::text,
    'worksheet_scores'::text, 'attendance_rate'::text, 'daily_notice'::text
  ]));
commit;
