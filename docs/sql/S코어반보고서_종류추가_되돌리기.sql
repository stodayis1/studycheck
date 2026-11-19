-- 되돌리기 — report_links 의 보고서 종류에서 'score_class' 를 뺀다.
--
-- ★ 이미 만든 S코어반 보고서 줄이 있으면 **규칙을 되돌릴 수 없다**(기존 줄이 규칙을 어긴다).
--   먼저 그 줄을 지워야 한다. 지우면 **보내 드린 링크가 죽는다** — 학부모님이 열어 보신
--   보고서가 사라지므로, 정말 되돌려야 할 때만 아래 주석을 풀고 돌린다.

-- delete from public.report_links where report_type = 'score_class';

begin;

alter table public.report_links drop constraint if exists report_links_report_type_check;
alter table public.report_links add constraint report_links_report_type_check
  check (report_type = any (array[
    'daily'::text, 'monthly'::text, 'quarterly'::text,
    'worksheet_scores'::text, 'attendance_rate'::text, 'daily_notice'::text,
    'monthly_report'::text
  ]));

commit;

-- 확인 — 0 이어야 한다
select count(*) as 남았나 from pg_constraint
 where conname = 'report_links_report_type_check'
   and pg_get_constraintdef(oid) like '%score_class%';
