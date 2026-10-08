-- 2026-10-08 에 한 작업의 되돌리기
--
-- 무엇을 했나
--   10/7(수) 수업인데 학습일지를 10/8 오후에 쓰는 바람에 **수업일자가 10/8 로** 저장된
--   학생 9명을, 수업일자 10/7 로 옮겼다.
--   (시간표에 목요일이 없는데 10/8 로 기록된 건들 — 전부 월·수·금 또는 월·수·토 학생)
--   윤수지(중2)는 시간표가 화·금인데 10/8 저녁에 입력됐고 이미 발송까지 됐다.
--   보강·추가 수업으로 실제 10/8 에 한 것으로 보여 **건드리지 않았다.**
--
-- 되돌리면 이 9명의 수업일자가 다시 10/8 이 된다.
-- learning_notes 는 session_id 로 붙어 있어 함께 따라간다(따로 손댈 것 없음).

update public.class_sessions
   set session_date = '2026-10-08'
 where id in (
   '3c089e3a-f83a-4ecb-85aa-21ae1533a8e9',  -- 안준혁 (초6)
   '087ede49-5763-4294-b4cf-75179888d378',  -- 오현승 (초6)
   '5060b368-bbca-4cc6-a83d-58232abed7eb',  -- 유정환 (초6)
   '16cf2fca-ac17-4f5f-b8c3-0b709e7b8eea',  -- 이지훈 (고1)
   '6fe8a04b-debe-4a76-a14a-41653dc8f446',  -- 임지원 (초6)
   '01ba1a9b-7923-42c3-9d9b-41226459d6b7',  -- 최다빈 (초6)
   'd6ba5fd0-fba0-4f9c-b624-c94cd4b89b4e',  -- 최다윤 (고1)
   '67916feb-9ca2-4d81-81cd-a36a64e3c180',  -- 하지원 (고1)
   '2ecc6cf9-fda9-4731-aa43-8357241a32bb'   -- 홍채은 (초6)
 );

select s.name, cs.session_date
  from public.class_sessions cs join public.students s on s.id = cs.student_id
 where cs.id in ('3c089e3a-f83a-4ecb-85aa-21ae1533a8e9','087ede49-5763-4294-b4cf-75179888d378',
                 '5060b368-bbca-4cc6-a83d-58232abed7eb','16cf2fca-ac17-4f5f-b8c3-0b709e7b8eea',
                 '6fe8a04b-debe-4a76-a14a-41653dc8f446','01ba1a9b-7923-42c3-9d9b-41226459d6b7',
                 'd6ba5fd0-fba0-4f9c-b624-c94cd4b89b4e','67916feb-9ca2-4d81-81cd-a36a64e3c180',
                 '2ecc6cf9-fda9-4731-aa43-8357241a32bb')
 order by s.name;
-- 9행 모두 2026-10-08 이면 되돌리기 완료.
