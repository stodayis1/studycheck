-- 영상_호명_대답.sql 되돌리기 — 학생들이 누른 대답 기록만 사라진다(시청 기록은 그대로)
alter table public.video_watch_logs drop column if exists call_responses;
