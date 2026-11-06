// TITLE: 9a. ai-modify 요청에 roomId 중앙 주입 (blank.html)
const fs = require('fs');
let content = fs.readFileSync('blank.html', 'utf8');

const search = `    async function fetchAiModifyWithRetry(payload, signal) {
      const body = JSON.stringify(payload);`;
const replace = `    async function fetchAiModifyWithRetry(payload, signal) {
      try { if (payload && !payload.roomId) payload.roomId = _roomKey(); } catch {}
      const body = JSON.stringify(payload);`;
if (content.split(search).length !== 2) {
  console.error('FAIL 9a. ai-modify 요청에 roomId 중앙 주입 (blank.html)');
  process.exit(1);
}
content = content.replace(search, replace);

fs.writeFileSync('blank.html', content, 'utf8');
console.log('OK 9a. ai-modify 요청에 roomId 중앙 주입 (blank.html)');
