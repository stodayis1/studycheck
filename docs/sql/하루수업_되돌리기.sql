-- 「오늘 하루만 온 수업」 되돌리기 — one_day_classes 표를 뗀다.
--
-- ★ 되돌릴 때는 **코드를 먼저** 되돌린다. 화면에 「오늘 왔어요」 버튼이 떠 있는 채로 표를
--   없애면 누를 때마다 조용히 실패한다(선생님은 더해진 줄 안다).
-- ★★ 표를 떼면 더해 둔 하루 수업이 전부 사라진다. 다만 **이미 쓴 학습일지·브리핑은
--   그대로다** — 일지는 class_sessions 에 따로 쌓이고 이 표를 보지 않는다.
--   잃는 것은 「오늘 수업 목록에 띄우는 표시」뿐이다.

-- ① 무엇이 들어 있나
select count(*) as 하루수업줄 from public.one_day_classes;
select s.name, s.grade, o.class_date, o.start_time, o.periods, o.created_by
from public.one_day_classes o join public.students s on s.id = o.student_id
order by o.class_date desc, o.start_time;

-- ② 지우기로 정했을 때만 주석을 푼다
-- begin;
-- drop table if exists public.one_day_classes;
-- commit;

-- 값만 비우고 표는 두는 길(더 안전하다) — 위 대신 이 줄
-- delete from public.one_day_classes where class_date < current_date;

-- 확인
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'one_day_classes';
