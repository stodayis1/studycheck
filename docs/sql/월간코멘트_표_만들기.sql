-- 월간 리포트의 「담당 선생님 코멘트」를 담아 둘 자리
--
-- 원장님 2026-10-24 「알림장을 저렇게 쓰지 말고 한달동안 써준 알림장 내용을
--   너가 요약정리해서 써주면 어떨까?」
--
-- 지금은 그 달 **마지막 알림장 한 건**을 그대로 싣고 있다. 그래서 「오늘 15분 지각을
-- 해서…」 같은 하루치 이야기가 한 달 총평 자리에 들어간다.
-- 앞으로는 한 달치 알림장을 Claude 가 읽고 요약해 여기에 넣고, 원장님이 화면에서
-- 보시고 고친 뒤 링크를 찍는다.
--
-- ★ 빈 표 하나를 더하는 것이다. 지금 자료는 하나도 건드리지 않는다.
-- ★ 링크를 찍는 순간 이 글이 report_links.data 에 **박힌다**(스냅샷). 그 뒤에 여기를
--   고쳐도 이미 보낸 리포트는 안 바뀐다 — 그게 맞다.
begin;

create table if not exists public.monthly_report_comments (
  student_id  uuid not null references public.students(id) on delete cascade,
  year        smallint not null,
  month       smallint not null check (month between 1 and 12),
  comment     text not null,
  -- 'claude' = 알림장을 요약해 쓴 것, 'teacher' = 사람이 고쳐 쓴 것
  source      text not null default 'claude' check (source in ('claude', 'teacher')),
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (student_id, year, month)
);

comment on table public.monthly_report_comments is
  '월간 리포트의 담당 선생님 코멘트. 한 달치 알림장을 요약해 담는다 (원장님 2026-10-24).';

alter table public.monthly_report_comments enable row level security;

-- 직원만 읽고 쓴다. 학생·학부모도 authenticated 라 using (true) 로 쓰면 다 읽힌다.
-- is_staff() 는 (select ...) 로 감싸야 행마다 다시 안 돈다.
drop policy if exists mrc_staff_all on public.monthly_report_comments;
create policy mrc_staff_all on public.monthly_report_comments
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

commit;

-- 확인
select tablename, rowsecurity from pg_tables where tablename = 'monthly_report_comments';
select polname, pg_get_expr(polqual, polrelid) as using_절
from pg_policy where polrelid = 'public.monthly_report_comments'::regclass;
