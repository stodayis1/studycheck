-- docs/sql/최윤정_퇴사처리.sql 되돌리기
--
-- 바꾸기 **전** 상태를 그대로 떠 둔 것이다 (2026-10-08 기준).
--   · 학생 11명의 teacher_name 이 '최윤정, 이규숙' 이었다 (전원 재원):
--       신연우(초3) · 장율리(초3) · 유리예(초4) · 김지용(초5) · 김하루(초5) · 신서린(초5)
--       김태은(초6) · 박소연(초6) · 박지환(초6) · 손예원(초6) · 오지승(초6)
--     ※ 장율리는 OPS 에서는 이미 이규숙 선생님 담당이었고 StudyCheck 표기만 남아 있었다.
--       되돌릴 때 이 학생까지 '최윤정, 이규숙' 으로 되돌리면 OPS 와 다시 어긋난다 —
--       그래서 아래 목록에서 장율리는 **뺐다.**
--   · users.is_locked 는 true 였다(다만 코드에서 안 쓰이고 있었다).
--   · auth.users.banned_until 은 null 이었다.

-- ── 1) 담당 표기 되돌리기 ─────────────────────────────────────────────────
update public.students
   set teacher_name = '최윤정, 이규숙', updated_at = now()
 where teacher_name = '이규숙'
   and name in ('신연우','유리예','김지용','김하루','신서린',
                '김태은','박소연','박지환','손예원','오지승');

-- ── 2) 로그인 차단 풀기 ───────────────────────────────────────────────────
update auth.users set banned_until = null
 where id = (select id from public.users where name = '최윤정');
-- is_locked 는 바꾸기 전에도 true 였으므로 그대로 둔다.
-- (완전히 되살리려면: update public.users set is_locked = false where name = '최윤정';)

select
  (select count(*) from public.students where teacher_name like '%최윤정%') as 최윤정_담당표기,
  (select banned_until from auth.users
     where id = (select id from public.users where name = '최윤정')) as 로그인차단까지;
-- 담당표기 10 · 로그인차단 null 이면 되돌리기 완료.
