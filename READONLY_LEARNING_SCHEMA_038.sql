-- ════════════════════════════════════════════════════════════════════
-- READONLY_LEARNING_SCHEMA_038.sql — **구조정보만** 읽는 조회문 (초안)
--
--   지시   GPT_EXEC_038.md §4
--   상태   **아직 실행하지 않았습니다.** GPT 검수 뒤에 원장님이 1회 돌릴지 정합니다.
--   성격   읽기 전용 **한 문장**. 카탈로그(pg_catalog)만 봅니다.
-- ════════════════════════════════════════════════════════════════════
--
-- 이 문장이 **하는 일**
--   아래 대상 목록에 적힌 관계가 있는지, 있으면 그 열·제약·인덱스·RLS 의
--   **메타데이터**를 돌려줍니다. 결과는 jsonb 한 덩어리라 CSV 로 옮기기 쉽습니다.
--
-- 이 문장이 **하지 않는 일** (§4 의 명확한 제외)
--   · 업무 테이블의 **데이터 행을 한 줄도 읽지 않습니다.** `count(*)` 도 세지 않습니다.
--   · 정답·질문 전문·영상 URL·이미지·학생 값을 읽지 않습니다.
--   · 키·토큰·`auth.users` 를 읽지 않습니다.
--   · 함수 본문 · 열 default 표현식 · 열/테이블 주석 · 트리거 본문 ·
--     **정책 본문(`polqual`/`polwithcheck`)** · 역할 멤버(`polroles`) 를 읽지 않습니다.
--   · `pg_get_constraintdef`·`pg_get_indexdef`·`pg_get_expr` 같은 **원문 덤프 함수를
--     쓰지 않습니다.** (표현식 인덱스는 이름 없이 `<expression>` 으로만 표시)
--   · CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/GRANT/REVOKE/SET ROLE 이 없습니다.
--   · 임시 데이터를 넣고 rollback 하는 방식을 쓰지 않습니다.
--   · 목록 밖의 schema 를 뒤지지 않습니다. 실패하면 권한을 풀지 않습니다.
--
-- 읽는 카탈로그
--   pg_namespace · pg_class · pg_attribute · pg_constraint · pg_index · pg_policy
--   그리고 `format_type()` (열의 정확한 DB 타입 이름을 얻는 표준 함수)
--
-- 대상 목록 — **고정**입니다. 동적으로 넓히지 않습니다.
--   질문앱 테이블은 **인계 자료로 실제 이름이 확인된 뒤에만** 아래에 추가합니다.
--   지금은 추측 이름을 넣지 않았습니다. 없는 이름은 결과에서 `"exists": false` 로 나옵니다.
-- ════════════════════════════════════════════════════════════════════

with targets(schema_name, table_name) as (
  values
    -- 학생·사용자
    ('public', 'students'),
    ('public', 'users'),
    -- 콘텐츠
    ('public', 'problems'),
    ('public', 'standard_types'),
    ('public', 'concepts'),
    ('public', 'type_learning_assets'),
    -- 학습 기록
    ('public', 'gradings'),
    ('public', 'grading_answers'),
    ('public', 'student_worksheets'),
    ('public', 'progress_checks'),
    ('public', 'learning_notes'),
    ('public', 'video_watch_logs'),
    ('public', 'concept_video_progress'),
    -- AI 쌍둥이 (014 설치분)
    ('ai_question_private', 'ai_practice_problems'),
    ('ai_question_private', 'twin_candidates')
),

-- 관계를 찾는다. 없으면 oid 가 null 이고 결과에 exists=false 로 나간다
rel as (
  select
    t.schema_name,
    t.table_name,
    c.oid                      as rel_oid,
    c.relkind                  as rel_kind,
    c.relrowsecurity           as rls_enabled,
    c.relforcerowsecurity      as rls_forced
  from targets t
  left join pg_catalog.pg_namespace n
         on n.nspname = t.schema_name
  left join pg_catalog.pg_class c
         on c.relnamespace = n.oid
        and c.relname = t.table_name
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
),

-- 열: 이름 · 정확한 타입 · nullable · identity/generated 여부
cols as (
  select
    r.rel_oid,
    jsonb_agg(
      jsonb_build_object(
        'ordinal',   a.attnum,
        'column',    a.attname,
        'type',      pg_catalog.format_type(a.atttypid, a.atttypmod),
        'nullable',  not a.attnotnull,
        'identity',  nullif(a.attidentity, ''),
        'generated', nullif(a.attgenerated, '')
      )
      order by a.attnum
    ) as columns
  from rel r
  join pg_catalog.pg_attribute a
    on a.attrelid = r.rel_oid
  where r.rel_oid is not null
    and a.attnum > 0
    and not a.attisdropped
  group by r.rel_oid
),

