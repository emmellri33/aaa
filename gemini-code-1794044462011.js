// TITLE: 4. blank.html G1 항상 ai-modify 경유 및 토글 ON 옵션 핸들러 확장 (step4_blank_g1_and_options.js)
const fs = require('fs');

const file = 'blank.html';
let content = fs.readFileSync(file, 'utf8');

const search = `      appendMsg("user", text + (attachedFiles.length > 0 ? \` (📎 \${attachedFiles.length}개 첨부)\` : ""));
      chatInput.value = "";
      adjustTextareaHeight();
      attachedFiles = [];
      renderAttachments();
      if (!isComplex) {
        const chatLoading = document.createElement("div");
        chatLoading.className = "msg ai";
        chatLoading.innerHTML = '<div class="avatar">G</div><div class="bubble">생각 중... (중지 가능)</div>';
        chatMessages.appendChild(chatLoading);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        currentAbortController = new AbortController();
        setPendingState(true);
        try {
          const cr = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: promptPayload, pageContext: (typeof contextText !== "undefined" ? contextText.value : ""), model: resolveModel("chat"), roomId: currentRoomId, images: imageFiles, recentTurns: buildRecentTurns() }),
            signal: currentAbortController.signal
          });
          const cd = await cr.json();
          chatLoading.remove();
          const dlCards = extractDownloadCards(promptPayload, (cd && cd.reply) || "");
          appendMsg("ai", (cd && (cd.reply || cd.error)) || "(응답 없음)", null, false, false, (cd && cd.usage) || null, dlCards.length ? { cards: dlCards } : null);
          refreshBudgetBadge(cd && cd.usage && cd.usage.dayCost);
        } catch (e) {
          chatLoading.remove();
          appendMsg("ai", e && e.name === "AbortError" ? "사용자에 의해 요청이 중지되었습니다." : "오류 발생: " + e.message);
        } finally {
          setPendingState(false);
          updateTargetPageSelect();
        }
        return;
      }

      const loadingMsg = document.createElement("div");
      loadingMsg.className = "msg ai";
      loadingMsg.innerHTML = '<div class="avatar">G</div><div class="bubble">⏳ AI가 응답을 생성하고 있습니다... (■ 중지 가능)</div>';
      chatMessages.appendChild(loadingMsg);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      currentAbortController = new AbortController();
      setPendingState(true);

      try {
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
        }
        
        try { lastAiTurn = { instruction: promptPayload, patch: (d && d.patch) || null, at: Date.now() }; } catch {}
        
        if (!d.ok || !d.patch) {
          await logFailureToServer("AI 응답 생성 실패", d.error || "JSON 파싱 실패", "자가수복 재시도");
          await requestSelfHealRetry(effectiveInstruction, d.error || "유효한 AI 응답이 아님", 1, (d && d.patch && typeof d.patch.search === "string") ? {target: d.patch.target || null, search: d.patch.search, replace: (typeof d.patch.replace === "string" ? d.patch.replace : null)} : null, promptPayload);
        } else if (d.patch.type === "question") {
          const toolBadge = d.patch.toolRounds ? \`[🔍 도구 \${d.patch.toolRounds}회] \` : "";
          let qHtml = "❓ " + toolBadge + "[의도 확인 및 답변]<br>" + escapeHtml(d.patch.question).replace(/\\n/g, "<br>");

          if (Array.isArray(d.patch.options) && d.patch.options.length > 0) {
            qHtml += '<div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">';
            d.patch.options.forEach((opt, oIdx) => {
              const label = typeof opt === "string" ? opt : (opt.label || opt.instruction);
              const sendText = typeof opt === "string" ? opt : (opt.instruction || opt.label);
              qHtml += \`<button class="small-btn primary ask-option-btn" data-send="\${encodeURIComponent(sendText)}" style="text-align:left; padding:6px 10px; font-size:12px;">\${oIdx + 1}. \${escapeHtml(label)}</button>\`;
            });
            qHtml += '</div>';
          }

          appendMsg("ai", qHtml, null, false, true, (d && d.usage) || null);

          // 옵션 버튼 클릭 이벤트 연결 (클릭 시 해당 선택지로 handleSend 재호출)
          const lastMsg = chatMessages.lastElementChild;
          if (lastMsg) {
            const optBtns = lastMsg.querySelectorAll(".ask-option-btn");
            optBtns.forEach(btn => {
              btn.onclick = () => {
                const nextInstruction = decodeURIComponent(btn.getAttribute("data-send") || "");
                if (nextInstruction) {
                  chatInput.value = nextInstruction;
                  adjustTextareaHeight();
                  handleSend(true);
                }
              };
            });
          }

          refreshBudgetBadge(d && d.usage && d.usage.dayCost);
        } else if (d.patch.type === "patch") {
          appendPatchCard(d.patch, true, effectiveInstruction, 0);
        }
      } catch (e) {
        loadingMsg.remove();
        if (e.name === "AbortError") {
          appendMsg("ai", "⏹️ 사용자에 의해 요청이 중지되었습니다.");
        } else {
          appendMsg("ai", "오류 발생: " + e.message);
        }
      } finally {
        setPendingState(false);
        updateTargetPageSelect();
      }
    }

    // ROUTER 분할2 수정: 전송은 항상 ai-modify로 — OFF여도 서버 3관이 읽기/쓰기/묻기를 가름
    sendBtn.onclick = () => handleSend(true);`;

