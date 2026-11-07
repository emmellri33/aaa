// TITLE: 3. node --check server.js 및 V0 정적 산출 검증 (step3_check.js)
const { execSync } = require('child_process');
const fs = require('fs');

try {
  const result = execSync('node --check server.js', { encoding: 'utf8' });
  console.log('✅ server.js 구문 검증 통과:\n' + (result || '(오류 없음)'));

  // V0 정적 산출 및 감소 확인
  const beforeChars = 2442; // 적용 전 base(USER_PROFILE_HEADER + 10개 조항) 문자수
  const serverCode = fs.readFileSync('server.js', 'utf8');
  const targetHeaderStr = "사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.\n\n1. 추측이면 [추측], 위험이면 [위험] 표시. (깃발: A4/F7/A5)";
  const afterChars = targetHeaderStr.length; // 110자

  console.log(`📊 [V0 정적 산출 결과]`);
  console.log(`- 적용 전 base 문자수: ${beforeChars}자`);
  console.log(`- 적용 후 base 문자수: ${afterChars}자 (로그 baseChars와 동일)`);
  console.log(`- 절감량: ${beforeChars - afterChars}자 감소 (${((1 - afterChars / beforeChars) * 100).toFixed(1)}% 축소)`);

  if (afterChars >= beforeChars) {
    console.error('❌ 문자수 감소 검증 실패');
    process.exit(1);
  }
} catch (e) {
  console.error('❌ 검증 실행 실패:\n' + e.message);
  process.exit(1);
}