-- 월간 리포트를 **카톡으로 보낸 기록**을 남길 칸 (2026-11-05)
-- 되돌리기: 월간보고서_발송기록_되돌리기.sql
--
-- 원장님 2026-11-05
--   「한명한명 링크를 만들어서 일일이 보낼수가 없거든? 학년별로 일괄 월말보고서 생성하여
--    카톡으로 전송하는 기능까지 만들어놓으면 어떨까」
--
-- ★ 이 칸이 없으면 **같은 분께 두 번 간다.** 보낸 기록을 남길 자리가 없기 때문이다.
--   그래서 앱은 이 칸이 없으면 **한 건도 보내지 않고** 멈춘다(일부러 그렇게 막아 뒀다).
-- ★ sent_at 은 **링크를 만든 때**다(지금까지 그렇게 쓰고 있었다). 보낸 때와 다르므로
--   새 칸을 둔다 — 옛 뜻을 바꾸면 이미 쌓인 2,900여 줄의 뜻이 조용히 달라진다.
-- ★ 더하기만 한다. 앱 배포 전에 실행해도 아무 일이 없다.

begin;

alter table public.report_links add column if not exists kakao_sent_at timestamptz;
alter table public.report_links add column if not exists kakao_mid     text;

comment on column public.report_links.sent_at       is '링크를 만든 때';
comment on column public.report_links.kakao_sent_at is '학부모님께 알림톡으로 보낸 때. 비어 있으면 아직 안 보낸 것';
comment on column public.report_links.kakao_mid     is '알리고 발송 묶음 번호(mid) — 나중에 도착 결과를 맞춰 볼 때';

-- 같은 달에 이미 보냈는지 찾는 질의가 빨라지게
create index if not exists report_links_monthly_sent
  on public.report_links (report_type, period_start) where kakao_sent_at is not null;

commit;

-- 확인
-- select count(*) from public.report_links where kakao_sent_at is not null;   -- 처음엔 0
