-- 매쓰홀릭_동명이인_이지훈.sql 을 되돌린다. 「이지훈」 규칙 한 줄만 뺀다.
-- 다른 규칙(이수연·유연우2·이지훈h)은 그대로 둔다.

update public.app_settings
set value = value - '이지훈',
    updated_at = now()
where key = 'matholic_name_rules';

select value from public.app_settings where key = 'matholic_name_rules';
