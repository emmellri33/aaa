// TITLE: 1. 구문 검사 헬퍼 함수 추가 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search = `function checkWhitespaceAndProps(searchStr, replaceStr) {`;
const replace = `function verifyHtmlScriptsSyntax(text) {
  if (!text.includes("<html") && !text.includes("</html>") && !text.includes("<script")) return { ok: true };
  const re = /<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi;
  let m; let idx = 0; const errors = [];
  while ((m = re.exec(text)) !== null) {
    idx++;
    try { new Function(m[1]); } catch (e) { errors.push("script #" + idx + ": " + e.message); }
  }
  if (errors.length) return { ok: false, error: errors.join("\\n") };
  return { ok: true, blocks: idx };
}

function checkWhitespaceAndProps(searchStr, replaceStr) {`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('server.js', content.replace(search, replace), 'utf8');
console.log('✅ 블록 1 적용 완료');