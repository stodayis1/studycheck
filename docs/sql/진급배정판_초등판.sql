-- 진급 배정판에 **초등 판**을 더한다 (원장님 2026-11-17)
--
--   「초등학생들도 한학년 올라가면서 윤주희, 조윤희 강사 담당 학생들을 다시 배정할거거든.
--     현재 담당 학생들 학년 올라가면서 배정할수 있도록 진급배정판에 초등버전 하나더 만들어줘」
--
-- class_move_assign.track 은 지금 '고등'·'중등' 둘만 받는다(CHECK). '초등' 을 더한다.
--
-- ★ 지우는 것이 아니다 — 받는 값을 **넓히기만** 한다. 이미 있는 줄은 그대로다.
-- ★ 이 한 줄이 **코드보다 먼저** 적용돼야 한다. 안 그러면 초등 탭에서 고르는 순간
--   「new row violates check constraint」 로 저장이 막힌다(화면에는 빨간 글로 뜬다 —
--   데이터가 상하지는 않는다).
--
-- 되돌리기: docs/sql/진급배정판_초등판_되돌리기.sql

begin;

alter table public.class_move_assign drop constraint if exists class_move_assign_track_check;
alter table public.class_move_assign add constraint class_move_assign_track_check
  check (track = any (array['고등'::text, '중등'::text, '초등'::text]));

commit;

-- 확인 — '초등' 이 들어 있어야 한다
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.class_move_assign'::regclass and contype = 'c';

-- 지금 들어 있는 줄 (초등 판을 더해도 그대로여야 한다)
select track, count(*) from public.class_move_assign group by 1 order by 1;
