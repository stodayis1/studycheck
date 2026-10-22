-- 「지훈다윤_1021_브리핑_다시보내기.sql」 되돌리기 — 지웠던 발송 기록을 그대로 되살린다
--
-- 되돌리면 「이 학생만 보내기」 단추가 다시 잠긴다(이미 보낸 것으로 보이므로).
-- 이미 다시 보내신 뒤라면 그 새 기록이 남아 있으니, 그때는 되돌릴 필요가 없다
-- (같은 학생·같은 날에 두 줄이 생겨 버린다 — 아래 select 로 먼저 확인할 것).
begin;

insert into public.briefing_sends (id, student_id, session_date, session_id, to_phone, status, error, body_len, sent_at)
values
  ('b20b5d46-0157-4818-8e86-eea2d1c6b93f', '43ae14d0-5392-40d8-8152-0ac26f9ad67f', '2026-10-21',
   'dca9a4c2-7a5b-4032-9d60-2149e3cdb12e', '010-8918-0222', 'sent', null, 153, '2026-10-21 11:00:54.467519+00'),
  ('a9831bd5-228f-4505-ac9d-20b93818c1c8', '367ced4f-5f29-4859-9ab1-fe76855aef85', '2026-10-21',
   'be2b16b0-816c-423b-89de-425e47870678', '010-9352-1053', 'sent', null, 153, '2026-10-21 11:00:50.234254+00')
on conflict (id) do nothing;

commit;

-- 되돌리기 전에 먼저 볼 것 — 이미 다시 보내신 기록이 있는지
select st.name, bs.body_len, bs.sent_at
from public.briefing_sends bs join public.students st on st.id = bs.student_id
where bs.session_date = '2026-10-21' and st.name in ('이지훈', '최다윤');
