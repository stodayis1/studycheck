-- 쌍둥이 문항 파이프라인 — 파일럿 준비 수치 조회 (읽기 전용)
-- 작성 2026-09-27 · GPT-EXEC-012 작업 B · D-102 · D-103 · D-104
--
-- 무엇: `쌍둥이_설치전_점검.sql` 이 `raise notice` 로만 알려주던 숫자들을
--       **결과표로** 돌려줍니다. 현재 Supabase SQL Editor 가 notice 를 표시하지 않아
--       011 실행에서 개별 숫자를 하나도 받지 못했기 때문입니다.
--
-- 이 파일은 **아무것도 바꾸지 않습니다.** SELECT 하나뿐입니다.
-- 테이블·함수·행을 만들거나 고치지 않고, 임시 테이블도 만들지 않습니다.
--
-- 실행: Supabase → StudyCheck 프로젝트 → SQL Editor → 전체 붙여넣고 Run
--       결과가 **표로** 나옵니다. 그 표를 그대로 주시면 됩니다.
--
-- ⚠ 이것은 판정 파일이 아닙니다 (D-103).
--   설치를 막는 판정은 `쌍둥이_설치전_점검.sql` 이 합니다. 그 파일은 건드리지 않았습니다.
--   이 파일은 **숫자를 보여주기만** 합니다. 여기서 숫자가 나빠도 자동으로 멈추는 것은 없습니다.
--
-- ⚠ 출력하지 않는 것 (D-104)
--   정답 · 학생·학부모·직원 정보 · 이미지 경로 · Storage 객체명 · 객체 id ·
--   ETag 값 · Storage metadata 원문 · 이미지 데이터 · 서명 URL.
--   ETag 는 **있는지 없는지만** 셉니다. 값은 어디에도 나오지 않습니다.
--
--   `image_path` 는 Storage 객체와 이름을 맞추는 데 반드시 필요하므로 아래 `base` 안에서만
--   쓰입니다. 결과표의 어떤 열에도 실리지 않습니다 — 회귀 테스트가 이것을 확인합니다.
--
-- ─────────────────────────────────────────────────────────────────────
-- 읽는 법
--
--   section = SUMMARY      → 전체 수치 14줄
--   section = PILOT_TYPE   → 사용 가능한 파일럿 유형 목록 (한 유형당 한 줄)
--
--   가장 중요한 줄은 `[판정]` 입니다.
--     status = READY      → 사용 가능 파일럿 유형이 10개 이상 (D-073 파일럿 가능)
--     status = NOT_READY  → 10개 미만. 파일럿 규모를 줄이거나 데이터를 보정해야 합니다
--
--   `[20]`·`[21]`·`[22]` 는 **경고**입니다 (D-089). 0이 아니어도 설치를 막지 않습니다.
--   고장 난 원문은 파이프라인이 원문별로 안전하게 건너뜁니다.
-- ─────────────────────────────────────────────────────────────────────
--
-- 집계 조건은 `쌍둥이_설치전_점검.sql` 의 `[12]`~`[24]` 와 **같습니다** (GPT-EXEC-012 §134).
--   기본조건  : twin_id 없음 · 정답 있음 · number|choice · type_code 있음
--   엄격조건  : 기본조건 + is_essay = false (**null 제외**, D-082) + image_path 있음 (D-088)
--   사용 가능 : 엄격조건 + Storage 객체 존재 + updated_at 존재 + ETag 존재 (D-083)

with

-- ── 기본조건 (D-088 적용 전) ──────────────────────────────────────────
-- `[13]`·`[14]` 가 "여기서 무엇이 빠지는가" 를 세므로 is_essay·image_path 를 아직 걸지 않는다.
base as (
  select p.id,
         p.type_code,
         p.answer_kind,
         p.is_essay,
         p.image_path          -- Storage 이름 맞추기에만 쓴다. 결과표에는 나가지 않는다
    from public.problems p
   where p.twin_id is null
     and p.answer_text is not null and btrim(p.answer_text) <> ''
     and p.answer_kind in ('number','choice')
     and p.type_code is not null and btrim(p.type_code) <> ''
),

