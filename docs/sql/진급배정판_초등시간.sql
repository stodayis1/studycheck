-- 진급 배정판 초등 판에서 **시간도 바꿀 수 있게** 한다 (원장님 2026-11-18)
--
--   「시간이 바껴서 진급하는 학생들도 있거든. 담당도 바뀌고.
--     진급배정판에 담당이 바뀌는 기능은 있는데 시간도 변경하는 기능이 지금은 없어. 같이 추가해줘」
--
-- 고등 판은 정해진 타임(weekday_slot · weekend_slot)을 고르지만 초등은 그런 반이 없다.
-- 그래서 **요일 + 시작 시각 + 교시** 를 그대로 담는 칸을 하나 더 둔다.
--   { "days": ["월","수"], "start": "16:00", "periods": 2 }
-- 비워 두면(null) **지금 시간표 그대로**다.
--
-- ★ 더하기만 한다 — 있는 줄은 하나도 안 건드린다.
-- ★ 이 한 줄이 **코드보다 먼저** 적용돼야 한다. 안 그러면 시간을 고르는 순간
--   「column new_time does not exist」 로 저장만 막힌다(데이터는 안 상한다).
--
-- 되돌리기: docs/sql/진급배정판_초등시간_되돌리기.sql

begin;

alter table public.class_move_assign add column if not exists new_time jsonb;

comment on column public.class_move_assign.new_time is
  '초등 진급 판에서 바꾼 수업 시간 {days:[요일],start:"HH:MM",periods:교시}. null 이면 지금 시간표 그대로';

commit;

-- 확인 — new_time 칸이 있어야 한다
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'class_move_assign'
order by ordinal_position;

-- 있는 줄은 그대로여야 한다 (칸만 늘고 값은 전부 null)
select track, count(*) as 줄수, count(new_time) as 시간바꾼줄
from public.class_move_assign group by 1 order by 1;
