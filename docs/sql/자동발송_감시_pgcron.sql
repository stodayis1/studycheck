-- 자동 발송이 **조용히 멈추지 않았나** 하루 두 번 점검한다 — Supabase pg_cron (원장님 2026-10-26)
--
-- 깨우는 곳: /api/cron/briefing/watch  (lib/cronBriefing.ts runWatchCron · 점검은 lib/cronHealth.ts)
--   · 한국 12:30 · 21:30 에 돈다 (UTC 03:30 · 12:30)
--   · 문제가 없으면 아무것도 안 보낸다. 있으면 원장님 번호로만 문자 한 통.
--   · 감시 자신도 cron_runs 에 watch-noon · watch-night 로 남는다.
--
-- 바꾸는 것은 두 가지뿐이다. 테이블은 손대지 않는다.
--   ① wake_briefing 이 받는 단계에 'watch' 를 더한다 (나머지는 지금 운영 중인 정의 그대로)
--   ② 예약 'briefing-watch' 하나를 더한다
-- 되돌리기: 자동발송_감시_pgcron_되돌리기.sql
begin;

create or replace function public.wake_briefing(p_phase text)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $$
declare
  v_secret text;
  v_id bigint;
begin
  if p_phase not in ('evening', 'morning', 'remind', 'watch') then
    raise exception '단계는 evening · morning · remind · watch 입니다: %', p_phase;
  end if;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'studycheck_cron_secret';
  if v_secret is null then
    raise exception 'Vault 에 studycheck_cron_secret 이 없습니다';
  end if;

  select net.http_get(
    url := 'https://studycheck-five.vercel.app/api/cron/briefing/' || p_phase,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 300000
  ) into v_id;
  return v_id;
end
$$;

-- create or replace 는 권한을 그대로 둔다. 그래도 한 번 더 막아 둔다(학생·학부모도 authenticated 다).
revoke all on function public.wake_briefing(text) from public, anon, authenticated, service_role;

commit;

-- ② 한국 12:30 · 21:30 = UTC 03:30 · 12:30
select cron.schedule('briefing-watch', '30 3,12 * * *', $$select public.wake_briefing('watch')$$);

-- 확인 — 권한은 {postgres=X/postgres} 여야 한다
select proacl from pg_proc where proname = 'wake_briefing';
select jobid, jobname, schedule, active from cron.job order by jobid;
