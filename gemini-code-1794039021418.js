// TITLE: 3. USER_PROFILE_HEADER 3곳 검증 및 제거, base 1줄 축소 (step3_remove_uph.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const uphMatches = content.split('USER_PROFILE_HEADER');
if (uphMatches.length - 1 !== 3) {
  console.error(`❌ USER_PROFILE_HEADER 출현 횟수 불일치: ${uphMatches.length - 1}회 (정확히 3회 필수)`);
  process.exit(1);
}

// 1. const USER_PROFILE_HEADER 정의 행 삭제 (위아래 빈줄 유지)
const searchDef = `const USER_PROFILE_HEADER = "사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.";\n\n`;
if (!content.includes(searchDef)) {
  console.error('❌ USER_PROFILE_HEADER 정의 앵커 매칭 실패');
  process.exit(1);
}
content = content.replace(searchDef, '');

// 2. base 프롬프트에서 헤더 제거 -> 난간 1줄만 남김
const searchBase = `const PATCH_SYSTEM_PROMPT = [
  USER_PROFILE_HEADER,
  "",
  "1. 추측이면 [추측], 위험이면 [위험] 표시. (깃발: A4/F7/A5)"
].join("\\n");`;

const replaceBase = `const PATCH_SYSTEM_PROMPT = ["1. 추측이면 [추측], 위험이면 [위험] 표시. (깃발: A4/F7/A5)"].join("\\n");`;

if (content.split(searchBase).length !== 2) {
  console.error('❌ PATCH_SYSTEM_PROMPT base 앵커 매칭 실패');
  process.exit(1);
}
content = content.replace(searchBase, replaceBase);

// 3. /api/run ask 경로 askPrompt에서 헤더 제거
const searchAsk = `const askPrompt = USER_PROFILE_HEADER + "\\n\\n[질문]\\n" + question;`;
const replaceAsk = `const askPrompt = "[질문]\\n" + question;`;

if (content.split(searchAsk).length !== 2) {
  console.error('❌ askPrompt 앵커 매칭 실패');
  process.exit(1);
}
content = content.replace(searchAsk, replaceAsk);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ step3_remove_uph.js 완료: USER_PROFILE_HEADER 완전 제거 및 base 난간 1줄 축소');