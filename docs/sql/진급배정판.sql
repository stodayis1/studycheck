-- 진급 배정판 — 학년이 올라갈 때 **누가 어느 선생님·어느 타임으로 가는지** 담는 표.
-- 원장님 2026-11-17 「링크 띄워주고 스터디체크 안에 넣어줘」 「초6이 중등으로 넘어오는 시간표도
-- 같이 넣어줘, 같은 메뉴안에」
--
-- 그동안 claude.ai 아티팩트 두 장으로 쓰고 있었다.
--   중3 고등 배정판  https://claude.ai/artifact/S96PpLFXoS8uq8gD5iqMgW
--   초6 중등 배정판  https://claude.ai/artifact/7D1GCXVUk73n2dXfZULazh
-- 그쪽은 ① 강사가 고치려면 claude.ai 계정과 「참여」 권한이 따로 필요하고(보기 권한으로는
-- 서버가 저장을 막는다) ② 학생·시간표를 **박아 넣은 글자**라 원생이 바뀌면 손으로 고쳐야 했고
-- ③ 나중에 실제 시간표(schedules)로 옮길 때 값을 다시 쳐야 했다.
--
-- 되돌리기: docs/sql/진급배정판_되돌리기.sql
--
-- ★ 지우는 변경이 없다 — 표 하나를 **더하기만** 한다.

create table if not exists public.class_move_assign (
  -- 한 학생은 한 번에 한 판에만 오른다 (초6은 중등 판, 중3은 고등 판)
  student_id    uuid primary key references public.students(id) on delete cascade,
  -- '고등' = 중3 → 고등부 · '중등' = 초6 → 중등부
  track         text not null check (track in ('고등', '중등')),
  -- 맡을 선생님 이름. '김은수' 처럼 지금 자리에 그대로 남는 경우도 이 칸에 적는다.
  -- users 를 참조하지 않는다 — 판에 적는 이름이고, 강사가 바뀌어도 이 기록은 그대로여야 한다.
  teacher_name  text,
  -- 고등 판만 쓴다. 평일·주말 타임 열쇠 ('at1' · 'bt3' · 'ja' · 'jb' / 'sat-r1' · 'j-sat2' …)
  -- 뜻은 lib/moveAssign.ts 한 곳에 있다. 중등 판은 학생이 지금 쓰는 시간표를 그대로 쓰므로 비운다.
  weekday_slot  text,
  weekend_slot  text,
  updated_at    timestamptz not null default now(),
  updated_by_name text
);

comment on table public.class_move_assign is
  '진급 배정판 (app/teacher/move-assign). 타임 열쇠의 뜻은 lib/moveAssign.ts 에 있다. 실제 시간표는 schedules 이고 이 표는 계획이다.';

create index if not exists class_move_assign_track_idx on public.class_move_assign (track);

alter table public.class_move_assign enable row level security;

-- 고등 커리큘럼과 **같은 사람**만 본다 — 원장님, 재원 고등학생을 맡은 강사,
-- 또는 app_settings 'high_curriculum_teachers' 에 넣어 둔 강사
-- (docs/sql/고등커리큘럼_고등강사만.sql · 고등커리큘럼_볼사람_추가.sql).
--
-- ★ 초6 → 중등 판은 중등 선생님들(김은수·박경미·신애진)이 보셔야 하는데, 그분들은 이 함수에
--   걸리지 않는다. 지금은 **원장님이 혼자 맞추고 결과를 알려 주시는 방식**이라 그대로 두었다.
--   중등 선생님께 열려면 app_settings 'high_curriculum_teachers' 에 그분들 users.id 를 더하거나
--   (그러면 고등 커리큘럼도 같이 보인다) 이 표만 보는 함수를 따로 만들어야 한다. 원장님 결정 사항.
--
-- ★ (select ...) 로 감싼다 — 맨몸으로 두면 행마다 호출돼 느려진다.
drop policy if exists class_move_assign_read on public.class_move_assign;
create policy class_move_assign_read on public.class_move_assign
  for select to authenticated
  using ((select public.can_see_high_curriculum()));

drop policy if exists class_move_assign_write on public.class_move_assign;
create policy class_move_assign_write on public.class_move_assign
  for all to authenticated
  using ((select public.can_see_high_curriculum()))
  with check ((select public.can_see_high_curriculum()));

-- 확인
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'class_move_assign' order by policyname;

-- 맨몸 is_staff()/is_admin() 이 섞여 들어가지 않았는지 (0 이어야 한다)
select count(*) as 맨몸정책 from pg_policies where schemaname = 'public'
  and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
