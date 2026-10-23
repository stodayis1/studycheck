-- 유형만렙 공통수학2 1,272문항을 **되돌린다** (잘못 올렸을 때만)
-- ※ 그림은 problem-images 저장소의 hc2-1/mr/ 아래에 남는다. 다시 올리면 덮어쓴다.
delete from problems
 where book = '유형만렙' and grade = '공통수학2' and semester = 1;
