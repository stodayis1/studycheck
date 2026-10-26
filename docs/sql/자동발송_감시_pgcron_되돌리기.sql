-- 「자동발송_감시_pgcron.sql」 되돌리기
--
-- 감시만 멈춘다. 학부모 발송(evening · morning)과 강사 알림(remind)은 그대로 돈다.
select cron.unschedule('briefing-watch');

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
  if p_phase not in ('evening', 'morning', 'remind') then
    raise exception '단계는 evening · morning · remind 입니다: %', p_phase;
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

revoke all on function public.wake_briefing(text) from public, anon, authenticated, service_role;

commit;

-- 대시보드 띠는 감시 기록이 없으면 「점검 안 돎」을 띄운다.
-- 감시를 아주 그만둘 때는 lib/cronHealth.ts 의 CRON_SLOTS 에서 watch-noon · watch-night 두 줄도 지울 것.
