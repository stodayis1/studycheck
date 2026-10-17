-- 자동 발송이 **하루에 한 번만** 돌도록 자리를 만든다 (원장님 2026-10-17).
--
-- 왜
--   Vercel 예약이 40~50분 늦게 깨운다. 저녁 8시 것이 20:41 에, 오전 11시 것이 11:50 에
--   돌았다. 「그렇게 늦게 나가면 무슨 소용」이라는 말씀.
--
--   그래서 깨우는 시각을 **여러 번**으로 늘리고(10분마다), 라우트에서
--     ① 정해진 시각 전에는 그냥 돌아간다
--     ② 그날 이미 돌았으면 그냥 돌아간다
--   로 막는다. 그러면 11시 직후 첫 깨움이 일을 하고 나머지는 조용히 지나간다.
--
--   ②를 하려면 「오늘 돌았다」를 적어 둘 자리가 필요하다. 학부모 발송은 briefing_sends
--   가 중복을 막아 주지만, 담당강사 샘플과 미작성 알림 문자는 막을 길이 없어서
--   깨울 때마다 또 나간다.
--
-- 덤으로 — 「예약이 돈 적이 있나」를 이 표만 보면 알 수 있다. 그동안은 알 길이 없어
--   접속 기록을 뒤지거나 결과로 짐작해야 했다.

create table if not exists public.cron_runs (
  id          bigserial primary key,
  phase       text not null,                 -- evening · morning
  run_date    date not null,                 -- 한국 날짜
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  result      jsonb,
  unique (phase, run_date)
);

alter table public.cron_runs enable row level security;

drop policy if exists staff_read on public.cron_runs;
create policy staff_read on public.cron_runs
  for select to authenticated using ((select public.is_staff()));
-- 쓰기 정책은 두지 않는다. 자동 발송이 서비스롤로만 적는다.
