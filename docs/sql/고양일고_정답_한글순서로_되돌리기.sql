-- 「고양일고_정답_한글순서로.sql」을 되돌린다 — 예전 값(원본 순서 + 16번 오타) 그대로.
begin;

update problems set answer_text = '③' where source_key = '2026_2학기중간_고양일고_고1_14번';
update problems set answer_text = '①' where source_key = '2026_2학기중간_고양일고_고1_15번';
update problems set answer_text = '⑤' where source_key = '2026_2학기중간_고양일고_고1_16번';
update problems set answer_text = '②' where source_key = '2026_2학기중간_고양일고_고1_17번';
update problems set answer_text = '④' where source_key = '2026_2학기중간_고양일고_고1_18번';
update problems set answer_text = '③' where source_key = '2026_2학기중간_고양일고_고1_19번';
update problems set answer_text = '①' where source_key = '2026_2학기중간_고양일고_고1_20번';

update exam_papers set answers_text =
'1 ②
2 ③
3 ②
4 ②
5 ⑤
6 ④
7 ①
8 ④
9 ⑤
10 ①
11 ⑤
12 ④
13 ⑤
14 ③
15 ①
16 ①
17 ②
18 ④
19 ③
20 ①
21 ③
22 ④'
where id = 'f9773eec-4fbe-4064-854c-4df32216bd5e';

commit;
