-- 되돌리기 — 「시험기간 결석」을 다시 「시험기간」으로 (2026-10-08)
--
-- ★ 주의: 이 되돌리기는 **이름을 바꾼 뒤에 새로 적힌 기록까지** 같이 옛 이름으로 돌린다.
--    그게 맞다 — 코드도 함께 되돌릴 테니 옛 이름 하나로 모여야 한다.
--    코드만 남겨 두고 이것만 돌리면 선생님 화면에서 버튼이 안 눌린 것처럼 보인다(값이 안 맞아서).

begin;

update public.learning_notes
   set attendance = '시험기간'
 where attendance = '시험기간 결석';

select attendance, count(*) as 건수
  from public.learning_notes
 where attendance like '시험기간%'
 group by 1;

commit;
