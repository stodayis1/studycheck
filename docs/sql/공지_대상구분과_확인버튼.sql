-- 공지사항에 「누구에게 보일지」와 「확인 버튼」을 더한다 (원장님 2026-11-13).
--
-- 왜
--   지금은 공지 하나를 선생님·학생·학부모가 모두 본다. 그래서 「성적이 미진한 학생은 보강 잡아 알려 주세요」
--   같은 내부 지시를 올리면 학부모님도 읽는다. 대상을 가르고, 선생님께 보낸 글은 읽었는지 확인받는다.
--
-- 순서
--   ① 이 SQL 을 먼저 적용한다 (칸만 더하므로 지금 앱은 그대로 돈다 — audience 는 전부 'all' 로 들어간다)
--   ② 앱을 배포한다
--
-- 되돌리기: docs/sql/공지_대상구분과_확인버튼_되돌리기.sql

begin;

-- ① 공지에 대상 칸과 확인 요청 칸
alter table public.announcements
  add column if not exists audience text not null default 'all',
  add column if not exists needs_ack boolean not null default false;

comment on column public.announcements.audience is
  'all = 모두 / teacher = 선생님·직원만 / family = 학생·학부모 (직원은 어느 것이든 다 본다)';
comment on column public.announcements.needs_ack is
  '참이면 선생님 화면에 「확인」 단추가 뜨고, 누른 사람이 announcement_acks 에 쌓인다';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_audience_chk') then
    alter table public.announcements
      add constraint announcements_audience_chk check (audience in ('all', 'teacher', 'family'));
  end if;
end $$;

-- ② 누가 읽었는지
create table if not exists public.announcement_acks (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null,
  user_name text,
  acked_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.announcement_acks enable row level security;

-- 직원만 읽고 쓴다. 학생·학부모도 authenticated 라서 to authenticated using (true) 를 쓰면 안 된다.
drop policy if exists acks_staff_read on public.announcement_acks;
create policy acks_staff_read on public.announcement_acks for select to authenticated
  using ((select public.is_staff()));

drop policy if exists acks_self_write on public.announcement_acks;
create policy acks_self_write on public.announcement_acks for insert to authenticated
  with check ((select public.is_staff()) and user_id = (select auth.uid()));

-- 잘못 눌렀을 때 본인이 무를 수 있게. 원장님은 누구 것이든 지울 수 있다.
drop policy if exists acks_self_delete on public.announcement_acks;
create policy acks_self_delete on public.announcement_acks for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ③ 선생님 전용 공지는 학생·학부모에게 보이지 않는다
--    (바꾸기 전: (is_active = true) or (select is_staff()) — 누구나 활성 공지를 다 읽었다)
drop policy if exists public_read_active on public.announcements;
create policy public_read_active on public.announcements for select
  using (
    (select public.is_staff())
    or (is_active = true and audience in ('all', 'family'))
  );

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'announcements'
  and column_name in ('audience', 'needs_ack');
-- audience, needs_ack 두 줄이 나오면 맞다.

select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('announcements', 'announcement_acks')
order by tablename, policyname;

-- 맨몸 is_staff()/is_admin() 가 남아 있지 않은지 (행마다 불리면 앱 전체가 느려진다)
select count(*) as 맨몸호출 from pg_policies where schemaname = 'public'
  and tablename in ('announcements', 'announcement_acks')
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
-- 0 이어야 한다.
