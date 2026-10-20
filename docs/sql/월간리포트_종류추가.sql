-- report_links 에 「월간 리포트」 종류를 더한다
--
-- 원장님 2026-10-20 — 리딩온어학원 양식처럼 한 달에 한 번 보내는 학습 리포트.
--
-- report_links.report_type 에 **검사 규칙**이 걸려 있어서, 새 종류를 넣으면 그냥 막힌다
-- (실제로 링크를 만들어 보다가 걸렸다). 'monthly_report' 를 더한다.
--
-- ★ 예전 학습분석리포트가 쓰던 'monthly' 와 **다른 이름**이다. 그쪽은 그대로 둔다 —
--   화면도 보내는 방식도 다르다(그쪽은 이미지, 이쪽은 링크).
begin;

alter table public.report_links drop constraint if exists report_links_report_type_check;
alter table public.report_links add constraint report_links_report_type_check
  check (report_type = any (array[
    'daily'::text, 'monthly'::text, 'quarterly'::text,
    'worksheet_scores'::text, 'attendance_rate'::text, 'daily_notice'::text,
    'monthly_report'::text
  ]));

commit;
