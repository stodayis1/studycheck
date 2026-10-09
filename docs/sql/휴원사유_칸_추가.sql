-- students.leave_reason 추가 (2026-10-09)
--
-- 왜: 휴원을 스터디체크에서도 시작할 수 있게 하면서, OPS 에만 있던 「휴원 사유」 칸을
--     스터디체크에도 만든다. 어느 쪽에서 시작해도 양쪽에 같은 내용이 남아야 한다는
--     원장님 요구(2026-10-09). 없으면 OPS 에서 적은 사유가 스터디체크에선 사라진다.
--
-- 안전한가: 칸을 **더하는** 것뿐이고 기본값은 NULL 이다. 기존 행·코드에 영향 없다.
-- 되돌리기: docs/sql/휴원사유_칸_추가_되돌리기.sql

alter table public.students add column if not exists leave_reason text;

comment on column public.students.leave_reason is
  '휴원 사유. OPS students.leave_reason 과 같은 칸 — 어느 쪽에서 적어도 양쪽에 반영된다.';
