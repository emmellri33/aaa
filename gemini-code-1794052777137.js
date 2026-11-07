// TITLE: 3. blank.html 최적화/HANDOFF 수동 경로 및 배너 잔재 제거 (step3_blank_remove_handoff.js)
const fs = require('fs');

const file = 'blank.html';
let content = fs.readFileSync(file, 'utf8');

// 1. 헤더에서 handoffBtn 제거
const searchHeaderBtn = `      <span id="contextBadge" class="context-badge" title="추정 토큰 (글자수÷2)">맥락 0% (0 / 8000)</span>
      <button id="handoffBtn" class="handoff-btn" title="방 기록 최적화 및 memory.json 병합 · HANDOFF.md 다운로드">⚡ 최적화</button>
      <span id="keyStatus" class="status-dot" title="서버 및 API 키 상태">⚪ 확인 중</span>`;

const replaceHeaderBtn = `      <span id="contextBadge" class="context-badge" title="추정 토큰 (글자수÷2)">맥락 0% (0 / 8000)</span>
      <span id="keyStatus" class="status-dot" title="서버 및 API 키 상태">⚪ 확인 중</span>`;

if (content.split(searchHeaderBtn).length !== 2) {
  console.error('❌ step3_blank_remove_handoff.js: 헤더 handoffBtn 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchHeaderBtn, replaceHeaderBtn);

// 2. contextWarnBanner에서 [📋 요약 저장] 및 요약 저장 버튼 제거
const searchBanner = `      <div id="contextWarnBanner">
        <span>⚠️ 맥락 한도의 80%를 넘었습니다! [📋 요약 저장]을 눌러 HANDOFF.md를 만든 뒤 새 채팅 첫 메시지에 붙여넣으세요.</span>
        <button class="small-btn" onclick="document.getElementById('handoffBtn').click()">요약 저장</button>
      </div>`;

const replaceBanner = `      <div id="contextWarnBanner">
        <span>⚠️ 맥락 한도의 80%를 넘었습니다!</span>
      </div>`;

if (content.split(searchBanner).length !== 2) {
  console.error('❌ step3_blank_remove_handoff.js: contextWarnBanner 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchBanner, replaceBanner);

// 3. handoffBtn 변수 참조 제거
const searchVar = `    const contextWarnBanner = document.getElementById("contextWarnBanner");
    const handoffBtn = document.getElementById("handoffBtn");
    const clearChatBtn = document.getElementById("clearChatBtn");`;

const replaceVar = `    const contextWarnBanner = document.getElementById("contextWarnBanner");
    const clearChatBtn = document.getElementById("clearChatBtn");`;

if (content.split(searchVar).length !== 2) {
  console.error('❌ step3_blank_remove_handoff.js: handoffBtn 변수 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchVar, replaceVar);

// 4. handoffBtn.onclick 핸들러 통째 제거
const searchHandler = `    // 18. [최적화] -> 방 기록 정리 + memory.json 병합 + HANDOFF.md 다운로드 (다음 1수 + 근거 줄번호 + 막힌 지점)
    handoffBtn.onclick = async () => {
      const room = getCurrentRoom();
      const msgs = room.messages || [];
      const factsToAdd = [];
      const doneList = [];
      const todoList = [];

      msgs.forEach(m => {
        const t = String(m.text || "");
        if (m.patch) {
          const exp = (m.patch.explanation || "패치 제안").replace(/\\n/g, " / ");
          doneList.push(exp);
          factsToAdd.push(exp);
        } else if (m.role === "user") {
          todoList.push(t.slice(0, 80));
        }
      });

      // 서버 memory.json에 핵심 사실 병합
      if (factsToAdd.length > 0) {
        try {
          await fetch("/api/memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addFacts: factsToAdd, roomId: currentRoomId })
          });
        } catch {}
      }

      const lastUserReq = todoList.length > 0 ? todoList[todoList.length - 1] : "없음";
      const handoffMd = [
        "# HANDOFF (최적화 보고)",
        "",
        "## 다음 1수",
        "- " + lastUserReq + "에 대한 후속 검증 및 추가 요구사항 반영",
        "",
        "## 근거 줄번호 및 완료된 작업",
        doneList.length > 0 ? doneList.slice(-5).map(x => "- " + x).join("\\n") : "- 대화방 [" + room.name + "] 진행 내용 정리 완료",
        "",
        "## 막힌 지점",
        todoList.length > 1 ? "- 이전 검토 사항: " + todoList[todoList.length - 2] : "- 특별한 장애물 없음",
        "",
        "## 주의",
        "- .env 및 API 키/포트 설정은 절대 수정하지 말 것",
        "- search 조각은 현재 파일에 100% 존재하는 문자열만 사용할 것"
      ].join("\\n");

      try {
        await navigator.clipboard.writeText(handoffMd);
      } catch {}

      downloadFile("HANDOFF.md", encodeURIComponent(handoffMd));
      appendMsg("ai", "⚡ 대화방 최적화가 완료되었습니다. 핵심 사실이 memory.json에 병합되었고, HANDOFF.md가 다운로드 및 복사되었습니다.", null, true);
    };`;

const replaceHandler = `    // (SESSION 분할4: 수동 최적화 및 HANDOFF.md 다운로드 핸들러 삭제 — 마일스톤 자동 인계로 일원화)`;

if (content.split(searchHandler).length !== 2) {
  console.error('❌ step3_blank_remove_handoff.js: handoffBtn.onclick 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchHandler, replaceHandler);

// 5. verify-render 및 rollback 호출 시 roomId 전달
const searchVr = `                const verifyRes = await fetch("/api/verify-render", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ target: targetPage, screenshot: shotData.image })
                });`;

const replaceVr = `                const verifyRes = await fetch("/api/verify-render", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ target: targetPage, screenshot: shotData.image, roomId: _roomKey() })
                });`;

if (content.split(searchVr).length !== 2) {
  console.error('❌ step3_blank_remove_handoff.js: verify-render roomId 전달 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchVr, replaceVr);

const searchRb = `              const rbRes = await fetch("/api/rollback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: _rbT }) });`;
const replaceRb = `              const rbRes = await fetch("/api/rollback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: _rbT, roomId: _roomKey() }) });`;

if (content.split(searchRb).length !== 2) {
  console.error('❌ step3_blank_remove_handoff.js: rollback roomId 전달 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchRb, replaceRb);

// blank.html 인라인 <script> 전 블록 검사
const re = /<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi;
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
console.log(`✅ step3_blank_remove_handoff.js 완료 (인라인 <script> ${sIdx}개 블록 파싱 통과)`);