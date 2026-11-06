// TITLE: 3. blank.html handleSend 코딩 토글 연동 및 read 파이프 이음 (step3_blank_handle_send.js)
const fs = require('fs');

const file = 'blank.html';
const content = fs.readFileSync(file, 'utf8');

const search = `      try {
        const effectiveInstruction = withPrevContext(promptPayload);
        const res = await fetchAiModifyWithRetry({
          target: resolveEffectiveTarget(promptPayload),
          instruction: effectiveInstruction,
          currentContent: contextText.value,
          model: resolveModel("patch"),
          images: imageFiles,
          recentTurns: buildRecentTurns()
        }, currentAbortController.signal);
        
        const d = await res.json();
        loadingMsg.remove();`;

const replace = `      try {
        const effectiveInstruction = withPrevContext(promptPayload);
        const res = await fetchAiModifyWithRetry({
          target: resolveEffectiveTarget(promptPayload),
          instruction: effectiveInstruction,
          currentContent: contextText.value,
          model: resolveModel("patch"),
          images: imageFiles,
          recentTurns: buildRecentTurns(),
          codingToggle: isComplex ? "ON" : "OFF"
        }, currentAbortController.signal);
        
        const d = await res.json();
        loadingMsg.remove();

        // ROUTER 분할2: 읽기 파이프 이음 (route === "read" 이면 기존 /api/chat 1회 호출로 연결)
        if (d && d.ok && d.route === "read") {
          const chatLoading = document.createElement("div");
          chatLoading.className = "msg ai";
          chatLoading.innerHTML = '<div class="avatar">G</div><div class="bubble">📖 조회 요청 처리 중...</div>';
          chatMessages.appendChild(chatLoading);
          chatMessages.scrollTop = chatMessages.scrollHeight;
          try {
            const cr = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: promptPayload,
                pageContext: (typeof contextText !== "undefined" ? contextText.value : ""),
                model: resolveModel("chat"),
                roomId: currentRoomId,
                images: imageFiles,
                recentTurns: buildRecentTurns()
              }),
              signal: currentAbortController ? currentAbortController.signal : undefined
            });
            const cd = await cr.json();
            chatLoading.remove();
            appendMsg("ai", (cd && (cd.reply || cd.error)) || "(조회 응답 없음)", null, false, false, (cd && cd.usage) || null);
            refreshBudgetBadge(cd && cd.usage && cd.usage.dayCost);
          } catch (cErr) {
            chatLoading.remove();
            appendMsg("ai", "조회 실패: " + cErr.message);
          } finally {
            setPendingState(false);
            updateTargetPageSelect();
          }
          return;
        }`;

if (content.split(search).length !== 2) {
  console.error('❌ step3_blank_handle_send.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step3_blank_handle_send.js 적용 완료');