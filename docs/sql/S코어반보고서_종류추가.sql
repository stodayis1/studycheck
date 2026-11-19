-- report_links 에 「S코어반 학습 기록」 종류를 더한다 (원장님 2026-11-19)
--
-- 「기존에 있는거 말고 ... S코어반은 별도로 새로 만들어줘」
--
-- 월간 리포트(monthly_report)는 전교생에게 같은 꼴로 나간다. 이쪽은 **선행 과정을 따라가고
-- 있는지**를 보여 주는 것이라 보는 것이 다르다 — 달마다 학습지 성적, 선행 범위와 현 학년
-- 범위를 갈라서, 다시 푼 학습지, 숙제·출결, 교재, 평가 기록.
--
-- ★ report_links.report_type 에 **검사 규칙**이 걸려 있다. 새 종류를 안 넣으면
--   링크를 만드는 순간 그냥 막힌다(화면은 멀쩡히 뜬다).
-- ★ 지우는 변경이 없다 — 규칙에 글자 하나를 **더하기만** 한다.
--
-- 되돌리기: docs/sql/S코어반보고서_종류추가_되돌리기.sql

begin;

alter table public.report_links drop constraint if exists report_links_report_type_check;
alter table public.report_links add constraint report_links_report_type_check
  check (report_type = any (array[
    'daily'::text, 'monthly'::text, 'quarterly'::text,
    'worksheet_scores'::text, 'attendance_rate'::text, 'daily_notice'::text,
    'monthly_report'::text,
    'score_class'::text
  ]));

commit;

-- 확인 — 'score_class' 가 규칙 안에 있어야 한다 (1)
select count(*) as 열렸나 from pg_constraint
 where conname = 'report_links_report_type_check'
   and pg_get_constraintdef(oid) like '%score_class%';
