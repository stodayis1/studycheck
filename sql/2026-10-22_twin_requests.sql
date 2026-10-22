-- 쌍둥이 만들기 요청 — 문제은행 문항을 숫자만 바꾼 쌍둥이로 만들어 달라는 줄.
-- 버튼(문제은행 · 채점결과 재출제)은 여기에 요청만 남기고, 실제로 만드는 건 Claude(「요청 처리해줘」).
-- 순서와 명령은 scripts/twin-gen/README.md.
-- 기존 표는 건드리지 않고 새 표만 추가. RLS 는 staff 전용 (학생·학부모도 authenticated 라서 true 로 열면 안 된다).

create table if not exists public.twin_requests (
  id bigserial primary key,
  problem_id bigint not null references public.problems(id) on delete cascade,  -- 원래 문항
  status text not null default '대기'
    check (status in ('대기', '확인대기', '반영완료', '실패')),
  -- 대기: 아직 손 안 댐 / 확인대기: 만들어서 원장님 확인 기다림 / 반영완료: 문제은행에 들어감 / 실패: 못 만듦(reason)
  reason text,                         -- 실패 사유 (도형 문제 등) — 화면에 보인다
  source text not null default 'manual' check (source in ('manual', 'reprint')),
  requested_by_name text,
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  made_count int not null default 0,   -- 반영한 쌍둥이 수
  unique (problem_id)                  -- 한 문항에 요청 하나. 다시 누르면 기존 줄을 쓴다
);

create index if not exists twin_requests_status_idx on public.twin_requests(status, requested_at);

alter table public.twin_requests enable row level security;

drop policy if exists staff_only on public.twin_requests;
create policy staff_only on public.twin_requests
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

-- 확인용
select count(*) as rows_now from public.twin_requests;
