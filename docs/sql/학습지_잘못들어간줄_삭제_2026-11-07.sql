-- 초4 학생 한 명(id fe741bdc…) 11월 7일 학습지 8장 삭제 — 다른 학생 것이 그 학생 이름으로 출력돼 풀렸다
--
-- 왜 (2026-11-12, 원장님)
--   「7일날 출석하지 않았는데 그날 왜 학습지가 채점되어 있는지 모르겠네…
--     11월 7일에 다른 학생을 그 학생 이름으로 출력해서 풀이했던거 같아」
--   「11월 7일건은 삭제해주면 될듯」
--
--   그 학생은 11/07(토)에 출석하지 않았다. 확인한 것:
--     · 11/07 수업일지(class_sessions) 없음. 직전 수업은 11/06(금).
--     · OPS 보강도 11/07 이 아니라 11/21(토) 10시로 예약돼 있다.
--     · 그날 10시 보강 출석자 명단에 그 학생은 없다.
--   그런데도 학습지 8장이 그 학생 이름으로 들어가 있었다. 종이에 그 학생 이름이 찍혀 나갔고
--   그걸 다른 학생이 푼 것으로 보신다 — 점수의 주인을 알 수 없으므로 **옮기지 않고 지운다.**
--
-- 무엇이 지워지나 — student_worksheets 8줄 (전부 '초4 · 4학년 2학기 4단원' 계열)
--     83점(main, 매쓰홀릭 25/30) · 100 · 100 · 33 · 100 · 75 (similar, 매쓰홀릭)
--     75점 · 100점 (main, 11/07 19:27 앱에서 직접)
--   6줄은 매쓰홀릭 붙여넣기로 들어온 것이라 memo 에 「매쓰홀릭 …」이 남아 있다.
--
-- ★ 딸린 줄은 없다 — 이 8줄을 parent_worksheet_id 로 가리키는 학습지 0건(실행 전 확인).
-- ★ 작업기록(worksheet_action_logs) 12줄은 **그대로 둔다.** 「언제 누가 무엇을 했나」는
--   남아 있어야 한다. 학습지 줄이 없어도 기록은 혼자 선다(외래키가 없다).
-- ★ 이미 학부모님께 나간 11/09·11/11 브리핑의 「점수 현황」 링크 스냅샷에는 이 8줄이
--   얼어붙어 있다. 그 링크를 다시 여시면 아직 보인다 — 그건 따로 정할 일이다.
--
-- 되돌리기: docs/sql/학습지_잘못들어간줄_삭제_2026-11-07_되돌리기.sql
--   (지워진 8줄을 id 까지 그대로 되살린다)

begin;

-- 지우기 전에 **몇 줄인지** 확인한다. 8이 아니면 멈춘다.
do $$
declare n int;
begin
  select count(*) into n from public.student_worksheets
  where student_id = 'fe741bdc-d821-4fd1-a860-0b352fefe47f'
    and (submitted_at at time zone 'Asia/Seoul')::date = date '2026-11-07';
  if n <> 8 then
    raise exception '지울 줄이 8개가 아니라 %개입니다 — 멈춥니다. 되돌리기 파일과 맞는지 보세요.', n;
  end if;
end $$;

delete from public.student_worksheets
where student_id = 'fe741bdc-d821-4fd1-a860-0b352fefe47f'
  and (submitted_at at time zone 'Asia/Seoul')::date = date '2026-11-07';

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
select (submitted_at at time zone 'Asia/Seoul')::date as 제출일, count(*) as 장수
from public.student_worksheets
where student_id = 'fe741bdc-d821-4fd1-a860-0b352fefe47f'
  and submitted_at >= '2026-10-01'
group by 1 order by 1 desc;
-- 11-07 줄이 사라지고 11-02 가 가장 최근이면 맞다.
