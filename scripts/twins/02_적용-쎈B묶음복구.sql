-- 쎈↔쎈B 묶음 되살리기 (2026-10-24)
--
-- 무슨 일이 있었나
--   clean.mjs 가 「혼자 남은 묶음」을 비울 때 problems 를 order 없이 range 로 넘겨 읽었다.
--   쪽마다 차례가 달라 **짝의 한쪽을 못 읽은 탓에 멀쩡한 쌍이 「혼자」로 보였고**,
--   중2·중3 쎈↔쎈B 601문항의 twin_group 이 비워졌다.
--   (clean.mjs·stat.mjs 에 order('id') 를 넣어 같은 일이 다시 안 생기게 했다.)
--
-- 왜 되살릴 수 있나
--   짝은 twin_id 칸에 그대로 있다. 묶음 번호는 처음부터 least(id, twin_id) 로 만들었다
--   (scripts/twins/01_적용.sql). 비어 있는 칸만 그 규칙으로 다시 채운다.
--   공통수학2처럼 **이미 다른 묶음에 들어간 문항은 건드리지 않는다**(twin_group is null 조건).

update public.problems
   set twin_group = least(id, twin_id)
 where twin_id is not null
   and twin_group is null;
