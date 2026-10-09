-- 되돌리기 — students.leave_reason 칸 삭제 (2026-10-09)
--
-- ★ 칸을 지우면 적혀 있던 휴원 사유도 **같이 사라진다.** 코드(학생관리 휴원 모달)를
--   먼저 되돌린 뒤에 실행할 것. OPS 쪽 leave_reason 은 그대로 남는다.

alter table public.students drop column if exists leave_reason;
