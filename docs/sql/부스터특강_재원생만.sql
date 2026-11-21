-- 부스터 특강 — 재원생만 신청 (2026-11-21)
--
-- 원장님 2026-11-21: 「부스터는 참고로 재원생 대상이야」
--                   「중1-1 재원생이 아니면 신청 못하게 우리 프로그램에서 막으면 되지」
--
-- ★ 신청서의 「다니고 있나요? 네/아니요」는 누구나 「네」를 누를 수 있다. 그래서 그 답을 믿지 않고
--   **학생 이름 + 학원에 등록된 번호**가 students 에 있는지 DB 안에서 본다.
--     · 이름: 띄어쓰기를 빼고 같으면 같은 이름
--     · 번호: 숫자만 남겨 보호자 번호(parent_phone) 또는 학생 번호(student_phone) 와 같으면
--     · 재원생 = students.is_active (휴원 중인 학생도 재원생으로 본다)
--   2026-11-21 기준 재원생 191명 모두 보호자 번호가 10~11자리로 들어 있다.
--
-- ★ 특강마다 켜고 끈다 — booster_sessions.enrolled_only. 실제 중1-1 과 연습용 줄 모두 켠다.
--   (동시 접수 시험 scripts/booster-race-test.mjs 는 시험하는 동안만 연습용 줄을 끄고, 끝나면 다시 켠다.)
--
-- ★ 더하기만 한다. 표에 칸 하나를 더하고, booster_apply() 를 **같은 꼴(인자 8개)** 로 다시 쓴다.
--   정원을 지키는 잠금·자리번호·check 는 한 줄도 바꾸지 않았다.
-- ★ 되돌리기: docs/sql/부스터특강_재원생만_되돌리기.sql

begin;

alter table public.booster_sessions
  add column if not exists enrolled_only boolean not null default false;

update public.booster_sessions
   set enrolled_only = true
 where slug in ('yebi-jung1-booster-2026-12', 'yebi-jung1-booster-2026-12-test');

create or replace function public.booster_apply(
  p_slug text, p_student_name text, p_grade text, p_parent_name text,
  p_parent_phone text, p_phone_digits text, p_is_enrolled boolean, p_agreed_count integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s          public.booster_sessions%rowtype;
  v_seat     int;
  v_id       uuid;
  v_enrolled boolean;
begin
  -- 1겹 — 특강 행을 잠근다. 같은 순간에 들어온 사람들이 여기서 한 줄로 선다.
  select * into s from public.booster_sessions where slug = p_slug for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  if not s.is_open then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  -- 시각은 DB 시계로 본다. 브라우저 시계는 사람이 바꿀 수 있다.
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

  -- ★ 재원생인가 — 신청서의 답(p_is_enrolled)이 아니라 students 에서 본다.
  v_enrolled := exists (
    select 1 from public.students st
     where st.is_active
       and replace(st.name, ' ', '') = replace(coalesce(p_student_name, ''), ' ', '')
       and coalesce(p_phone_digits, '') <> ''
       and (regexp_replace(coalesce(st.parent_phone, ''),  '\D', '', 'g') = p_phone_digits
         or regexp_replace(coalesce(st.student_phone, ''), '\D', '', 'g') = p_phone_digits)
  );

  if s.enrolled_only and not v_enrolled then
    return jsonb_build_object('ok', false, 'reason', 'not_enrolled');
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

  -- is_enrolled 에는 신청서의 답이 아니라 **DB 로 확인한 값**을 적는다.
  insert into public.booster_applications
    (session_id, seat_no, student_name, grade, parent_name, parent_phone,
     phone_digits, is_enrolled, agreed_count)
  values
    (s.id, v_seat, p_student_name, p_grade, p_parent_name, p_parent_phone,
     p_phone_digits, v_enrolled, p_agreed_count)
  returning id into v_id;

  -- 3겹 — 이 update 가 capacity 를 넘기면 check 제약에 걸려 통째로 되돌아간다.
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

-- 권한은 그대로 — 서버(service_role)만 부른다
revoke all on function public.booster_apply(text, text, text, text, text, text, boolean, int) from public;
grant execute on function public.booster_apply(text, text, text, text, text, text, boolean, int) to service_role;
-- ★ public 에서 빼는 것만으로는 안 막힌다 — Supabase 는 anon·authenticated 에 따로 권한을 준다.
--   2026-11-21 적용 뒤 확인해 보니 둘 다 직접 부를 수 있었다. 서버만 부르므로 뺀다.
revoke execute on function public.booster_apply(text, text, text, text, text, text, boolean, int) from anon, authenticated;

commit;
