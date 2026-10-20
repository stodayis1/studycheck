-- 강의영상에 「대표예제」를 더한다
--
-- 원장님 2026-10-20
--   「공통수학2 개념동영상을 마무리 했거든. 이거 대표예제문제들을 이제 영상으로 만들건데
--     스터디체크 메뉴에 대표개념 연결 있잖아. 거기에다 반영할수 있겠어?」
--   「개념영상이 하나여도 대표예제가 여러개 있을수 있거든」
--
-- 왜 칸을 새로 안 만드나
--   lesson_videos 는 이미 (grade · kind · concept_no · order_label · type_codes) 로
--   「어느 개념의 몇 번째 것이고, 어떤 유형을 덮는지」를 다 담고 있다.
--   개념영상 01번이 공수2-01-01~06 **여섯 유형**을 덮는 식이다 — 그게 곧 대표예제들이다.
--   그러니 종류 하나만 늘리면 된다. kind='대표예제', concept_no 는 그 개념영상과 같게,
--   order_label 은 「01-예제2」처럼, type_codes 에는 그 예제가 덮는 유형.
begin;

alter table public.lesson_videos drop constraint if exists lesson_videos_kind_check;
alter table public.lesson_videos add constraint lesson_videos_kind_check
  check (kind = any (array['개념'::text, '증명'::text, '대표예제'::text]));

comment on column public.lesson_videos.kind is
  '개념 / 증명 / 대표예제. 개념영상 한 편에 대표예제가 여럿 붙을 수 있다 (원장님 2026-10-20)';

commit;
