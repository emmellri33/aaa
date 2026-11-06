// TITLE: 4. /api/ai-modify 진입부 디스크 해시 c2stash 기록 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search = `    const ALLOWED_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-4-argon"];
    const useModel = ALLOWED_MODELS.includes(model) ? model : "gemini-3.5-flash-lite";
    
    let htmlSource = currentContent;
    if (!htmlSource) {
      const p = path.join(__dirname, targetFile);
      htmlSource = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    }
    const activeKey = getActiveKey();`;

const replace = `    const ALLOWED_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-4-argon"];
    const useModel = ALLOWED_MODELS.includes(model) ? model : "gemini-3.5-flash-lite";

    // C2 ①: 요청 진입 시 디스크 기준 해시 기록 (신규 파일이면 null)
    const c2RoomKey = (req.body && req.body.roomId && String(req.body.roomId).trim()) || "global";
    const c2StashKey = c2RoomKey + ":" + targetFile;
    const initialDiskHash = getDiskFileHash(targetFile);
    c2stash.set(c2StashKey, initialDiskHash);
    
    let htmlSource = currentContent;
    if (!htmlSource) {
      const p = path.join(__dirname, targetFile);
      htmlSource = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    }
    const activeKey = getActiveKey();`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('server.js', content.replace(search, replace), 'utf8');
console.log('✅ 블록 4 적용 완료');