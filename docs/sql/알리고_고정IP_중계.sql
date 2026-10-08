-- 알리고를 **Supabase 를 거쳐** 부른다 (2026-10-08)
--   되돌리기: docs/sql/알리고_고정IP_중계_되돌리기.sql
--
-- 왜
--   알리고는 **등록된 고정 IP 에서만** API 를 받는다. 고객센터 답변도 같다 —
--   "유동 IP 만 가능한 상황이라면 발송 로직을 별도의 고정 IP 서버에서 호출해 달라."
--   그런데 Vercel 서버리스는 나가는 IP 가 매번 바뀌어 등록할 수가 없다.
--
--   ★ 그 "고정 IP 서버" 가 이미 있다 — Supabase 다.
--     여기서 http 로 나가면 항상 같은 IP 로 나간다(2026-10-08 측정: 16.184.57.154, 6회 동일).
--     서버를 새로 사거나 관리할 필요가 없다.
--
--   그래서 Vercel 은 지금처럼 본문을 만들고 링크를 찍고, **알리고로 나가는 마지막 한 번만**
--   이 함수를 거친다.
--
-- 보안
--   · SECURITY DEFINER 지만 **service_role 만** 부를 수 있다(서버 API 전용).
--     학생·학부모·강사는 물론 비로그인도 못 부른다.
--   · 보낼 수 있는 주소를 **kakaoapi.aligo.in 으로 못박았다.** 안 그러면 이 함수가
--     "아무 데나 요청을 보내 주는 창구"가 된다(SSRF).
--   · 알리고 API 키는 **여기 저장하지 않는다.** Vercel 환경변수에 두고 호출할 때 넘긴다.

create extension if not exists http with schema extensions;

create or replace function public.aligo_call(p_path text, p_form text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare r extensions.http_response;
begin
  -- ★ 주소를 못박는다. 경로만 받고 호스트는 코드가 정한다.
  if p_path !~ '^/akv10/[a-z/]+/$' then
    raise exception '허용되지 않는 알리고 경로입니다: %', p_path;
  end if;

  select * into r from extensions.http((
    'POST',
    'https://kakaoapi.aligo.in' || p_path,
    array[extensions.http_header('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')],
    'application/x-www-form-urlencoded',
    p_form
  )::extensions.http_request);

  return jsonb_build_object('status', r.status, 'body', r.content);
exception when others then
  -- 알리고가 느리거나 끊겨도 **예외로 터뜨리지 않는다.** 부르는 쪽이 사람 말로 알려 준다.
  return jsonb_build_object('status', 0, 'body', null, 'error', sqlerrm);
end $$;

-- 서버 API(service_role) 만 쓴다.
revoke all on function public.aligo_call(text, text) from public, anon, authenticated;
grant execute on function public.aligo_call(text, text) to service_role;

-- 확인용 — 아직 알리고에 IP 등록 전이면 code -99 가 나오는 것이 정상이다.
select public.aligo_call('/akv10/token/create/30/s/', 'apikey=x&userid=x');
