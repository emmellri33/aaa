// TITLE: 3. server.js 단일 session.md 엔진 헬퍼 신설 (step3_session_helpers.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `// --- EYES 분할5: C2 더티 핑거프린트 stash (roomId + target 키 map) ---`;

const replace = `// --- SESSION 분할1: 단일 session.md 엔진 헬퍼 ---
function calcSessionFp() {
  try {
    const entries = fs.readdirSync(__dirname, { withFileTypes: true })
      .filter(e => e.isFile() && !isForbiddenFileName(e.name))
      .map(e => e.name)
      .sort();
    const sessionFp = crypto.createHash('sha1').update(entries.join('\\n')).digest('hex').slice(0, 8);
    return sessionFp;
  } catch (e) {
    return '00000000';
  }
}

function sanitizeSessionRoomId(roomId) {
  const r = String(roomId || '').trim();
  if (!r || r.includes('..') || r.includes('/') || r.includes('\\\\') || r.includes('#')) {
    return null;
  }
  return r;
}

function readSessionFile() {
  if (!fs.existsSync(SESSION_PATH)) {
    return '# 세션 기록 (session.md)\\n\\n';
  }
  return fs.readFileSync(SESSION_PATH, 'utf8');
}

function ensureRoomSection(content, roomId) {
  const header = \`## 방 \${roomId}\`;
  if (!content.includes(header)) {
    const trimmed = content.trimEnd();
    const newContent = trimmed ? \`\${trimmed}\\n\\n\${header}\\n\` : \`\${header}\\n\`;
    fs.writeFileSync(SESSION_PATH, newContent, 'utf8');
    return newContent;
  }
  return content;
}

function getRoomSection(content, roomId) {
  const header = \`## 방 \${roomId}\`;
  const idx = content.indexOf(header);
  if (idx === -1) return '';
  const after = content.slice(idx + header.length);
  const nextSectionIdx = after.indexOf('\\n## 방 ');
  if (nextSectionIdx === -1) {
    return after.trim();
  }
  return after.slice(0, nextSectionIdx).trim();
}

function updateRoomSection(fullContent, roomId, updateFn) {
  const header = \`## 방 \${roomId}\`;
  let content = fullContent;
  if (!content.includes(header)) {
    const trimmed = content.trimEnd();
    content = trimmed ? \`\${trimmed}\\n\\n\${header}\\n\` : \`\${header}\\n\`;
  }

  const headerIdx = content.indexOf(header);
  const afterHeader = content.slice(headerIdx + header.length);
  const nextSecIdx = afterHeader.indexOf('\\n## 방 ');

  const secBody = nextSecIdx === -1 ? afterHeader : afterHeader.slice(0, nextSecIdx);
  const rest = nextSecIdx === -1 ? '' : afterHeader.slice(nextSecIdx);

  const newSecBody = updateFn(secBody);
  const updatedContent = content.slice(0, headerIdx + header.length) + newSecBody + rest;
  fs.writeFileSync(SESSION_PATH, updatedContent, 'utf8');
  return updatedContent;
}

// --- EYES 분할5: C2 더티 핑거프린트 stash (roomId + target 키 map) ---`;

if (content.split(search).length !== 2) {
  console.error('❌ step3_session_helpers.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step3_session_helpers.js 완료');