-- 되돌리기 — 11/20 코어반 6줄을 적용 전(「본고사」)으로 돌린다.
-- 적용: docs/sql/코어테스트_11월20일_본고사를_예비2회로.sql
--
-- ★ 가늠쇠는 적용이 memo 뒤에 붙인 꼬리말이다. 적용 전에 그 꼬리말이 붙은 줄은 0건이었으므로
--   이것으로 적용이 건드린 6줄만 정확히 집힌다. 선생님이 손으로 넣은 줄은 안 걸린다.
--   지운 줄도 새로 넣은 줄도 없으므로 되살릴 것은 없다.

begin;

update exams
set title = '본고사',
    memo = replace(memo, ' · 본고사 시험지로 연습 (원장님 2026-11-20 — 본고사는 11/26~27)', '')
where exam_type='코어테스트' and exam_date='2026-11-20' and title='예비 2회' and unit_name is null
  and memo like '%본고사 시험지로 연습 (원장님 2026-11-20 — 본고사는 11/26~27)%';

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select title as 회차, count(*) as 건수
from exams where exam_type='코어테스트' and exam_date='2026-11-20'
group by 1 order by 1;
-- 본고사 6건

select count(*) as 꼬리말_남은줄 from exams
where memo like '%본고사 시험지로 연습 (원장님 2026-11-20%';
-- 0 이어야 한다
