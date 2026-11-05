#!/usr/bin/env node
/**
 * patch-b4.js — B4 대화 맥락, 북마크 & 스마트 다운로드 패처
 * 규칙:
 * 1) 파일 통갈이 금지 — 앵커 1회 매치 치환
 * 2) 앵커 매치 횟수 불일치 또는 문법 검사 실패 시 즉각 중단 및 원복 (fail-closed)
 * 3) server node --check 및 blank.html <script> 전 블록 문법 검사
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FILES = {
  server: path.join(__dirname, "server.js"),
  blank: path.join(__dirname, "blank.html"),
};

const originals = {};

function abort(step, reason) {
  console.error(`\n❌ [ABORT - ${step}] ${reason}`);
  for (const [key, filePath] of Object.entries(FILES)) {
    if (typeof originals[key] === "string") {
      try {
        fs.writeFileSync(filePath, originals[key], "utf8");
      } catch (e) {
        console.error(`⚠️ 원복 실패 (${filePath}): ${e.message}`);
      }
    }
  }
  console.error("↩️ 수정된 파일 모두 원본 상태로 원복 완료.");
  process.exit(1);
}

function replaceOnce(content, oldStr, newStr, label) {
  const parts = content.split(oldStr);
  const count = parts.length - 1;
  if (count !== 1) {
    abort(label, `앵커 매치 횟수가 1회가 아닙니다 (실제 매치: ${count}회)`);
  }
  console.log(`✅ [${label}] 앵커 1회 정확 매치 및 치환 완료`);
  return parts[0] + newStr + parts[1];
}

function checkHtmlScripts(htmlContent, fileLabel) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let idx = 0;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    idx++;
    const code = match[1].trim();
    if (code) {
      try {
        new Function(code);
      } catch (e) {
        abort(`${fileLabel} <script #${idx}> 문법검사`, e.message);
      }
    }
  }
  if (idx === 0) {
    abort(`${fileLabel} <script> 검사`, "<script> 블록을 찾을 수 없습니다.");
  }
  console.log(`✅ [${fileLabel}] <script> ${idx}개 블록 문법 검사 통과`);
}

// 0. 원본 파일 로드 및 백업
for (const [key, filePath] of Object.entries(FILES)) {
  if (!fs.existsSync(filePath)) {
    abort("초기화", `대상 파일이 존재하지 않습니다: ${filePath}`);
  }
  originals[key] = fs.readFileSync(filePath, "utf8");
}

let serverTxt = originals.server;
let blankTxt = originals.blank;

// ============================================================================
// S1. #8 chat 문맥 (server.js 3곳)
// ============================================================================
const S1A_OLD = `    const { message, pageContext, model, images, roomId } = req.body || {};`;
const S1A_NEW = `    const { message, pageContext, model, images, roomId, recentTurns } = req.body || {};`;
serverTxt = replaceOnce(serverTxt, S1A_OLD, S1A_NEW, "S1a server /api/chat destructure");

const S1B_OLD = `    const pageBlock = pageContext ? "[현재 파일 내용]\\n" + String(pageContext).slice(0, 12000) + "\\n\\n" : "";
    let totalIn = 0, totalOut = 0, lastUsage = null;`;
const S1B_NEW = `    const pageBlock = pageContext ? "[현재 파일 내용]\\n" + String(pageContext).slice(0, 12000) + "\\n\\n" : "";
    const recentBlock = recentTurns ? "\\n\\n[최근 대화 (최대 4턴)]\\n" + String(recentTurns).slice(0, 2000) : "";
    let totalIn = 0, totalOut = 0, lastUsage = null;`;
serverTxt = replaceOnce(serverTxt, S1B_OLD, S1B_NEW, "S1b server /api/chat recentBlock const");

const S1C_OLD = `        "",
        memoryBlock + pageBlock + historySection,
        "",`;
const S1C_NEW = `        "",
        memoryBlock + pageBlock + recentBlock + historySection,
        "",`;
serverTxt = replaceOnce(serverTxt, S1C_OLD, S1C_NEW, "S1c server /api/chat prompt 삽입");

// ============================================================================
// S2. #8 ai-modify 문맥 (server.js 3곳)
// ============================================================================
const S2A_OLD = `    const { instruction, target, currentContent, model, images, retryError, testToolCall, mockResponses } = req.body || {};`;
const S2A_NEW = `    const { instruction, target, currentContent, model, images, retryError, recentTurns, testToolCall, mockResponses } = req.body || {};`;
serverTxt = replaceOnce(serverTxt, S2A_OLD, S2A_NEW, "S2a server /api/ai-modify destructure");

const S2B_OLD = `    const retryNote = retryError ? "\\n\\n[직전 패치 실패 사유 — 반드시 수정하여 재작성하세요]\\n" + retryError : "";`;
const S2B_NEW = `    const retryNote = retryError ? "\\n\\n[직전 패치 실패 사유 — 반드시 수정하여 재작성하세요]\\n" + retryError : "";
    const recentBlock = recentTurns ? "\\n\\n[최근 대화 (최대 4턴)]\\n" + String(recentTurns).slice(0, 2000) : "";`;
serverTxt = replaceOnce(serverTxt, S2B_OLD, S2B_NEW, "S2b server /api/ai-modify recentBlock const");

const S2C_OLD = `      const prompt = PATCH_SYSTEM_PROMPT + memoryBlock + failureNote + retryNote + codeSection + historySection + roundHint + "\\n\\n[사용자 지시]\\n" + instruction;`;
const S2C_NEW = `      const prompt = PATCH_SYSTEM_PROMPT + memoryBlock + failureNote + retryNote + recentBlock + codeSection + historySection + roundHint + "\\n\\n[사용자 지시]\\n" + instruction;`;
serverTxt = replaceOnce(serverTxt, S2C_OLD, S2C_NEW, "S2c server /api/ai-modify prompt 삽입");

// ============================================================================
// C1. B4 헬퍼 4종 (blank.html)
// ============================================================================
const C1_OLD = `    function withPrevContext(instruction) {`;
const C1_NEW = `    function saveRoomPin() {
      try {
        const r = getCurrentRoom();
        if (!r) return;
        r.target = targetPageSelect ? targetPageSelect.value : r.target;
        r.model = modelSelect ? modelSelect.value : r.model;
        saveRoomsState();
      } catch {}
    }
    function applyRoomPin(room) {
      try {
        const r = room || getCurrentRoom();
        if (r && r.target && targetPageSelect && [...targetPageSelect.options].some(o => o.value === r.target)) targetPageSelect.value = r.target;
        if (r && r.model && modelSelect && modelSelect.querySelector('option[value="' + r.model + '"]')) modelSelect.value = r.model;
      } catch {}
    }
    function buildRecentTurns() {
      try {
        const room = getCurrentRoom();
        const msgs = (room.messages || []).filter(m => !m.patch && m.text).slice(0, -1).slice(-4);
        if (!msgs.length) return "";
        return msgs.map(m => {
          const t = String(m.text);
          return (m.role === "user" ? "[user] " : "[ai] ") + t.slice(0, 500);
        }).join("\\n");
      } catch { return ""; }
    }
    function extractDownloadCards(userText, replyText) {
      try {
        if (!/(다운로드|파일로|내려받)/.test(String(userText || ""))) return [];
        const out = [];
        const re = /\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g;
        let mm;
        const extMap = { js: "js", html: "html", css: "css", py: "py", json: "json", md: "md", txt: "txt" };
        while (out.length < 3 && (mm = re.exec(String(replyText || ""))) !== null) {
          const lang = String(mm[1] || "").toLowerCase();
          const code = String(mm[2] || "").trim().slice(0, 4000);
          if (!code) continue;
          out.push({ filename: "gemgem-생성파일-" + (out.length + 1) + "." + (extMap[lang] || "txt"), content: code });
        }
        return out;
      } catch { return []; }
    }
    function withPrevContext(instruction) {`;
blankTxt = replaceOnce(blankTxt, C1_OLD, C1_NEW, "C1 blank helpers 삽입");

// ============================================================================
// C2. appendMsg 확장 (blank.html)
// ============================================================================
const C2_OLD = `    function appendMsg(role, text, fileData = null, skipSave = false, isRawHtml = false, usage = null) {
      const msgDiv = document.createElement("div");
      msgDiv.className = \`msg \${role}\`;

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.innerText = role === "user" ? "U" : "G";

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = isRawHtml ? text : escapeHtml(text).replace(/\\n/g, "<br>");

      if (fileData) {
        const card = document.createElement("div");
        card.className = "file-card";
        card.innerHTML = \`
          <div><strong>📄 \${escapeHtml(fileData.filename)}</strong><div style="font-size:11px;color:#64748b;">생성된 파일</div></div>
          <button onclick="downloadFile('\${escapeHtml(fileData.filename)}', \\\`\${encodeURIComponent(fileData.content)}\\\`)">📥 다운로드</button>
        \`;
        bubble.appendChild(card);
      }

      if (role === "ai" && usage && (usage.inEst != null || usage.inHi != null)) {
        const badge = document.createElement("div");
        badge.className = "usage-badge";
        const iu = usage.inEst != null ? usage.inEst : usage.inHi;
        const ou = usage.outEst != null ? usage.outEst : usage.outHi;
        badge.innerText = \`🔢 약 \${Number(iu || 0) + Number(ou || 0)} tok · \${usage.model || ""}\`;
        bubble.appendChild(badge);
      }

      msgDiv.appendChild(avatar);
      msgDiv.appendChild(bubble);
      chatMessages.appendChild(msgDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      if (!skipSave) {
        const room = getCurrentRoom();
        room.messages.push({ role, text, fileData, isHtml: isRawHtml, usage: usage || undefined });
        saveRoomsState();
      }
    }`;

const C2_NEW = `    function appendMsg(role, text, fileData = null, skipSave = false, isRawHtml = false, usage = null, x = null) {
      const msgDiv = document.createElement("div");
      msgDiv.className = \`msg \${role}\`;

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.innerText = role === "user" ? "U" : "G";

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.innerHTML = isRawHtml ? text : escapeHtml(text).replace(/\\n/g, "<br>");

      if (fileData) {
        const card = document.createElement("div");
        card.className = "file-card";
        card.innerHTML = \`
          <div><strong>📄 \${escapeHtml(fileData.filename)}</strong><div style="font-size:11px;color:#64748b;">생성된 파일</div></div>
          <button onclick="downloadFile('\${escapeHtml(fileData.filename)}', \\\`\${encodeURIComponent(fileData.content)}\\\`)">📥 다운로드</button>
        \`;
        bubble.appendChild(card);
      }

      let rec = (x && x.rec) || null;
      const cards = (x && x.cards) || (rec && rec.files) || null;
      if (cards && cards.length) {
        cards.slice(0, 3).forEach(f => {
          const card = document.createElement("div");
          card.className = "file-card";
          card.innerHTML = \`
            <div><strong>📄 \${escapeHtml(f.filename)}</strong><div style="font-size:11px;color:#64748b;">생성된 파일</div></div>
            <button>📥 다운로드</button>
          \`;
          card.querySelector("button").onclick = () => downloadFile(f.filename, encodeURIComponent(f.content));
          bubble.appendChild(card);
        });
      }

      if (role === "ai" && usage && (usage.inEst != null || usage.inHi != null)) {
        const badge = document.createElement("div");
        badge.className = "usage-badge";
        const iu = usage.inEst != null ? usage.inEst : usage.inHi;
        const ou = usage.outEst != null ? usage.outEst : usage.outHi;
        badge.innerText = \`🔢 약 \${Number(iu || 0) + Number(ou || 0)} tok · \${usage.model || ""}\`;
        bubble.appendChild(badge);
      }

      if (role === "ai") {
        const pb = document.createElement("button");
        pb.className = "small-btn";
        pb.style.cssText = "margin-top:6px;font-size:11px;";
        pb.innerText = "🛠️ Complex로 승격";
        pb.onclick = () => { chatInput.value = text; adjustTextareaHeight(); chatInput.focus(); };
        bubble.appendChild(pb);
      }

      const star = document.createElement("button");
      star.className = "small-btn";
      star.style.cssText = "float:right;font-size:12px;border:none;background:transparent;cursor:pointer;";
      star.title = "북마크";
      star.innerText = (rec && rec.bookmark) ? "★" : "☆";
      star.onclick = () => {
        if (!rec) return;
        rec.bookmark = !rec.bookmark;
        try { saveRoomsState(); } catch {}
        star.innerText = rec.bookmark ? "★" : "☆";
      };
      bubble.insertBefore(star, bubble.firstChild);

      msgDiv.appendChild(avatar);
      msgDiv.appendChild(bubble);
      chatMessages.appendChild(msgDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      if (!skipSave) {
        const room = getCurrentRoom();
        if (!rec) rec = { role, text, fileData, isHtml: isRawHtml, usage: usage || undefined, bookmark: false };
        if (cards && cards.length && !rec.files) rec.files = cards;
        room.messages.push(rec);
        saveRoomsState();
      }
    }`;
blankTxt = replaceOnce(blankTxt, C2_OLD, C2_NEW, "C2 blank appendMsg 확장 (승격버튼, 북마크, 다운로드 카드)");

// ============================================================================
// C3. 방 렌더 교체 (blank.html)
// ============================================================================
const C3_OLD = `    function renderCurrentRoomMessages() {
      const room = getCurrentRoom();
      currentRoomBadge.innerText = "💬 " + room.name;
      chatMessages.innerHTML = "";
      (room.messages || []).forEach(m => {
        if (m.patch) {
          appendPatchCard(m.patch, false);
        } else {
          appendMsg(m.role, m.text, m.fileData || null, true, m.isHtml === true, m.usage);
        }
      });
      updateContextCounter();
    }`;
const C3_NEW = `    function renderCurrentRoomMessages() {
      const room = getCurrentRoom();
      applyRoomPin(room);
      currentRoomBadge.innerText = "💬 " + room.name;
      chatMessages.innerHTML = "";
      const onlyBmk = !!window.__bmkOnly;
      (room.messages || []).forEach(m => {
        if (onlyBmk && !m.bookmark) return;
        if (m.patch) {
          appendPatchCard(m.patch, false);
        } else {
          appendMsg(m.role, m.text, m.fileData || null, true, m.isHtml === true, m.usage, { rec: m });
        }
      });
      updateContextCounter();
    }`;
blankTxt = replaceOnce(blankTxt, C3_OLD, C3_NEW, "C3 blank renderCurrentRoomMessages 교체 (Pin/북마크 필터)");

// ============================================================================
// C4. 방 이동 전 저장 (blank.html)
// ============================================================================
const C4_OLD = `          moveBtn.onclick = () => {
            r.archived = false;
            currentRoomId = r.id;`;
const C4_NEW = `          moveBtn.onclick = () => {
            saveRoomPin();
            r.archived = false;
            currentRoomId = r.id;`;
blankTxt = replaceOnce(blankTxt, C4_OLD, C4_NEW, "C4 blank 방 이동 전 saveRoomPin 호출");

// ============================================================================
// C5. 타깃 변경 저장 (blank.html)
// ============================================================================
const C5_OLD = `    targetPageSelect.onchange = () => {
      const target = targetPageSelect.value;
      const frame = document.getElementById("indexPreview");
      if (frame) {
        try { frame.removeAttribute("srcdoc"); } catch {}
        frame.src = target + "?t=" + Date.now();
      }
      loadIndexCode();
    };`;
const C5_NEW = `    targetPageSelect.onchange = () => {
      const target = targetPageSelect.value;
      const frame = document.getElementById("indexPreview");
      if (frame) {
        try { frame.removeAttribute("srcdoc"); } catch {}
        frame.src = target + "?t=" + Date.now();
      }
      loadIndexCode();
      saveRoomPin();
    };`;
blankTxt = replaceOnce(blankTxt, C5_OLD, C5_NEW, "C5 blank 타깃 변경 시 saveRoomPin 호출");

// ============================================================================
// C6. 모델 변경 핸들러 신설 (blank.html)
// ============================================================================
const C6_OLD = `    // 기본 모델(gemini-3.5-flash-lite) 선택
    if (modelSelect.querySelector('option[value="gemini-3.5-flash-lite"]')) {
      modelSelect.value = "gemini-3.5-flash-lite";
    }`;
const C6_NEW = `    // 기본 모델(gemini-3.5-flash-lite) 선택
    if (modelSelect.querySelector('option[value="gemini-3.5-flash-lite"]')) {
      modelSelect.value = "gemini-3.5-flash-lite";
    }
    modelSelect.onchange = () => { saveRoomPin(); };`;
blankTxt = replaceOnce(blankTxt, C6_OLD, C6_NEW, "C6 blank 모델 변경 핸들러 신설");

// ============================================================================
// C7. chat payload 문맥 전송 (blank.html)
// ============================================================================
const C7_OLD = `          const cr = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: promptPayload, pageContext: (typeof contextText !== "undefined" ? contextText.value : ""), model: modelSelect.value, roomId: currentRoomId, images: imageFiles }),
            signal: currentAbortController.signal
          });`;
const C7_NEW = `          const cr = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: promptPayload, pageContext: (typeof contextText !== "undefined" ? contextText.value : ""), model: modelSelect.value, roomId: currentRoomId, images: imageFiles, recentTurns: buildRecentTurns() }),
            signal: currentAbortController.signal
          });`;
blankTxt = replaceOnce(blankTxt, C7_OLD, C7_NEW, "C7 blank /api/chat에 recentTurns 추가");

// ============================================================================
// C8. ai-modify payload 문맥 전송 (blank.html)
// ============================================================================
const C8_OLD = `        const res = await fetchAiModifyWithRetry({
          target: __explicitTarget(effectiveInstruction) || (targetPageSelect ? targetPageSelect.value: "index.html"),
          instruction: effectiveInstruction,
          currentContent: contextText.value,
          model: modelSelect.value,
          images: imageFiles
        }, currentAbortController.signal);`;
const C8_NEW = `        const res = await fetchAiModifyWithRetry({
          target: __explicitTarget(effectiveInstruction) || (targetPageSelect ? targetPageSelect.value: "index.html"),
          instruction: effectiveInstruction,
          currentContent: contextText.value,
          model: modelSelect.value,
          images: imageFiles,
          recentTurns: buildRecentTurns()
        }, currentAbortController.signal);`;
blankTxt = replaceOnce(blankTxt, C8_OLD, C8_NEW, "C8 blank /api/ai-modify에 recentTurns 추가");

// ============================================================================
// C9. 채팅 응답 카드 추출 및 연결 (blank.html)
// ============================================================================
const C9_OLD = `          const cd = await cr.json();
          chatLoading.remove();
          appendMsg("ai", (cd && (cd.reply || cd.error)) || "(응답 없음)", null, false, false, (cd && cd.usage) || null);
          refreshBudgetBadge(cd && cd.usage && cd.usage.dayHi);`;
const C9_NEW = `          const cd = await cr.json();
          chatLoading.remove();
          const dlCards = extractDownloadCards(promptPayload, (cd && cd.reply) || "");
          appendMsg("ai", (cd && (cd.reply || cd.error)) || "(응답 없음)", null, false, false, (cd && cd.usage) || null, dlCards.length ? { cards: dlCards } : null);
          refreshBudgetBadge(cd && cd.usage && cd.usage.dayHi);`;
blankTxt = replaceOnce(blankTxt, C9_OLD, C9_NEW, "C9 blank 채팅 응답 카드(다운로드) 연결");

// ============================================================================
// C12. 새 방 pin 계승 (blank.html)
// ============================================================================
const C12_OLD = `      const newRoom = {
        id: "room_" + Date.now(),
        name: (name && name.trim()) ? name.trim() : ("대화방 " + (rooms.length + 1)),
        baselineOffset: 0,
        messages: [],
        archived: false
      };`;
const C12_NEW = `      const newRoom = {
        id: "room_" + Date.now(),
        name: (name && name.trim()) ? name.trim() : ("대화방 " + (rooms.length + 1)),
        baselineOffset: 0,
        messages: [],
        archived: false,
        target: targetPageSelect ? targetPageSelect.value : undefined,
        model: modelSelect ? modelSelect.value : undefined
      };`;
blankTxt = replaceOnce(blankTxt, C12_OLD, C12_NEW, "C12 blank 새 방 생성 시 pin(target, model) 계승");

// ============================================================================
// C10. 칩 바 DOM (blank.html)
// ============================================================================
const C10_OLD = `      <div class="input-wrapper">
        <div class="input-box">`;
const C10_NEW = `      <div class="input-wrapper">
        <div id="promptChips" style="display:flex;gap:6px;padding:6px 10px 0;flex-wrap:wrap;"></div>
        <div class="input-box">`;
blankTxt = replaceOnce(blankTxt, C10_OLD, C10_NEW, "C10 blank promptChips 래퍼 추가");

// ============================================================================
// C11. 칩 + 필터 배선 (blank.html)
// ============================================================================
const C11_OLD = `    sendBtn.onclick = () => handleSend(false);`;
const C11_NEW = `    sendBtn.onclick = () => handleSend(false);
    ["다크모드 점검", "모바일 깨짐 확인", "방금 패치 원인 분석"].forEach(c => {
      const b = document.createElement("button");
      b.className = "small-btn";
      b.style.cssText = "font-size:11px;";
      b.innerText = c;
      b.onclick = () => { chatInput.value = c; adjustTextareaHeight(); chatInput.focus(); };
      document.getElementById("promptChips").appendChild(b);
    });
    document.getElementById("bookmarkFilterBtn").onclick = (e) => {
      window.__bmkOnly = !window.__bmkOnly;
      e.target.innerText = window.__bmkOnly ? "★ 북마크만" : "☆ 북마크만";
      renderCurrentRoomMessages();
    };`;
blankTxt = replaceOnce(blankTxt, C11_OLD, C11_NEW, "C11 blank 프롬프트 칩 및 북마크 필터 핸들러 추가");

// ============================================================================
// C13. 필터 버튼 DOM (blank.html)
// ============================================================================
const C13_OLD = `        <span id="budgetBadge" hidden style="font-size:12px;font-weight:700;color:#fff;background:#f59e0b;border-radius:12px;padding:4px 10px;"></span>
        <button id="clearChatBtn" class="small-btn danger" style="margin-left:auto;" title="현재 대화방 기록 지우기">🗑️ 지우기</button>`;
const C13_NEW = `        <span id="budgetBadge" hidden style="font-size:12px;font-weight:700;color:#fff;background:#f59e0b;border-radius:12px;padding:4px 10px;"></span>
        <button id="bookmarkFilterBtn" class="small-btn" title="북마크한 메시지만 보기">☆ 북마크만</button>
        <button id="clearChatBtn" class="small-btn danger" style="margin-left:auto;" title="현재 대화방 기록 지우기">🗑️ 지우기</button>`;
blankTxt = replaceOnce(blankTxt, C13_OLD, C13_NEW, "C13 blank 북마크 필터 버튼 DOM 추가");

// ============================================================================
// 파일 쓰기 및 문법 검증
// ============================================================================
try {
  fs.writeFileSync(FILES.server, serverTxt, "utf8");
  fs.writeFileSync(FILES.blank, blankTxt, "utf8");
} catch (writeErr) {
  abort("파일 저장", writeErr.message);
}

// 1) server.js: node --check
try {
  execFileSync(process.execPath, ["--check", FILES.server], { stdio: "pipe" });
  console.log("✅ [server.js] node --check 통과");
} catch (chkErr) {
  const stderr = chkErr.stderr ? chkErr.stderr.toString() : chkErr.message;
  abort("server.js node --check", stderr);
}

// 2) blank.html: <script> 전 블록 문법 검사
checkHtmlScripts(blankTxt, "blank.html");

console.log("\n🎉 B4 패치 적용 및 전 항목 문법 검증 완료!");
