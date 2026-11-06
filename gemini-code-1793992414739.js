// TITLE: 6. server.js 문법 및 blank.html 인라인 script 파싱 검증 (step6_check.js)
const { execSync } = require('child_process');
const fs = require('fs');

try {
  const checkResult = execSync('node --check server.js', { encoding: 'utf8' });
  console.log('✅ server.js 구문 검증 통과 (node --check server.js):');
  console.log(checkResult || '(구문 오류 없음)');
} catch (e) {
  console.error('❌ server.js 구문 오류:\n' + e.message);
  process.exit(1);
}

try {
  const html = fs.readFileSync('blank.html', 'utf8');
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m, idx = 0;
  while ((m = re.exec(html)) !== null) {
    idx++;
    new Function(m[1]);
  }
  console.log(`✅ blank.html 인라인 <script> ${idx}개 블록 파싱 통과`);
} catch (e) {
  console.error('❌ blank.html 스크립트 파싱 오류:\n' + e.message);
  process.exit(1);
}