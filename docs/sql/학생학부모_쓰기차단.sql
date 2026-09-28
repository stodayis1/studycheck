-- 학생·학부모가 자기 기록을 고치거나 지우지 못하게 막는다
--
-- 지금 상태(2026-09-28): 학생·학부모 세션이 붙는 11개 표의 정책이 전부 `for all`이다.
--   staff_or_own_student = is_staff() OR student_id in (본인)
-- 즉 **읽기뿐 아니라 수정·삭제까지** 열려 있다. 화면에 버튼이 없을 뿐,
-- 로그인한 학생이 개발자도구로 직접 요청하면 자기 학습지 점수나 수업 기록을 바꿀 수 있다.
--
-- 앱이 실제로 쓰는 것은 다섯 가지뿐이다(그 외는 전부 읽기만 하면 된다):
--   learning_notes   INSERT·UPDATE  과제 달성률 체크, 연산서 「다 했어요」, 영상 시청 표시, 학생 메모
--   video_watch_logs INSERT·UPDATE  영상 시청 기록
--   student_worksheets  UPDATE       학습지 「제출」 표시 (status만)
--   feedbacks           UPDATE       알림장 읽음 표시 (is_read만)
--   feedback_replies    INSERT       알림장 답글
--
-- 그래서 두 겹으로 막는다.
--   (1) 정책: 안 쓰는 6개 표는 읽기만 남긴다. 쓰는 5개도 필요한 명령만 남긴다(DELETE는 전부 회수).
--   (2) 트리거: 쓰기를 남겨둔 표에서도 '허용된 칸' 말고는 못 바꾸게 한다.
--       (정책은 행 단위라 칸을 못 가린다. 점수는 학생이 못 건드려야 한다)
--
-- ⚠️ 직원(is_staff)은 어느 것도 달라지지 않는다. 선생님 화면은 그대로다.
-- ⚠️ 서버(서비스 키)도 그대로다 — OPS 결석 동기화가 class_sessions·learning_notes에 직접 쓰는데,
--    RLS는 서비스 키를 건너뛰지만 트리거는 안 건너뛰므로 트리거 안에서 따로 통과시킨다.
-- ⚠️ 통째로 한 트랜잭션이라 중간에 실패하면 전부 되돌아간다.
--
-- 되돌리기: 파일 맨 아래 주석 참고(원래의 for all 정책 한 줄로 복구).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- (1-A) 앱이 쓰지 않는 표 6개 — 본인 것 "읽기만"
-- ════════════════════════════════════════════════════════════════════════════
-- class_sessions        수업 기록(날짜·출결·데일리테스트 점수)
-- exam_prep_assignments 시험대비 배정
-- progress_checks       단원 진도 체크
-- schedules             시간표
-- student_exam_prep     시험대비 진도·점수
-- student_textbooks     배정 교재

drop policy if exists staff_or_own_student on public.class_sessions;
create policy staff_all on public.class_sessions for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.class_sessions for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

drop policy if exists staff_or_own_student on public.exam_prep_assignments;
create policy staff_all on public.exam_prep_assignments for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.exam_prep_assignments for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

drop policy if exists staff_or_own_student on public.progress_checks;
create policy staff_all on public.progress_checks for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.progress_checks for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

drop policy if exists staff_or_own_student on public.schedules;
create policy staff_all on public.schedules for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.schedules for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

drop policy if exists staff_or_own_student on public.student_exam_prep;
create policy staff_all on public.student_exam_prep for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.student_exam_prep for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

drop policy if exists staff_or_own_student on public.student_textbooks;
create policy staff_all on public.student_textbooks for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.student_textbooks for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

-- ════════════════════════════════════════════════════════════════════════════
-- (1-B) 앱이 쓰는 표 5개 — 필요한 명령만 남긴다 (DELETE는 전부 회수)
-- ════════════════════════════════════════════════════════════════════════════

-- learning_notes: 읽기 + 새로 만들기 + 고치기 (칸 제한은 아래 트리거가 한다)
drop policy if exists staff_or_own_student on public.learning_notes;
create policy staff_all on public.learning_notes for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.learning_notes for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));
create policy own_insert on public.learning_notes for insert
  with check (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));
create policy own_update on public.learning_notes for update
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

-- video_watch_logs: 본인 시청 기록이라 읽기 + 만들기 + 고치기
drop policy if exists staff_or_own_student on public.video_watch_logs;
create policy staff_all on public.video_watch_logs for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.video_watch_logs for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));
create policy own_insert on public.video_watch_logs for insert
  with check (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));
create policy own_update on public.video_watch_logs for update
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

-- student_worksheets: 「제출」 표시만 하면 되므로 INSERT·DELETE 없이 UPDATE만
drop policy if exists staff_or_own_student on public.student_worksheets;
create policy staff_all on public.student_worksheets for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.student_worksheets for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));
create policy own_update on public.student_worksheets for update
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

-- feedbacks: 읽음 표시만 하면 되므로 UPDATE만
drop policy if exists staff_or_own_student on public.feedbacks;
create policy staff_all on public.feedbacks for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.feedbacks for select
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));
create policy own_update on public.feedbacks for update
  using (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())))
  with check (student_id in (select id from public.students
    where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid())));

-- feedback_replies: 답글 쓰기(INSERT)와 읽기만. 남의 답글은 안 보이고, 쓴 답글은 못 고친다.
drop policy if exists staff_or_own_via_feedback on public.feedback_replies;
create policy staff_all on public.feedback_replies for all
  using (is_staff()) with check (is_staff());
create policy own_read on public.feedback_replies for select
  using (feedback_id in (select id from public.feedbacks
    where student_id in (select id from public.students
      where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid()))));
