-- 11월 코어테스트 — TOMA 연습회가 「본고사」로 들어간 40건을 예비 회차로 바로잡는다.
--
-- ★★ 운영 DB 에 적용함 (2026-11-13, 원장님 「돌려」 · 「두번 저장된것 중복된듯 한줄 지우면 될거 같아」).
--    손대기 전: 본고사 40 · 예비 1회 15 (55줄)
--    손댄 뒤  : 예비 1회 49 · 예비 2회 1 (50줄) — 본고사 0건, 지운 것 5줄
--    예비 2회는 강다현 2026-11-12 64점 한 명(11월에 두 번 친 유일한 학생)
--    김하루 11/12 줄 수 1 · 선생님이 손으로 넣은 예비 1회 14건 그대로
--    다시 돌리지 말 것. 되돌릴 일이 생기면 _되돌리기.sql 로.
--
-- 왜
--   coreTestRound 가 「연습N회」를 몰라서, 회차가 없는 것으로 보고 전부 본고사로 떨어뜨렸다.
--   본고사는 한 달에 하루(11/26·27)인데 11/09 부터 매일 긁어 넣기 시작하면서 한 달에 40번 생겼다.
--   원장님 2026-11-13 「본고사는 아직 안치렀거든」.
--
-- 원장님이 주신 규칙
--   「동일학생 이름으로 1건 올라왔다면 예비1회, 2건 올라왔다면 각각 1회, 2회에 입력하면돼」
--   → 학생별로 날짜 순서대로 1건이면 예비 1회, 2건이면 예비 1회·예비 2회.
--     (11월에 3건 이상인 학생은 없다 — 적용 전에 ① 에서 센다.)
--
-- 손대는 줄을 어떻게 고르나
--   exam_type='코어테스트' · 11월 · title='본고사' · unit_name is null
--   → unit_name 이 비어 있는 것이 매쓰홀릭에서 들어온 줄이다(선생님이 손으로 넣으면 단원을 적는다).
--
-- 겹친 줄
--   그중 4건은 같은 날 같은 점수의 「예비 1회」가 손으로 이미 들어가 있다
--   (박태하 63 · 김하루 87 · 박나현 83 · 박소연 70). 회차를 고치면 두 줄이 되므로 **지운다.**
--   김하루는 손으로 넣은 「예비 1회 87점」이 4분 사이에 두 줄 저장돼 있다 — 한 줄도 지운다
--   (원장님 「두번 저장된것 중복된듯 한줄 지우면 될거 같아」).
--
-- 앞으로
--   코드는 고쳤다(lib/matholic.ts — 「연습1회」→ 예비 1회). 코어테스트도 memo 에 원제목을 남기므로
--   다음부터는 어느 회차에서 왔는지 되짚을 수 있다.
--
-- 되돌리기: docs/sql/코어테스트_11월_본고사를_예비회차로_되돌리기.sql

begin;

-- ① 3건 이상인 학생이 있으면 멈춘다 (규칙이 안 맞는다는 뜻)
do $$
declare v int;
begin
  select count(*) into v from (
    select student_id from exams
    where exam_type='코어테스트' and exam_date >= '2026-11-01' and exam_date < '2026-12-01'
      and title='본고사' and unit_name is null
    group by 1 having count(*) >= 3) q;
  if v > 0 then
    raise exception '11월에 3건 이상인 학생이 %명 있습니다 — 규칙을 다시 보셔야 합니다', v;
  end if;
end $$;

-- ② 손으로 넣은 예비 줄과 같은 날·같은 점수로 겹치는 것은 지운다 (4건)
delete from exams e
where e.exam_type='코어테스트' and e.exam_date >= '2026-11-01' and e.exam_date < '2026-12-01'
  and e.title='본고사' and e.unit_name is null
  and exists (
    select 1 from exams x
    where x.student_id = e.student_id and x.exam_type='코어테스트'
      and x.exam_date = e.exam_date and x.title like '예비%' and x.score = e.score and x.id <> e.id);

-- ③ 김하루 「예비 1회 87점」이 두 줄 — 나중 것 한 줄을 지운다 (2026-11-12 08:08:28 저장분)
delete from exams where id = 'b6fa6050-ae92-40a7-9e3f-6cd8148a3cf4';

-- ④ 남은 것을 학생별 날짜 순서대로 예비 1회 · 예비 2회로
with 본 as (
  select id, row_number() over (partition by student_id order by exam_date, created_at) as 순번
  from exams
  where exam_type='코어테스트' and exam_date >= '2026-11-01' and exam_date < '2026-12-01'
    and title='본고사' and unit_name is null
)
update exams e
set title = case when 본.순번 = 1 then '예비 1회' else '예비 2회' end
from 본 where 본.id = e.id;

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select title as 회차, count(*) as 건수
from exams where exam_type='코어테스트' and exam_date >= '2026-11-01' and exam_date < '2026-12-01'
group by 1 order by 1;
-- 본고사 0건 · 예비 1회 49건 · 예비 2회 1건 (11/12 강다현)

select s.name as 학생, e.exam_date as 날짜, e.title as 회차, e.score as 점수
from exams e join students s on s.id=e.student_id
where e.exam_type='코어테스트' and e.exam_date >= '2026-11-01' and e.title='예비 2회';
-- 강다현 2026-11-12 예비 2회 64점

select count(*) as 김하루_11월12일_줄수 from exams e join students s on s.id=e.student_id
where s.name='김하루' and e.exam_type='코어테스트' and e.exam_date='2026-11-12';
-- 1 이어야 한다
