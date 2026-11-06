// TITLE: 5. blank.html 묻기 옵션 버튼 렌더링 및 클릭 재호출 확장 (step5_blank_ask_ui.js)
const fs = require('fs');

const file = 'blank.html';
const content = fs.readFileSync(file, 'utf8');

const search = `        } else if (d.patch.type === "question") {
          const toolBadge = d.patch.toolRounds ? \`[🔍 도구 \${d.patch.toolRounds}회] \` : "";
          appendMsg("ai", \`❓ \${toolBadge}[의도 확인 및 답변]\\n\${d.patch.question}\`, null, false, false, (d && d.usage) || null);
          refreshBudgetBadge(d && d.usage && d.usage.dayCost);
        } else if (d.patch.type === "patch") {`;

const replace = `        } else if (d.patch.type === "question") {
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
                  handleSend(codingToggleState === "ON");
                }
              };
            });
          }

          refreshBudgetBadge(d && d.usage && d.usage.dayCost);
        } else if (d.patch.type === "patch") {`;

if (content.split(search).length !== 2) {
  console.error('❌ step5_blank_ask_ui.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step5_blank_ask_ui.js 적용 완료');