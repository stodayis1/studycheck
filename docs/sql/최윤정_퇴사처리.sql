-- 최윤정 선생님 퇴사 처리 — StudyCheck 쪽 (2026-10-08, 원장님 지시)
--   되돌리기: docs/sql/최윤정_퇴사처리_되돌리기.sql
--   OPS 쪽은 sumath-admin/sql/2026-10-08_최윤정_퇴사처리.sql (적용 완료)
--
-- 계정은 지우지 않는다. 수업기록 50건·상담 5건·시험 4건·알림장 3건이 「최윤정」이라는
-- **이름 글자**로 남아 있어(외래키가 아니다) 계정을 지워도 사라지지 않고,
-- 나중에 "이 수업 누가 했지?" 를 되짚을 때 계정이 없으면 오히려 불편하다.
--
-- ★ 여기서 알게 된 것: `users.is_locked` 는 **코드 어디에서도 쓰이지 않고 있었다.**
--   즉 지금껏 '잠긴' 계정도 멀쩡히 로그인됐다. 이 파일에서 Auth 로 실제로 막고,
--   코드 쪽(lib/apiAuth.ts, 업무 현황 목록)에서도 is_locked 를 보도록 함께 고친다.

-- ── 1) 담당 표기에서 최윤정 선생님을 뺀다 ─────────────────────────────────
-- 현재 11명이 '최윤정, 이규숙' 공동 담당으로 적혀 있다(전원 재원).
-- OPS 에서는 이미 이규숙 선생님께 넘겼다.
update public.students
   set teacher_name = '이규숙', updated_at = now()
 where teacher_name = '최윤정, 이규숙';

-- ── 2) 로그인 차단 ────────────────────────────────────────────────────────
-- users.is_locked 는 표시용으로 두고, **실제 차단은 Auth 에서** 한다.
update public.users set is_locked = true where name = '최윤정';
update auth.users
   set banned_until = timestamptz '2099-12-31 00:00:00+00'
 where id = (select id from public.users where name = '최윤정');

-- ── 확인용 ────────────────────────────────────────────────────────────────
select
  (select count(*) from public.students where teacher_name like '%최윤정%') as 최윤정_남은_담당표기,
  (select count(*) from public.students where teacher_name = '이규숙' and is_active) as 이규숙_담당_재원,
  (select is_locked from public.users where name = '최윤정') as 잠김표시,
  (select banned_until from auth.users
     where id = (select id from public.users where name = '최윤정')) as 로그인차단까지;
