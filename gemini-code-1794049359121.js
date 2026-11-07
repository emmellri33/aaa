// TITLE: 1. server.js SESSION_TOKEN_CAP 상수 신설 (step1_constants.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `const SESSION_PATH = path.join(__dirname, 'session.md');
const SESSION_DETAIL_DIR = path.join(__dirname, 'session-detail');`;

const replace = `const SESSION_PATH = path.join(__dirname, 'session.md');
const SESSION_DETAIL_DIR = path.join(__dirname, 'session-detail');
const SESSION_TOKEN_CAP = 8000;`;

if (content.split(search).length !== 2) {
  console.error('❌ step1_constants.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step1_constants.js 완료');