-- 매쓰홀릭_동명이인.sql 을 되돌린다. 더한 두 줄(이지훈 · 박시연2)만 뺀다.
-- 먼저 있던 규칙(이수연·유연우2·이지훈h)은 그대로 둔다.

update public.app_settings
set value = value - '이지훈' - '박시연2',
    updated_at = now()
where key = 'matholic_name_rules';

select value from public.app_settings where key = 'matholic_name_rules';
