// TITLE: 1. memory.json global 배열에 시드 2건 기입 (step1_memory_seed.js)
const fs = require('fs');
const path = require('path');

const MEMORY_PATH = path.join(__dirname, 'memory.json');
const seed1 = "사용자: 비개발자, 한글 선호";
const seed2 = "핵심 건드리는 것 같으면 질문으로";

let data = { global: [], rooms: {} };

if (fs.existsSync(MEMORY_PATH)) {
  try {
    const raw = fs.readFileSync(MEMORY_PATH, 'utf8');
    data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      console.error('❌ memory.json 파싱 실패: 객체 아님');
      process.exit(1);
    }
    if (!Array.isArray(data.global)) {
      data.global = [];
    }
  } catch (e) {
    console.error('❌ memory.json 읽기/파싱 실패 (fail-closed):', e.message);
    process.exit(1);
  }
}

let added = 0;
if (!data.global.includes(seed1)) {
  data.global.push(seed1);
  added++;
}
if (!data.global.includes(seed2)) {
  data.global.push(seed2);
  added++;
}

fs.writeFileSync(MEMORY_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`✅ step1_memory_seed.js 완료: 시드 ${added}건 추가 (현재 global 총 ${data.global.length}건)`);