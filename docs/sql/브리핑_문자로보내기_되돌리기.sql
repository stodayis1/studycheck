-- 「이 학생은 알림톡 대신 문자로」 되돌리기.
--
-- ★ 되돌릴 때는 **끄는 것만으로 충분하다.** 칸을 떼지 않아도 전부 알림톡으로 돌아간다.
--   칸을 떼면 그동안 켜 둔 학생 표시가 사라지고, 발송 기록의 「어느 길로 나갔나」도 없어진다.
-- ★ 끄기 전에 **왜 켰는지**를 보고 끈다 — 카카오가 그 번호를 아직 막고 있으면,
--   끄는 순간 그 집은 브리핑을 **아예 못 받는다**(알림톡이 조용히 거절된다).

-- ① 지금 켜져 있는 학생
select name, grade, brief_by_sms from public.students
where brief_by_sms = true order by grade, name;

-- ② 문자로 나간 기록
select count(*) as 문자로나간건수, min(session_date) as 처음, max(session_date) as 마지막
from public.briefing_sends where channel = 'sms';

-- ③ 한 학생만 끄기 (가장 흔한 되돌리기)
-- update public.students set brief_by_sms = false where name = '최온유' and is_active = true;

-- ④ 전부 끄기
-- update public.students set brief_by_sms = false where brief_by_sms = true;

-- ⑤ 칸까지 떼기 — **앱을 먼저 되돌린 뒤에만.** 칸이 없는 채로 지금 코드가 돌면
--    학생 읽기가 통째로 실패해서 브리핑이 한 건도 안 나간다.
-- begin;
-- alter table public.students drop column if exists brief_by_sms;
-- alter table public.briefing_sends drop column if exists channel;
-- commit;

-- 확인
select column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'students' and column_name = 'brief_by_sms')
    or (table_name = 'briefing_sends' and column_name = 'channel'));
