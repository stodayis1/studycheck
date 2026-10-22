-- 학습지에 「만든 사람」을 적어 둔다 — 강사별로 갈라 보기 위해
--
-- 원장님 2026-10-22 「지금까지 출제한 학습지(강사별로)가 쭈루룩 목록에 떠서…」
--
-- ★ 지난 학습지는 누가 만들었는지 **알 길이 없다**. 표에 그 칸이 없었다.
--   그래서 오늘부터 만드는 것만 기록된다. 지난 것은 화면에서 「기록 없음」으로 묶인다.
-- ★ 값을 넣거나 지우는 것이 아니라 **빈 칸 하나를 더하는 것**이다. 지금 자료는 그대로다.
begin;

alter table public.exam_sheets
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists created_by_name text;

-- 목록을 강사로 거를 때 쓴다
create index if not exists exam_sheets_created_by_idx on public.exam_sheets (created_by);

comment on column public.exam_sheets.created_by is '이 학습지를 만든 직원(users.id). 2026-10-22 이전 것은 null — 기록이 없었다.';
comment on column public.exam_sheets.created_by_name is '만든 사람 이름을 그때 값으로 박아 둔다(퇴사해도 목록이 비지 않게).';

commit;

-- 확인
select column_name, data_type from information_schema.columns
where table_name = 'exam_sheets' order by ordinal_position;
