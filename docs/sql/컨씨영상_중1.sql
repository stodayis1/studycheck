-- 컨씨영상 중1-2 17편을 학습일지 「강의영상 고르기」에 (2026-11-03) — 방식은 컨씨영상_중3-2.sql 과 같다
-- · 채널의 「중1 쎈C N번」 17편은 모두 9/8 에 올렸고 1-2 선별 번호다. 로컬 원본(쏀C선별문항/영상/중1/2학기)과 길이가 같다
-- · 로컬에만 있는 240·468번, 중1-1 컨씨영상은 채널에 없다
-- 되돌리기: 컨씨영상_중1_되돌리기.sql
insert into lesson_videos (grade, kind, concept_no, order_label, title, chapter, sub_chapter, book, youtube_id, duration_seconds, type_codes)
select '쎈C 중1-2', '대표예제', v.no, '쎈C풀이' || repeat(' ', 4 - length(v.no::text)) || v.no || '번', s.type_title, s.chapter_title, p.sub_chapter_title, '쎈 중1-2 C단계', v.yt, v.sec, array[p.type_code]
from (values
  (126,'B8ZdaratxkU',274),(133,'NgwJmiZYGkM',142),(135,'RfZefiIwejU',177),(136,'1_ekiBcR2gU',125),(141,'ab6lq-2Y6zM',103),(232,'QpscHPUhKQM',69),(243,'MRU9aMER11U',83),(244,'JGgIdlrnOXI',169),(248,'2nUgCsJNHzQ',217),(323,'BpsmTeVYpOo',61),(328,'6WnKRFGfQa0',62),(329,'D3eQCmALQtw',135),(337,'x_GzZ92NM4I',113),(448,'KyxmT7KDW2s',105),(450,'CXoBC8hHHzo',150),(458,'RjzVcRabDMA',97),(464,'xLrNV8u-p2U',236)
) v(no, yt, sec)
join problems p on p.book = '쎈' and p.grade = '중1' and p.semester = 2 and p.local_no = v.no::text and p.step = 'C'
join standard_types s on s.code = p.type_code;
