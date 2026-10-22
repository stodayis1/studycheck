-- 「미작성알림_1030_추가.sql」 되돌리기 — 10시 30분 알림 예약을 없애고 함수도 원래대로
--
-- ★ 저녁 8시 알림이 **초등만** 가는 것은 코드 쪽이라 이 SQL 로는 안 돌아간다.
--   전원으로 되돌리시려면 lib/cronBriefing.ts 의 `when: 'evening'` 을 지우면 된다
--   (lib/teacherReminder.ts 가 그 값으로 초등만 거른다).
begin;

select cron.unschedule('briefing-remind');

create or replace function public.wake_briefing(p_phase text)
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_secret text;
  v_id bigint;
begin
  if p_phase not in ('evening', 'morning') then
    raise exception '단계는 evening 또는 morning 입니다: %', p_phase;
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

commit;

select jobid, jobname, schedule, active from cron.job order by jobid;
