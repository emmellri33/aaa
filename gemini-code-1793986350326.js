// TITLE: 3. /api/files/write 콕핏 저장 경로에 C2 대조 및 409 처리 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search = `app.post('/api/files/write', (req, res) => {
  try {
    const { name, content } = req.body || {};
    const filename = String(name || "").trim();
    if (!filename || isForbiddenFileName(filename)) {
      return res.status(403).json({ ok: false, error: "거부됨: 쓰기 금지된 파일명입니다." });
    }
    const p = path.join(__dirname, filename);`;

const replace = `app.post('/api/files/write', (req, res) => {
  try {
    const { name, content, confirmed, roomId } = req.body || {};
    const filename = String(name || "").trim();
    if (!filename || isForbiddenFileName(filename)) {
      return res.status(403).json({ ok: false, error: "거부됨: 쓰기 금지된 파일명입니다." });
    }

    // C2 적용 재확인: confirmed가 아닐 때 stash 대조 후 mismatch면 409
    if (!confirmed) {
      const rKey = (roomId && String(roomId).trim()) || "global";
      const stashKey = rKey + ":" + filename;
      const initialHash = c2stash.get(stashKey);
      if (initialHash !== undefined) {
        const currentHash = getDiskFileHash(filename);
        if (initialHash !== currentHash) {
          return res.status(409).json({
            ok: false,
            error: "conflict(409): 요청 이후 파일이 변경되었습니다. 변경 내용을 확인 후 덮어쓰려면 확인을 눌러주세요.",
            dirty: true
          });
        }
      }
    }

    const p = path.join(__dirname, filename);`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('server.js', content.replace(search, replace), 'utf8');
console.log('✅ 블록 3 적용 완료');