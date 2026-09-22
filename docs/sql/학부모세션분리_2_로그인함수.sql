-- 학부모 세션 분리 ② 로그인 함수가 새 칸을 쓰게 한다
--
-- ⚠️ 반드시 이 순서를 지킬 것
--    1) 학부모세션분리_1_칸추가와정책확대.sql 실행 (먼저)
--    2) 앱 배포 — app/api/push/subscribe 가 두 칸을 모두 보는 버전
--    3) 이 파일           ← 지금 여기
--
--    2)를 건너뛰고 이 파일을 먼저 돌리면, 학부모가 「알림 켜기」를 눌렀을 때만 403이 난다
--    (화면 자체는 ①에서 정책을 이미 넓혔으므로 정상이다).
--
-- 바뀌는 것: p_role='parent' 로그인은 parent_session_uid에 기록한다. 학생 로그인은 그대로
--            session_uid에 기록한다. 이제 둘이 서로를 밀어내지 않는다.
--            (같은 역할끼리는 여전히 마지막 기기 하나만 유지된다 — 학부모가 폰과 PC에서
--             번갈아 로그인하면 마지막 것만 살아있다. 기존 동작과 같다.)
--
-- 되돌리기: 아래 함수에서 parent 분기의 `parent_session_uid`를 `session_uid`로 바꿔서 다시
--           create or replace 하면 원래 동작으로 돌아간다. ①의 정책이 두 칸을 모두 받아주므로
--           되돌리는 중에도 아무도 잠기지 않는다. 데이터는 지우지 않는다.

begin;

create or replace function public.student_login(p_login_id text, p_phone_last4 text, p_role text default 'student'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_student public.students%rowtype;
  v_dup_count int;
  v_key text := trim(p_login_id);
  v_fails int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  -- 최근 15분 안에 실패 5번이면 잠금
  select count(*) into v_fails
  from public.student_login_attempts
  where login_id = v_key and ok = false and attempted_at > now() - interval '15 minutes';

  if v_fails >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  select * into v_student from public.students where login_id = v_key and is_active = true limit 1;

  if not found then
    insert into public.student_login_attempts(login_id, ok) values (v_key, false);
    select count(*) into v_dup_count from public.students where name = v_key and is_active = true;
    if v_dup_count > 1 then
      return jsonb_build_object('ok', false, 'reason', 'duplicate');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_phone_last4 is null or length(p_phone_last4) <> 4
     or right(regexp_replace(coalesce(v_student.parent_phone, ''), '[^0-9]', '', 'g'), 4) <> p_phone_last4 then
    insert into public.student_login_attempts(login_id, ok) values (v_key, false);
    return jsonb_build_object('ok', false, 'reason', 'bad_password');
  end if;

  -- 성공하면 그 아이디의 실패 기록을 지워서 다음에 걸리지 않게 한다
  delete from public.student_login_attempts where login_id = v_key and ok = false;
  insert into public.student_login_attempts(login_id, ok) values (v_key, true);

  -- ★ 여기가 바뀐 부분: 학부모는 자기 칸에 기록한다 (학생 세션을 밀어내지 않는다)
  if p_role = 'parent' then
    update public.students
       set parent_session_uid = auth.uid(), parent_last_login_at = now()
     where id = v_student.id;
  else
    update public.students
       set session_uid = auth.uid(), student_last_login_at = now()
     where id = v_student.id;
  end if;

  return jsonb_build_object('ok', true, 'student_id', v_student.id, 'student_name', v_student.name);
end;
$function$;

commit;

-- ── 확인용 ─────────────────────────────────────────────────────────────────
-- 실행 후 학부모 앱에서 한 번 로그인해보고, 그 학생 행에 parent_session_uid가 채워지는지 본다.
--
-- select name, session_uid, parent_session_uid, student_last_login_at, parent_last_login_at
-- from students where login_id = '확인할아이디';
