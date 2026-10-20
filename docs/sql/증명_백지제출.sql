-- 증명 영상 과제: 백지에 증명을 직접 써서 사진으로 낸다 — 채점은 없다, 제출만 (2026-10-20)
-- 되돌리기: 증명_백지제출_되돌리기.sql
--
-- 원장님 방향
-- · 증명 과정은 반드시 백지에 써서 낸다. 영상을 다 본 뒤(90% 이상)에만 올릴 수 있다.
-- · 사진은 한 번에 최대 3장. 채점·선생님 말 없음 — 「냈다 / 안 냈다」만.
-- · 사진은 비공개 — 선생님과 그 학생의 학부모만 잠깐 열리는 주소로 본다. 학생 본인은 제출 여부만.
-- 과제는 따로 없다 — 학습일지 영상 과제에 「증명」 강의(lesson_videos.kind='증명')를 넣으면 자동으로 따라온다.
-- 학생은 API(/api/proof-submit)로만 올린다. API 가 「내 과제인지 · 영상을 다 봤는지」를 확인하고 서비스 키로 쓴다.
-- 다시 내면 같은 줄의 사진을 바꾼다(그날 그 영상에 한 줄).

begin;

create table if not exists public.proof_submissions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  session_id       uuid not null references public.class_sessions(id) on delete cascade,
  lesson_video_id  uuid references public.lesson_videos(id) on delete set null,
  video_url        text not null,
  photo_paths      text[] not null default '{}',   -- proof-photos 버킷 안 경로 (1~3장)
  submitted_at     timestamptz not null default now(),
  unique (student_id, session_id, video_url)
);
create index if not exists proof_submissions_session on public.proof_submissions (session_id);

alter table public.proof_submissions enable row level security;

drop policy if exists staff_all on public.proof_submissions;
create policy staff_all on public.proof_submissions for all
  using ((select public.is_staff())) with check ((select public.is_staff()));

-- 학생·학부모는 「냈는지」만 본다 — 줄을 읽을 수는 있지만 사진 자체는 비공개 보관함이라 열 수 없다.
drop policy if exists own_read on public.proof_submissions;
create policy own_read on public.proof_submissions for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

-- 사진 보관함: 비공개. 보관함 읽기·쓰기 정책을 하나도 만들지 않는다 → 서비스 키(API)와 선생님용 signed URL 로만 열린다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proof-photos', 'proof-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 사진은 선생님과 **그 학생의 학부모**만 본다 (원장님 2026-10-20). 학생 본인은 제출 여부만.
-- 사진 경로: <student_id>/<session_id>/<1~3>.jpg — 학부모는 자기 자녀 폴더만 열린다.
drop policy if exists proof_photos_staff_read on storage.objects;
create policy proof_photos_staff_read on storage.objects for select
  using (bucket_id = 'proof-photos' and (select public.is_staff()));

drop policy if exists proof_photos_parent_read on storage.objects;
create policy proof_photos_parent_read on storage.objects for select
  using (bucket_id = 'proof-photos'
    and (storage.foldername(name))[1] in (
      select id::text from public.students where parent_session_uid = (select auth.uid())));

commit;
