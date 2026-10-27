-- 학교 자료집 수행평가(stats.assessment) 되돌리기 — 2026-10-27 넣은 12곳.
-- 수행평가 칸만 뺀다(학생수·편제 등 다른 칸은 그대로).
update public.school_profiles set stats = stats - 'assessment'
where school_name in ('신원중','지축중','원흥중','고양중','고양제일중','목암중','도래울중','신원고','고양일고','고양동산고','백양고','봉일천고');
-- 봉일천고는 이때 새로 만든 한 장이다. 한 장째 지우려면(편제를 아직 안 채웠을 때만):
-- delete from public.school_profiles where school_name = '봉일천고' and math_curriculum = '[]'::jsonb;
