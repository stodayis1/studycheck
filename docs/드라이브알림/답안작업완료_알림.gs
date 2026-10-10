/**
 * 구글 드라이브 기출 한글파일 폴더에 「답안작업완료」 파일이 생기면 원장님 Gmail 로 알린다.
 * (담당 강사가 정답 입력을 끝내고 파일 이름을 「…_답안작업완료.hwpx」 로 바꿔 올리는 순간)
 *
 * 설치 (한 번만): script.google.com → 새 프로젝트 → 이 내용을 통째로 붙여넣기 → 위쪽 함수 고르는 칸에서
 *   「설치」 를 고르고 ▶ 실행 → 권한 허용. 끝. 그 뒤로는 5분마다 구글이 알아서 확인한다 (PC 가 꺼져 있어도 된다).
 * 끄기: 함수 「끄기」 를 실행.
 * 읽기만 한다 — 폴더의 파일을 고치거나 옮기지 않는다.
 */
const FOLDER_ID = '1vzxl9dlMYLGabf2BsK0AuWW2PrAEK5hU';

// 이미 「답안작업완료」였던 파일 (2026-10-08: 원흥중 중2 · 지축중 중2 · 고양제일중 중3) — 다시 알리지 않는다
const ALREADY = [
  '119c6O4ed7RmBMJURQVh6r4mlUjR31dB0',
  '1hFzHJHzMUxXX_KFtBWYBCZ1NuMXcDeUB',
  '1SvtbYK3etFRzv002SEeJVxMDrftz-tdE',
];

function 확인() {
  const props = PropertiesService.getScriptProperties();
  const seen = new Set(JSON.parse(props.getProperty('notified') || 'null') || ALREADY);
  const files = DriveApp.getFolderById(FOLDER_ID).getFiles();
  const fresh = [];
  while (files.hasNext()) {
    const f = files.next();
    if (/답안\s*작업\s*완료/.test(f.getName()) && !seen.has(f.getId())) {
      fresh.push(f);
      seen.add(f.getId());
    }
  }
  if (!fresh.length) return;
  // 「26년_2학기 중간_신원중 중2_답안작업완료.hwpx」 → 「신원중 중2」
  const short = (name) => (name.match(/([가-힣]+[중고])[\s_]*([중고]\s*\d)/) || []).slice(1).join(' ').replace(/\s+/g, ' ') || name;
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: '[답안작업완료] ' + fresh.map((f) => short(f.getName())).join(', '),
    body: '정답 입력이 끝난 한글 파일이 올라왔습니다.\n\n'
      + fresh.map((f) => '· ' + f.getName() + '\n  ' + f.getUrl()).join('\n\n')
      + '\n\n다음: 한글에서 PDF 로 변환 → 스터디체크 「시험지 분석」에 올리고 「문항 넣기」',
  });
  props.setProperty('notified', JSON.stringify(Array.from(seen)));
}

function 설치() {
  끄기();
  ScriptApp.newTrigger('확인').timeBased().everyMinutes(5).create();
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '[답안작업완료 알림] 설치됐습니다',
    '이 메일이 폰에 알림으로 떴다면 준비가 끝난 것입니다. 앞으로 「답안작업완료」 파일이 생기면 5분 안에 이렇게 메일이 갑니다.');
  확인();
}

function 끄기() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
}
