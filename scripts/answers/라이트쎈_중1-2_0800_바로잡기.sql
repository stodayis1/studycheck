-- 라이트쎈 중1-2 0800 — 2026-10-27 에 ② 로 넣은 정답을 ③ 으로 바로잡는다
--
-- 정답 그림(m1-2/light/…/0800_a.png)에 다음 문항 0801 의 답(②)이 잘려 들어가 있었고,
-- 그림을 두 번 따로 읽어도 둘 다 그 그림을 읽었으니 같게 ② 가 나왔다.
-- 풀이 본문 53쪽: 「0800 ③ 회전체의 옆면을 만드는 선분을 모선이라 한다. 답 ③」.
-- 이 일로 「그림 두 번 + 원본(빠른정답·풀이) 한 번」 세 겹 대조를 규칙으로 했다(README).
update problems set answer_text = '③'
where book = '라이트쎈' and grade = '중1' and semester = 2 and local_no = '0800'
  and answer_kind = 'choice' and answer_text = '②';

-- 되돌리기
-- update problems set answer_text = '②'
-- where book = '라이트쎈' and grade = '중1' and semester = 2 and local_no = '0800' and answer_text = '③';
