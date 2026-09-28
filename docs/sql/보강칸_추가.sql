-- 학습일지에 '보강' 전용 칸을 만든다
--
-- 왜: 결석한 날의 보강 진행 상황(안내 발송 / 날짜 예약 / 완료 / 보강 안 함)을
--     학생·학부모 화면에 보여주려는 것이다.
--
-- 왜 기존 memo에 쓰지 않는가:
--   learning_notes.memo는 **선생님이 학습관리에서 직접 쓰는 칸**이고 학부모 화면에
--   「📝 선생님 메모」로 그대로 나간다. 여기에 OPS가 보강 문구를 쓰면 선생님이 적어둔
--   내용이 지워진다. 그래서 칸을 따로 둔다.
--
-- 누가 쓰나: OPS(수학OPS)가 서비스 키로 이 칸만 갱신한다.
--   (sumath-admin/src/lib/studycheckPush.ts — 보강 상태가 바뀔 때마다)
--   학생·학부모는 이 칸을 못 바꾼다 — 학생학부모_쓰기차단.sql의 트리거 화이트리스트에
--   makeup_note가 없으므로 자동으로 금지된다. 읽기는 기존 own_read 정책이 그대로 커버한다.
--
-- 되돌리기: alter table public.learning_notes drop column makeup_note;
--           (칸만 지우면 되고 다른 데이터는 영향이 없다)

begin;

alter table public.learning_notes add column if not exists makeup_note text;

comment on column public.learning_notes.makeup_note is
  '결석한 날의 보강 진행 상황. OPS가 씁니다. 예: "10월 5일(일) 예정", "보강 안 함". 선생님 메모(memo)와는 별개 칸.';

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='learning_notes' and column_name='makeup_note';
--
-- 실제 확인은 OPS에서 보강 날짜를 하나 예약해 보고,
-- 학생·학부모 앱 그 날짜 기록에 「보강」 줄이 뜨는지 보면 된다.
