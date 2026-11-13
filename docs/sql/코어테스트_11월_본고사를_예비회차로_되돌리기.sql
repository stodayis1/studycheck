-- 되돌리기 — 11월 코어테스트를 적용 전(전부 「본고사」)으로 돌린다.
-- 적용: docs/sql/코어테스트_11월_본고사를_예비회차로.sql
--
-- ★ 가늠쇠는 「단원도 메모도 비어 있는 11월 예비 회차」다. 적용 전에 그런 줄은 0건이었으므로
--   이것으로 적용이 건드린 36건만 정확히 집힌다. 선생님이 손으로 넣은 줄은 단원이 적혀 있어 안 걸린다.

begin;

-- ① 회차를 본고사로 되돌린다
update exams
set title = '본고사'
where exam_type='코어테스트' and exam_date >= '2026-11-01' and exam_date < '2026-12-01'
  and title in ('예비 1회','예비 2회') and unit_name is null and memo is null;

-- ② 지운 줄을 되살린다 — 겹침 4건 (매쓰홀릭에서 들어온 본고사)
insert into exams (id, student_id, exam_type, exam_date, title, score, total_score, teacher_name, created_at)
values
  ('4ce1d4ed-b226-4077-829e-4e92f1a9bf55','998b86ca-8f0c-425a-b9fa-d62f23d3bc4e','코어테스트','2026-11-12','본고사',87,100,'이규숙','2026-11-12 08:00:39.910137+00'),
  ('3561044a-e242-4076-a9aa-7a4ffc9e8a31','1abf5225-2971-492d-a1f1-682ffa768578','코어테스트','2026-11-12','본고사',83,100,'이규숙','2026-11-12 08:00:39.959407+00'),
  ('36f8115f-9a96-4263-9f75-f336845523c0','fd17686e-e38e-4605-ac79-602e2935ff29','코어테스트','2026-11-12','본고사',70,100,'이규숙','2026-11-12 08:00:40.002416+00'),
  ('311e6e33-0e3d-4de2-8bb9-4c92c76b7ff4','fe741bdc-d821-4fd1-a860-0b352fefe47f','코어테스트','2026-11-12','본고사',63,100,'이규숙','2026-11-12 08:00:40.080256+00')
on conflict (id) do nothing;

-- ③ 김하루 중복 줄도 되살린다
insert into exams (id, student_id, exam_type, exam_date, title, unit_name, score, total_score, teacher_name, created_at)
values
  ('b6fa6050-ae92-40a7-9e3f-6cd8148a3cf4','998b86ca-8f0c-425a-b9fa-d62f23d3bc4e','코어테스트','2026-11-12','예비 1회','Ⅲ 합동과 대칭~Ⅳ 소수의 곱셈',87,100,'이규숙','2026-11-12 08:08:28.77947+00')
on conflict (id) do nothing;

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select title as 회차, count(*) as 건수
from exams where exam_type='코어테스트' and exam_date >= '2026-11-01' and exam_date < '2026-12-01'
group by 1 order by 1;
-- 본고사 40건 · 예비 1회 15건
