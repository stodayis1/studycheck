-- 수업시간 글자(students.class_time)를 **실제 시간표**(schedules)에서 다시 만들어 넣는다.
--
-- 왜 (2026-11-11, 원장님 「실제 수업 시간은 스터디체크로 맞춰줘」):
--   class_time 은 목록·OPS·문자에 그대로 보이는 **글자**이고, schedules 가 **실제 시간표**다.
--   학생관리의 시간표 편집·「시간표 변경요청 반영」은 schedules 를 쓰면서 class_time 글자까지
--   같이 고쳐 준다(writeSchedules 한 곳). 그런데 **엑셀 업로드**는 class_time 글자만 직접 써서,
--   둘이 조용히 갈라진 학생이 40명이었다 — 「월수금3」, 「오후5시」, 「고등 화목토2반」처럼
--   요일·시각을 알 수 없는 옛 표기가 남아 OPS 로도 그대로 복사됐다.
--
--   schedules 를 믿을 수 있는지 먼저 확인했다 — 어긋난 40명 중 36명은 schedules 의 요일이
--   최근 6주 실제 수업 기록의 요일과 **똑같았다**.
--
-- 범위: 아래 34명만. 아래 여섯 명은 **일부러 뺐다** (원장님 확인 뒤에 따로 처리):
--   · 요일이 실제 수업과 다름 — 이지훈 · 김민재 · 진서우 · 이서우
--   · 요일은 같은데 시각이 글자와 다름 — 호킨슨제레미(금 19시/18시) · 이연서(목 16시/14시)
--
-- 되돌리기: docs/sql/수업시간_글자_시간표로_맞추기_되돌리기.sql
-- ★ schedules(실제 시간표)는 건드리지 않는다. 보이는 글자 한 칸만 고친다.

update public.students st
set class_time = d.만든글,
    updated_at = now()
from (
  select s.id,
    string_agg(
      sc.day_of_week || to_char(sc.start_time, 'HH24:MI') || '·' || sc.periods || '교시',
      ', ' order by position(sc.day_of_week in '월화수목금토일'), sc.start_time
    ) as 만든글
  from public.students s
  join public.schedules sc on sc.student_id = s.id and sc.is_active = true
  group by s.id
) d
where d.id = st.id
  and coalesce(st.class_time, '') <> d.만든글
  and st.id in (
    '1c8e0c6a-0b98-4338-a31b-46f86f2ca8c4','849bb6d6-8bb7-4785-b1c6-4ab0da687cf8',
    'c67b8dc8-56cf-4fc8-98c3-9448c26eecba','d93f1544-1e48-4f15-9cc7-8a8e783da0e8',
    'fc901674-8258-40fd-8326-30f9fb2bb97b','ae2e3ec8-94d7-452a-816b-515e61462291',
    'f6ee4395-865d-4274-821a-31c359fa3467','bfde113c-7f35-404c-ad69-f3a46060a13f',
    '94f61081-7d96-4355-bd78-ffdfb6404d49','b09875a5-898b-40e4-899c-ef00abdc30b9',
    '7befacb4-42d6-4444-af33-e4fb1701edef','48530836-90da-4d5b-8022-0c1837e0186e',
    '5d200410-283c-4a13-9592-9b80b4153be1','3abf8cd9-2f50-40f6-9401-146b08f296dc',
    'e4febc89-1f42-417c-81b8-99ab4911af21','c783e7ef-fe78-4493-b7dc-d017de43be98',
    'f43d37b2-2fb3-4464-8238-fdc99c7e54eb','2ca7f3b0-c943-4946-afcf-99cc72e3d522',
    '3aefb32c-dd03-4e95-ad40-1c770acd4215','1ab39d56-ffb8-4a92-b34c-3e2f318ecdc3',
    '48a6f9c7-a0bf-4f3e-825f-1677f8470091','a17c3905-6fd9-4ed9-9cb1-86e0040f667c',
    'bb8ba2e3-4b11-4ae3-85af-1546084659ca','aa735178-d357-4c14-9662-568366b2dff9',
    'cdc3c92b-bc05-4b55-8c9e-24d4dac0dc80','2b84fc40-4502-4f62-bfb2-43d1f1b52fad',
    '8e38c1cf-a8b5-4540-b2f9-a53752d91fac','aea0ff19-8832-49cd-a224-a1716ec8a4d8',
    'e98948d3-4ade-40c1-a500-9979dd5e6c09','73cc3dd7-8233-48ef-929e-e3d3af7896e2',
    '697f769e-69ee-4f1b-9b62-bdcb02a3f6be','a6888181-71fd-4a62-8427-8e4e4dd8ac50',
    '74b6e67e-159d-4df1-b37f-c806018af5f0','e6813358-1b72-45f5-b731-f8cc32d1cf0b'
  );

-- 확인 — 0 이어야 한다 (뺀 여섯 명만 남는다)
select count(*) as 아직_어긋남
from (
  select st.id, st.name, st.class_time,
    string_agg(sc.day_of_week || to_char(sc.start_time,'HH24:MI') || '·' || sc.periods || '교시',
      ', ' order by position(sc.day_of_week in '월화수목금토일'), sc.start_time) as 만든글
  from public.students st
  join public.schedules sc on sc.student_id = st.id and sc.is_active = true
  where st.is_active = true and coalesce(st.is_test,false) = false
  group by st.id, st.name, st.class_time
) d
where coalesce(class_time,'') <> 만든글
  and name not in ('이지훈','김민재','진서우','이서우','호킨슨제레미','이연서');
