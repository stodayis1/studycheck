-- 「제시간_자동발송_pgcron.sql」 되돌리기
--
-- 되돌려도 **발송은 멈추지 않는다** — Vercel cron 이 그대로 남아 있다(늦게 나갈 뿐).
select cron.unschedule('briefing-evening');
select cron.unschedule('briefing-morning');

drop function if exists public.wake_briefing(text);

-- 비밀값까지 치울 때만:
-- delete from vault.secrets where name = 'studycheck_cron_secret';

-- 확장은 다른 데서 쓸 수 있으니 지우지 않는다.
