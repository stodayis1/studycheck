-- 2026-10-08 에 지운 「초4 윤수지(신원초)」 를 되살리는 파일.
--
-- 왜 지웠나
--   중2 신원중 윤수지(원장님 따님, 시범 대상)와 **이름이 같아** 헷갈렸다.
--   초4 쪽은 2026-07-29 에 등록됐지만 **퇴원 상태이고 딸린 기록이 하나도 없었다** —
--   수업 0 · 결석 0 · 보강 0 · 주문 0 · 상담 0 · 학습지 0 (StudyCheck·OPS 양쪽 확인).
--   그래서 지워도 사라지는 기록이 없다.
--
-- 되살릴 일은 없겠지만, 지운 값은 남겨 둔다.

-- StudyCheck (cggskjxsyrvuhsldgkoj)
insert into public.students (id, name, grade, school, parent_phone, is_active, teacher_name, ops_student_id)
values ('1e864b8c-90ba-478a-8a33-3289bd968a33', '윤수지', '초4', '신원초',
        '01095982589', false, '조윤희', '3e879419-a9e3-42ee-9ed2-2364c6de92be')
on conflict (id) do nothing;

-- 수학OPS (rofnofcgkewbabnijcsu) — 아래는 OPS 프로젝트에서 실행할 것
-- insert into public.students (id, name, grade, active, teacher_id)
-- values ('3e879419-a9e3-42ee-9ed2-2364c6de92be', '윤수지', '초4', false,
--         (select id from public.profiles where name = '조윤희' limit 1))
-- on conflict (id) do nothing;
