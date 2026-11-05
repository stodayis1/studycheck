-- 월간보고서_발송기록.sql 되돌리기 (2026-11-05)
--
-- ★ 칸을 지우면 **누구에게 보냈는지 기록이 사라진다.** 그러면 앱이 발송을 막는다
--   (기록 없이 보내면 같은 분께 두 번 가기 때문이다).
-- ★ 지우기 전에 몇 건이 쌓였는지 보세요:
--     select count(*) from public.report_links where kakao_sent_at is not null;

begin;

drop index if exists public.report_links_monthly_sent;
alter table public.report_links drop column if exists kakao_mid;
alter table public.report_links drop column if exists kakao_sent_at;

commit;
