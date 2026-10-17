-- 「학습일지_안쓰는_학생.sql」 되돌리기
--
-- ★ 칸을 지우면 누가 켜 뒀는지도 같이 사라진다. 먼저 값만 끄고,
--   칸까지 지우는 줄은 일부러 주석으로 뒀다 — 정말 치울 때만 풀어서 쓸 것.
begin;

update public.students set skip_lesson_note = false, updated_at = now()
where skip_lesson_note;

commit;

-- alter table public.students drop column if exists skip_lesson_note;
