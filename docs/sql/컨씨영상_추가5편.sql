-- 컨씨영상 5편 더 (2026-11-03) — 제목이 「쏀C」(오타)라 처음 찾을 때 빠졌던 것: 중3-2 139, 중2-2 296·312, 중1-2 240·468
-- · 5편 모두 9/8 에 올렸고 로컬 원본(쏀C선별문항/영상)과 길이가 같다. 방식은 컨씨영상_중3-2.sql · 컨씨영상_중2.sql 과 같다
-- 되돌리기: 컨씨영상_추가5편_되돌리기.sql
insert into lesson_videos (grade, kind, concept_no, order_label, title, chapter, sub_chapter, book, youtube_id, duration_seconds, type_codes)
select v.g, '대표예제', v.no, '쎈C풀이' || case when v.g = '쎈C 중3-2' then '' else repeat(' ', 4 - length(v.no::text)) end || v.no || '번', s.type_title, s.chapter_title, p.sub_chapter_title, '쎈 ' || substr(v.g, 4) || ' C단계', v.yt, v.sec, array[p.type_code]
from (values ('쎈C 중3-2','중3',2,139,'kEamvkt3P4w',272),('쎈C 중2-2','중2',2,296,'U8Mg9EVYyIc',189),('쎈C 중2-2','중2',2,312,'-MRarAwAu2Q',74),('쎈C 중1-2','중1',2,468,'ZtyOWHgpblg',207),('쎈C 중1-2','중1',2,240,'KOVWqgwdZ48',192)) v(g, gr, sem, no, yt, sec)
join problems p on p.book = '쎈' and p.grade = v.gr and p.semester = v.sem and p.local_no = v.no::text and p.step = 'C'
join standard_types s on s.code = p.type_code;
