-- 설문에 「행사마다 다른 답」을 담을 칸 하나를 더한다. (원장님 2026-11-06)
--
-- 왜
--   11/21 부모학교 설문은 꼭지마다 별점(0.5~5)으로 받는다. 지금 표에는 별점을 담을 칸이 없고,
--   꼭지는 행사마다 달라서 칸을 네 개 만들어도 다음 행사에서 또 모자란다.
--   그래서 행사별 답은 jsonb 한 칸(answers)에 담는다.
--     { "stars": {"0":4.5,"1":5}, "recommend":5, "consult_new":[…], "consult_now":[…],
--       "agree_notice":true, "agree_privacy":true }
--   꼭지 이름은 코드(lib/surveyEvents.ts)에 있고 여기엔 **차례(0,1,2,3)** 만 담는다.
--
-- ★ 더하기만 한다. 기존 칸·기존 답 6건(10/24 설명회)은 건드리지 않는다.
-- ★ 기본값이 '{}' 라 예전 줄도 그대로 읽힌다.
-- ★ 이 칸이 없어도 설문 화면은 돌아간다 — app/api/survey 가 칸이 없으면 글로 적어 둔다.
--   그래도 별점을 숫자로 집계하려면 이 파일을 한 번 실행해야 한다.
--
-- 되돌리기: 설문_행사별답_칸추가_되돌리기.sql
begin;

alter table public.survey_responses
  add column if not exists answers jsonb not null default '{}'::jsonb;

comment on column public.survey_responses.answers is
  '행사별 답 (별점·상담 체크·동의). 꼭지 이름은 lib/surveyEvents.ts 에 있다.';

commit;

-- 확인 — answers 칸이 jsonb 로 생겼고, 기존 줄은 {} 인지 본다
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'survey_responses' and column_name = 'answers';

select survey_key, count(*) as 답, count(*) filter (where answers <> '{}'::jsonb) as 행사별답있음
from public.survey_responses group by survey_key order by survey_key;
