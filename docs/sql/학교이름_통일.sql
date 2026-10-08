-- 학교 이름 통일 — 스터디체크 DB (2026-10-08)
--
-- 왜: 「신원중」과 「신원중학교」가 섞여 같은 학교가 두 줄로 갈렸다.
--     시험대비 화면은 students.school = exam_schedule.school_name 으로 대상 학생을 찾으므로
--     「신원중학교」로 저장된 학생은 「신원중」 시험일정에 **영원히 안 걸린다.**
--
-- 규칙: lib/school.ts 의 normalizeSchool() 과 똑같다.
--     초등학교→초 · 중학교→중 · 고등학교→고 · 여자중학교→여중 · 여자고등학교→여고
--     뒤에 붙은 학년 숫자 떼기(신원초6→신원초) · 오금초→고양오금초(공식 명칭 고양오금초등학교)
--     앞으로 입력하는 값은 코드가 저장 직전에 같은 규칙으로 다듬는다.
--
-- 바뀔 건수(2026-10-08 확인): students 21건, exam_papers 1건
-- 되돌리기: docs/sql/학교이름_통일_되돌리기.sql  (바꾸기 전 값을 id 째로 떠 뒀다)

begin;

-- ① 학년이 뒤에 붙어 들어온 2건 — 둘 다 퇴원생이다. 일반 규칙으로는 「오금초5」가 되므로 먼저 손본다.
update public.students set school = '신원초' where id = '1fc98bc5-0992-428f-a55e-83d241be77a9';  -- 윤도연 「신원초6」
update public.students set school = '오금초' where id = '54042989-bfab-48c8-83c0-a2f8e6f46163';  -- 김재훈 「오금초 5」

-- ② 일반 규칙 (여러 번 돌려도 결과가 같다)
with n as (
  select id, school, case when t = '오금초' then '고양오금초' else t end as want
  from (
    select id, school,
      regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        replace(trim(school), ' ', ''),
        '여자중학교$', '여중'), '여자고등학교$', '여고'),
        '초등학교$', '초'), '중학교$', '중'), '고등학교$', '고') as t
    from public.students
  ) s
)
update public.students st set school = n.want
  from n where n.id = st.id and n.want <> st.school;

-- ③ 시험지 분석에 하나 남아 있던 「고양중학교」 (문항·파일 0건이라 안전하다)
update public.exam_papers set school_name = '고양중'
 where id = '17dc36b1-1528-4f9e-823a-d940fcb5e9e6' and school_name = '고양중학교';

-- 확인 — 아래 두 줄 모두 0행이어야 한다
select '아직 긴 이름인 학생' as 확인, id, name, school from public.students
 where school ~ '(초등학교|중학교|고등학교)$' or school = '오금초' or school ~ '[[:space:]0-9]';
select '아직 긴 이름인 시험지' as 확인, id, school_name from public.exam_papers
 where school_name ~ '(초등학교|중학교|고등학교)$';

-- 통일된 학교 목록
select school, count(*) as 학생수 from public.students where is_active group by 1 order by 2 desc, 1;

commit;
