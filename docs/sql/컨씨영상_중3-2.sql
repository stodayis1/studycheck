-- 컨씨영상(쎈 C단계 선별 문항 풀이, 수지쌤 채널) 중3-2 39편을 학습일지 「강의영상 고르기」에 넣는다 (2026-11-03)
-- · grade 「쎈C 중3-2」 = 고르기 창의 과정 목록에 따로 뜬다. kind 「대표예제」 = 학생 화면에서 (문제풀이) 영상으로 튼다
-- · 문항 번호 → 문제은행 22개정 쎈 중3-2 의 같은 번호 → 유형 코드·단원 (그림 대조는 2026-10-29 에 함)
-- · 유튜브에 없는 선별 문항 10개(139, 651·652·653·657·658, 743·747·749·750)는 아직 넣지 않는다
-- 되돌리기: 컨씨영상_중3-2_되돌리기.sql
insert into lesson_videos (grade, kind, concept_no, order_label, title, chapter, sub_chapter, book, youtube_id, type_codes)
select '쎈C 중3-2', '대표예제', v.no, '쎈C풀이' || v.no || '번', s.type_title, s.chapter_title, p.sub_chapter_title, '쎈 중3-2 C단계', v.yt, array[p.type_code]
from (values
  (126,'neuWqW4snBk'),(127,'LMJ2rhtZgNw'),(129,'8bUEBn40RwU'),(130,'fvTfAvx7AcA'),(133,'Ib9MZuI94S0'),(138,'TlGgfxPpvww'),(141,'-PhV0rLZ2cw'),(144,'o1GOPM1JM-U'),
  (243,'p-TxSvbfzbk'),(246,'XYPRetrmKgw'),(247,'reMSk9XQ3Z0'),(248,'0g6IB6Fbedo'),(249,'hb021T8KR8E'),(252,'yKNqtOJyevc'),(253,'XMw9Rj7tLhk'),(255,'UZM7cVGwOgI'),(258,'rxP8BdQc_i4'),
  (373,'fW4HCUzEe2U'),(375,'MUty-vszN94'),(378,'qo6s4e49y3c'),(381,'7VKahfan50o'),(384,'k4-s8YVErCs'),(396,'S4e9N-Xkfm8'),
  (475,'THRgSyttvQo'),(477,'QgEZdEw5OXo'),(478,'rJTwHg2AbMU'),(481,'5zcaDkArn8A'),(482,'dHTU8YK3YUY'),(484,'d6KFm27BkaM'),(485,'RLJHp2kRRQA'),(486,'-i_NblbsgJE'),
  (577,'TmAfD6Jojfs'),(578,'ZTx5NdnuSBs'),(582,'D8NfcKnOwm0'),(583,'Nn5W5YAtCBM'),(584,'O3iRgr0iAaY'),(585,'vxaZiWXBjJk'),(586,'8kYYrzF62cA'),(592,'A9rHhQ_YofU')
) v(no, yt)
join problems p on p.book = '쎈' and p.grade = '중3' and p.semester = 2 and p.local_no = v.no::text
join standard_types s on s.code = p.type_code;
