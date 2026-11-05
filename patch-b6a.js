#!/usr/bin/env node
/**
 * patch-b6a.js — B6a 콕핏 UX & 히스토리 패처
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

let blankTxt = originals.blank;
let cockpitTxt = originals.cockpit;


// ============================================================================
// CD1. 콕핏 에디터 버튼+Diff 뷰 (cockpit.html)
// ============================================================================
const CD1_OLD = `<div class="editor-header">
            <span id="currentFileName">파일을 선택하세요</span>
            <button class="btn" id="saveFileBtn" onclick="saveCurrentFile()" style="display: none;">💾 저장하기</button>
            <button class="btn" id="checkFileBtn" onclick="checkCurrentFile()" style="display: none;">🔍 문법검사</button>
            <button class="btn" id="renameFileBtn" onclick="renameCurrentFile()" style="display: none;">✏️ 이름변경</button>
            <button class="btn" id="deleteFileBtn" onclick="deleteCurrentFile()" style="display: none; background: #7f1d1d;">🗑️ 삭제</button>
          </div>
          <textarea class="editor-textarea" id="fileEditor" placeholder="내용 없음" disabled oninput="refreshDirtyState()" onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();saveCurrentFile();}"></textarea>`;

const CD1_NEW = `<div class="editor-header">
            <span id="currentFileName">파일을 선택하세요</span>
            <button class="btn" id="saveFileBtn" onclick="saveCurrentFile()" style="display: none;">💾 저장하기</button>
            <button class="btn" id="checkFileBtn" onclick="checkCurrentFile()" style="display: none;">🔍 문법검사</button>
            <button class="btn" id="renameFileBtn" onclick="renameCurrentFile()" style="display: none;">✏️ 이름변경</button>
            <button class="btn" id="deleteFileBtn" onclick="deleteCurrentFile()" style="display: none; background: #7f1d1d;">🗑️ 삭제</button>
            <button class="btn" id="diffSnapBtn" onclick="showSnapshotDiff()">🔍 스냅샷 Diff</button>
            <button class="btn" id="rollbackFileBtn" onclick="rollbackCurrentFile()" style="background:#7c2d12;">↩ 롤백</button>
          </div>
          <textarea class="editor-textarea" id="fileEditor" placeholder="내용 없음" disabled oninput="refreshDirtyState()" onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();saveCurrentFile();}"></textarea>
          <pre id="snapDiffView" hidden style="background:#020617;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:8px 10px;font-family:monospace;font-size:12px;max-height:220px;overflow-y:auto;white-space:pre-wrap;margin-top:8px;"></pre>`;

cockpitTxt = replaceOnce(cockpitTxt, CD1_OLD, CD1_NEW, "CD1 cockpit.html 버튼 2개 + Diff 뷰 추가");


// ============================================================================
// CJ. 콕핏 Diff+롤백 JS (cockpit.html)
// ============================================================================
const CJ_OLD = `    let currentSelectedFile = null;
    let editorOriginal = "";
    let editorDirty = false;`;

const CJ_NEW = `    let currentSelectedFile = null;
    let editorOriginal = "";
    let editorDirty = false;
    function renderLineDiff(oldText, newText) {
      try {
        const a = String(oldText || "").split("\\n"), b = String(newText || "").split("\\n");
        if (a.length * b.length > 9000000) return "파일이 너무 큼 (행 " + a.length + " vs " + b.length + ") — 전체 비교 생략";
        const n = a.length, m = b.length;
        const dp = new Uint16Array((n + 1) * (m + 1));
        for (let i = n - 1; i >= 0; i--) {
          for (let j = m - 1; j >= 0; j--) {
            dp[i * (m + 1) + j] = (a[i] === b[j]) ? (dp[(i + 1) * (m + 1) + j + 1] + 1) : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
          }
        }
        let out = "", i = 0, j = 0, rows = 0, skipped = 0;
        while (i < n && j < m) {
          if (a[i] === b[j]) { i++; j++; }
          else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) { out += (rows < 300 ? "- " + a[i] + "\\n" : ""); rows++; i++; }
          else { out += (rows < 300 ? "+ " + b[j] + "\\n" : ""); rows++; j++; }
        }
        while (i < n) { out += (rows < 300 ? "- " + a[i] + "\\n" : ""); rows++; i++; }
        while (j < m) { out += (rows < 300 ? "+ " + b[j] + "\\n" : ""); rows++; j++; }
        if (!out) return "(차이 없음 — 스냅샷과 현재본 동일)";
        if (rows > 300) out += "... 외 " + (rows - 300) + "행 생략";
        return out;
      } catch (e) { return "Diff 실패: " + e.message; }
    }
    async function showSnapshotDiff() {
      if (!currentSelectedFile) return alert("먼저 파일을 선택하세요");
      const view = document.getElementById("snapDiffView");
      try {
        if (view) { view.hidden = false; view.innerText = "⏳ 스냅샷 비교 중..."; }
        const t = (currentSelectedFile === "index") ? "index.html" : currentSelectedFile;
        const r = await fetch("/api/files/read?name=" + encodeURIComponent("snapshot-meta.json"));
        const d = await r.json();
        let snapText = null;
        try {
          const meta = JSON.parse(d.content || "{}");
          const ent = (meta && meta.byTarget) ? (meta.byTarget[t] || (t === "index.html" ? meta.byTarget["index"] : null)) : null;
          if (ent && typeof ent.content === "string") snapText = ent.content;
        } catch {}
        if (snapText == null) { if (view) view.innerText = "스냅샷 없음: " + t + " (저장 후 다시 시도)"; return; }
        let cur = null;
        try {
          const cr = await fetch("/api/files/read?name=" + encodeURIComponent(t));
          const cd = await cr.json();
          if (cd.ok) cur = cd.content || "";
        } catch {}
        if (cur == null) cur = document.getElementById("fileEditor").value || "";
        if (view) view.innerText = renderLineDiff(snapText, cur);
      } catch (e) { if (view) view.innerText = "Diff 실패: " + e.message; }
    }
    async function rollbackCurrentFile() {
      if (!currentSelectedFile) return alert("먼저 파일을 선택하세요");
      try {
        const r = await fetch("/api/rollback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: currentSelectedFile }) });
        const d = await r.json();
        if (d.ok) { alert("✅ 롤백 완료: " + currentSelectedFile); selectFileToEdit(currentSelectedFile); }
        else alert("❌ 롤백 실패: " + (d.error || "오류"));
      } catch (e) { alert("❌ 롤백 오류: " + e.message); }
    }`;

cockpitTxt = replaceOnce(cockpitTxt, CJ_OLD, CJ_NEW, "CJ cockpit.html renderLineDiff, showSnapshotDiff, rollbackCurrentFile 함수 추가");


// ============================================================================
// C5d. 콕핏 히스토리 선언+이동 (cockpit.html)
// ============================================================================
const C5D_OLD = `    let termSessions = [];
    let activeSessionId = null;`;

const C5D_NEW = `    let termSessions = [];
    let activeSessionId = null;
    let __cockHist = [];
    let __cockHistIdx = -1;
    function cockHistNav(e) {
      try {
        const input = document.getElementById("termInput");
        if (!input || !__cockHist.length) return;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          if (__cockHistIdx < 0) __cockHistIdx = __cockHist.length;
          if (__cockHistIdx > 0) __cockHistIdx--;
          input.value = __cockHist[__cockHistIdx] || "";
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          if (__cockHistIdx >= 0) {
            __cockHistIdx++;
            input.value = __cockHistIdx >= __cockHist.length ? "" : __cockHist[__cockHistIdx];
            if (__cockHistIdx >= __cockHist.length) __cockHistIdx = -1;
          }
        }
      } catch {}
    }`;

cockpitTxt = replaceOnce(cockpitTxt, C5D_OLD, C5D_NEW, "C5d cockpit.html __cockHist 선언 및 cockHistNav 함수 추가");


// ============================================================================
// C5b. 콕핏 히스토리 저장 (cockpit.html)
// ============================================================================
const C5B_OLD = `      sess.history += \`$ \${cmd}\\n\`;`;
const C5B_NEW = `      sess.history += \`$ \${cmd}\\n\`;
      try { __cockHist.push(cmd); __cockHistIdx = -1; } catch {}`;

cockpitTxt = replaceOnce(cockpitTxt, C5B_OLD, C5B_NEW, "C5b cockpit.html 히스토리 저장 로직 추가");


// ============================================================================
// C5a. 콕핏 입력 배선 (cockpit.html)
// ============================================================================
const C5A_OLD = `        <input type="text" class="term-input" id="termInput" placeholder="명령어 입력 (예: git status, git log --oneline -5, grep body index.html)" onkeydown="if(event.key==='Enter') runActiveTerminal()" />`;
const C5A_NEW = `        <input type="text" class="term-input" id="termInput" placeholder="명령어 입력 (예: git status, git log --oneline -5, grep body index.html)" onkeydown="if(event.key==='Enter') runActiveTerminal(); else cockHistNav(event)" />`;

cockpitTxt = replaceOnce(cockpitTxt, C5A_OLD, C5A_NEW, "C5a cockpit.html onkeydown 히스토리 네비게이션 배선");


// ============================================================================
// M1a. blank 메모리 칩 DOM (blank.html)
// ============================================================================
const M1A_OLD = `          <textarea id="memoryEditor" rows="6" style="width:100%; font-family:monospace; font-size:12px; padding:8px; border:1px solid #cbd5e1; border-radius:8px;"></textarea>`;
const M1A_NEW = `          <div id="memChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;max-height:96px;overflow-y:auto;"></div>
          <textarea id="memoryEditor" rows="6" style="width:100%; font-family:monospace; font-size:12px; padding:8px; border:1px solid #cbd5e1; border-radius:8px;"></textarea>`;

blankTxt = replaceOnce(blankTxt, M1A_OLD, M1A_NEW, "M1a blank.html 메모리 칩 컨테이너 DOM 추가");


// ============================================================================
// M1b. blank 메모리 칩 JS (blank.html)
// ============================================================================
const M1B_OLD = `        memEl.value = mData.content || JSON.stringify({ facts: [] }, null, 2);`;
const M1B_NEW = `        memEl.value = mData.content || JSON.stringify({ facts: [] }, null, 2);
        try { renderMemoryChips(mData.content); } catch {}
    function renderMemoryChips(jsonText) {
      try {
        const box = document.getElementById("memChips");
        if (!box) return;
        box.innerHTML = "";
        let data = {};
        try { data = JSON.parse(jsonText || "{}"); } catch { data = {}; }
        let scopes = { global: Array.isArray(data.global) ? data.global : [] };
        if (Array.isArray(data.facts)) scopes = { global: data.facts };
        if (data.rooms && typeof data.rooms === "object") {
          for (const k of Object.keys(data.rooms)) { if (Array.isArray(data.rooms[k])) scopes[k] = data.rooms[k]; }
        }
        {
          const fl = [];
          for (const k of Object.keys(scopes)) { (scopes[k] || []).forEach(f => fl.push({ scope: k, text: String(f) })); }
          const mkChip = (label, title, bg, fn) => {
            const c = document.createElement("button");
            c.className = "small-btn"; c.innerText = label; c.title = title || label;
            c.style.background = bg || ""; c.style.maxWidth = "220px"; c.style.overflow = "hidden"; c.style.textOverflow = "ellipsis"; c.style.whiteSpace = "nowrap";
            c.onclick = fn; box.appendChild(c); return c;
          };
          let curScope = box.getAttribute("data-scope") || "전체";
          const drawFacts = () => {
            box.querySelectorAll("[data-fact]").forEach(el => el.remove());
            fl.filter(f => curScope === "전체" || f.scope === curScope).slice(0, 60).forEach(f => {
              const short = f.text.length > 24 ? f.text.slice(0, 24) + "…" : f.text;
              mkChip("[" + f.scope + "] " + short, f.text, "#f1f5f9", () => {
                try { chatInput.value = (chatInput.value ? chatInput.value + "\\n" : "") + f.text; adjustTextareaHeight(); chatInput.focus(); } catch {}
              }).setAttribute("data-fact", "1");
            });
          };
          mkChip("전체(" + fl.length + ")", "전체 보기", curScope === "전체" ? "#bfdbfe" : "", () => { try { box.setAttribute("data-scope", "전체"); renderMemoryChips(jsonText); } catch {} });
          Object.keys(scopes).forEach(k => {
            mkChip(k + "(" + scopes[k].length + ")", k + "만 보기", curScope === k ? "#bfdbfe" : "", () => { try { box.setAttribute("data-scope", k); renderMemoryChips(jsonText); } catch {} });
          });
          drawFacts();
        }
      } catch {}
    }`;

blankTxt = replaceOnce(blankTxt, M1B_OLD, M1B_NEW, "M1b blank.html 메모리 칩 렌더링 함수 추가");


// ============================================================================
// B1. blank 터미널 히스토리 (blank.html)
// ============================================================================
const B1_OLD = `    window.runQuickTerm = (cmd) => executeTerminalCommand(cmd);
    termRunBtn.onclick = () => executeTerminalCommand(termInput.value);
    termInput.onkeydown = (e) => { if (e.key === "Enter") executeTerminalCommand(termInput.value); };`;

const B1_NEW = `    window.runQuickTerm = (cmd) => executeTerminalCommand(cmd);
    termRunBtn.onclick = () => executeTerminalCommand(termInput.value);
    let __termHist = [];
    let __termHistIdx = -1;
    termInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        const v = termInput.value;
        if (v.trim()) { try { __termHist.push(v); } catch {} }
        __termHistIdx = -1;
        executeTerminalCommand(v);
      } else if (e.key === "ArrowUp" && __termHist.length) {
        e.preventDefault();
        if (__termHistIdx < 0) __termHistIdx = __termHist.length;
        if (__termHistIdx > 0) __termHistIdx--;
        termInput.value = __termHist[__termHistIdx] || "";
      } else if (e.key === "ArrowDown" && __termHist.length) {
        e.preventDefault();
        if (__termHistIdx >= 0) {
          __termHistIdx++;
          termInput.value = __termHistIdx >= __termHist.length ? "" : __termHist[__termHistIdx];
          if (__termHistIdx >= __termHist.length) __termHistIdx = -1;
        }
      }
    };`;

blankTxt = replaceOnce(blankTxt, B1_OLD, B1_NEW, "B1 blank.html 터미널 방향키 히스토리 추가");


// ============================================================================
// 파일 쓰기 및 문법 검증
// ============================================================================
try {
  fs.writeFileSync(FILES.blank, blankTxt, "utf8");
  fs.writeFileSync(FILES.cockpit, cockpitTxt, "utf8");
} catch (writeErr) {
  abort("파일 저장", writeErr.message);
}

// 1) server.js: node --check (무변경 확인용 하네스 유지)
try {
  execFileSync(process.execPath, ["--check", FILES.server], { stdio: "pipe" });
  console.log("✅ [server.js] node --check 통과 (무변경)");
} catch (chkErr) {
  const stderr = chkErr.stderr ? chkErr.stderr.toString() : chkErr.message;
  abort("server.js node --check", stderr);
}

// 2) blank.html & cockpit.html: <script> 전 블록 문법 검사
checkHtmlScripts(blankTxt, "blank.html");
checkHtmlScripts(cockpitTxt, "cockpit.html");

console.log("\n🎉 B6a 패치 적용 및 전 항목 문법 검증 완료!");
