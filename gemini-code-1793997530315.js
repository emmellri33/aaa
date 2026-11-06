// TITLE: 5. server.js 문법 및 골든셋 검증기 점검 (step5_verify_check.js)
const { execSync } = require('child_process');

try {
  const checkResult = execSync('node --check server.js', { encoding: 'utf8' });
  console.log('✅ server.js 구문 검증 통과 (node --check server.js):');
  console.log(checkResult || '(구문 오류 없음)');

  const verifyResult = execSync('node verify-router-cases.js', { encoding: 'utf8' });
  console.log('✅ 골든셋 검증기(verify-router-cases.js) 정상 실행 확인:');
  console.log(verifyResult);
} catch (e) {
  console.error('❌ 검증 실패:\n' + e.message);
  process.exit(1);
}