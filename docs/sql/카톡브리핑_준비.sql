-- 카톡 수업 브리핑 자동 발송 준비
--   되돌리기: docs/sql/카톡브리핑_준비_되돌리기.sql
--
-- 세 가지를 한다.
--   1) report_links 에 만료 시각을 둔다 (지금은 링크가 영구히 산다)
--   2) get_report_by_token 이 만료된 링크를 안 내주게 한다
--   3) 하루에 한 번만 가도록 발송 기록 표를 만든다 (중복 발송 = 요금 + 학부모 민원)

-- ── 1) 만료 시각 ───────────────────────────────────────────────────────────
alter table public.report_links
  add column if not exists expires_at timestamptz;

-- 이미 보낸 링크들도 기준을 맞춰 준다. 90일은 "지난 학기 것을 다시 열어 보는" 정도를
-- 감당하는 길이이고, 그 뒤엔 카톡에 남은 링크가 저절로 닫힌다.
update public.report_links
   set expires_at = created_at + interval '90 days'
 where expires_at is null;

alter table public.report_links
  alter column expires_at set default (now() + interval '90 days');

-- 토큰으로 한 건을 찍어 읽는 경로라 토큰 인덱스가 핵심이다(이미 있으면 넘어간다).
create unique index if not exists report_links_token_key
  on public.report_links (token);

-- ── 1-2) report_type 에 새 값 세 개를 허용한다 ─────────────────────────────
-- ★ 이 표에는 report_type 을 daily/monthly/quarterly 로 묶어 둔 CHECK 제약이 있다.
--   이걸 안 넓히면 브리핑 링크 생성이 통째로 실패한다(미리보기에서 실제로 막혔다).
--   원래 정의: CHECK (report_type = ANY (ARRAY['daily','monthly','quarterly']))
alter table public.report_links drop constraint if exists report_links_report_type_check;
alter table public.report_links add constraint report_links_report_type_check
  check (report_type = any (array[
    'daily', 'monthly', 'quarterly',
    'worksheet_scores', 'attendance_rate', 'daily_notice'   -- 카톡 브리핑 버튼 뒤 화면
  ]));

-- ── 2) 만료된 링크는 안 내준다 ─────────────────────────────────────────────
-- 원래 정의: select * from public.report_links where token = p_token limit 1;
create or replace function public.get_report_by_token(p_token text)
 returns setof report_links
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select * from public.report_links
   where token = p_token
     and (expires_at is null or expires_at > now())
   limit 1;
$function$;

-- ── 3) 발송 기록 ───────────────────────────────────────────────────────────
-- (student_id, session_date) 를 유일하게 묶어 **DB가** 중복 발송을 막는다.
-- 코드에서 "이미 보냈나?" 를 확인하는 방식은 두 번 눌리면 둘 다 통과한다.
create table if not exists public.briefing_sends (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_date date not null,
  session_id uuid references public.class_sessions(id) on delete set null,
  to_phone text,
  status text not null default 'sent',          -- sent | failed | skipped
  error text,
  body_len int,                                  -- 알림톡 본문 길이(1000자 한도 감시용)
  sent_at timestamptz not null default now(),
  constraint briefing_sends_once unique (student_id, session_date)
);

create index if not exists briefing_sends_date_idx
  on public.briefing_sends (session_date desc);

alter table public.briefing_sends enable row level security;

-- ★ 학생·학부모도 authenticated 다. to authenticated using (true) 로 쓰면 전원이 읽는다.
--   발송 기록은 직원 전용. is_staff() 는 (select ...) 로 감싸야 행마다 안 불린다.
drop policy if exists briefing_sends_staff_all on public.briefing_sends;
create policy briefing_sends_staff_all on public.briefing_sends
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
