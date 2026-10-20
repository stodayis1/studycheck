-- 강의영상 목록 + 학생별 시청 기록 강화 (2026-10-20)
-- 되돌리기: 강의영상_목록과_시청기록_되돌리기.sql
--
-- 원장님 방향: 강의영상은 전체 공개가 아니라 **학습일지에서 학생마다 과제로 넣어 준 것만** 학생에게 보인다.
--   과제는 지금처럼 class_sessions.video_url(줄바꿈 링크)에 들어간다 — 학부모 화면·선생님 배지가 그대로 돈다.
--   학생은 스터디체크 안에서 재생하고, 실제로 재생된 초를 세서 「제대로 들었는지」를 자동으로 판정한다.
-- 데이터: 장면별로 몇 초 봤는지가 남는다 → 학생별 취약 개념 분석으로 잇는다.

begin;

-- 1) 강의영상 목록 (수지쌤 개념·증명 영상). 유튜브 재생목록을 읽어 채운다(선생님 화면 「유튜브에서 다시 읽어오기」).
create table if not exists public.lesson_videos (
  id               uuid primary key default gen_random_uuid(),
  grade            text not null,                 -- '공통수학2'
  kind             text not null check (kind in ('개념', '증명')),
  concept_no       int  not null,                 -- 개념 번호 (증명은 딸린 개념의 번호)
  order_label      text not null,                 -- '03', '03-증명2'
  title            text not null,
  chapter          text,
  sub_chapter      text,
  book             text,                          -- '개념+유형 개념편 공통수학2'
  book_pages       int[],
  youtube_id       text unique,                   -- 아직 안 올렸으면 null
  duration_seconds numeric,
  scenes           jsonb not null default '[]',   -- [{"start":0,"end":17.4,"label":"오늘 배울 개념","kind":"title"}, …]
  type_codes       text[] not null default '{}',  -- 이어지는 필수예제 유형 코드 (공수2-02-06 …)
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (grade, order_label)
);

alter table public.lesson_videos enable row level security;

drop policy if exists staff_all on public.lesson_videos;
create policy staff_all on public.lesson_videos for all
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- 학생·학부모는 「자기 학습일지 과제에 들어간 영상」만 읽는다 (목록 전체가 보이면 안 된다)
drop policy if exists own_assigned_read on public.lesson_videos;
create policy own_assigned_read on public.lesson_videos for select
  using (
    youtube_id is not null and exists (
      select 1 from public.class_sessions cs
      join public.students s on s.id = cs.student_id
      where cs.video_url like '%' || lesson_videos.youtube_id || '%'
        and (s.session_uid = (select auth.uid()) or s.parent_session_uid = (select auth.uid()))
    )
  );

-- 2) 시청 기록: 창 열려 있던 시간이 아니라 **실제로 재생된 초**
alter table public.video_watch_logs
  add column if not exists lesson_video_id    uuid references public.lesson_videos(id) on delete set null,
  add column if not exists duration_seconds   numeric,                    -- 영상 길이
  add column if not exists covered_seconds    int     not null default 0, -- 한 번이라도 재생된 서로 다른 초 (건너뛴 곳은 안 셈)
  add column if not exists coverage_pct       numeric not null default 0, -- covered / duration × 100
  add column if not exists played_seconds     int     not null default 0, -- 다시 본 것까지 포함한 재생 초
  add column if not exists focus_lost_seconds int     not null default 0, -- 다른 앱·탭으로 간 동안 (재생 중)
  add column if not exists scene_seconds      jsonb   not null default '{}', -- {"3": 41, …} 장면 번호별 재생 초
  add column if not exists watched_ranges     jsonb   not null default '[]', -- [[0,95],[120,180]] 본 구간(초) — 다시 들어와도 이어서 셈
  add column if not exists completed_at       timestamptz;                -- 완료 판정 시각 (covered 90% 이상)

-- 같은 날 같은 영상은 한 줄 (지금 화면도 그렇게 가정하고 .single() 로 읽는다). 기존 6줄에 겹침 없음 확인함.
create unique index if not exists video_watch_logs_one_per_video
  on public.video_watch_logs (student_id, session_id, video_url);

commit;
