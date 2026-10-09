-- 되돌리기 — 학교를 다시 빈칸으로 (2026-10-09)
--
-- 원래 값은 일곱 명 모두 빈 문자열('')이었다. NULL 이 아니라 '' 다.

begin;

update public.students set school = ''
 where id in (
  'f54874ae-ecb2-44f5-9b52-32d34ef65dcb',  -- 최서현
  'a6888181-71fd-4a62-8427-8e4e4dd8ac50',  -- 최건희
  'f6ee4395-865d-4274-821a-31c359fa3467',  -- 김준희
  'e0e86e98-ad28-4425-bcde-d67c93176668',  -- 노우석
  'ee9086e5-d57f-4afe-af29-b0ad2689e3ea',  -- 신성우
  '30bf9181-265a-4463-86fe-f7734207b23c',  -- 이은서
  'e6813358-1b72-45f5-b731-f8cc32d1cf0b'   -- 홍성준
 );

-- 실행하면 「UPDATE 7」이 나와야 한다
commit;
