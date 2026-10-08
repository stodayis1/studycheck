-- docs/sql/카톡브리핑_준비.sql 되돌리기
-- 바꾸기 전 상태를 그대로 떠 둔 것이다.

-- 3) 발송 기록 표 제거
drop table if exists public.briefing_sends;

-- 2) get_report_by_token — 만료 검사가 없던 원래 정의
create or replace function public.get_report_by_token(p_token text)
 returns setof report_links
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select * from public.report_links where token = p_token limit 1;
$function$;

-- 1) 만료 칸 제거 (칸을 지우면 값도 함께 사라진다 — 되돌릴 일이 없게 쓰자)
alter table public.report_links alter column expires_at drop default;
alter table public.report_links drop column if exists expires_at;

-- report_links_token_key 는 토큰 중복을 막는 인덱스라 되돌릴 이유가 없어 남겨 둔다.
-- 꼭 지우려면: drop index if exists public.report_links_token_key;
