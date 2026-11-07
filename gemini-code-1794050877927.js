// TITLE: 2. server.js /api/ai-modify 방 입장 목차 동봉 및 복귀 대조 fp 배선 (step2_server_session_context.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

// 1. 목차 읽기 및 복귀 대조
const searchContext = `    const facts = readMemoryFacts(req.body ? req.body.roomId : null);
    const memoryBlock = facts.length > 0 ? "\\n\\n[공유 기억 (memory.json)]\\n- " + facts.join("\\n- ") : "";`;

const replaceContext = `    const facts = readMemoryFacts(req.body ? req.body.roomId : null);
    const memoryBlock = facts.length > 0 ? "\\n\\n[공유 기억 (memory.json)]\\n- " + facts.join("\\n- ") : "";

    // --- SESSION 분할3: 방 입장 목차 읽기 및 복귀 대조 (fp) ---
    const sessionRoomId = sanitizeSessionRoomId((req.body && req.body.roomId && String(req.body.roomId).trim()) || "global") || "global";
    let fullSession = readSessionFile();
    let sessionSection = getRoomSection(fullSession, sessionRoomId);

    const currentFp = calcSessionFp();
    const sessionLines = sessionSection.split('\\n').map(l => l.trim()).filter(Boolean);
    let latestFp = null;
    for (const line of sessionLines) {
      const fpMatch = line.match(/\\[fp:([a-f0-9]{8})\\]/);
      if (fpMatch) {
        latestFp = fpMatch[1];
        break;
      }
    }

    if (latestFp && latestFp !== currentFp) {
      const topLine = sessionLines[0] || "";
      // 해석 ③: 섹션 맨 위 줄이 같은 새값의 불일치 보고면 중복 기록 생략
      if (!(topLine.startsWith("# [복귀]") && topLine.includes(\`디스크 fp \${currentFp}\`))) {
        const today = new Date().toISOString().slice(0, 10);
        const mismatchLine = \`# [복귀] (\${today}) [진행]: 기록과 현실 불일치: 디스크 fp \${currentFp} (기록 \${latestFp}) → 다음 요청 시 fp 갱신\`;
        updateRoomSection(fullSession, sessionRoomId, (secBody) => {
          const lines = secBody.split('\\n').map(l => l.trim()).filter(l => l.startsWith('# '));
          lines.unshift(mismatchLine);
          return '\\n' + lines.join('\\n') + '\\n';
        });
        fullSession = readSessionFile();
        sessionSection = getRoomSection(fullSession, sessionRoomId);
      }
    }

    const sessionBlock = sessionSection ? ("\\n\\n[방 작업 목차 (session.md)]\\n" + sessionSection) : "";`;

if (content.split(searchContext).length !== 2) {
  console.error('❌ step2_server_session_context.js: sessionBlock 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchContext, replaceContext);

// 2. metaLine 연동
const searchMeta = `        const c2RoomId = (req.body && req.body.roomId && String(req.body.roomId).trim()) || "-";
        // TODO(소유분할): SESSION 방 id 연동
        const metaLine = \`방:\${c2RoomId} 토글:\${codingToggle} 타겟:\${targetFile}\`;`;

const replaceMeta = `        const metaLine = \`방:\${sessionRoomId} 토글:\${codingToggle} 타겟:\${targetFile}\`;`;

if (content.split(searchMeta).length !== 2) {
  console.error('❌ step2_server_session_context.js: metaLine 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchMeta, replaceMeta);

// 3. feasPrompt에 sessionBlock 동봉 (memoryBlock 뒤)
const searchFeas = `const feasPrompt = feasTargetHeader + PATCH_SYSTEM_PROMPT + "\\n[현재 라우터 판정]\\n" + feasDecision + "\\n\\n[적용 설명서(b팩)]\\n" + BPACK_FEASIBILITY + memoryBlock + recentBlock + "\\n\\n" + feasCodeBlock + "\\n\\n[사용자 지시]\\n" + signalText;`;
const replaceFeas = `const feasPrompt = feasTargetHeader + PATCH_SYSTEM_PROMPT + "\\n[현재 라우터 판정]\\n" + feasDecision + "\\n\\n[적용 설명서(b팩)]\\n" + BPACK_FEASIBILITY + memoryBlock + sessionBlock + recentBlock + "\\n\\n" + feasCodeBlock + "\\n\\n[사용자 지시]\\n" + signalText;`;

if (content.split(searchFeas).length !== 2) {
  console.error('❌ step2_server_session_context.js: feasPrompt 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchFeas, replaceFeas);

// 4. 최종 prompt에 sessionBlock 동봉 (memoryBlock 뒤)
const searchPrompt = `const prompt = targetHeader + assembledPrompt + memoryBlock + failureNote + retryNote + recentBlock + codeSection + historySection + roundHint + "\\n\\n[사용자 지시]\\n" + instruction;`;
const replacePrompt = `const prompt = targetHeader + assembledPrompt + memoryBlock + sessionBlock + failureNote + retryNote + recentBlock + codeSection + historySection + roundHint + "\\n\\n[사용자 지시]\\n" + instruction;`;

if (content.split(searchPrompt).length !== 2) {
  console.error('❌ step2_server_session_context.js: prompt 앵커 불일치 (fail-closed)');
  process.exit(1);
}
content = content.replace(searchPrompt, replacePrompt);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ step2_server_session_context.js 완료');