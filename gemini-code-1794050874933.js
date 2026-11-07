// TITLE: 1. server.js readMemoryFacts __ 제외 및 POST /api/memory codingToggle 분기 추가 (step1_server_memory_toggle.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

// 1. readMemoryFacts __ 접두 항목 제외
const searchFacts = `function readMemoryFacts(roomId) {
  const data = readMemoryData();
  let facts = [...data.global];
  if (roomId && data.rooms[roomId] && Array.isArray(data.rooms[roomId])) {
    facts = facts.concat(data.rooms[roomId]);
  }
  return facts;
}`;

const replaceFacts = `function readMemoryFacts(roomId) {
  const data = readMemoryData();
  let facts = [...data.global];
  if (roomId && data.rooms[roomId] && Array.isArray(data.rooms[roomId])) {
    facts = facts.concat(data.rooms[roomId]);
  }
  return facts.filter(f => !String(f).startsWith('__'));
}`;

if (content.split(searchFacts).length !== 2) {
  console.error('❌ step1_server_memory_toggle.js: readMemoryFacts 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchFacts, replaceFacts);

// 2. POST /api/memory codingToggle 분기 추가
const searchPostMem = `app.post('/api/memory', (req, res) => {
  try {
    const { facts, addFacts, rawJson, roomId } = req.body || {};
    let data = readMemoryData();
    let currentFacts = roomId && roomId !== "global" ? (data.rooms[roomId] || []) : data.global;`;

const replacePostMem = `app.post('/api/memory', (req, res) => {
  try {
    const { facts, addFacts, rawJson, roomId, codingToggle } = req.body || {};
    let data = readMemoryData();

    // --- SESSION 분할3: 방별 코딩 토글 기억 (rooms 내 __codingToggle:ON|OFF 유지) ---
    if (codingToggle !== undefined) {
      const ct = String(codingToggle).trim();
      if (ct !== "ON" && ct !== "OFF") {
        return res.status(400).json({ ok: false, error: "codingToggle 값은 ON 또는 OFF만 허용됩니다." });
      }
      const rId = sanitizeSessionRoomId(roomId);
      if (!rId) {
        return res.status(400).json({ ok: false, error: "유효한 roomId가 필요합니다." });
      }
      if (!data.rooms || typeof data.rooms !== "object") data.rooms = {};
      if (!Array.isArray(data.rooms[rId])) data.rooms[rId] = [];
      data.rooms[rId] = data.rooms[rId].filter(x => !String(x).startsWith("__codingToggle:"));
      data.rooms[rId].push("__codingToggle:" + ct);
      fs.writeFileSync(MEMORY_PATH, JSON.stringify(data, null, 2) + "\\n", "utf8");
      return res.json({ ok: true, data, facts: readMemoryFacts(rId), codingToggle: ct });
    }

    let currentFacts = roomId && roomId !== "global" ? (data.rooms[roomId] || []) : data.global;`;

if (content.split(searchPostMem).length !== 2) {
  console.error('❌ step1_server_memory_toggle.js: POST /api/memory 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchPostMem, replacePostMem);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ step1_server_memory_toggle.js 완료');