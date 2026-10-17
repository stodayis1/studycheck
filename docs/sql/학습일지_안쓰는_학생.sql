-- 「학습일지를 안 쓰는 학생」 표시 칸
--
-- 원장님 2026-10-17
--   「이윤경(고3)학생은 학습일지 작성안해도 되니 시간표에만 뜨고 학습일지는 안뜨게해줘」
--
-- 왜 칸을 새로 만드나
--   휴원(on_leave)과는 다르다. 이 학생은 **수업에 온다** — 시간표에도 떠야 한다.
--   다만 학습일지를 쓰지 않는다. 그래서 「안 쓰는 게 정상」이라는 사실을 어딘가에
--   적어 둬야 한다. 안 적어 두면
--     · 학습일지 화면의 「오늘 수업 N명 · 입력완료 x/N」 에서 영원히 한 명이 모자라고
--     · 「학습일지 미작성 보기」에 매번 뜨고
--     · 밤마다 담당 강사께 미작성 알림 문자가 간다
--   이 칸을 켜면 그 셋에서 빠지고, 시간표에는 「일지 없음」으로 남는다.
--
-- 쓰는 곳 (코드)
--   lib/expectedToday.ts          — 그날 일지를 써야 하는 사람에서 뺀다 (미작성·알림문자의 뿌리)
--   lib/missingNotes.ts           — 기록이 남아 있어도 미작성으로 세지 않는다
--   app/teacher/learning-notes    — 수업 목록에서 빼고, 시간표에는 「일지 없음」으로 표시
--   app/teacher/students          — 원장님만 켜고 끌 수 있는 체크칸
begin;

alter table public.students
  add column if not exists skip_lesson_note boolean not null default false;

comment on column public.students.skip_lesson_note is
  '학습일지를 쓰지 않는 학생. 시간표에는 뜨지만 일지 작성·미작성·강사 알림에서 뺀다 (원장님 2026-10-17 이윤경 고3)';

update public.students
set skip_lesson_note = true, updated_at = now()
where name = '이윤경' and grade = '고3' and is_active;

commit;

-- 확인
select name, grade, skip_lesson_note from public.students
where skip_lesson_note order by name;