-- ── 엄격조건 원문 + Storage 상태 ──────────────────────────────────────
-- **한 원문당 정확히 한 행**이 되도록 group by 로 접는다.
-- 그래서 조인이 문항 수를 부풀릴 수 없고, 아래 모든 집계가 `count(distinct p.id)` 와 같은 뜻이다.
-- 각 bool_or 은 점검 SQL 의 `count(distinct p.id) filter (...)` 와 같은 조건이다.
strict_storage as (
  select b.id,
         b.type_code,
         b.answer_kind,
         -- 객체가 하나도 안 붙었는가 (left join 결과가 전부 null)
         not bool_or(o.id is not null)                                as no_object,
         -- 객체는 있는데 updated_at 이 빈 것이 있는가 (D-083: 대체 불가)
         bool_or(o.id is not null and o.updated_at is null)            as missing_updated,
         -- 객체는 있는데 ETag 후보 두 키가 모두 빈 것이 있는가
         bool_or(o.id is not null
                 and btrim(coalesce(o.metadata->>'eTag',
                                    o.metadata->>'etag', '')) = '')   as missing_etag,
         -- 세 조건을 모두 만족하는 객체가 하나라도 있는가 → 사용 가능
         bool_or(o.id is not null
                 and o.updated_at is not null
                 and btrim(coalesce(o.metadata->>'eTag',
                                    o.metadata->>'etag', '')) <> '')  as usable
    from base b
    left join storage.objects o
      on o.bucket_id = 'problem-images'
     and o.name = b.image_path
   where b.is_essay = false
     and b.image_path is not null and btrim(b.image_path) <> ''
   group by b.id, b.type_code, b.answer_kind
),

-- ── 유형별 기존 쌍둥이 유무 ───────────────────────────────────────────
-- 그 유형의 **모든** 원문을 본다. 하나라도 twin_id 가 있으면 파일럿 대상이 아니다 (D-072).
-- 점검 SQL 은 standard_types 를 조인한 쿼리 안에서 이 수를 셌지만, `[7-2]` 로 code 유일성이
-- 확인됐으므로 결과가 같다. 여기서는 조인 없이 세어 code 가 중복돼도 부풀지 않게 한다.
type_twin as (
  select p.type_code, count(p.twin_id) as twin_cnt
    from public.problems p
   where p.type_code is not null and btrim(p.type_code) <> ''
   group by p.type_code
),

-- ── 유형별 사용 가능 원문 수 ──────────────────────────────────────────
-- strict_storage 가 원문당 한 행이므로 count 가 곧 서로 다른 원문 수다.
-- answer_kind 는 base 에서 number|choice 로 제한돼 있어
-- usable_source_count = usable_number_count + usable_choice_count 가 구조적으로 성립한다.
type_usable as (
  select ss.type_code,
         count(*) filter (where ss.usable)                              as usable_cnt,
         count(*) filter (where ss.usable and ss.answer_kind = 'number') as usable_number,
         count(*) filter (where ss.usable and ss.answer_kind = 'choice') as usable_choice
    from strict_storage ss
   group by ss.type_code
),

-- ── 사용 가능 파일럿 유형 ─────────────────────────────────────────────
-- standard_types 와 inner join 한다 — 실제 유형 목록 RPC 와 같은 집합이어야 한다 (D-093).
pilot_types as (
  select tu.type_code,
         st.grade,
         st.chapter_title,
         st.type_title,
         tu.usable_cnt,
         tu.usable_number,
         tu.usable_choice
    from type_usable tu
    join public.standard_types st on st.code = tu.type_code
    join type_twin tt            on tt.type_code = tu.type_code
   where tt.twin_cnt = 0
     and tu.usable_cnt >= 5
),

-- ── 수치 한 줄로 모으기 ───────────────────────────────────────────────
metrics as (
  select
    (select count(*) from public.problems where is_essay is null)              as m12,
    (select count(*) from base where is_essay is null)                        as m13,
    (select count(*) from base
      where is_essay = false
        and (image_path is null or btrim(image_path) = ''))                   as m14,
    (select count(*) from base
      where is_essay = false
        and image_path is not null and btrim(image_path) <> '')               as m15,
    (select count(*) from type_twin where twin_cnt = 0)                       as m16,
    (select count(*) from storage.objects where bucket_id = 'problem-images')  as m18,
    (select count(*) from strict_storage)                                      as m19,
    (select count(*) from strict_storage where no_object)                      as m20,
    (select count(*) from strict_storage where missing_updated)                 as m21,
    (select count(*) from strict_storage where missing_etag)                    as m22,
    (select count(*) from strict_storage where usable)                         as m23,
    (select count(*) from pilot_types)                                         as m24,
    (select count(distinct p.id)
       from public.problems p
       left join storage.objects o
         on o.bucket_id = 'problem-images' and o.name = p.image_path
      where p.image_path is not null and btrim(p.image_path) <> ''
        and o.id is null)                                                     as m_orphan
),

