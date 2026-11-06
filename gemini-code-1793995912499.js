// TITLE: 3b. lite 분류 실호출부 추가 (step3b_lite_invoke.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    const ai = activeKey ? new GoogleGenAI({ apiKey: activeKey }) : null;
    const seenSignatures = new Set();
    const toolHistoryBlocks = [];`;

const replace = `    const ai = activeKey ? new GoogleGenAI({ apiKey: activeKey }) : null;
    
    // --- ROUTER 분할3: 4단계 lite 분류 실호출 ---
    if (isUndecided) {
      try {
        const c2RoomId = (req.body && req.body.roomId && String(req.body.roomId).trim()) || "-";
        // TODO(소유분할): SESSION 방 id 연동
        const metaLine = \`방:\${c2RoomId} 토글:\${codingToggle} 타겟:\${targetFile}\`;
        const liteInput = instruction.length > 2000 ? instruction.slice(0, 2000) : instruction;
        const litePrompt = ROUTER_LITE_PROMPT + "\\n\\n[메타]\\n" + metaLine + "\\n\\n[요청]\\n" + liteInput;

        if (!ai) throw new Error("키 미설정");
        
        const liteResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash-lite",
          contents: [{ role: "user", parts: [{ text: litePrompt }] }],
        });
        
        const liteRaw = (liteResponse && liteResponse.text) ? liteResponse.text : "{}";
        let liteJson = {};
        try { liteJson = JSON.parse(extractJsonString(liteRaw)); } catch (e) { liteJson = {}; }
        
        let liteR = liteJson.r;
        const liteWhy = liteJson.why || "분석 불가";
        const liteConf = liteJson.conf || "low";
        let promoted = false;

        if (!["가벼움", "패치", "질문"].includes(liteR) || liteConf === "low") {
          liteR = "질문";
          promoted = true;
        }

        // TODO(소유분할): 분류기 사용량(lite) 본작업과 분리 계산 상수명 사용
        console.log(\`ROUTER LITE LOG: r=\${liteR}, why=\${liteWhy}, conf=\${liteConf}, 승격=\${promoted}, 팩=\${liteR}팩, 입력길이=\${liteInput.length}\`);

        if (liteR === "가벼움") {
           // TODO(소유분할): b-가벼움 부착 시 /api/chat 호출 인자 처리
           return res.json({ ok: true, route: "read", reason: "lite 판정: 가벼움" });
        } else if (liteR === "질문") {
           console.log("ROUTER pipe: [질문] lite 판정으로 질문 승격 -> 즉시 반환 (추측 패치 방지)");
           const askCard = {
             type: "question",
             question: "[의도 확인] " + liteWhy + "\\n무엇을 어떻게 바꿀지 더 구체적으로 알려주시겠어요?"
           };
           return res.json({ ok: true, result: JSON.stringify(askCard), patch: askCard, toolRounds: 0 });
        } else {
           appliedBPack = BPACK_PATCH;
           routerDecisionLog = \`모드: 패치 (라우터: 패치, 신뢰도 \${liteConf})\`;
        }
      } catch (e) {
        console.error("lite 분류 오류:", e.message);
        const askCard = {
           type: "question",
           question: "[의도 확인] 요청 분류 중 오류가 발생했습니다.\\n무엇을 어떻게 바꿀지 다시 한 번 알려주시겠어요?"
        };
        return res.json({ ok: true, result: JSON.stringify(askCard), patch: askCard, toolRounds: 0 });
      }
    }

    const seenSignatures = new Set();
    const toolHistoryBlocks = [];`;

if (content.split(search).length !== 2) {
  console.error('❌ 블록 3b 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ 3b. step3b_lite_invoke.js 완료');