-- 11월에 「본고사」로 들어간 TOMA 6줄을 **코어테스트에서 빼고 학습지로** 옮긴다.
--
-- ★ 학생 이름은 적지 않는다 (원장님 2026-11-20). 줄 id 로만 가리킨다.
--
-- ★★ 운영 DB 에 적용함 (2026-11-20, 원장님 「TOMA 본고사는 아직 안봤기 때문에 본고사 아니고」 ·
--    「학습지로 중1-1 전범위 Lv4로 해서 올려줘」 · 「이온유는 그냥 학습지로 올려줘」).
--    손대기 전: exams 코어테스트 본고사 6줄 (11/13 세 줄 · 11/17 세 줄)
--    손댄 뒤  : exams 그 6줄 없음 · student_worksheets 에 6줄 생김 (점수 그대로)
--    되돌릴 일이 생기면 _되돌리기.sql 로.
--
-- 왜
--   TOMA 본고사는 **11/26~27** 에 본다. 아직 안 치렀으므로 「본고사」 점수는 있을 수 없다.
--   이 6줄은 지난 TOMA 본고사 시험지(제6회, 2026.08)를 **연습으로 풀린 것**이다.
--   그런데 그 학생들은 11월에 예비 1회·2회가 **이미 차 있어** 회차로 넣을 자리가 없다
--   (셋은 11/12 예비1회 + 11/17 예비2회, 둘은 예비1회가 두 줄 + 예비2회).
--   원장님 판단: 회차가 아니라 **학습지**다. 코어테스트는 학원 정기 시험 점수 칸이므로
--   연습으로 푼 시험지가 거기 쌓이면 정기 시험 점수가 아니게 된다.
--
-- 어떻게 넣나 (lib/matholicApply.ts 의 학습지 넣는 꼴을 그대로 따른다)
--   subject '수학' · worksheet_type 'main' · status 'passed'(점수가 있으므로, 2026-11-18 규칙)
--   grade_level·semester = 시험지의 과정 (중1 시험지 다섯 줄은 중1-1, 초2 시험지 한 줄은 초2-1)
--   unit '전범위' · unit_name '제6회 TOMA 경시 (본고사 시험지로 연습)'
--   current_level 4 (원장님 「Lv4」. 초2 줄은 레벨을 말씀하지 않으셔서 같은 Lv4 로 넣었다)
--   assigned_at·submitted_at = 원래 시험 날 12:00 (KST)
--   memo = 원래 memo + 꼬리말 → **되돌리기의 가늠쇠**
--
-- ※ 겹침 없음 — 그 6명이 그 날짜에 가진 학습지를 전수 확인했다(0건). ① 에서 다시 센다.
-- ※ student_worksheets 에는 지금 트리거도 유일 제약도 없다(2026-11-20 확인). insert 가 막히지 않는다.
--
-- 되돌리기: docs/sql/코어테스트_남은본고사를_학습지로_되돌리기.sql

begin;

-- ① 6줄이 그대로 있고, 꼬리말 붙은 학습지가 아직 없는지 확인한다
do $$
declare v int; w int;
begin
  select count(*) into v from exams
  where id in ('86bf551c-9536-4d03-b916-c722b8bc2c46','f67ea05a-1700-499d-9f3b-1c5c26d55111',
               '41143d04-c44d-439b-80b2-0d58a32043eb','c2d5faf4-55a7-42d6-b4f8-77964391eb38',
               '27c4a647-59d0-4e54-85ec-d75a3af7bf79','ed11f9ab-d44c-493c-843f-c732182ebd54')
    and exam_type='코어테스트' and title='본고사';
  if v <> 6 then
    raise exception '옮길 코어테스트 본고사 줄이 6줄이 아닙니다 (%줄)', v;
  end if;

  select count(*) into w from student_worksheets
  where memo like '%본고사 시험지로 연습 → 학습지로 옮김 (원장님 2026-11-20)%';
  if w > 0 then
    raise exception '이미 옮긴 학습지가 %줄 있습니다 — 두 번 넣으려 하고 있습니다', w;
  end if;
end $$;

-- ② 학습지로 넣는다
with 옮길것(exam_id, 학년, 학기) as (values
  ('86bf551c-9536-4d03-b916-c722b8bc2c46'::uuid, '중1', 1::smallint),
  ('f67ea05a-1700-499d-9f3b-1c5c26d55111'::uuid, '중1', 1),
  ('41143d04-c44d-439b-80b2-0d58a32043eb'::uuid, '중1', 1),
  ('c2d5faf4-55a7-42d6-b4f8-77964391eb38'::uuid, '중1', 1),
  ('27c4a647-59d0-4e54-85ec-d75a3af7bf79'::uuid, '중1', 1),
  ('ed11f9ab-d44c-493c-843f-c732182ebd54'::uuid, '초2', 1)
)
insert into student_worksheets
  (student_id, subject, grade_level, semester, unit, unit_name, current_level,
   worksheet_type, status, score, assigned_at, submitted_at, memo)
select e.student_id, '수학', m.학년, m.학기, '전범위',
       '제6회 TOMA 경시 (본고사 시험지로 연습)', 4,
       'main', 'passed', round(e.score)::int,
       (e.exam_date::text || 'T12:00:00+09:00')::timestamptz,
       (e.exam_date::text || 'T12:00:00+09:00')::timestamptz,
       coalesce(e.memo, '') || ' · 본고사 시험지로 연습 → 학습지로 옮김 (원장님 2026-11-20)'
from exams e join 옮길것 m on m.exam_id = e.id;

-- ③ 코어테스트에서 뺀다
delete from exams
where id in ('86bf551c-9536-4d03-b916-c722b8bc2c46','f67ea05a-1700-499d-9f3b-1c5c26d55111',
             '41143d04-c44d-439b-80b2-0d58a32043eb','c2d5faf4-55a7-42d6-b4f8-77964391eb38',
             '27c4a647-59d0-4e54-85ec-d75a3af7bf79','ed11f9ab-d44c-493c-843f-c732182ebd54')
  and exam_type='코어테스트' and title='본고사';

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select count(*) as 남은_11월_본고사_TOMA from exams
where exam_type='코어테스트' and exam_date >= '2026-11-01' and exam_date < '2026-12-01'
  and title='본고사' and memo like '%TOMA%';
-- 0 이어야 한다

select grade_level as 학년, semester as 학기, unit as 단원, current_level as 레벨,
       score as 점수, status as 상태, assigned_at::date as 날짜
from student_worksheets
where memo like '%본고사 시험지로 연습 → 학습지로 옮김 (원장님 2026-11-20)%'
order by 날짜, 점수;
-- 6줄 — 중1-1 다섯 줄(32·40·64·65·70) · 초2-1 한 줄(91). 모두 전범위 Lv4 passed