summary as (
  select 1::int as section_order, 1::int as row_order, 'SUMMARY' as section,
         '[12]' as check_no, 'is_essay is null (전체)' as label,
         m12 as metric_value, 'INFO' as status,
         '참고. 전체 문제은행 기준' as note from metrics
  union all
  select 1, 2, 'SUMMARY', '[13]', '기본조건 중 is_essay null (D-082 제외)',
         m13, 'INFO', '미확인 값이라 대상에서 뺀 수' from metrics
  union all
  select 1, 3, 'SUMMARY', '[14]', '기본조건 중 이미지 없음 (D-088 제외)',
         m14, 'INFO', '이미지가 없으면 모델이 원문을 못 본다' from metrics
  union all
  select 1, 4, 'SUMMARY', '[15]', '엄격조건 원문 (Storage 확인 전)',
         m15, 'INFO', '기본조건 + is_essay=false + 이미지 있음' from metrics
  union all
  select 1, 5, 'SUMMARY', '[16]', '쌍둥이가 전혀 없는 유형 (원시)',
         m16, 'INFO', 'standard_types 미연결. [24] 와 뜻이 다르다' from metrics
  union all
  select 1, 6, 'SUMMARY', '[18]', 'problem-images 버킷 객체 수',
         m18, 'INFO', '참고' from metrics
  union all
  select 1, 7, 'SUMMARY', '[19]', '엄격조건 원문 재확인',
         m19, case when m19 = m15 then 'OK' else 'MISMATCH' end,
         '[15] 와 같아야 한다' from metrics
  union all
  select 1, 8, 'SUMMARY', '[20]', 'Storage 객체 없음 (경고·제외)',
         m20, case when m20 = 0 then 'OK' else 'WARN' end,
         '경고. 설치를 막지 않는다 (D-089)' from metrics
  union all
  select 1, 9, 'SUMMARY', '[21]', 'updated_at 없음 (경고·제외)',
         m21, case when m21 = 0 then 'OK' else 'WARN' end,
         '경고. D-083 으로 그 원문만 제외된다' from metrics
  union all
  select 1, 10, 'SUMMARY', '[22]', 'ETag 없음 (경고·제외)',
         m22, case when m22 = 0 then 'OK' else 'WARN' end,
         '경고. 값은 출력하지 않고 존재만 센다 (D-104)' from metrics
  union all
  select 1, 11, 'SUMMARY', '[23]', '사용 가능 원문',
         m23, case when m23 > 0 then 'OK' else 'NONE' end,
         '엄격조건 + Storage 객체·updated_at·ETag 모두 정상' from metrics
  union all
  select 1, 12, 'SUMMARY', '[24]', '사용 가능 파일럿 유형 (원문 5개 이상)',
         m24, case when m24 > 0 then 'OK' else 'NONE' end,
         'standard_types 연결 + 기존 쌍둥이 0 (D-093)' from metrics
  union all
  select 1, 13, 'SUMMARY', '[참고]', '전체 문항의 고아 이미지 참조',
         m_orphan, 'INFO', '판정 아님. 과거 데이터 포함' from metrics
  union all
  select 1, 14, 'SUMMARY', '[판정]', '10유형 파일럿 준비 여부',
         m24, case when m24 >= 10 then 'READY' else 'NOT_READY' end,
         'D-073 은 10유형 x 원문 5개 x 후보 2개' from metrics
)

-- ── 최종 결과표 (하나의 결과 집합) ────────────────────────────────────
select
  s.section_order,
  s.row_order::bigint as row_order,
  s.section,
  s.check_no,
  s.label,
  s.metric_value,
  s.status,
  s.note,
  null::text   as type_code,
  null::text   as grade,
  null::text   as chapter_title,
  null::text   as type_title,
  null::bigint as usable_source_count,
  null::bigint as usable_number_count,
  null::bigint as usable_choice_count
from summary s

union all

select
  2::int as section_order,
  row_number() over (order by pt.usable_cnt desc, pt.type_code asc) as row_order,
  'PILOT_TYPE'                       as section,
  '[24]'                             as check_no,
  '사용 가능 파일럿 유형'            as label,
  pt.usable_cnt                      as metric_value,
  'ELIGIBLE'                         as status,
  '원문 5개 이상 · 기존 쌍둥이 없음' as note,
  pt.type_code,
  pt.grade,
  pt.chapter_title,
  pt.type_title,
  pt.usable_cnt                      as usable_source_count,
  pt.usable_number                   as usable_number_count,
  pt.usable_choice                   as usable_choice_count
from pilot_types pt

order by section_order, row_order, type_code;
