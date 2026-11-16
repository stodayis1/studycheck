/**
 * 오토스텝을 누구에게 켜 두는지(lib/autostep.ts) 재는 검사.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/autostep-check.ts
 *
 * DB·인터넷 없이 돈다. 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import * as fs from 'node:fs'
import {
  autostepAllowed, isAutostepOpen, isAutostepPilot,
  AUTOSTEP_OPEN_SEMESTERS, AUTOSTEP_PILOT_STUDENT_IDS, AUTOSTEP_TEXTBOOK_NAMES,
} from '../lib/autostep.ts'

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
}

const 아무학생 = '00000000-0000-0000-0000-000000000000'
const 파일럿 = [...AUTOSTEP_PILOT_STUDENT_IDS][0]

// ① 원장님 2026-11-16 — 개념유형 중1-2 는 모든 학생에게 열려 있어야 한다
ok(autostepAllowed(아무학생, '개념+유형라이트', '중1', 2), '개념유형 중1-2 는 파일럿이 아닌 학생에게도 열려야 한다')
ok(autostepAllowed(null, '개념+유형라이트', '중1', 2), '여러 명 한꺼번에 배정(학생 미지정)에서도 열려야 한다')
ok(autostepAllowed(아무학생, '개념유형 라이트', '중1', 2), '옛 이름(개념유형 라이트)으로 배정된 기록도 열려야 한다')

// ② 열지 않은 것은 그대로 닫혀 있어야 한다
ok(!autostepAllowed(아무학생, '개념+유형라이트', '중1', 1), '중1-1 은 아직 전원 공개가 아니다')
ok(!autostepAllowed(아무학생, '개념+유형라이트', '중3', 2), '중3-2 는 쪽수 매핑이 0건이라 열려선 안 된다')
ok(!autostepAllowed(아무학생, '개념리피트', '중1', 2), '매핑 없는 개념서(개념리피트)에는 뜨면 안 된다')
ok(!autostepAllowed(아무학생, '개념유형 라이트(유형편)', '중1', 2), '유형편은 그 자체로 열리지 않는다(개념서 쪽으로 판단한다)')
ok(!isAutostepOpen('개념+유형라이트', '중1', null), '학기가 없으면 열리지 않는다')
ok(!isAutostepOpen('', '중1', 2), '교재 이름이 없으면 열리지 않는다')

// ③ 파일럿 학생은 그대로
ok(isAutostepPilot(파일럿), '파일럿 명단은 그대로 살아 있어야 한다')
ok(autostepAllowed(파일럿, '개념+유형라이트', '중2', 2), '파일럿 학생은 열지 않은 학기에서도 돌아야 한다')

// ④ 전원 공개 학기는 **쪽수 매핑이 전수로 들어간 학기**여야 한다.
//    (2026-11-16 재어 본 값 — concepts 와 autostep_concept_page_map 대조)
const 매핑된학기 = ['중1-1', '중1-2', '중2-1', '중2-2', '중3-1']
for (const x of AUTOSTEP_OPEN_SEMESTERS) {
  ok(매핑된학기.includes(`${x.grade}-${x.semester}`),
    `전원 공개 학기 ${x.grade}-${x.semester} 는 쪽수 매핑이 전수로 들어간 학기가 아니다`)
}
ok(AUTOSTEP_OPEN_SEMESTERS.length > 0, '전원 공개 학기가 하나도 없다')
ok(AUTOSTEP_TEXTBOOK_NAMES.includes('개념+유형라이트'), '지금 쓰는 교재 이름이 목록에 있어야 한다')

// ⑤ 두 화면이 **같은 판단**을 써야 한다 — 베껴 쓴 사본이 다시 생기면 한쪽만 열린다
for (const f of ['app/teacher/curriculum/page.tsx', 'app/teacher/learning-notes/page.tsx']) {
  const src = fs.readFileSync(f, 'utf8')
  ok(!/const AUTOSTEP_PILOT_STUDENT_IDS/.test(src), `${f} 에 파일럿 명단 사본이 다시 생겼다 — lib/autostep.ts 를 쓸 것`)
  ok(!/const AUTOSTEP_TEXTBOOK_NAMES/.test(src), `${f} 에 교재 이름 사본이 다시 생겼다 — lib/autostep.ts 를 쓸 것`)
  ok(/from '@\/lib\/autostep'/.test(src), `${f} 가 lib/autostep.ts 를 안 쓴다`)
}

if (bad) { console.error(`\n오토스텝 자가확인 실패 ${bad}건`); process.exit(1) }
console.log('오토스텝 자가확인 ✓')
