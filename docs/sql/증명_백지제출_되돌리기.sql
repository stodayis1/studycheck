-- 증명_백지제출.sql 되돌리기
-- 주의: 학생이 낸 증명 사진과 선생님 확인 기록이 모두 지워진다. 꼭 필요할 때만.
begin;

drop table if exists public.proof_submissions;
drop policy if exists proof_photos_staff_read on storage.objects;
drop policy if exists proof_photos_parent_read on storage.objects;

-- 보관함 안 사진부터 지워야 보관함을 지울 수 있다
delete from storage.objects where bucket_id = 'proof-photos';
delete from storage.buckets where id = 'proof-photos';

commit;
