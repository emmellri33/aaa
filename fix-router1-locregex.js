// TITLE: ROUTER 분할1 수정 — locRegex에 한국어 '버튼' 추가
// 실행 위치: 레포 루트 (/workspaces/aaa). node fix-router1-locregex.js
const fs = require('fs');

const file = 'server.js';
const content = fs.readFileSync(file, 'utf8');

function fail(msg) {
  console.error('FAIL: ' + msg + ' - 파일 미기록 원복');
  process.exit(1);
}

// 앵커: judgeThreeSlots 위치 칸 정규식 (전체 1행)
const search = `const locRegex = /(?:\\d+\\s*(?:행|줄|line)|#[a-zA-Z0-9_-]+|\\.[a-zA-Z0-9_-]+|\\b(?:title|button|btn|header|nav|footer|body|h[1-6]|input|form)\\b|함수|선택자)/i;`;

const replace = `const locRegex = /(?:\\d+\\s*(?:행|줄|line)|#[a-zA-Z0-9_-]+|\\.[a-zA-Z0-9_-]+|\\b(?:title|button|btn|header|nav|footer|body|h[1-6]|input|form)\\b|함수|선택자|버튼)/i;`;

// NOTE: 위치 단서에 한국어 '버튼' 추가 (시드 예문2 "...버튼 빨강으로"가 위치 칸을 통과해야 명확).
// 애매 예문 5종에는 '버튼'이 없어 영향 없음. 그 외 단어 추가 금지.

if (content.split(search).length !== 2) fail('앵커 0회 또는 2회 이상');

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('PASS: locRegex에 버튼 추가');
