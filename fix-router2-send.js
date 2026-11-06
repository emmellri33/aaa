// TITLE: ROUTER 분할2 수정 — 전송은 항상 ai-modify로 (4번 교체)
// 실행 위치: 레포 루트 (/workspaces/aaa). 미미 4번 적용 후에 실행. node fix-router2-send.js
const fs = require('fs');

const file = 'blank.html';
const content = fs.readFileSync(file, 'utf8');

function fail(msg) {
  console.error('FAIL: ' + msg + ' - 파일 미기록 원복');
  process.exit(1);
}

// 3관은 서버가 판단하므로 전송은 무조건 패치 파이프로. 토글은 서버 스킵 여부로만 사용.
const search = `    sendBtn.onclick = () => handleSend(codingToggleState === "ON");`;
const replace = `    // ROUTER 분할2 수정: 전송은 항상 ai-modify로 — OFF여도 서버 3관이 읽기/쓰기/묻기를 가름
    sendBtn.onclick = () => handleSend(true);`;

if (content.split(search).length !== 2) fail('앵커 0회 또는 2회 이상');

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('PASS: sendBtn 항상 ai-modify 전송으로 수정');
