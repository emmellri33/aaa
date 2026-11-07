// TITLE: BPACK_PATCH 출력 JSON 형식 고정 1줄 추가 및 구문 검증 (patch_bpack.js)
const fs = require('fs');
const { execSync } = require('child_process');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `  "- 패치 모드: 패치 외 말 금지. 출력은 JSON 1개만 (코드블록·잡담 금지). (F2-역할 + F3 조건부 — 코딩 ON일 때만 적용)",`;
const replace = `  "- 패치 모드: 패치 외 말 금지. 출력은 JSON 1개만 (코드블록·잡담 금지). (F2-역할 + F3 조건부 — 코딩 ON일 때만 적용)",
  "- 출력 JSON 형식 고정: {\\"type\\":\\"patch\\",\\"target\\",\\"edits\\":[{\\"search\\",\\"replace\\"}]} 또는 {\\"type\\":\\"question\\",\\"question\\"}. type·edits 빠지면 컷.",`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치 (fail-closed: 중단 및 원복)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ BPACK_PATCH 출력 JSON 형식 고정 1줄 추가 완료');

// 구문 검증 실행
try {
  const result = execSync('node --check server.js', { encoding: 'utf8' });
  console.log('✅ server.js 구문 검증 통과 (node --check server.js):\n' + (result || '(오류 없음)'));
} catch (e) {
  console.error('❌ server.js 구문 오류:\n' + e.message);
  process.exit(1);
}