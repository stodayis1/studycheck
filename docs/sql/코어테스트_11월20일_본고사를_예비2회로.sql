-- 11/20 코어반 6명 — 「본고사」로 들어간 줄을 「예비 2회」로 바로잡는다.
--
-- ★★ 운영 DB 에 적용함 (2026-11-20, 원장님 「오늘 코어테스트 예비2회로 나가야 하거든.
--    매쓰홀릭에서 본고사를 내가 시험지로 풀려서 본고사로 읽혔어. 이거 예비2회로 바꿔줘. 6명 전부」).
--    손대기 전: 2026-11-20 본고사 6줄 · 예비 2회 0줄
--    손댄 뒤  : 2026-11-20 예비 2회 6줄 · 본고사 0줄 (지운 것 없음, 점수 안 건드림)
--    되돌릴 일이 생기면 _되돌리기.sql 로.
--
-- 왜
--   원장님이 **지난 본고사 시험지(제3회 TOMA 중1 2026.05)를 예비 2회 시험지로 풀리셨다.**
--   매쓰홀릭 제목에는 「연습2회」가 안 붙어 오므로(원래 본고사 시험지라서)
--   `coreTestRound` 가 회차를 못 찾고 기본값인 「본고사」로 떨어뜨렸다.
--   본고사는 **11/26~27** 에 따로 본다 — 아직 안 치렀다(docs/S코어반_유지기준.md).
--   2026-11-13 노하은 건과 같은 일이다(그때도 본고사 시험지로 연습 → 예비 1회로 고쳤다).
--
-- 손대는 줄을 어떻게 고르나
--   exam_type='코어테스트' · exam_date='2026-11-20' · title='본고사' · unit_name is null
--   · memo like '%제3회 TOMA 수학경시대회 - 중1(2026.05)%'
--   → 네 조건이 다 맞는 줄이 **정확히 6줄**이고, 그 6줄이 코어반 6명이다.
--     unit_name 이 비어 있는 것이 매쓰홀릭에서 들어온 줄이다(손으로 넣으면 단원을 적는다).
--     memo 조건까지 넣는 이유: 같은 날 다른 학년의 코어테스트가 들어와도 안 걸리게.
--
-- 겹친 줄
--   없다. 6명 모두 11월에 예비 1회(11/13)만 있고 예비 2회는 0줄이다 — ① 에서 센다.
--
-- memo
--   「· 본고사 시험지로 연습 (원장님 2026-11-20 — 본고사는 11/26~27)」을 **뒤에 붙인다.**
--   원제목은 그대로 남긴다. 나중에 왜 회차가 바뀌었는지 되짚을 유일한 끈이다(함정 13).
--
-- 되돌리기: docs/sql/코어테스트_11월20일_본고사를_예비2회로_되돌리기.sql

begin;

-- ① 가늠쇠가 6줄이 아니거나, 예비 2회가 이미 있으면 멈춘다
do $$
declare v int; w int;
begin
  select count(*) into v from exams
  where exam_type='코어테스트' and exam_date='2026-11-20' and title='본고사' and unit_name is null
    and memo like '%제3회 TOMA 수학경시대회 - 중1(2026.05)%';
  if v <> 6 then
    raise exception '손댈 줄이 6줄이 아닙니다 (%줄) — 가늠쇠를 다시 보셔야 합니다', v;
  end if;

  select count(*) into w from exams
  where exam_type='코어테스트' and exam_date >= '2026-11-01' and exam_date < '2026-12-01'
    and title='예비 2회'
    and student_id in (
      select student_id from exams
      where exam_type='코어테스트' and exam_date='2026-11-20' and title='본고사' and unit_name is null
        and memo like '%제3회 TOMA 수학경시대회 - 중1(2026.05)%');
  if w > 0 then
    raise exception '그 학생들에게 11월 예비 2회가 이미 %줄 있습니다 — 두 줄이 됩니다', w;
  end if;
end $$;

-- ② 회차를 예비 2회로. 점수·날짜·선생님은 건드리지 않는다
update exams
set title = '예비 2회',
    memo = memo || ' · 본고사 시험지로 연습 (원장님 2026-11-20 — 본고사는 11/26~27)'
where exam_type='코어테스트' and exam_date='2026-11-20' and title='본고사' and unit_name is null
  and memo like '%제3회 TOMA 수학경시대회 - 중1(2026.05)%';

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select title as 회차, count(*) as 건수
from exams where exam_type='코어테스트' and exam_date='2026-11-20'
group by 1 order by 1;
-- 예비 2회 6건 (본고사 0건)

select s.name as 학생, e.title as 회차, e.score as 점수
from exams e join students s on s.id=e.student_id
where e.exam_type='코어테스트' and e.exam_date='2026-11-20' order by s.name;
-- 6명 모두 예비 2회, 점수는 손대기 전과 같아야 한다