const replace = `      appendMsg("user", text + (attachedFiles.length > 0 ? \` (📎 \${attachedFiles.length}개 첨부)\` : ""));
      chatInput.value = "";
      adjustTextareaHeight();
      attachedFiles = [];
      renderAttachments();

      // G1: OFF/ON 모두 항상 fetchAiModifyWithRetry 경유 (chat 직행 제거, 코딩 토글 상태 그대로 전달)
      const useToggleOn = (typeof isComplex === "boolean" && arguments.length > 0) ? isComplex : (codingToggleState === "ON");

      const loadingMsg = document.createElement("div");
      loadingMsg.className = "msg ai";
      loadingMsg.innerHTML = '<div class="avatar">G</div><div class="bubble">⏳ AI가 응답을 생성하고 있습니다... (■ 중지 가능)</div>';
      chatMessages.appendChild(loadingMsg);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      currentAbortController = new AbortController();
      setPendingState(true);

      try {
        const effectiveInstruction = withPrevContext(promptPayload);
        const res = await fetchAiModifyWithRetry({
          target: resolveEffectiveTarget(promptPayload),
          instruction: effectiveInstruction,
          currentContent: contextText.value,
          model: resolveModel("patch"),
          images: imageFiles,
          recentTurns: buildRecentTurns(),
          codingToggle: useToggleOn ? "ON" : "OFF"
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
            const dlCards = extractDownloadCards(promptPayload, (cd && cd.reply) || "");
            appendMsg("ai", (cd && (cd.reply || cd.error)) || "(조회 응답 없음)", null, false, false, (cd && cd.usage) || null, dlCards.length ? { cards: dlCards } : null);
            refreshBudgetBadge(cd && cd.usage && cd.usage.dayCost);
          } catch (cErr) {
            chatLoading.remove();
            appendMsg("ai", "조회 실패: " + cErr.message);
          } finally {
            setPendingState(false);
            updateTargetPageSelect();
          }
          return;
        }
        
        try { lastAiTurn = { instruction: promptPayload, patch: (d && d.patch) || null, at: Date.now() }; } catch {}
        
        if (!d.ok || !d.patch) {
          await logFailureToServer("AI 응답 생성 실패", d.error || "JSON 파싱 실패", "자가수복 재시도");
          await requestSelfHealRetry(effectiveInstruction, d.error || "유효한 AI 응답이 아님", 1, (d && d.patch && typeof d.patch.search === "string") ? {target: d.patch.target || null, search: d.patch.search, replace: (typeof d.patch.replace === "string" ? d.patch.replace : null)} : null, promptPayload);
        } else if (d.patch.type === "question") {
          const toolBadge = d.patch.toolRounds ? \`[🔍 도구 \${d.patch.toolRounds}회] \` : "";
          let qHtml = "❓ " + toolBadge + "[의도 확인 및 답변]<br>" + escapeHtml(d.patch.question).replace(/\\n/g, "<br>");

          if (Array.isArray(d.patch.options) && d.patch.options.length > 0) {
            qHtml += '<div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">';
            d.patch.options.forEach((opt, oIdx) => {
              const label = typeof opt === "string" ? opt : (opt.label || opt.instruction);
              const sendText = typeof opt === "string" ? opt : (opt.instruction != null ? opt.instruction : opt.label);
              const enableOn = (opt && typeof opt === "object" && opt.enableCoding) ? "1" : "0";
              qHtml += \`<button class="small-btn primary ask-option-btn" data-send="\${encodeURIComponent(sendText)}" data-enable-on="\${enableOn}" style="text-align:left; padding:6px 10px; font-size:12px;">\${oIdx + 1}. \${escapeHtml(label)}</button>\`;
            });
            qHtml += '</div>';
          }

          appendMsg("ai", qHtml, null, false, true, (d && d.usage) || null);

          // 옵션 버튼 클릭 이벤트 연결 (토글 켜고 진행하기 지원 및 그만두기 처리)
          const lastMsg = chatMessages.lastElementChild;
          if (lastMsg) {
            const optBtns = lastMsg.querySelectorAll(".ask-option-btn");
            optBtns.forEach(btn => {
              btn.onclick = () => {
                const nextInstruction = decodeURIComponent(btn.getAttribute("data-send") || "");
                const enableOn = btn.getAttribute("data-enable-on") === "1";
                if (!nextInstruction) {
                  appendMsg("ai", "⏹️ 작업을 취소했습니다.");
                  return;
                }
                if (enableOn && codingToggleState === "OFF") {
                  complexBtn.click();
                }
                chatInput.value = nextInstruction;
                adjustTextareaHeight();
                handleSend(codingToggleState === "ON");
              };
            });
          }

          refreshBudgetBadge(d && d.usage && d.usage.dayCost);
        } else if (d.patch.type === "patch") {
          appendPatchCard(d.patch, true, effectiveInstruction, 0);
        }
      } catch (e) {
        loadingMsg.remove();
        if (e.name === "AbortError") {
          appendMsg("ai", "⏹️ 사용자에 의해 요청이 중지되었습니다.");
        } else {
          appendMsg("ai", "오류 발생: " + e.message);
        }
      } finally {
        setPendingState(false);
        updateTargetPageSelect();
      }
    }

    // G1: 전송은 현재 코딩 토글 상태(ON/OFF)를 그대로 전달하여 항상 ai-modify를 경유
    sendBtn.onclick = () => handleSend(codingToggleState === "ON");`;

if (content.split(search).length !== 2) {
  console.error('❌ step4_blank_g1_and_options.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step4_blank_g1_and_options.js 완료');