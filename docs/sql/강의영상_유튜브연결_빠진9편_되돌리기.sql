-- 강의영상_유튜브연결_빠진9편.sql 되돌리기 — 채운 9칸을 다시 비운다
update lesson_videos set youtube_id = null, updated_at = now()
where id in ('b4bb2113-6bab-45f6-b7bf-25d48a9bcd04','13c5e375-0a61-4e9c-970f-6fc690b687db','6f2c2562-d5d1-4814-80ce-348001d6751b',
  'ee18b16f-e316-433c-9546-459f998ca917','fa72e016-ad60-4574-9d51-adb058a6656a','8134b385-70d7-4722-995d-865320016baa',
  '2816ee98-2988-4efc-9e50-23b876343256','6e792888-14c2-4b16-b963-820f226c0ba8','db4c966e-707e-44b7-a3bf-b668718f89de');
