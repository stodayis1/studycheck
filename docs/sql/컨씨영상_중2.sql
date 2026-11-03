-- 컨씨영상 중2-1 26편 · 중2-2 26편을 학습일지 「강의영상 고르기」에 (2026-11-03) — 방식은 컨씨영상_중3-2.sql 과 같다
-- · 학기는 유튜브 올린 날로 가른다: 6/15·6/25 = 중2-1(670~1286번), 9/8 = 중2-2(80~543번). 52편 모두 로컬 원본(쏀C선별문항/영상/중2/1학기·2학기)과 길이가 같다
-- · order_label 은 번호를 빈칸으로 네 자리에 맞춘다: 「1019」가 「670」보다, 「100」이 「80」보다 앞에 정렬되지 않게 (화면에서는 빈칸이 하나로 보인다)
-- · 중2-2 296·312번은 로컬에만 있고 채널에 없어 뺐다
-- 되돌리기: 컨씨영상_중2_되돌리기.sql
-- 중2-1 26편
insert into lesson_videos (grade, kind, concept_no, order_label, title, chapter, sub_chapter, book, youtube_id, duration_seconds, type_codes)
select '쎈C 중2-1', '대표예제', v.no, '쎈C풀이' || repeat(' ', 4 - length(v.no::text)) || v.no || '번', s.type_title, s.chapter_title, p.sub_chapter_title, '쎈 중2-1 C단계', v.yt, v.sec, array[p.type_code]
from (values
  (670,'cd-Cxz_Ebok',97),
  (768,'Y8dE0J8nu0M',140),
  (771,'m56qbgdCQ14',55),
  (776,'JD0CveNf3ng',140),
  (777,'7jzbs6wj-5A',86),
  (783,'TpMaYggnRh8',122),
  (889,'uNXIv82HZ90',140),
  (894,'M48CJXhOAQI',217),
  (897,'2GAas1H6dzs',191),
  (901,'jpr5cAPWloU',99),
  (904,'EL1M_z6hljg',127),
  (1019,'lsKbD5xWgAw',106),
  (1024,'8q7lVouVH_I',118),
  (1026,'pTQnDV2QgM8',110),
  (1027,'ZUYZV8fR-NA',152),
  (1032,'Z7AEVQHKfa0',106),
  (1153,'i1DvT_dIemU',102),
  (1157,'e6DUqNdLkuU',204),
  (1158,'TFcM79asHkk',112),
  (1165,'46XVQMPFf_c',143),
  (1166,'rWcb2kUNmL8',122),
  (1280,'FV-SS9JNN2k',182),
  (1282,'r7Z63u74TZs',130),
  (1284,'FJEXAv-jQ4s',162),
  (1285,'mGrz0-dBD7I',168),
  (1286,'t8_eAzl1QSo',149)
) v(no, yt, sec)
join problems p on p.book = '쎈' and p.grade = '중2' and p.semester = 1 and p.local_no = v.no::text and p.step = 'C'
join standard_types s on s.code = p.type_code;

-- 중2-2 26편
insert into lesson_videos (grade, kind, concept_no, order_label, title, chapter, sub_chapter, book, youtube_id, duration_seconds, type_codes)
select '쎈C 중2-2', '대표예제', v.no, '쎈C풀이' || repeat(' ', 4 - length(v.no::text)) || v.no || '번', s.type_title, s.chapter_title, p.sub_chapter_title, '쎈 중2-2 C단계', v.yt, v.sec, array[p.type_code]
from (values
  (80,'jlOfy5YPqo8',162),
  (82,'hqUZSYRv6-c',119),
  (94,'c7RvUXpEWwY',145),
  (96,'qVe3PvT-HOY',134),
  (98,'H1qko-A0N-8',169),
  (100,'HGDlhGo9doA',173),
  (197,'0sUP697Ppos',187),
  (205,'v7arfEcx-6w',148),
  (206,'MNjtx_FSoxo',234),
  (208,'NQWkF-1xQmk',68),
  (210,'jW1Aak6rNyE',111),
  (212,'Hd3-M7O1iT0',129),
  (299,'B8vtAgo_RN8',175),
  (305,'lj8WIcHwfQg',205),
  (311,'6JktPj_l9c0',186),
  (429,'H8dL29qQjZ4',146),
  (432,'LBh29iigPFQ',181),
  (438,'3b0qBynlaqE',153),
  (440,'KKdqSGY9Bqk',187),
  (443,'N1YgpckCX4k',135),
  (448,'RU4krEiP8So',98),
  (529,'G-6zBglX0uI',187),
  (535,'XZ_geaJGHaY',246),
  (540,'Hfan2Qme-KY',205),
  (541,'x7illalVaIw',196),
  (543,'KmjKTKnxBio',231)
) v(no, yt, sec)
join problems p on p.book = '쎈' and p.grade = '중2' and p.semester = 2 and p.local_no = v.no::text and p.step = 'C'
join standard_types s on s.code = p.type_code;
