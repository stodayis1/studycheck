-- 진급 배정판 「확정」 칸 (원장님 2026-11-19)
--
-- 「진급 배정판에서 시간표 변경이 확정된(반이동) 친구들은 담당 선생님이 시간표 변경요청을
--   올릴거거든. 그럼 진급배정판에서 해당학생들도 확정지어주면 됨」
--
-- 이 판은 계획이고 실제 시간표는 schedules 다. 둘을 잇는 길이 「시간표 변경요청」
-- (schedule_change_requests) 이다 — 담당 선생님이 올리고 원장님이 「반영」을 누르면 그때
-- 진짜 시간표가 바뀐다. 그 요청을 보고 이 판의 줄이 끝났는지 가른다.
--
-- ★ 저절로 확정되는 것(= 반영된 요청의 시간표가 계획과 같은 것)은 **적지 않는다.**
--   요청 표를 그때그때 읽어 가른다 — 베껴 적으면 요청이 되돌려졌을 때 이 판만 「확정」으로
--   남아 거짓이 된다. 아래 칸에 적히는 것은 **손으로 누른 확정**뿐이다
--   (담당만 바뀌는 학생, 중등 판처럼 견줄 시간 계획이 없는 줄).
--
-- 되돌리기: docs/sql/진급배정판_확정_되돌리기.sql
--
-- ★ 지우는 변경이 없다 — 칸을 **더하기만** 한다. 정책은 표 전체에 걸려 있어 손댈 것이 없다.

alter table public.class_move_assign
  add column if not exists confirmed_at      timestamptz,
  add column if not exists confirmed_by_name text,
  add column if not exists confirmed_note    text;

comment on column public.class_move_assign.confirmed_at is
  '손으로 누른 확정. 반영된 시간표 변경요청으로 저절로 확정되는 것은 여기 적지 않고 schedule_change_requests 를 읽어 가른다 (lib/moveAssign.ts confirmStateOf).';

-- 확인 — 칸 셋이 있어야 한다 (3)
select count(*) as 더한칸 from information_schema.columns
 where table_schema = 'public' and table_name = 'class_move_assign'
   and column_name in ('confirmed_at', 'confirmed_by_name', 'confirmed_note');

-- 정책은 그대로인지 (읽기·쓰기 두 줄)
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename = 'class_move_assign' order by policyname;
