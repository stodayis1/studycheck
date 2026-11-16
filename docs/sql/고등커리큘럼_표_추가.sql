-- curriculum_plan_docs 추가 (2026-11-16)
--
-- 왜: 고등 커리큘럼(고1·고2) — 반별(W·I·S·E) 교재 흐름, 내신 대비 계획, 단원별 차시표를
--     원장님과 고등 담당 강사가 같이 보고 고칠 수 있게 스터디체크에 둔다(원장님 2026-11-16).
--     화면: app/teacher/high-curriculum/page.tsx
--
-- 모양: 학년(grade)마다 문서(doc_id) 여러 개.
--   grade = 'g1' | 'g2' …
--   doc_id = 'books'  교재 흐름 표  {rows:[…]}
--            'exam'   내신 대비 표  {rows:[…]}
--            'unit-<탭>-<과목>-<번호>'  단원 한 줄의 차시·데일리·숙제·주차·메모
--   한 칸을 고치면 그 문서 한 줄만 바뀐다(다른 단원 줄을 덮어쓰지 않는다).
--
-- 누가: 선생님·직원(is_staff)만 읽고 쓴다. 학생·학부모(익명 로그인 authenticated)는 못 본다.
--       지우는 정책은 만들지 않는다 — 화면에도 줄을 지우는 길이 없다(표 안의 단계 삭제는 rows 를 고쳐 저장).
--
-- 안전한가: 새 표를 **더하는** 것뿐이다. 기존 표·코드에 영향 없다.
-- 되돌리기: docs/sql/고등커리큘럼_표_추가_되돌리기.sql

create table if not exists public.curriculum_plan_docs (
  grade           text        not null,
  doc_id          text        not null,
  data            jsonb       not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by_name text,
  primary key (grade, doc_id)
);

comment on table public.curriculum_plan_docs is
  '고등 커리큘럼 화면(/teacher/high-curriculum)의 저장소. grade(g1·g2)마다 books·exam·unit-* 문서. 직원만 읽고 쓴다.';

alter table public.curriculum_plan_docs enable row level security;

drop policy if exists curriculum_plan_docs_staff_read on public.curriculum_plan_docs;
create policy curriculum_plan_docs_staff_read on public.curriculum_plan_docs
  for select to authenticated using ((select public.is_staff()));

drop policy if exists curriculum_plan_docs_staff_insert on public.curriculum_plan_docs;
create policy curriculum_plan_docs_staff_insert on public.curriculum_plan_docs
  for insert to authenticated with check ((select public.is_staff()));

drop policy if exists curriculum_plan_docs_staff_update on public.curriculum_plan_docs;
create policy curriculum_plan_docs_staff_update on public.curriculum_plan_docs
  for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()));

-- 확인
select tablename, policyname, cmd from pg_policies where tablename = 'curriculum_plan_docs' order by policyname;
