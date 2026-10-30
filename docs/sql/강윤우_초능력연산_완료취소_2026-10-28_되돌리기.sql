-- 위를 되돌린다 — 다시 「완료」 상태로.
update student_textbooks set status = 'completed'
where id = '09cb9d34-cec8-4586-b5f2-6c81446d886e' and status = 'assigned';
