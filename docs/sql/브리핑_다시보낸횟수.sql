-- 브리핑을 다시 보낸 횟수를 기록할 칸
--
-- 원장님 2026-10-27 「이 학생만 보내기 버튼이 활성화 되질 않네. 활성화해줘.
--   그래야 못 받았다는 사람 다시 보내지」
--
-- 왜 칸이 필요한가
--   briefing_sends 에는 (student_id, session_date) 유일 제약(briefing_sends_once)이 있다.
--   그 제약이 **저녁 8시와 다음 날 11시 두 번 도는 자동 발송이 같은 사람에게 두 번
--   보내는 것**을 막아 준다 — 그래서 없애면 안 된다.
--   대신 원장님이 **일부러** 다시 보내실 때는 그 줄을 덮어쓰고 횟수만 올린다.
--
-- ★ 빈 칸 두 개를 더한다. 지금 자료는 그대로다.
begin;

alter table public.briefing_sends
  add column if not exists resend_count integer not null default 0,
  add column if not exists last_resent_at timestamptz,
  add column if not exists last_resent_by text;

comment on column public.briefing_sends.resend_count is
  '원장님이 손으로 다시 보낸 횟수. 자동 발송은 이 값을 올리지 않는다 (2026-10-27).';

commit;

-- 확인
select column_name, data_type from information_schema.columns
where table_name = 'briefing_sends' order by ordinal_position;
