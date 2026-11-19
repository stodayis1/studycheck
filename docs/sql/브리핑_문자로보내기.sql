-- 「이 학생은 알림톡 대신 문자로」 (원장님 2026-11-19)
--
-- 왜
--   최온유(초3) 학부모님 번호를 카카오가 **스팸으로 막아** 알림톡이 계속 거절된다
--   (11/17 브리핑 1건 + 11/18 재발송 2건, 모두 사유 「스팸」). 다시 보내도 같다.
--   원장님 「앞으로는 문자로 보내겠다」 · 「오늘 수업부터 문자로 발송하면 됨」.
--
-- 더하기만 한다 — 기존 칸·정책·자료는 하나도 건드리지 않는다.
-- 기본값은 false 라, 이 SQL 만 돌려서는 **아무 학생도 달라지지 않는다.**
-- 되돌리기: docs/sql/브리핑_문자로보내기_되돌리기.sql

begin;

-- ① 학생마다 「문자로 보낼까」 표시
alter table public.students
  add column if not exists brief_by_sms boolean not null default false;

comment on column public.students.brief_by_sms is
  '켜면 학부모 수업 브리핑을 알림톡 대신 문자로 보낸다 (카카오가 번호를 막은 집). 2026-11-19';

-- ② 발송 기록에 **어느 길로 나갔나**
--    문자로 나간 건은 알림톡 점검(aligo 결과 대조)에 안 잡힌다 — 이 칸이 없으면
--    「왜 이 학생만 점검에 없지」를 알 길이 없다.
alter table public.briefing_sends
  add column if not exists channel text;

comment on column public.briefing_sends.channel is
  'alimtalk | sms — 이 브리핑이 나간 길. 2026-11-19부터 적는다(그 전 줄은 비어 있고 전부 알림톡이다).';

commit;

-- ③ 최온유 학생 켜기 ─────────────────────────────────────────────────────────
-- ★ 이 줄만 따로 돌리셔도 됩니다. 이름이 정확히 하나일 때만 켜집니다.
update public.students set brief_by_sms = true
where name = '최온유' and is_active = true
  and (select count(*) from public.students where name = '최온유' and is_active = true) = 1;

-- 확인 ────────────────────────────────────────────────────────────────────
select name, grade, brief_by_sms from public.students
where brief_by_sms = true order by grade, name;      -- 최온유(초3) 한 줄이어야 한다

select column_name, data_type, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'students' and column_name = 'brief_by_sms';

select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'briefing_sends' and column_name = 'channel';
