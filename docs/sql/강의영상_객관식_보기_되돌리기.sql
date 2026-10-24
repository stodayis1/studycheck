-- 강의영상_객관식_보기.sql 되돌리기 (채운 보기도 같이 사라진다 — 대본 JSON 에 원본이 있다)
alter table lesson_videos drop column if exists quiz;
