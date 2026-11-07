// TITLE: 2. 프롬프트 문자수 로그 추가 (step2_diet_log.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `      console.log("MODIFY round=" + round, new Date().toISOString(), "model=" + useModel, retryError ? "(retry)" : "");`;

const replace = `      console.log("MODIFY round=" + round, new Date().toISOString(), "model=" + useModel, "baseChars=" + PATCH_SYSTEM_PROMPT.length, retryError ? "(retry)" : "");`;

if (content.split(search).length !== 2) {
  console.error('❌ 블록 2 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ 2. step2_diet_log.js 완료');