create policy own_insert on public.feedback_replies for insert
  with check (feedback_id in (select id from public.feedbacks
    where student_id in (select id from public.students
      where session_uid = (select auth.uid()) or parent_session_uid = (select auth.uid()))));

-- ════════════════════════════════════════════════════════════════════════════
-- (2) 칸 단위 보호 — 정책은 '행'만 가리므로, 점수 같은 칸은 트리거로 막는다
-- ════════════════════════════════════════════════════════════════════════════
-- 허용한 칸 말고 하나라도 값이 달라지면 거부한다(화이트리스트).
-- 나중에 칸이 새로 생겨도 자동으로 '금지' 쪽에 들어가므로 빠뜨릴 일이 없다.

create or replace function public.guard_student_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  allowed text[];
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
begin
  if public.is_staff() then
    return new;              -- 선생님·직원·원장은 그대로
  end if;

  -- ⚠️ 서버(서비스 키)는 반드시 통과시켜야 한다.
  -- RLS는 서비스 키를 아예 건너뛰지만 **트리거는 서비스 키도 그대로 탄다.**
  -- OPS(수학OPS)가 결석을 동기화할 때 StudyCheck의 class_sessions·learning_notes에 직접 upsert하는데
  -- (sumath-admin/src/lib/studycheckPush.ts), 이때는 로그인한 사람이 없어서 is_staff()가 false다.
  -- 이 줄이 없으면 OPS 결석 동기화가 통째로 막힌다.
  if auth.uid() is null or auth.role() = 'service_role' then
    return new;
  end if;

  allowed := string_to_array(tg_argv[0], ',');
  foreach k in array allowed loop
    o := o - k;
    n := n - k;
  end loop;

  if o is distinct from n then
    raise exception '학생·학부모는 이 항목을 바꿀 수 없어요. (허용: %)', tg_argv[0]
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- 학습지: 「제출」 표시만. 점수(score)·레벨·단원은 못 건드린다.
drop trigger if exists trg_student_edit_guard on public.student_worksheets;
create trigger trg_student_edit_guard
  before update on public.student_worksheets
  for each row execute function public.guard_student_update('status,submitted_at,updated_at');

-- 알림장: 읽음 표시만.
drop trigger if exists trg_student_edit_guard on public.feedbacks;
create trigger trg_student_edit_guard
  before update on public.feedbacks
  for each row execute function public.guard_student_update('is_read');

-- 수업일지: 학생이 직접 남기는 칸만. 학습지 점수(worksheet_score)·출결·선생님 기록은 못 바꾼다.
drop trigger if exists trg_student_edit_guard on public.learning_notes;
create trigger trg_student_edit_guard
  before update on public.learning_notes
  for each row execute function public.guard_student_update(
    'textbook_achievement,achievement_reason,worksheet_reason,student_memo,student_edited,workbook_done,video_started_at,video_completed_at');

commit;

-- ── 확인 ───────────────────────────────────────────────────────────────────
-- 1) DELETE 권한이 학생에게 남아있지 않은지 (아래가 0줄이어야 정상)
--   select c.relname, p.polname, p.polcmd::text
--   from pg_policy p join pg_class c on c.oid=p.polrelid
--   where c.relname in ('class_sessions','exam_prep_assignments','progress_checks','schedules',
--                       'student_exam_prep','student_textbooks','learning_notes','video_watch_logs',
--                       'student_worksheets','feedbacks','feedback_replies')
--     and p.polcmd::text = 'd' and p.polname <> 'staff_all';
--
-- 2) OPS 연동이 여전히 되는지 (서버는 트리거를 통과해야 한다)
--    결석은 StudyCheck에서 체크하고 그게 OPS로 간다(주 방향). 이 경로는 선생님이 하는 일이라
--    트리거와 무관하다.
--    트리거를 타는 것은 **반대 방향**이다 — OPS가 StudyCheck의 class_sessions·learning_notes에
--    서비스 키로 직접 쓰는 경우(sumath-admin/src/lib/studycheckPush.ts):
--      · 학부모가 보강 안내 문자 링크에서 날짜를 고르거나 「보강 안 함」을 누를 때
--      · OPS에서 보강을 확정·출석·취소 처리할 때
--    확인: 위 동작을 하나 해보고 StudyCheck 학습일지 메모에
--          「[OPS] 보강 예정: ...」 / 「[OPS] 보강 안 함으로 처리됨」이 붙는지 본다.
--    (이 push는 실패해도 조용히 넘어가므로 — .catch(() => {}) — 화면엔 아무 표시가 없다)
--
-- 3) 학생 앱에서 꼭 눌러볼 것 (이게 되면 정상)
--    · 과제 화면에서 「다 했어요」 체크
--    · 학습지 「제출」
--    · 알림장 열어서 읽음 처리 + 답글 쓰기
--    · 영상 재생(시청 기록)
--    · 학습일지에서 과제 달성률/메모 저장
--
-- 되돌리기 (표마다 이렇게 하면 예전 상태):
--   drop policy staff_all on public.class_sessions;
--   drop policy own_read on public.class_sessions;
--   ... (own_insert/own_update가 있으면 같이) ...
--   create policy staff_or_own_student on public.class_sessions for all
--     using (is_staff() or student_id in (select id from public.students
--       where session_uid=(select auth.uid()) or parent_session_uid=(select auth.uid())))
--     with check (is_staff() or student_id in (select id from public.students
--       where session_uid=(select auth.uid()) or parent_session_uid=(select auth.uid())));
--   drop trigger trg_student_edit_guard on public.student_worksheets;  -- 트리거도 같이
