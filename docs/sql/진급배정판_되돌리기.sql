-- docs/sql/진급배정판.sql 되돌리기.
--
-- ★ 표를 지우면 맞춰 두신 배정이 **같이 사라진다.** 되돌리기 전에 반드시 먼저 떠 둔다:
--
--     select s.name, s.grade, a.* from public.class_move_assign a
--       join public.students s on s.id = a.student_id
--      order by a.track, s.name;
--
--   아티팩트 두 장에도 2026-11-13 까지의 배정이 남아 있지만, 앱에서 그 뒤에 고친 것은 그쪽에 없다.
--     중3 https://claude.ai/artifact/S96PpLFXoS8uq8gD5iqMgW
--     초6 https://claude.ai/artifact/7D1GCXVUk73n2dXfZULazh
--
-- 화면만 내리려면 이 파일을 쓰지 말고 사이드바 메뉴만 빼면 된다 — 표는 그대로 두는 쪽이 안전하다.

drop policy if exists class_move_assign_write on public.class_move_assign;
drop policy if exists class_move_assign_read  on public.class_move_assign;
drop index  if exists public.class_move_assign_track_idx;
drop table  if exists public.class_move_assign;

-- 확인 (0 이어야 한다)
select count(*) as 남은표 from pg_tables where schemaname = 'public' and tablename = 'class_move_assign';
