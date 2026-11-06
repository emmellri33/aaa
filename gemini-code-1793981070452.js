// TITLE: 4. 최종 무결성 확인 및 node --check server.js 실행
const { execSync } = require('child_process');
try {
  const result = execSync('node --check server.js', { encoding: 'utf8' });
  console.log('✅ node --check server.js 통과:\n' + result);
} catch (e) {
  console.error('❌ 구문 에러 발생:\n' + e.message);
  process.exit(1);
}