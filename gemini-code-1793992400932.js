// TITLE: 4. blank.html sendBtn.onclick 토글 상태 반영 (step4_blank_send_click.js)
const fs = require('fs');

const file = 'blank.html';
const content = fs.readFileSync(file, 'utf8');

const search = `    sendBtn.onclick = () => handleSend(false);`;
const replace = `    sendBtn.onclick = () => handleSend(codingToggleState === "ON");`;

if (content.split(search).length !== 2) {
  console.error('❌ step4_blank_send_click.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step4_blank_send_click.js 적용 완료');