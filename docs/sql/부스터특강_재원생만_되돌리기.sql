-- 부스터 특강 — 재원생만 신청 되돌리기 (2026-11-21)
-- docs/sql/부스터특강_재원생만.sql 을 적용하기 전 모양으로 돌린다.
-- ★ 신청 명단(booster_applications)은 건드리지 않는다.

begin;

create or replace function public.booster_apply(
  p_slug text, p_student_name text, p_grade text, p_parent_name text,
  p_parent_phone text, p_phone_digits text, p_is_enrolled boolean, p_agreed_count integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s      public.booster_sessions%rowtype;
  v_seat int;
  v_id   uuid;
begin
  select * into s from public.booster_sessions where slug = p_slug for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  if not s.is_open then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if now() < s.opens_at then
    return jsonb_build_object('ok', false, 'reason', 'not_yet',
                              'opens_at', s.opens_at);
  end if;

  if s.seats_taken >= s.capacity then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  if coalesce(p_agreed_count, 0) < 3 then
    return jsonb_build_object('ok', false, 'reason', 'need_agreement');
  end if;

  if exists (
    select 1 from public.booster_applications
    where session_id = s.id
      and status = 'confirmed'
      and phone_digits = p_phone_digits
      and student_name = p_student_name
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  v_seat := s.seats_taken + 1;

  insert into public.booster_applications
    (session_id, seat_no, student_name, grade, parent_name, parent_phone,
     phone_digits, is_enrolled, agreed_count)
  values
    (s.id, v_seat, p_student_name, p_grade, p_parent_name, p_parent_phone,
     p_phone_digits, p_is_enrolled, p_agreed_count)
  returning id into v_id;

  update public.booster_sessions
     set seats_taken = v_seat
   where id = s.id;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'seat_no', v_seat,
    'seats_taken', v_seat, 'capacity', s.capacity);

exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'race');
end;
$function$;

revoke all on function public.booster_apply(text, text, text, text, text, text, boolean, int) from public;
grant execute on function public.booster_apply(text, text, text, text, text, text, boolean, int) to service_role;

alter table public.booster_sessions drop column if exists enrolled_only;

commit;
