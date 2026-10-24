-- 풀이 영상 「먼저 풀어 봐」에서 객관식으로 고르게 한다 (원장님 2026-10-24)
-- quiz = {"answer": "정답", "wrong": ["오답1","오답2","오답3"]} — 대본(docs/대본/공통수학2/풀이/*.json 의 quiz)에서 채운다. 없으면 null(예전처럼 「다 풀었어요」)
alter table lesson_videos add column if not exists quiz jsonb;
