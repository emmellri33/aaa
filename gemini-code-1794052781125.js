// TITLE: 4. node --check server.js 실행 및 구문 무결성 점검 (step4_check.js)
const { execSync } = require('child_process');

try {
  const result = execSync('node --check server.js', { encoding: 'utf8' });
  console.log('✅ server.js 구문 검증 통과 (node --check server.js):');
  console.log(result || '(구문 오류 없음)');
} catch (e) {
  console.error('❌ server.js 구문 오류:\n' + e.message);
  process.exit(1);
}