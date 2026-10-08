-- docs/sql/알리고_고정IP_중계.sql 되돌리기
--
-- 되돌리기 전에: lib/aligo.ts 가 이 함수를 거쳐 보내고 있다.
-- 함수를 지우면 **알림톡 발송이 멈춘다.** 먼저 코드를 되돌리거나 발송을 꺼 둘 것.

drop function if exists public.aligo_call(text, text);

-- http 확장은 2026-10-08 에 이 작업 때문에 켰다.
-- 다른 데서 쓰고 있지 않은 것을 확인한 뒤에만 끈다.
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and pg_get_functiondef(p.oid) like '%extensions.http%';
-- drop extension if exists http;

select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'aligo_call';
-- 위 조회가 0행이면 되돌리기 완료.
