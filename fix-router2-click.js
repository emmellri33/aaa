// TITLE: ROUTER 분할2 수정 — 옵션 클릭도 항상 ai-modify로 (5번 교체)
// 실행 위치: 레포 루트 (/workspaces/aaa). 미미 5번 적용 후에 실행. node fix-router2-click.js
const fs = require('fs');

const file = 'blank.html';
const content = fs.readFileSync(file, 'utf8');

function fail(msg) {
  console.error('FAIL: ' + msg + ' - 파일 미기록 원복');
  process.exit(1);
}

// 선택지에는 target이 박혀 있어 OFF여도 서버 3관이 명확→패치로 감. 토글 상태와 무관하게 통일.
const search = `                  handleSend(codingToggleState === "ON");`;
const replace = `                  handleSend(true);`;

if (content.split(search).length !== 2) fail('앵커 0회 또는 2회 이상');

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('PASS: 옵션 클릭 항상 ai-modify 전송으로 수정');
