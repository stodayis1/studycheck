-- 공통수학2 강의영상 중 유튜브에 올라가 있는데 앱에 연결이 안 된 9편 (2026-10-23)
-- 원인: 재생목록에 안 들어가 동기화(sync_lesson_videos)가 youtube_id 를 못 붙임. 비어 있는 칸만 채운다.
update lesson_videos set youtube_id = v.yid, updated_at = now()
from (values
  ('b4bb2113-6bab-45f6-b7bf-25d48a9bcd04','ttV5TnlNbc8'), -- 21 명제와 조건
  ('13c5e375-0a61-4e9c-970f-6fc690b687db','Lxt_ecTF3qQ'), -- 22 명제 p→q의 참, 거짓
  ('6f2c2562-d5d1-4814-80ce-348001d6751b','vp_tBShuYMk'), -- 23 ‘모든’이나 ‘어떤’을 포함한 명제
  ('ee18b16f-e316-433c-9546-459f998ca917','I7DgE8ow3lo'), -- 24 명제의 역과 대우
  ('fa72e016-ad60-4574-9d51-adb058a6656a','mwfzGLUs3xQ'), -- 25 충분조건과 필요조건
  ('8134b385-70d7-4722-995d-865320016baa','8RuOLyw7zn8'), -- 26 명제의 증명
  ('2816ee98-2988-4efc-9e50-23b876343256','YxZyFHacxIo'), -- 28 함수의 뜻
  ('6e792888-14c2-4b16-b963-820f226c0ba8','ZWdbmVxWrVc'), -- 29 함수의 그래프
  ('db4c966e-707e-44b7-a3bf-b668718f89de','wMrhmidsluw')  -- 18-풀이03
) as v(id, yid)
where lesson_videos.id = v.id::uuid and lesson_videos.youtube_id is null;
