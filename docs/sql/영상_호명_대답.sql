-- 영상 시청 중 이름 부르기에 학생이 버튼으로 대답한 기록 (원장님 2026-10-21)
-- 되돌리기: 영상_호명_대답_되돌리기.sql
--
-- 이름을 부르면 영상이 멈추고 대답 버튼(「네! 준비됐어요」「집중할게요!」「맞았어요/틀렸어요」 …)이 뜬다.
-- 누를 때까지 영상은 멈춰 있다. 한 줄(학생·수업·영상)마다 대답들을 배열로 쌓는다:
--   [{ "key": "try", "at": 영상 초, "answer": "맞았어요", "ms": 응답까지 걸린 밀리초, "ts": ISO 시각 }]
--   15초 넘게 안 누르면 { "key": …, "answer": null, "noanswer": true } 를 먼저 한 번 남긴다.
-- 학생은 자기 시청 기록 줄에만 쓴다 — video_watch_logs 의 기존 정책 그대로라 정책은 안 바꾼다.

alter table public.video_watch_logs
  add column if not exists call_responses jsonb not null default '[]'::jsonb;
