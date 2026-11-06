// TITLE: 9. node --check server.js 및 blank.html 인라인 script 검증
const { execSync } = require('child_process');
const fs = require('fs');

try {
  const result = execSync('node --check server.js', { encoding: 'utf8' });
  console.log('✅ node --check server.js 통과:\n' + (result || "(구문 오류 없음)"));
} catch (e) {
  console.error('❌ server.js 구문 에러:\n' + e.message);
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
  console.error('❌ blank.html 스크립트 구문 에러:\n' + e.message);
  process.exit(1);
}