// TITLE: 2. server.js isForbiddenFileName에 session.md 및 session-detail 추가 (step2_forbidden_files.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `// --- 폴더 파일 목록 & 읽기 (/api/files) ---
function isForbiddenFileName(name) {
  const n = String(name || "");
  const low = n.toLowerCase();
  if (!n || n.includes("..") || n.includes("/") || n.includes("\\\\")) return true;
  if (n.startsWith(".") || low.includes(".env") || low.includes("key") || n === "node_modules") return true;
  return false;
}`;

const replace = `// --- 폴더 파일 목록 & 읽기 (/api/files) ---
function isForbiddenFileName(name) {
  const n = String(name || "");
  const low = n.toLowerCase();
  if (!n || n.includes("..") || n.includes("\\\\")) return true;
  if (n === "session.md" || n === "session-detail" || n === "session-detail/") return true;
  // 상세 파일 읽기 허용: session-detail/ 하위 파일 (추가 슬래시 없음)
  if (n.startsWith("session-detail/")) {
    const sub = n.slice("session-detail/".length);
    if (!sub || sub.includes("/") || sub.includes("..")) return true;
    return false;
  }
  if (n.includes("/")) return true;
  if (n.startsWith(".") || low.includes(".env") || low.includes("key") || n === "node_modules") return true;
  return false;
}`;

if (content.split(search).length !== 2) {
  console.error('❌ step2_forbidden_files.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step2_forbidden_files.js 완료');