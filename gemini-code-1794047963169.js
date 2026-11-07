// TITLE: 1. server.js session.md 및 session-detail 경로 상수 추가 (step1_constants.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `const INDEX_PATH = path.join(__dirname, 'index.html');
const MEMORY_PATH = path.join(__dirname, 'memory.json');`;

const replace = `const INDEX_PATH = path.join(__dirname, 'index.html');
const MEMORY_PATH = path.join(__dirname, 'memory.json');
const SESSION_PATH = path.join(__dirname, 'session.md');
const SESSION_DETAIL_DIR = path.join(__dirname, 'session-detail');`;

if (content.split(search).length !== 2) {
  console.error('❌ step1_constants.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step1_constants.js 완료');