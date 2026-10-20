-- 강의영상_목록과_시청기록.sql 되돌리기
-- 주의: 새로 생긴 시청 칸(covered_seconds 등)에 쌓인 값은 사라진다. 원래 있던 watch_seconds 등은 그대로.
begin;

drop index if exists public.video_watch_logs_one_per_video;

alter table public.video_watch_logs
  drop column if exists completed_at,
  drop column if exists watched_ranges,
  drop column if exists scene_seconds,
  drop column if exists focus_lost_seconds,
  drop column if exists played_seconds,
  drop column if exists coverage_pct,
  drop column if exists covered_seconds,
  drop column if exists duration_seconds,
  drop column if exists lesson_video_id;

drop table if exists public.lesson_videos;

commit;
