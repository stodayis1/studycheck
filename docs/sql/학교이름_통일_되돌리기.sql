-- 되돌리기 — 학교 이름 통일 (스터디체크 DB, 2026-10-08)
--
-- 바꾸기 **전**에 떠 둔 값이다. id 로 짚어 되돌리므로 그 뒤에 새로 들어온 학생은 건드리지 않는다.
-- (코드도 함께 되돌려야 한다 — 안 그러면 다음 저장에서 다시 통일된다. lib/school.ts)

begin;

update public.students st set school = v.before
  from (values
  ('43ae14d0-5392-40d8-8152-0ac26f9ad67f'::uuid, '고양동산고등학교'),
  ('d5448679-46a6-4e70-bc42-07d1787d4867'::uuid, '고양오금초등학교'),
  ('1aac3aeb-4080-4cae-97cc-fe4b8bd26de0'::uuid, '고양초등학교'),
  ('9fdb2de3-d722-48ca-b285-aaa626c727a2'::uuid, '도래울초등학교'),
  ('3bf7753d-b14e-4358-9105-20c11a53fa05'::uuid, '백양고등학교'),
  ('1fc98bc5-0992-428f-a55e-83d241be77a9'::uuid, '신원초6'),
  ('02d1e83d-9e6c-445d-8462-e99c1ae4ebeb'::uuid, '신원중학교'),
  ('ae8ca267-a631-4b06-8a92-b2168d0d2461'::uuid, '신원중학교'),
  ('4f791f41-b45f-4b97-a933-62fca282d462'::uuid, '신원초등학교'),
  ('649890ec-5e94-4ef3-b23f-5f626c88c3f4'::uuid, '신원초등학교'),
  ('6a575070-4ebb-444e-949c-daabd4cc487a'::uuid, '신원초등학교'),
  ('795c8665-edd3-4dd0-b88d-23e86ef034e7'::uuid, '신원초등학교'),
  ('930a418d-57e4-4588-82e5-d9b98ba35fa9'::uuid, '신원초등학교'),
  ('94f61081-7d96-4355-bd78-ffdfb6404d49'::uuid, '신원초등학교'),
  ('ecc64791-8d51-4e0a-b9c2-405f1011d510'::uuid, '신원초등학교'),
  ('fd8270aa-2e1e-464b-9d6d-1875a87ca133'::uuid, '신원초등학교'),
  ('73cc3dd7-8233-48ef-929e-e3d3af7896e2'::uuid, '오금초'),
  ('d78bcbfb-f9a3-4709-9c53-bc4807df489c'::uuid, '오금초'),
  ('fa6a317a-ffa6-411b-834a-98573f545945'::uuid, '오금초'),
  ('54042989-bfab-48c8-83c0-a2f8e6f46163'::uuid, '오금초 5'),
  ('86a5053e-c709-426a-9bac-6f29a6dbdc34'::uuid, '진관초등학교')
) as v(id, before)
 where v.id = st.id;

update public.exam_papers set school_name = '고양중학교'
 where id = '17dc36b1-1528-4f9e-823a-d940fcb5e9e6';

select school, count(*) as 학생수 from public.students where is_active group by 1 order by 2 desc, 1;

commit;
