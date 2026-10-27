-- 「브리핑_다시보낸횟수.sql」 되돌리기 — 더한 칸을 뺀다
--
-- ★ 칸을 빼면 「몇 번 다시 보냈는지」 기록도 같이 사라진다. 발송 기록 자체는 그대로다.
begin;

alter table public.briefing_sends
  drop column if exists resend_count,
  drop column if exists last_resent_at,
  drop column if exists last_resent_by;

commit;

select column_name from information_schema.columns
where table_name = 'briefing_sends' order by ordinal_position;
