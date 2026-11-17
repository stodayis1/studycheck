-- 「브리핑 저녁 발송 9시」 되돌리기 — 깨움 창을 UTC 08:00~11:50(한국 17:00~20:50)로
--
-- ★ 되돌릴 때는 **코드를 먼저** 되돌린다.
--   lib/cronBriefing.ts 의 eveningNotBefore() 가 평일 '21:00' 인 채로 이 줄만 되돌리면
--   깨움이 20:50 에 끝나 그날 저녁 발송이 통째로 안 나간다.

select cron.schedule('briefing-evening', '*/10 8-11 * * *', $$select public.wake_briefing('evening')$$);

select jobid, jobname, schedule, active, username from cron.job order by jobid;
