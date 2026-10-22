-- 「진우영재_졸음_알림장_1022.sql」 되돌리기 — 넣은 알림장 두 줄을 지운다
--
-- ★ 오전 11시 브리핑이 **나가기 전에만** 의미가 있다.
--   이미 나갔으면 학부모님 카톡은 되돌릴 수 없다 — 지워도 앱 화면에서만 사라진다.
--   나갔는지는 아래 select 로 먼저 본다.
begin;

delete from public.feedbacks
where id in ('a1000000-1022-4000-8000-000000000001',   -- 이진우
             'a1000000-1022-4000-8000-000000000002');  -- 박영재

commit;

-- 되돌리기 전에 먼저 볼 것 — 10/22 브리핑이 이미 나갔는지
select st.name, bs.sent_at, bs.body_len
from public.briefing_sends bs join public.students st on st.id = bs.student_id
where bs.session_date = '2026-10-22' and st.name in ('이진우','박영재');
