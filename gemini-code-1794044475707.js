// TITLE: 5. node --check server.js 및 blank.html 스크립트·baseChars=42 검증 (step5_check.js)
const { execSync } = require('child_process');
const fs = require('fs');

try {
  // 1. node --check server.js
  const checkOut = execSync('node --check server.js', { encoding: 'utf8' });
  console.log('✅ node --check server.js 통과:\n' + (checkOut || '(구문 오류 없음)'));

  // 2. blank.html 인라인 <script> 전 블록 파싱 검증
  const html = fs.readFileSync('blank.html', 'utf8');
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m, idx = 0;
  while ((m = re.exec(html)) !== null) {
    idx++;
    new Function(m[1]);
  }
  console.log(`✅ blank.html 인라인 <script> ${idx}개 블록 파싱 통과`);

  // 3. 상시 프롬프트 baseChars=42 유지 확인
  const serverSrc = fs.readFileSync('server.js', 'utf8');
  const expectedBase = `const PATCH_SYSTEM_PROMPT = ["1. 추측이면 [추측], 위험이면 [위험] 표시. (깃발: A4/F7/A5)"].join("\\n");`;
  if (!serverSrc.includes(expectedBase)) {
    throw new Error('PATCH_SYSTEM_PROMPT 상시 42자 기준이 변경되었습니다.');
  }
  const baseLen = "1. 추측이면 [추측], 위험이면 [위험] 표시. (깃발: A4/F7/A5)".length;
  console.log(`✅ 상시 baseChars=${baseLen} 유지 확인 완료`);
} catch (e) {
  console.error('❌ 검증 실패:', e.message);
  process.exit(1);
}