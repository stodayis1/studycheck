-- 지난 중·고등 「결석」 중 학교 시험기간에 걸린 것을 「시험기간 결석」으로 (2026-10-08)
--
-- 왜: 중·고등은 시험기간에 학원을 안 나와도 봐주신다(원장님). 2026-10-08 에 그 규칙을
--     코드에 넣었는데, 그 전에 적힌 결석은 전부 일반 「결석」으로 남아 있어서 출석률과
--     과제달성률을 계속 깎고 있었다.
--
-- 범위: 시험일 **4일 전 ~ 2일 후**. exam_schedule 의 exam_date 는 시험 **첫날**이고
--     보통 3~5일 보니, 뒤쪽 2일은 「시험 끝나고 이틀은 놀더라」는 원장님 말씀 기준이다.
--
-- ★ 빼는 것: OPS 에 **살아 있는 보강**(완료·예약·안내대기)이 붙은 날은 그대로 둔다.
--     학원이 보강을 해 드렸거나 해 드릴 날이면 그건 평소 결석으로 처리한 것이 맞고,
--     시험기간 결석으로 돌리면 그 보강 기록이 학부모 화면에서 사라진다.
--     해당 5건 — 주혜진 10/02(보강 완료 10/03) · 주혜진 10/06(예약 10/17) ·
--     김봄·김은서·유연우 10/06(보강 안내 보냄, 날짜 선택 대기)
--
-- 바뀔 건수(2026-10-08 22시 확인): 74건 / 학생 36명 / 2026-06-29 ~ 2026-10-08
-- 되돌리기: docs/sql/지난_시험기간_결석_되돌리기.sql  (바꾼 id 74개를 그대로 떠 뒀다)
--
-- ★ OPS 는 건드리지 않는다. 이미 닫힌 보강(보강 안 함)은 그대로 두고, 사람이 진행 중인
--   보강 안내·예약도 그대로 둔다. 소급해서 닫으면 학부모가 받은 예약 링크가 꼬인다.

begin;

with 제외 as (
  select * from (values
    ('주혜진','중1','2026-10-02'::date),
    ('주혜진','중1','2026-10-06'::date),
    ('김봄',  '중1','2026-10-06'::date),
    ('김은서','중1','2026-10-06'::date),
    ('유연우','중1','2026-10-06'::date)
  ) as t(name, grade, d)
),
대상 as (
  select distinct n.id
  from public.learning_notes n
  join public.class_sessions cs on cs.id = n.session_id
  join public.students st on st.id = n.student_id
  join public.exam_schedule e on e.school_name = st.school
       and e.grade = regexp_replace(st.grade, '[^0-9]', '', 'g')
  where n.attendance = '결석'
    and st.grade ~ '(중|고)'
    and cs.session_date between e.exam_date - 4 and e.exam_date + 2
    and not exists (
      select 1 from 제외 x
       where x.name = st.name and x.grade = st.grade and x.d = cs.session_date)
)
update public.learning_notes n
   set attendance = '시험기간 결석'
  from 대상 t
 where t.id = n.id;

-- 확인
select attendance, count(*) as 건수
  from public.learning_notes
 where attendance in ('결석', '시험기간 결석')
 group by 1 order by 2 desc;

commit;
