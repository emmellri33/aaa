#!/usr/bin/env node
/**
 * patch-b3.js — B3 실시간 토큰 가시화 및 사용량 보정 패처
 * 규칙:
 * 1) 파일 통갈이 금지 — 앵커 1회 매치 치환
 * 2) 앵커 매치 횟수 불일치 또는 문법 검사 실패 시 즉각 중단 및 원복 (fail-closed)
 * 3) server node --check 및 blank.html / cockpit.html <script> 전 블록 문법 검사
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FILES = {
  server: path.join(__dirname, "server.js"),
  blank: path.join(__dirname, "blank.html"),
  cockpit: path.join(__dirname, "cockpit.html"),
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
  console.error("↩️ 수정된 3개 파일 모두 원본 상태로 원복 완료.");
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
let cockpitTxt = originals.cockpit;


// ============================================================================
// F1. #3 캘리브레이션 + 응답확장 (server.js 5곳)
// ============================================================================

// F1-1 헬퍼 삽입
const F1_1_OLD = `function logUsageCall({ route, model, inChars, outChars, inTok, outTok }) {`;
const F1_1_NEW = `const CALIB_DEFAULT_IN = 0.25, CALIB_DEFAULT_OUT = 0.25;
function readCalibFactors() {
  try {
    if (!fs.existsSync(USAGE_LOG_PATH)) return { in: CALIB_DEFAULT_IN, out: CALIB_DEFAULT_OUT, n: 0 };
    const lines = fs.readFileSync(USAGE_LOG_PATH, "utf8").split("\\n").filter(Boolean);
    for (const l of lines) {
      if (l.startsWith("#CALIB ")) {
        try {
          const p = JSON.parse(l.slice(7));
          const fi = Number(p.in), fo = Number(p.out), nn = Math.max(0, Math.floor(Number(p.n) || 0));
          if (fi > 0.01 && fi < 5 && fo > 0.01 && fo < 5) return { in: fi, out: fo, n: nn };
        } catch (e) {}
        break;
      }
    }
  } catch (e) {}
  return { in: CALIB_DEFAULT_IN, out: CALIB_DEFAULT_OUT, n: 0 };
}
function logUsageCall({ route, model, inChars, outChars, inTok, outTok }) {`;
serverTxt = replaceOnce(serverTxt, F1_1_OLD, F1_1_NEW, "F1-1 server 캘리브레이션 헬퍼 삽입");

// F1-2 summary 확장
const F1_2_OLD = `  const summary = { model: String(model || GEMINI_MODEL), inLo, inHi, outLo, outHi };`;
const F1_2_NEW = `  const summary = { model: String(model || GEMINI_MODEL), inLo, inHi, outLo, outHi };
  const calibNow = readCalibFactors();
  summary.inEst = Math.max(1, Math.round(inC * calibNow.in));
  summary.outEst = Math.max(1, Math.round(outC * calibNow.out));
  let calibWrite = calibNow;
  if (Number(inTok) > 0 && Number(outTok) > 0 && inC > 20 && outC > 0) {
    const rIn = Math.min(2, Math.max(0.05, Number(inTok) / inC));
    const rOut = Math.min(2, Math.max(0.05, Number(outTok) / outC));
    const w = Math.min(0.3, 1 / (calibNow.n + 1));
    calibWrite = { in: calibNow.in * (1 - w) + rIn * w, out: calibNow.out * (1 - w) + rOut * w, n: calibNow.n + 1 };
  }`;
serverTxt = replaceOnce(serverTxt, F1_2_OLD, F1_2_NEW, "F1-2 server summary 확장 및 가중치 갱신");

// F1-3 당일 누적
const F1_3_OLD = `    const entry = JSON.stringify({`;
const F1_3_NEW = `    const _dk = new Date().toISOString().slice(0, 10);
    const _db = (totals.byDay && totals.byDay[_dk]) || {};
    summary.dayHi = (Number(_db.inHi) || 0) + (Number(_db.outHi) || 0);
    const entry = JSON.stringify({`;
serverTxt = replaceOnce(serverTxt, F1_3_OLD, F1_3_NEW, "F1-3 server summary.dayHi 당일 누적");

// F1-4 #행 읽기 제외 (실제 server.js 8칸/6칸 공백 기준)
const F1_4_OLD = `        rawLines = lines.slice(1);
      } else {
        rawLines = lines;
      }`;
const F1_4_NEW = `        rawLines = lines.slice(1).filter(l => !l.startsWith("#"));
      } else {
        rawLines = lines.filter(l => !l.startsWith("#"));
      }`;
serverTxt = replaceOnce(serverTxt, F1_4_OLD, F1_4_NEW, "F1-4 server usage.log 주석(#) 라인 필터링");

// F1-5 쓰기 시 #CALIB 2행 저장
const F1_5_OLD = `    const outContent = "#TOTALS " + JSON.stringify(totals) + "\\n" + rawLines.join("\\n") + "\\n";`;
const F1_5_NEW = `    const outContent = "#TOTALS " + JSON.stringify(totals) + "\\n" + "#CALIB " + JSON.stringify({ in: calibWrite.in, out: calibWrite.out, n: calibWrite.n }) + "\\n" + rawLines.join("\\n") + "\\n";`;
serverTxt = replaceOnce(serverTxt, F1_5_OLD, F1_5_NEW, "F1-5 server usage.log #CALIB 2행 저장");


// ============================================================================
// F2. 콕핏 리더 호환 (cockpit.html 1곳)
// ============================================================================

// F2-1 #CALIB 스킵
const F2_1_OLD = `        if (lines[0].startsWith("#TOTALS ")) {
          try { totals = JSON.parse(lines[0].slice(8)); } catch (e) {}
          rawLines = lines.slice(1);
        }`;
const F2_1_NEW = `        if (lines[0].startsWith("#TOTALS ")) {
          try { totals = JSON.parse(lines[0].slice(8)); } catch (e) {}
          rawLines = lines.slice(1).filter(l => !l.startsWith("#"));
        } else {
          rawLines = lines.filter(l => !l.startsWith("#"));
        }`;
cockpitTxt = replaceOnce(cockpitTxt, F2_1_OLD, F2_1_NEW, "F2-1 cockpit #CALIB 스킵 처리");


// ============================================================================
// F3. #2 말풍선 배지 (blank.html 5곳)
// ============================================================================

// F3-1 배지 CSS
const F3_1_OLD = `    .msg.ai .bubble { background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 4px; border: 1px solid #e2e8f0; }`;
const F3_1_NEW = `    .msg.ai .bubble { background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 4px; border: 1px solid #e2e8f0; }
    .usage-badge { display: block; text-align: right; font-size: 10px; color: #94a3b8; margin-top: 6px; }`;
blankTxt = replaceOnce(blankTxt, F3_1_OLD, F3_1_NEW, "F3-1 blank usage-badge CSS 추가");

// F3-2 appendMsg 교체
const F3_2_OLD = `    function appendMsg(role, text, fileData = null, skipSave = false, isRawHtml = false) {
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

      msgDiv.appendChild(avatar);
      msgDiv.appendChild(bubble);
      chatMessages.appendChild(msgDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      if (!skipSave) {
        const room = getCurrentRoom();
        room.messages.push({ role, text, fileData, isHtml: isRawHtml });
        saveRoomsState();
      }
    }`;

const F3_2_NEW = `    function appendMsg(role, text, fileData = null, skipSave = false, isRawHtml = false, usage = null) {
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
blankTxt = replaceOnce(blankTxt, F3_2_OLD, F3_2_NEW, "F3-2 blank appendMsg usage 파라미터/배지 추가");

// F3-3 채팅 응답 배지+예산
const F3_3_OLD = `          const cd = await cr.json();
          chatLoading.remove();
          appendMsg("ai", (cd && (cd.reply || cd.error)) || "(응답 없음)");`;
const F3_3_NEW = `          const cd = await cr.json();
          chatLoading.remove();
          appendMsg("ai", (cd && (cd.reply || cd.error)) || "(응답 없음)", null, false, false, (cd && cd.usage) || null);
          refreshBudgetBadge(cd && cd.usage && cd.usage.dayHi);`;
blankTxt = replaceOnce(blankTxt, F3_3_OLD, F3_3_NEW, "F3-3 blank 채팅 응답 배지+예산 갱신");

// F3-4 Complex 질문 배지+예산
const F3_4_OLD = `          appendMsg("ai", \`❓ \${toolBadge}[의도 확인 및 답변]\\n\${d.patch.question}\`);`;
const F3_4_NEW = `          appendMsg("ai", \`❓ \${toolBadge}[의도 확인 및 답변]\\n\${d.patch.question}\`, null, false, false, (d && d.usage) || null);
          refreshBudgetBadge(d && d.usage && d.usage.dayHi);`;
blankTxt = replaceOnce(blankTxt, F3_4_OLD, F3_4_NEW, "F3-4 blank Complex 질문 배지+예산 갱신");

// F3-5 히스토리 재렌더 usage 전달
const F3_5_OLD = `      (room.messages || []).forEach(m => {
        if (m.patch) {
          appendPatchCard(m.patch, false);
        } else {
          appendMsg(m.role, m.text, m.fileData || null, true, m.isHtml === true);
        }
      });`;
const F3_5_NEW = `      (room.messages || []).forEach(m => {
        if (m.patch) {
          appendPatchCard(m.patch, false);
        } else {
          appendMsg(m.role, m.text, m.fileData || null, true, m.isHtml === true, m.usage);
        }
      });`;
blankTxt = replaceOnce(blankTxt, F3_5_OLD, F3_5_NEW, "F3-5 blank 히스토리 재렌더링 시 usage 복원");


// ============================================================================
// F4. #23 예산 경고 (blank.html 2곳 + cockpit.html 3곳)
// ============================================================================

// F4-1 A 헤더 배지 (blank.html)
const F4_1_A_OLD = `        <button id="clearChatBtn" class="small-btn danger" style="margin-left:auto;" title="현재 대화방 기록 지우기">🗑️ 지우기</button>`;
const F4_1_A_NEW = `        <span id="budgetBadge" hidden style="font-size:12px;font-weight:700;color:#fff;background:#f59e0b;border-radius:12px;padding:4px 10px;"></span>
        <button id="clearChatBtn" class="small-btn danger" style="margin-left:auto;" title="현재 대화방 기록 지우기">🗑️ 지우기</button>`;
blankTxt = replaceOnce(blankTxt, F4_1_A_OLD, F4_1_A_NEW, "F4-1A blank budgetBadge DOM 추가");

// F4-1 B refreshBudgetBadge 함수 (blank.html)
const F4_1_B_OLD = `    // --- 메시지 렌더링 ---`;
const F4_1_B_NEW = `    function refreshBudgetBadge(dayHi) {
      try {
        const lim = Number(localStorage.getItem("gemgem-budget-daily") || "200000");
        const el = document.getElementById("budgetBadge");
        if (!el) return;
        if ((Number(dayHi) || 0) >= lim) {
          el.hidden = false;
          el.innerText = \`⚠️ 오늘 토큰 상한 초과 (\${Math.round(Number(dayHi) / 1000)}k/\${Math.round(lim / 1000)}k)\`;
        } else { el.hidden = true; }
      } catch (e) {}
    }

    // --- 메시지 렌더링 ---`;
blankTxt = replaceOnce(blankTxt, F4_1_B_OLD, F4_1_B_NEW, "F4-1B blank refreshBudgetBadge 함수 추가");

// F4-2 A 콕핏 임계값 UI (cockpit.html)
const F4_2_A_OLD = `          <button class="btn" onclick="loadUsage()">🔄 새로고침</button>`;
const F4_2_A_NEW = `          <label style="font-size:12px;color:#94a3b8;">일일 상한 <input id="budgetInput" type="number" min="1000" step="1000" style="width:110px;background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:6px;padding:3px 8px;" /> <button class="btn" onclick="saveBudget()">저장</button></label>
          <button class="btn" onclick="loadUsage()">🔄 새로고침</button>`;
cockpitTxt = replaceOnce(cockpitTxt, F4_2_A_OLD, F4_2_A_NEW, "F4-2A cockpit 일일 상한 입력 UI 추가");

// F4-2 B 콕핏 loadBudgetInput / saveBudget 함수 (cockpit.html)
const F4_2_B_OLD = `    async function loadUsage() {`;
const F4_2_B_NEW = `    function loadBudgetInput() { try { const el = document.getElementById("budgetInput"); if (el) el.value = localStorage.getItem("gemgem-budget-daily") || "200000"; } catch (e) {} }
    function saveBudget() {
      try {
        const el = document.getElementById("budgetInput");
        const v = Math.max(1000, Math.floor(Number(el && el.value) || 200000));
        localStorage.setItem("gemgem-budget-daily", String(v));
        if (el) el.value = String(v);
        alert("✅ 일일 상한 저장: " + v);
      } catch (e) { alert("❌ 저장 실패: " + e.message); }
    }
    async function loadUsage() {`;
cockpitTxt = replaceOnce(cockpitTxt, F4_2_B_OLD, F4_2_B_NEW, "F4-2B cockpit loadBudgetInput / saveBudget 함수 추가");

// F4-2 C 콕핏 탭 전환 시 입력값 동기화 (cockpit.html)
const F4_2_C_OLD = `      if (tabId === "usageTab") {
        document.querySelectorAll(".tab-btn")[3].classList.add("active");
        loadUsage();
      }`;
const F4_2_C_NEW = `      if (tabId === "usageTab") {
        document.querySelectorAll(".tab-btn")[3].classList.add("active");
        loadBudgetInput();
        loadUsage();
      }`;
cockpitTxt = replaceOnce(cockpitTxt, F4_2_C_OLD, F4_2_C_NEW, "F4-2C cockpit 탭 전환 시 loadBudgetInput 호출");


// ============================================================================
// 파일 쓰기 및 문법 검증
// ============================================================================
try {
  fs.writeFileSync(FILES.server, serverTxt, "utf8");
  fs.writeFileSync(FILES.blank, blankTxt, "utf8");
  fs.writeFileSync(FILES.cockpit, cockpitTxt, "utf8");
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

// 2) blank.html & cockpit.html: <script> 전 블록 문법 검사
checkHtmlScripts(blankTxt, "blank.html");
checkHtmlScripts(cockpitTxt, "cockpit.html");

console.log("\n🎉 B3 패치 적용 및 전 항목 문법 검증 완료!");