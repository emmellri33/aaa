// TITLE: 1. router-pending.md 시드 파일 생성 (step1_pending_seed.js)
const fs = require('fs');

const pendingFile = 'router-pending.md';
if (!fs.existsSync(pendingFile)) {
  fs.writeFileSync(pendingFile, '# router-pending.md 대기열 (신호 감지 수집본)\n\n', 'utf8');
  console.log('✅ step1_pending_seed.js: router-pending.md 생성 완료');
} else {
  console.log('ℹ️ step1_pending_seed.js: router-pending.md 이미 존재함');
}