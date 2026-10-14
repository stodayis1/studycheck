-- 꺼진 채 쌓여 있는 시간표 줄을 치운다 (원장님 2026-10-14).
--
-- 왜
--   예전 저장 방식이 기존 줄을 is_active=false 로 **끄고** 새 줄을 넣는 식이라,
--   저장할 때마다 줄이 쌓였다. 이도윤 학생은 39줄까지 늘어나 있었다.
--   살아 있는 줄 608개에 꺼진 줄이 1,346개(146명분)다. 꺼진 줄은 아무 화면도 읽지 않는다.
--   (저장 코드는 2026-10-14 에 「지우고 새로 넣기」로 고쳤다. 앞으로는 안 쌓인다.)
--
-- 되돌릴 수 있게
--   지우기 전에 schedules_dead_backup 으로 **통째로 옮겨 둔다.** 되돌리기는 거기서
--   그대로 다시 넣는다.
--
-- ★ 변경기록 트리거를 잠깐 끈다. 1,346줄 삭제가 그대로 기록되면 사람이 한 진짜 변경이
--   묻힌다. 이건 사람이 아니라 정리 작업이다.

begin;

create table if not exists public.schedules_dead_backup (like public.schedules including all);

insert into public.schedules_dead_backup
  select * from public.schedules where is_active = false;

alter table public.schedules disable trigger audit_schedules;
delete from public.schedules where is_active = false;
alter table public.schedules enable trigger audit_schedules;

commit;

-- 확인
-- select count(*) from schedules where is_active = false;      -- 0 이어야 한다
-- select count(*) from schedules_dead_backup;                  -- 옮겨 둔 수
