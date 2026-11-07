// TITLE: 3. blank.html 방별 토글 저장·복원 및 기억 편집 UI __ 숨김 (step3_blank_toggle_memory.js)
const fs = require('fs');

const file = 'blank.html';
let content = fs.readFileSync(file, 'utf8');

// 1. 코딩 토글 함수 및 클릭 리스너 교체
const searchToggleClick = `    complexBtn.onclick = () => {
      codingToggleState = (codingToggleState === "OFF") ? "ON" : "OFF";
      complexBtn.innerText = (codingToggleState === "ON") ? "💻 코딩 ON" : "💻 코딩 OFF";
      complexBtn.style.background = (codingToggleState === "ON") ? "#dbeafe" : "";
      complexBtn.style.borderColor = (codingToggleState === "ON") ? "#2563eb" : "#cbd5e1";
      complexBtn.style.color = (codingToggleState === "ON") ? "#1d4ed8" : "#64748b";
    };`;

const replaceToggleClick = `    function applyCodingToggleUI(state) {
      codingToggleState = state === "ON" ? "ON" : "OFF";
      complexBtn.innerText = (codingToggleState === "ON") ? "💻 코딩 ON" : "💻 코딩 OFF";
      complexBtn.style.background = (codingToggleState === "ON") ? "#dbeafe" : "";
      complexBtn.style.borderColor = (codingToggleState === "ON") ? "#2563eb" : "#cbd5e1";
      complexBtn.style.color = (codingToggleState === "ON") ? "#1d4ed8" : "#64748b";
    }

    async function saveRoomCodingToggle(roomId, state) {
      if (!roomId) return;
      try {
        await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, codingToggle: state })
        });
      } catch {}
    }

    async function restoreRoomCodingToggle(roomId) {
      if (!roomId) return;
      try {
        const r = await fetch("/api/memory?roomId=" + encodeURIComponent(roomId));
        const d = await r.json();
        if (d.ok && d.data && d.data.rooms && Array.isArray(d.data.rooms[roomId])) {
          const item = d.data.rooms[roomId].find(x => String(x).startsWith("__codingToggle:"));
          if (item) {
            applyCodingToggleUI(item.split(":")[1]);
            return;
          }
        }
      } catch {}
      applyCodingToggleUI("OFF");
    }

    complexBtn.onclick = () => {
      const nextState = (codingToggleState === "OFF") ? "ON" : "OFF";
      applyCodingToggleUI(nextState);
      saveRoomCodingToggle(currentRoomId, nextState);
    };`;

if (content.split(searchToggleClick).length !== 2) {
  console.error('❌ step3_blank_toggle_memory.js: complexBtn.onclick 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchToggleClick, replaceToggleClick);

// 2. 방 전환/렌더 시 restoreRoomCodingToggle 호출
const searchRender = `    function renderCurrentRoomMessages() {
      const room = getCurrentRoom();
      applyRoomPin(room);`;

const replaceRender = `    function renderCurrentRoomMessages() {
      const room = getCurrentRoom();
      applyRoomPin(room);
      restoreRoomCodingToggle(room.id);`;

if (content.split(searchRender).length !== 2) {
  console.error('❌ step3_blank_toggle_memory.js: renderCurrentRoomMessages 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchRender, replaceRender);

// 3. 기억 편집 모달에서 __ 항목 숨김 (memChips 및 memoryEditor)
const searchMemModal = `        memEl.value = mData.content || JSON.stringify({ facts: [] }, null, 2);
        try { renderMemoryChips(mData.content); } catch {}`;

const replaceMemModal = `        let cleanContent = mData.content;
        try {
          const parsedData = JSON.parse(mData.content || "{}");
          if (parsedData.rooms && typeof parsedData.rooms === "object") {
            for (const k of Object.keys(parsedData.rooms)) {
              if (Array.isArray(parsedData.rooms[k])) {
                parsedData.rooms[k] = parsedData.rooms[k].filter(x => !String(x).startsWith("__"));
              }
            }
          }
          cleanContent = JSON.stringify(parsedData, null, 2);
        } catch {}
        memEl.value = cleanContent || JSON.stringify({ facts: [] }, null, 2);
        try { renderMemoryChips(cleanContent); } catch {}`;

if (content.split(searchMemModal).length !== 2) {
  console.error('❌ step3_blank_toggle_memory.js: memEl.value 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchMemModal, replaceMemModal);

// 4. renderMemoryChips 내 fl 추출 시 __ 필터링
const searchChips = `for (const k of Object.keys(scopes)) { (scopes[k] || []).forEach(f => fl.push({ scope: k, text: String(f) })); }`;
const replaceChips = `for (const k of Object.keys(scopes)) { (scopes[k] || []).filter(f => !String(f).startsWith('__')).forEach(f => fl.push({ scope: k, text: String(f) })); }`;

if (content.split(searchChips).length !== 2) {
  console.error('❌ step3_blank_toggle_memory.js: renderMemoryChips scopes 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchChips, replaceChips);

// blank.html 인라인 <script> 전 블록 문법 파싱 검증
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m, sIdx = 0;
while ((m = re.exec(content)) !== null) {
  sIdx++;
  try {
    new Function(m[1]);
  } catch (err) {
    console.error(`❌ blank.html script 블록 #${sIdx} 문법 오류:`, err.message);
    process.exit(1);
  }
}

fs.writeFileSync(file, content, 'utf8');
console.log(`✅ step3_blank_toggle_memory.js 완료 (인라인 <script> ${sIdx}개 블록 파싱 통과)`);