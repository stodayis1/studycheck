-- ★ 2026-10-31 부터 이 알림은 **오전 10시**에 나간다 (원장님 「문자는 오전 10시에 보내자」).
--    예약(pg_cron)은 그대로다 — 한국 10:00~10:50 에 10분마다 깨우고, 막는 시각만
--    라우트에서 10:30 → 10:00 으로 바꿨다. 아래 글은 처음 넣을 때의 기록이다.
-- 수업일지 미작성 알림을 **오전 10시 30분**에 한 번 더 — 11시 발송 직전
--
-- 원장님 2026-10-22
--   「오후 8시에 초등학생 학습브리핑이 나갈때 굳이 중고등 강사에게는 학습일지 미작성
--     안내를 안내보내도 될 거 같아. 어차피 대부분 다음날 오전 11시에 학습브리핑이 나가니까.
--     차라리 오전 11시 전 한 10시 30분경에 학습일지 미작성 상태인 알림을 주면
--     학습브리핑 발송 직전에 혹시 놓친 학습일지가 있더라도 얼렁 작성할 수 있잖아.」
--
-- 바뀌는 것
--   · 저녁 8시 알림 → **초등만** (코드 쪽에서 거른다. 이 SQL 과 무관)
--   · 오전 10시 30분 알림 → **새로 생김** (이 SQL). 전날 수업 중 아직 빈 것 전부.
--   · 학부모 발송 시각(저녁 8시 · 다음 날 11시)은 **그대로**다. 이 예약은 문자만 보낸다.
--
-- 왜 01 시(UTC)에 10분마다 깨우나
--   pg_net 호출이 밀릴 수 있어 넉넉히 깨우고, 라우트 쪽에서 10:30 전이면 그냥 돌아간다.
--   10:55 를 넘으면 11시 발송에 너무 가까워 보내지 않는다. 하루 한 번만 돈다
--   (cron_runs 의 phase='premorning' 자리잡기).
begin;

-- wake_briefing 이 'remind' 도 받도록 — 주소 끝에 그대로 붙는다
--   https://studycheck-five.vercel.app/api/cron/briefing/remind
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

-- 01:00~01:59 UTC = 한국 10:00~10:59. 라우트가 10:30 전이면 그냥 돌아간다.
select cron.schedule('briefing-remind', '*/10 1 * * *', $$select public.wake_briefing('remind')$$);

commit;

-- 확인
select jobid, jobname, schedule, active from cron.job order by jobid;
