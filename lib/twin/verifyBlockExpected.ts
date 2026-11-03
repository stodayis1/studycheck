// `[5-가]/[5-나]` DO 블록의 **고정 기대 실행 토큰** — 검수 전용 (GPT-EXEC-019 §58·§64)
//
// 이 파일은 무엇인가
//   `docs/sql/쌍둥이_설치후_검증.sql`(= `POSTINSTALL_TO_RUN_017.sql`) 안에서
//   `[5-가]`와 `[5-나]`를 함께 담고 있는 **하나의 do 블록 전체**를, 경계(`do $t$` · `$t$;`)와
//   선언부까지 포함해 실행 토큰으로 적어 둔 것이다. 주석·공백·줄바꿈은 들어 있지 않다.
//
// 왜 마커 뒤 일부가 아니라 블록 전체인가 (§62)
//   `[5-나]` 표식 뒤만 비교하면 그 **앞에** 끼워 넣은 IF·handler·역할 전환을 놓친다.
//   018 검수가 실제로 그 방식으로 뚫었다. 그래서 감싸는 경계와 선언까지 범위에 넣는다.
//
// 어떻게 만들었고, 왜 저절로 갱신되지 않는가 (§69)
//   2026-09-28 에 임시 스크립트로 아래 해시의 SQL 에서 한 번 뽑아 **손으로 넣었다.**
//   저장소에는 생성기를 두지 않는다. 테스트도 이 파일을 쓰지 않는다.
//   SQL 이 정당하게 바뀌면 이 상수는 **틀리게 되고 검사는 실패한다.** 그때 사람이
//   바뀐 SQL 을 검수한 뒤에만 이 파일을 고친다 — 변이가 조용히 새 정상이 되지 않는다.
//
// 이 상수를 쓰는 검사가 무엇이 아닌지
//   파일 해시 비교가 아니다. 아래 `sourceSha256` 은 **출처 기록**일 뿐이고,
//   통과·실패를 가르는 것은 토큰 비교다 (§68).
//
// 검수 전용이다. 운영 실행 SQL 이 아니고, 어떤 화면·API 도 이 파일을 읽지 않는다.

/** 토큰 서명 형식: `w:낱말` `n:숫자` `s:종류:값` `p:연산자` `q:본문태그` `i:따옴표식별자` */
export const EXPECTED_BLOCK = {
  /** 출처 — 이 해시의 SQL 에서 뽑았다는 기록 (검사 기준이 아니다) */
  sourceSha256: '4c913d8d4beef1fb8247afee5e31084d7163b5cafe9271ecea613bbffccb5deb',
  sourcePath: 'docs/sql/쌍둥이_설치후_검증.sql',
  /** 파일 안에서 몇 번째 do 블록인가 (0-based). 앞뒤로 블록이 늘거나 줄면 실패한다 */
  doBlockIndex: 10,
  /** 참고용 위치. **검사 기준이 아니다** — 행 번호·들여쓰기는 보지 않는다 (§60) */
  sourceLines: '928~961',
  tokens: [
  // 928: do $t$
  "w:do", "q:$t$",
  // 929: declare
  "w:declare",
  // 930: v_cnt int;
  "w:v_cnt", "w:int", "p:;",
  // 931: v_sqlstate text;
  "w:v_sqlstate", "w:text", "p:;",
  // 932: begin
  "w:begin",
  // 934: select count(*) into v_cnt from information_schema.columns
  "w:select", "w:count", "p:(", "p:*", "p:)", "w:into", "w:v_cnt", "w:from", "w:information_schema", "p:.", "w:columns",
  // 935: where table_schema = 'public' and table_name = 'type_learning_assets'
  "w:where", "w:table_schema", "p:=", "s:single:public", "w:and", "w:table_name", "p:=", "s:single:type_learning_assets",
  // 936: and column_name in ('answer_text','answer','solution_outline','problem_text_latex');
  "w:and", "w:column_name", "w:in", "p:(", "s:single:answer_text", "p:,", "s:single:answer", "p:,", "s:single:solution_outline", "p:,", "s:single:problem_text_latex", "p:)", "p:;",
  // 937: if v_cnt > 0 then
  "w:if", "w:v_cnt", "p:>", "n:0", "w:then",
  // 938: raise exception '[5-가] 학생이 읽는 테이블에 정답·풀이 칼럼이 %개 있습니다', v_cnt;
  "w:raise", "w:exception", "s:single:[5-가] 학생이 읽는 테이블에 정답·풀이 칼럼이 %개 있습니다", "p:,", "w:v_cnt", "p:;",
  // 939: end if;
  "w:end", "w:if", "p:;",
  // 940: raise notice '[5-가] 학생 테이블에 정답 칼럼 없음: OK';
  "w:raise", "w:notice", "s:single:[5-가] 학생 테이블에 정답 칼럼 없음: OK", "p:;",
  // 945: set local role authenticated;
  "w:set", "w:local", "w:role", "w:authenticated", "p:;",
  // 946: begin
  "w:begin",
  // 947: perform 1 from ai_question_private.ai_practice_problems limit 1;
  "w:perform", "n:1", "w:from", "w:ai_question_private", "p:.", "w:ai_practice_problems", "w:limit", "n:1", "p:;",
  // 948: v_sqlstate := '__NO_ERROR__';
  "w:v_sqlstate", "p::=", "s:single:__NO_ERROR__", "p:;",
  // 949: exception when others then
  "w:exception", "w:when", "w:others", "w:then",
  // 950: v_sqlstate := sqlstate;
  "w:v_sqlstate", "p::=", "w:sqlstate", "p:;",
  // 951: end;
  "w:end", "p:;",
  // 952: reset role;
  "w:reset", "w:role", "p:;",
  // 953: if v_sqlstate = '__NO_ERROR__' then
  "w:if", "w:v_sqlstate", "p:=", "s:single:__NO_ERROR__", "w:then",
  // 954: raise exception '[5-나] authenticated 가 private 스키마를 읽었습니다. 즉시 롤백하세요.';
  "w:raise", "w:exception", "s:single:[5-나] authenticated 가 private 스키마를 읽었습니다. 즉시 롤백하세요.", "p:;",
  // 955: end if;
  "w:end", "w:if", "p:;",
  // 956: if v_sqlstate <> '42501' then
  "w:if", "w:v_sqlstate", "p:<>", "s:single:42501", "w:then",
  // 957: raise exception '[5-나] 기대한 권한 오류(42501)가 아닙니다: %', v_sqlstate;
  "w:raise", "w:exception", "s:single:[5-나] 기대한 권한 오류(42501)가 아닙니다: %", "p:,", "w:v_sqlstate", "p:;",
  // 958: end if;
  "w:end", "w:if", "p:;",
  // 959: raise notice '[5-나] authenticated 의 private 스키마 접근 거부: OK (42501)';
  "w:raise", "w:notice", "s:single:[5-나] authenticated 의 private 스키마 접근 거부: OK (42501)", "p:;",
  // 960: end;
  "w:end", "p:;",
  // 961: $t$;
  "q:$t$", "p:;",
  ] as const,
}
