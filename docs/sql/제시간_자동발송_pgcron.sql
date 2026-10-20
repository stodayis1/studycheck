-- 학부모 브리핑 자동 발송을 **제시간에** 깨운다 — Supabase pg_cron
--
-- 원장님 2026-10-19~20
--   「11시쯤 나가게 해줘 / 그렇게 늦게 나가면 무슨 소용」
--   「토요일 수업은 오전에 끝나. 오후 6시에 학습브리핑 보내줘」
--
-- 왜 Vercel cron 으로는 안 되나
--   이 플랜의 Vercel cron 은 **하루 한 번**, 그것도 **한 시간 안에 아무 때나** 깨운다.
--   재어 보면 늘 40~50분 늦었다 — 11:49 · 11:49 · 20:40 · 11:49.
--   게다가 하루 한 번짜리로는 토요일 18시와 평일 20시를 같은 자리에서 맞출 수 없다.
--
-- Supabase 는 Pro 라 **분 단위**로 돈다. 알리고로 나가는 그 고정 IP 와 같은 곳이기도 하다.
--
-- ★ 10분마다 깨워도 **하루 한 번만** 발송된다.
--   깨어난 쪽은 /api/cron/briefing/* 을 부를 뿐이고, 그 안에서
--     · 시각으로 막고 (토 18:00 / 평일 20:00 / 오전 11:00 전에는 그냥 돌아간다)
--     · cron_runs 한 줄을 선점해 (같은 날 같은 단계는 한 번만)
--   두 겹으로 지킨다. Vercel cron 도 그대로 두는 이유다 — 둘이 같이 깨워도 한 번만 나간다.
--
-- 비밀값은 **Vault** 에 둔다. cron.job 테이블에 그대로 적으면 대시보드에서 다 보인다.
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ① 비밀값 — Vercel 의 CRON_SECRET 과 **같은 값**이어야 한다.
--   (이 파일에는 값을 적지 않는다. 넣는 문장은 아래 주석 참고)
-- select vault.create_secret('<새 비밀값>', 'studycheck_cron_secret', '브리핑 자동발송 호출용');

-- ② 깨우는 함수. 응답을 기다리지 않는다(pg_net 은 비동기다) — 발송은 1~2분 걸린다.
create or replace function public.wake_briefing(p_phase text)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault', 'pg_temp'
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
    timeout_milliseconds := 300000      -- 발송이 1~2분 걸린다. 넉넉히 둔다.
  ) into v_id;
  return v_id;
end $$;

-- ★ 로그인한 학생·학부모도 authenticated 다. 이 함수가 그들에게 열려 있으면
--   아무나 발송을 깨울 수 있다. 아무에게도 주지 않는다 — pg_cron 은 postgres 로 돈다.
revoke all on function public.wake_briefing(text) from public;
revoke all on function public.wake_briefing(text) from anon;
revoke all on function public.wake_briefing(text) from authenticated;
revoke all on function public.wake_briefing(text) from service_role;
-- 적용 뒤 권한이 {postgres=X/postgres} 인지 꼭 확인할 것 (학생·학부모도 authenticated 다)

commit;

-- ③ 일정 — pg_cron 은 **UTC** 로 돈다 (한국시간 = UTC + 9)
--    저녁: 한국 17:00~21:00 (토 18시·평일 20시 둘 다 덮는다) = UTC 08:00~12:00
--    오전: 한국 11:00~11:59                                  = UTC 02:00~02:59
select cron.schedule('briefing-evening', '*/10 8-11 * * *', $$select public.wake_briefing('evening')$$);
select cron.schedule('briefing-morning', '*/10 2 * * *',    $$select public.wake_briefing('morning')$$);

-- 확인
select jobid, jobname, schedule, active, username from cron.job order by jobid;

-- ④ 잘 닿는지 한 번 눌러 본다. 비밀값이 아직 다르면 **401 이 나는 것이 정상**이다
--    (401 이 난다는 것 자체가 「닿긴 했다」는 뜻이다. 아무 응답이 없으면 그게 문제다)
-- select public.wake_briefing('morning');
-- select id, status_code, left(content,200), error_msg from net._http_response order by id desc limit 3;
