-- 영상 과제를 배부하면서 「직접 푼 풀이도 찍어 내라」고 켜는 표 (2026-11-04)
-- 되돌리기: 영상과제_풀이사진_요청_되돌리기.sql
--
-- 원장님 2026-11-04
--   「영상과제를 배부하면서 증명이 아니라 직접 풀이한것도 찍어 올리라고 할거거든.
--    직접풀이한거 찍어올릴수 있도록 창 만들어주려고 하는데 기능좀 추가해줘」
--
-- 지금까지는 **영상 종류**만 보고 저절로 따라왔다 — 증명 강의(lesson_videos.kind='증명')와
-- 컨씨영상(grade '쎈C …')만 사진을 냈다. 이 표는 그 밖의 영상(개념·대표예제·바깥 유튜브 링크)에
-- 선생님이 **하나씩 켜는** 자리다.
--
-- ★ 새 길을 내지 않는다. 켜지면 학생은 지금 쓰던 그 칸(ProofSubmitBox)으로 내고,
--   사진은 같은 보관함(proof-photos), 기록은 같은 표(proof_submissions)에 들어간다.
--   그래서 선생님·학부모 화면의 「○○ 제출 1/2」 칩도 그대로 돈다.
-- ★ 수업·학생이 지워지면 같이 지워진다(on delete cascade). 영상 과제에서 링크를 빼면
--   화면에서 그 줄도 지운다 — 남아 있어도 video_url 에 없으면 아무 데도 안 쓰인다.
-- ★ 학생은 **읽기만** 한다(켜졌는지 보려고). 켜고 끄는 것은 선생님뿐이다.

begin;

create table if not exists public.video_photo_requests (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  session_id   uuid not null references public.class_sessions(id) on delete cascade,
  video_url    text not null,
  -- 같은 영상이라도 뒤에 ?si=… 가 붙어 들어온 것이 있어 유튜브 id 도 같이 남긴다(견주기용)
  youtube_id   text,
  requested_by text,
  created_at   timestamptz not null default now(),
  unique (session_id, video_url)
);
create index if not exists video_photo_requests_student on public.video_photo_requests (student_id);

alter table public.video_photo_requests enable row level security;

-- ★ `authenticated` 에게 열면 **학생·학부모까지 다 읽힌다**(학생도 익명 authenticated 다).
--   직원 전용은 반드시 is_staff() 로 본다. (select ...) 로 감싸야 줄마다 다시 안 돈다.
drop policy if exists staff_all on public.video_photo_requests;
create policy staff_all on public.video_photo_requests for all
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- 학생·학부모는 **자기 것만, 읽기만**. 「이 영상은 풀이 사진을 내야 하는가」를 보려고 읽는다.
drop policy if exists own_read on public.video_photo_requests;
create policy own_read on public.video_photo_requests for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

commit;

-- 확인
-- select tablename, policyname, cmd from pg_policies
--   where schemaname='public' and tablename='video_photo_requests';
--
-- ★ 맨몸 is_staff() 가 섞이면 줄마다 다시 돌아 앱 전체가 느려진다. 아래가 **0** 이어야 한다.
-- select count(*) from pg_policies where schemaname='public'
--   and (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '(?<!SELECT )(?<![.\w])is_(staff|admin)\(\)';
