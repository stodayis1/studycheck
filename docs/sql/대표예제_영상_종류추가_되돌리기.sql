-- 「대표예제_영상_종류추가.sql」 되돌리기
--
-- ★ 대표예제 영상이 이미 들어 있으면 규칙을 되돌릴 수 없다(그 줄들이 규칙에 걸린다).
--   먼저 지우든지, 그대로 두려면 이 파일을 쓰지 말 것.
begin;
-- delete from public.lesson_videos where kind = '대표예제';
alter table public.lesson_videos drop constraint if exists lesson_videos_kind_check;
alter table public.lesson_videos add constraint lesson_videos_kind_check
  check (kind = any (array['개념'::text, '증명'::text]));
commit;