-- 제약: PK · UNIQUE · FK 만. CHECK 는 본문이 딸려오므로 **가져오지 않는다**
cons_raw as (
  select
    r.rel_oid,
    co.oid        as con_oid,
    co.conname    as con_name,
    co.contype    as con_type,
    co.conkey     as con_key,
    co.confrelid  as ref_oid,
    co.confkey    as ref_key,
    co.confupdtype as on_update,
    co.confdeltype as on_delete
  from rel r
  join pg_catalog.pg_constraint co
    on co.conrelid = r.rel_oid
  where r.rel_oid is not null
    and co.contype in ('p', 'u', 'f')
),
cons as (
  select
    cr.rel_oid,
    jsonb_agg(
      jsonb_build_object(
        'name', cr.con_name,
        'kind', case cr.con_type
                  when 'p' then 'primary_key'
                  when 'u' then 'unique'
                  when 'f' then 'foreign_key'
                end,
        'columns', (
          select coalesce(jsonb_agg(a.attname order by k.ord), '[]'::jsonb)
          from unnest(cr.con_key) with ordinality as k(attnum, ord)
          join pg_catalog.pg_attribute a
            on a.attrelid = cr.rel_oid and a.attnum = k.attnum
        ),
        'references', case when cr.con_type = 'f' then
          jsonb_build_object(
            'schema', rn.nspname,
            'table',  rc.relname,
            'columns', (
              select coalesce(jsonb_agg(ra.attname order by rk.ord), '[]'::jsonb)
              from unnest(cr.ref_key) with ordinality as rk(attnum, ord)
              join pg_catalog.pg_attribute ra
                on ra.attrelid = cr.ref_oid and ra.attnum = rk.attnum
            ),
            'on_update', cr.on_update,
            'on_delete', cr.on_delete
          )
        end
      )
      order by cr.con_type, cr.con_name
    ) as constraints
  from cons_raw cr
  left join pg_catalog.pg_class rc on rc.oid = cr.ref_oid
  left join pg_catalog.pg_namespace rn on rn.oid = rc.relnamespace
  group by cr.rel_oid
),

-- 인덱스: 키 열과 unique 여부만. **표현식 원문은 가져오지 않는다**
idx as (
  select
    r.rel_oid,
    jsonb_agg(
      jsonb_build_object(
        'name',   ic.relname,
        'unique', i.indisunique,
        'primary', i.indisprimary,
        'partial', i.indpred is not null,   -- 조건이 있는지만. 조건 본문은 안 가져온다
        'key_columns', (
          select coalesce(jsonb_agg(
                   case when k.attnum = 0 then '<expression>'
                        else (select a.attname
                                from pg_catalog.pg_attribute a
                               where a.attrelid = r.rel_oid and a.attnum = k.attnum)
                   end
                   order by k.ord), '[]'::jsonb)
          from unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
          where k.ord <= i.indnkeyatts
        )
      )
      order by ic.relname
    ) as indexes
  from rel r
  join pg_catalog.pg_index i on i.indrelid = r.rel_oid
  join pg_catalog.pg_class ic on ic.oid = i.indexrelid
  where r.rel_oid is not null
  group by r.rel_oid
),

-- RLS 정책: **이름과 명령 종류와 개수만.** 본문(polqual·polwithcheck)·역할은 안 읽는다
pol as (
  select
    r.rel_oid,
    count(*) as policy_count,
    jsonb_agg(
      jsonb_build_object(
        'name', p.polname,
        'command', case p.polcmd
                     when 'r' then 'SELECT'
                     when 'a' then 'INSERT'
                     when 'w' then 'UPDATE'
                     when 'd' then 'DELETE'
                     when '*' then 'ALL'
                   end,
        'permissive', p.polpermissive
      )
      order by p.polname
    ) as policies
  from rel r
  join pg_catalog.pg_policy p on p.polrelid = r.rel_oid
  where r.rel_oid is not null
  group by r.rel_oid
),

-- 대상 두 테이블을 **실제로 참조하는** FK 관계 — 중간 연결 후보 찾기용 메타데이터만
inbound as (
  select
    jsonb_agg(
      jsonb_build_object(
        'from_schema', fn.nspname,
        'from_table',  fc.relname,
        'constraint',  co.conname,
        'to_schema',   tn.nspname,
        'to_table',    tc.relname
      )
      order by fn.nspname, fc.relname, co.conname
    ) as inbound_fks
  from pg_catalog.pg_constraint co
  join pg_catalog.pg_class  tc on tc.oid = co.confrelid
  join pg_catalog.pg_namespace tn on tn.oid = tc.relnamespace
  join pg_catalog.pg_class  fc on fc.oid = co.conrelid
  join pg_catalog.pg_namespace fn on fn.oid = fc.relnamespace
  where co.contype = 'f'
    and (tn.nspname, tc.relname) in (select schema_name, table_name from targets)
)

select jsonb_pretty(jsonb_build_object(
  'snapshot_kind', 'structure_metadata_only',
  'server_version', current_setting('server_version'),
  'collected_at', now(),
  'note', 'No business data rows, no counts, no policy bodies, no defaults, no comments.',
  'relations', (
    select jsonb_agg(
      jsonb_build_object(
        'schema', r.schema_name,
        'table',  r.table_name,
        'exists', r.rel_oid is not null,
        'kind',   case r.rel_kind
                    when 'r' then 'table'
                    when 'p' then 'partitioned_table'
                    when 'v' then 'view'
                    when 'm' then 'materialized_view'
                    when 'f' then 'foreign_table'
                    else null
                  end,
        'rls', case when r.rel_oid is null then null else
                 jsonb_build_object(
                   'enabled', r.rls_enabled,
                   'forced',  r.rls_forced,
                   'policy_count', coalesce(p.policy_count, 0),
                   'policies', coalesce(p.policies, '[]'::jsonb)
                 ) end,
        'columns',     coalesce(c.columns, '[]'::jsonb),
        'constraints', coalesce(k.constraints, '[]'::jsonb),
        'indexes',     coalesce(x.indexes, '[]'::jsonb)
      )
      order by r.schema_name, r.table_name
    )
    from rel r
    left join cols c on c.rel_oid = r.rel_oid
    left join cons k on k.rel_oid = r.rel_oid
    left join idx  x on x.rel_oid = r.rel_oid
    left join pol  p on p.rel_oid = r.rel_oid
  ),
  'inbound_foreign_keys', coalesce((select inbound_fks from inbound), '[]'::jsonb)
)) as structure_metadata;
