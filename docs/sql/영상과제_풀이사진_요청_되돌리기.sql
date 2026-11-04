-- 영상과제_풀이사진_요청.sql 되돌리기 (2026-11-04)
--
-- ★ 표를 지우면 **선생님이 켜 둔 「풀이 사진 받기」가 모두 사라진다.**
--   학생이 이미 낸 사진과 기록(proof_submissions · proof-photos)은 **그대로 남는다** —
--   그건 다른 표다. 다만 그 영상의 제출 칸이 학생 화면에서 사라져 「안 냈다」로 보이지 않고
--   칩 자체가 안 뜬다.
-- ★ 되돌리기 전에 몇 줄이 켜져 있는지 먼저 세어 보기:
--     select count(*) from public.video_photo_requests;

begin;

drop policy if exists own_read  on public.video_photo_requests;
drop policy if exists staff_all on public.video_photo_requests;
drop table if exists public.video_photo_requests;

commit;
