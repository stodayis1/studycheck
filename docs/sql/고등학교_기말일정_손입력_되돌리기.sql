-- 되돌리기 — 2026-11-07 에 손으로 넣은 고등학교 2학기 기말 일정만 지운다
--
-- ★ 날짜까지 집어서 지운다. source='manual' 전체를 지우면 원장님·선생님이 달력에서 손으로
--   넣으신 학원 일정(코어테스트·설명회·경시대회 등)까지 날아간다. 절대 그렇게 하지 않는다.

delete from public.school_schedule_periods
 where source = 'manual'
   and kind = 'exam'
   and (school, start_date) in (
     ('백양고',     date '2026-12-02'),
     ('백양고',     date '2026-12-07'),
     ('신원고',     date '2026-11-24'),
     ('신원고',     date '2026-12-07'),
     ('고양동산고', date '2026-12-09'),
     ('고양동산고', date '2026-12-14'),
     ('고양국제고', date '2026-11-23'),
     ('고양국제고', date '2026-12-08')
   );

-- 확인 — 손입력 시험 일정이 0줄이고, 학원 일정(kind='academy')은 그대로인지
select kind, count(*) from public.school_schedule_periods where source = 'manual' group by kind;
