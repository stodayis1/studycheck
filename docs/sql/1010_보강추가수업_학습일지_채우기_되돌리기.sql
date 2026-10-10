-- 되돌리기 — 10/10 보강·추가수업으로 만든 수업·학습일지 삭제 (2026-10-10)
--
-- session_type 이 '보강'/'추가수업' 인 것만 지운다. 담당 강사가 쓴 '정규' 수업은 건드리지 않는다.

begin;

delete from public.learning_notes
 where session_id in (
   select id from public.class_sessions
    where session_date = '2026-10-10' and session_type in ('보강', '추가수업'));

delete from public.class_sessions
 where session_date = '2026-10-10' and session_type in ('보강', '추가수업');

commit;
