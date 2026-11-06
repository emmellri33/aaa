// TITLE: 1. c2stash 맵 및 getDiskFileHash 헬퍼 추가 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search = `const PINS_PATH = path.join(__dirname, "target-pins.json");`;
const replace = `// --- EYES 분할5: C2 더티 핑거프린트 stash (roomId + target 키 map) ---
const c2stash = new Map();

function getDiskFileHash(filename) {
  try {
    const fullPath = path.join(__dirname, filename);
    if (!fs.existsSync(fullPath)) return null;
    const raw = fs.readFileSync(fullPath, 'utf8');
    return crypto.createHash('sha1').update(raw).digest('hex');
  } catch (e) {
    return null;
  }
}

const PINS_PATH = path.join(__dirname, "target-pins.json");`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('server.js', content.replace(search, replace), 'utf8');
console.log('✅ 블록 1 적용 완료');