// TITLE: 8. blank.html 되돌리기(undo) 시 confirmed: true 고정 전송 (blank.html)
const fs = require('fs');
let content = fs.readFileSync('blank.html', 'utf8');

const search = `      undoBtn.onclick = async () => {
        if (backupContent === null) return;
        const r = await fetch(__patchSaveUrl(typeof patch !== "undefined" ? patch : null), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: backupContent })
        });`;

const replace = `      undoBtn.onclick = async () => {
        if (backupContent === null) return;
        // 되돌리기는 사용자 명시 revert이므로 confirmed: true 고정 전송
        const r = await fetch(__patchSaveUrl(typeof patch !== "undefined" ? patch : null), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: backupContent, confirmed: true, roomId: _roomKey() })
        });`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('blank.html', content.replace(search, replace), 'utf8');
console.log('✅ 블록 8 적용 완료');