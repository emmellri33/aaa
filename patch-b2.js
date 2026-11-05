#!/usr/bin/env node
/**
 * patch-b2.js — B2 콕핏 상호 격리 및 파일 생명주기 완성 패처 (검수 수정판)
 * - 미미 초안에서 F5-2 OLD 1줄만 수정 (B1a 적용본 기준: <body data-gemgem-root> 포함)
 * - 규칙: 1) 파일 통갈이 금지 — 정확히 1회 매치되는 앵커 치환만 수행
 *          2) 앵커 매치 횟수가 정확히 1회가 아니면 즉시 중단 및 전 파일 원복 (fail-closed)
 *          3) server.js `node --check` + cockpit.html <script> 문법 검사 통과 필수
 *          4) blank.html은 일절 수정하지 않음.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FILES = {
  server: path.join(__dirname, "server.js"),
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
  console.error("↩️ 파일 모두 원본 상태로 원복 완료.");
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
let cockpitTxt = originals.cockpit;


// ============================================================================
// F1. #17 manifest 등급 세분화 (server.js 3곳)
// ============================================================================

// F1-1 getCreator + normalizeOwner
const F1_1_OLD = `function getCreator(filename) {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) {
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ "index.html": "system" }, null, 2), "utf8");
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    if (filename === "index.html") return "system";
    return manifest[filename] || "user";
  } catch (e) {
    return filename === "index.html" ? "system" : "user";
  }
}`;

const F1_1_NEW = `function normalizeOwner(raw, filename) {
  const o = String(raw || "").trim().toLowerCase();
  if (o === "system" || o === "cockpit" || o === "gemgem" || o === "user") return o;
  if (filename === "cockpit.html" || filename === "blank.html") return "cockpit";
  return o || "user";
}
function getCreator(filename) {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) {
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ "index.html": "system" }, null, 2), "utf8");
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    if (filename === "index.html") return "system";
    if (filename === "blank.html" || filename === "cockpit.html") {
      const raw = manifest[filename];
      if (!raw) return "cockpit";
      return normalizeOwner(raw, filename);
    }
    const raw = manifest[filename];
    if (!raw) return "user";
    return normalizeOwner(raw, filename);
  } catch (e) {
    if (filename === "index.html") return "system";
    if (filename === "blank.html" || filename === "cockpit.html") return "cockpit";
    return "user";
  }
}`;
serverTxt = replaceOnce(serverTxt, F1_1_OLD, F1_1_NEW, "F1-1 server getCreator + normalizeOwner");

// F1-2 ai-modify 가드 호환
const F1_2_OLD = `    if (targetFile === "blank.html" || targetFile === "server.js" || (targetFile === "cockpit.html" && creator !== "gemgem")) {`;
const F1_2_NEW = `    if (targetFile === "blank.html" || targetFile === "server.js" || (targetFile === "cockpit.html" && !(creator === "gemgem" || creator === "cockpit"))) {`;
serverTxt = replaceOnce(serverTxt, F1_2_OLD, F1_2_NEW, "F1-2 server ai-modify 가드 호환");

// F1-3 /api/files 목록 owner 정규화
const F1_3_OLD = `        return { name: e.name, size: stat.size, owner: manifest[e.name] || "user" };`;
const F1_3_NEW = `        return { name: e.name, size: stat.size, owner: getCreator(e.name) };`;
serverTxt = replaceOnce(serverTxt, F1_3_OLD, F1_3_NEW, "F1-3 server /api/files 목록 owner 정규화");


// ============================================================================
// F2-1. server.js — /api/files/delete + /api/files/rename 신설 (F4-1보다 먼저)
// ============================================================================
const F2_1_OLD = `app.get('/api/git/status', (req, res) => {`;
const F2_1_NEW = `app.post('/api/files/delete', (req, res) => {
  try {
    const { name } = req.body || {};
    const filename = String(name || "").trim();
    if (!filename || isForbiddenFileName(filename)) {
      return res.status(403).json({ ok: false, error: "거부됨: 쓰기 금지된 파일명입니다." });
    }
    if (!filename.endsWith(".html")) {
      return res.status(403).json({ ok: false, error: "거부됨: .html만 삭제할 수 있습니다." });
    }
    if (["index.html", "blank.html", "cockpit.html", "server.js"].includes(filename)) {
      return res.status(403).json({ ok: false, error: "거부됨: 시스템·콕핏 파일은 삭제할 수 없습니다." });
    }
    const owner = getCreator(filename);
    if (owner !== "gemgem") {
      return res.status(403).json({ ok: false, error: "거부됨: gemgem 소유만 삭제할 수 있습니다 (현재: " + owner + ")." });
    }
    const p = path.join(__dirname, filename);
    if (!fs.existsSync(p)) {
      return res.status(404).json({ ok: false, error: "파일이 존재하지 않습니다: " + filename });
    }
    saveSnapshotToDisk(fs.readFileSync(p, "utf8"), filename);
    fs.unlinkSync(p);
    try {
      if (fs.existsSync(MANIFEST_PATH)) {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
        if (manifest[filename]) { delete manifest[filename]; fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8"); }
      }
    } catch (e) {}
    res.json({ ok: true, name: filename });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/files/rename', (req, res) => {
  try {
    const { name, newName } = req.body || {};
    const oldN = String(name || "").trim();
    const newN = String(newName || "").trim();
    if (!oldN || isForbiddenFileName(oldN) || !newN || isForbiddenFileName(newN)) {
      return res.status(403).json({ ok: false, error: "거부됨: 쓰기 금지된 파일명입니다." });
    }
    if (!oldN.endsWith(".html") || !newN.endsWith(".html")) {
      return res.status(403).json({ ok: false, error: "거부됨: .html끼리만 이름을 바꿀 수 있습니다." });
    }
    if (["index.html", "blank.html", "cockpit.html", "server.js"].includes(oldN) || ["index.html", "blank.html", "cockpit.html", "server.js"].includes(newN)) {
      return res.status(403).json({ ok: false, error: "거부됨: 시스템·콕핏 파일은 이름을 바꿀 수 없습니다." });
    }
    if (!/^[a-z0-9-]{1,40}\\.html$/.test(newN)) {
      return res.status(400).json({ ok: false, error: "새 파일명이 올바르지 않습니다 (소문자·숫자·하이픈, 40자 이내)." });
    }
    const owner = getCreator(oldN);
    if (owner !== "gemgem") {
      return res.status(403).json({ ok: false, error: "거부됨: gemgem 소유만 이름을 바꿀 수 있습니다 (현재: " + owner + ")." });
    }
    const po = path.join(__dirname, oldN);
    const pn = path.join(__dirname, newN);
    if (!fs.existsSync(po)) {
      return res.status(404).json({ ok: false, error: "파일이 존재하지 않습니다: " + oldN });
    }
    if (fs.existsSync(pn)) {
      return res.status(400).json({ ok: false, error: "이미 있는 파일명입니다: " + newN });
    }
    const content = fs.readFileSync(po, "utf8");
    saveSnapshotToDisk(content, oldN);
    fs.writeFileSync(pn, content, "utf8");
    saveSnapshotToDisk(content, newN);
    fs.unlinkSync(po);
    try {
      let manifest = {};
      if (fs.existsSync(MANIFEST_PATH)) { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")); }
      const ow = manifest[oldN] || "gemgem";
      delete manifest[oldN];
      manifest[newN] = ow;
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
    } catch (e) {}
    res.json({ ok: true, name: newN, oldName: oldN });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/git/status', (req, res) => {`;
serverTxt = replaceOnce(serverTxt, F2_1_OLD, F2_1_NEW, "F2-1 server.js — /api/files/delete + /api/files/rename 신설");

// ============================================================================
// F4-1 server.js — POST /api/check 신설 (F2-1 적용 후, 같은 앵커 1회 유지)
// ============================================================================
const F4_1_OLD = `app.get('/api/git/status', (req, res) => {`;
const F4_1_NEW = `app.post('/api/check', (req, res) => {
  try {
    const { file, content } = req.body || {};
    const filename = String(file || "").trim();
    if (!filename || isForbiddenFileName(filename)) {
      return res.status(400).json({ ok: false, error: "거부됨(400): 허용되지 않은 파일명입니다." });
    }
    const text = String(content == null ? "" : content);
    if (filename === "server.js" || filename.endsWith(".js")) {
      const tmp = path.join("/tmp", "check-" + Date.now() + "-" + Math.floor(Math.random() * 1000000) + ".js");
      try { fs.writeFileSync(tmp, text, "utf8"); } catch (e) { return res.status(500).json({ ok: false, error: "임시 파일 쓰기 실패: " + e.message }); }
      execFile(process.execPath, ["--check", tmp], { timeout: 10000 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmp); } catch (e) {}
        if (err) {
          return res.json({ ok: false, file: filename, error: String((stderr || stdout || err.message) || "문법 오류").slice(0, 2000) });
        }
        return res.json({ ok: true, file: filename });
      });
      return;
    }
    if (filename.endsWith(".html")) {
      const re = /<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi;
      let m; let idx = 0; const errors = [];
      while ((m = re.exec(text)) !== null) {
        idx++;
        try { new Function(m[1]); } catch (e) { errors.push("script #" + idx + ": " + e.message); }
      }
      if (errors.length) return res.json({ ok: false, file: filename, error: errors.join("\\n").slice(0, 2000) });
      return res.json({ ok: true, file: filename, blocks: idx });
    }
    return res.json({ ok: true, file: filename });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/git/status', (req, res) => {`;
serverTxt = replaceOnce(serverTxt, F4_1_OLD, F4_1_NEW, "F4-1 server.js — POST /api/check 신설");

// ============================================================================
// F2-2 cockpit.html — 편집기 헤더에 문법검사·이름변경·삭제 버튼
// ============================================================================
const F2_2_OLD = `            <span id="currentFileName">파일을 선택하세요</span>
            <button class="btn" id="saveFileBtn" onclick="saveCurrentFile()" style="display: none;">💾 저장하기</button>`;
const F2_2_NEW = `            <span id="currentFileName">파일을 선택하세요</span>
            <button class="btn" id="saveFileBtn" onclick="saveCurrentFile()" style="display: none;">💾 저장하기</button>
            <button class="btn" id="checkFileBtn" onclick="checkCurrentFile()" style="display: none;">🔍 문법검사</button>
            <button class="btn" id="renameFileBtn" onclick="renameCurrentFile()" style="display: none;">✏️ 이름변경</button>
            <button class="btn" id="deleteFileBtn" onclick="deleteCurrentFile()" style="display: none; background: #7f1d1d;">🗑️ 삭제</button>`;
cockpitTxt = replaceOnce(cockpitTxt, F2_2_OLD, F2_2_NEW, "F2-2 cockpit 편집기 헤더 버튼 3종 추가");

// ============================================================================
// F2-3 cockpit.html — delete/rename 함수 신설 (F4-2보다 먼저)
// ============================================================================
const F2_3_OLD = `    // --- 3. 커밋 탭 로직 ---`;
const F2_3_NEW = `    async function deleteCurrentFile() {
      if (!currentSelectedFile) return;
      if (!confirm("정말 삭제할까요? " + currentSelectedFile + " (스냅샷에 보존되어 롤백 가능)")) return;
      try {
        const r = await fetch("/api/files/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: currentSelectedFile }) });
        const d = await r.json();
        if (d.ok) {
          alert("✅ 삭제됨: " + currentSelectedFile);
          currentSelectedFile = null;
          editorOriginal = "";
          editorDirty = false;
          document.getElementById("fileEditor").value = "";
          document.getElementById("fileEditor").disabled = true;
          document.getElementById("currentFileName").innerText = "파일을 선택하세요";
          await loadWorkspaceFiles();
        } else { alert("❌ 삭제 실패: " + (d.error || "오류")); }
      } catch (e) { alert("❌ 삭제 요청 중 예외: " + e.message); }
    }

    async function renameCurrentFile() {
      if (!currentSelectedFile) return;
      const raw = prompt("새 파일명 (소문자·숫자·하이픈만, .html 자동 추가):", currentSelectedFile.replace(/\\.html$/, ""));
      if (raw === null) return;
      const base = String(raw).trim().toLowerCase().replace(/\\.html$/, "");
      if (!/^[a-z0-9-]{1,40}$/.test(base)) { alert("파일명이 올바르지 않습니다."); return; }
      const newName = base + ".html";
      try {
        const r = await fetch("/api/files/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: currentSelectedFile, newName }) });
        const d = await r.json();
        if (d.ok) {
          alert("✅ 이름 변경됨: " + currentSelectedFile + " → " + newName);
          currentSelectedFile = newName;
          refreshDirtyState();
          await loadWorkspaceFiles();
        } else { alert("❌ 이름변경 실패: " + (d.error || "오류")); }
      } catch (e) { alert("❌ 이름변경 요청 중 예외: " + e.message); }
    }

    // --- 3. 커밋 탭 로직 ---`;
cockpitTxt = replaceOnce(cockpitTxt, F2_3_OLD, F2_3_NEW, "F2-3 cockpit delete/rename 함수 신설");

// ============================================================================
// F4-2 cockpit.html — checkCurrentFile 함수 (F2-3 적용 후)
// ============================================================================
const F4_2_OLD = `    // --- 3. 커밋 탭 로직 ---`;
const F4_2_NEW = `    async function checkCurrentFile() {
      if (!currentSelectedFile) return;
      const editor = document.getElementById("fileEditor");
      const content = editor.value;
      try {
        const r = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: currentSelectedFile, content }) });
        const d = await r.json();
        if (d.ok) { alert("✅ 문법 OK: " + currentSelectedFile + (d.blocks ? " (script " + d.blocks + "개)" : "")); }
        else { alert("❌ 문법 오류 (" + currentSelectedFile + "):\\n" + (d.error || "오류")); }
      } catch (e) { alert("❌ 검사 요청 중 예외: " + e.message); }
    }

    // --- 3. 커밋 탭 로직 ---`;
cockpitTxt = replaceOnce(cockpitTxt, F4_2_OLD, F4_2_NEW, "F4-2 cockpit checkCurrentFile 함수 신설");


// ============================================================================
// F3-1. 상태 변수 (cockpit.html)
// ============================================================================
const F3_1_OLD = `    // --- 2. 파일 편집 탭 로직 ---
    let currentSelectedFile = null;`;
const F3_1_NEW = `    // --- 2. 파일 편집 탭 로직 ---
    let currentSelectedFile = null;
    let editorOriginal = "";
    let editorDirty = false;`;
cockpitTxt = replaceOnce(cockpitTxt, F3_1_OLD, F3_1_NEW, "F3-1 cockpit 파일 편집 탭 상태 변수 추가");


// ============================================================================
// F3-2. selectFileToEdit 교체 + refreshDirtyState 신설 (cockpit.html)
// ============================================================================
const F3_2_OLD = `    async function selectFileToEdit(filename) {
      currentSelectedFile = filename;
      loadWorkspaceFiles();

      const label = document.getElementById("currentFileName");
      const editor = document.getElementById("fileEditor");
      const saveBtn = document.getElementById("saveFileBtn");

      label.innerText = \`📄 \${filename} (불러오는 중...)\`;
      editor.disabled = true;
      saveBtn.style.display = "none";

      try {
        const r = await fetch("/api/files/read?name=" + encodeURIComponent(filename));
        const d = await r.json();
        if (d.ok) {
          label.innerText = \`📄 \${filename}\`;
          editor.value = d.content || "";
          editor.disabled = false;
          saveBtn.style.display = "inline-block";
        } else {
          label.innerText = \`❌ \${filename} 로드 실패: \` + (d.error || "오류");
          editor.value = "";
        }
      } catch (e) {
        label.innerText = \`❌ 오류: \` + e.message;
        editor.value = "";
      }
    }`;

const F3_2_NEW = `    async function selectFileToEdit(filename) {
      if (editorDirty && currentSelectedFile && currentSelectedFile !== filename) {
        if (!confirm("저장 안 한 변경이 있습니다 (" + currentSelectedFile + "). 저장하지 않고 이동할까요?")) return;
      }
      currentSelectedFile = filename;
      editorDirty = false;
      editorOriginal = "";
      loadWorkspaceFiles();

      const label = document.getElementById("currentFileName");
      const editor = document.getElementById("fileEditor");
      const saveBtn = document.getElementById("saveFileBtn");
      const checkBtn = document.getElementById("checkFileBtn");
      const renameBtn = document.getElementById("renameFileBtn");
      const deleteBtn = document.getElementById("deleteFileBtn");

      label.innerText = \`📄 \${filename} (불러오는 중...)\`;
      editor.disabled = true;
      saveBtn.style.display = "none";
      if (checkBtn) checkBtn.style.display = "none";
      if (renameBtn) renameBtn.style.display = "none";
      if (deleteBtn) deleteBtn.style.display = "none";

      try {
        const r = await fetch("/api/files/read?name=" + encodeURIComponent(filename));
        const d = await r.json();
        if (d.ok) {
          label.innerText = \`📄 \${filename}\`;
          editor.value = d.content || "";
          editorOriginal = d.content || "";
          editorDirty = false;
          editor.disabled = false;
          saveBtn.style.display = "inline-block";
          if (checkBtn) checkBtn.style.display = "inline-block";
          const canManage = filename.endsWith(".html") && !["index.html", "blank.html", "cockpit.html"].includes(filename);
          if (renameBtn) renameBtn.style.display = canManage ? "inline-block" : "none";
          if (deleteBtn) deleteBtn.style.display = canManage ? "inline-block" : "none";
        } else {
          label.innerText = \`❌ \${filename} 로드 실패: \` + (d.error || "오류");
          editor.value = "";
          editorOriginal = "";
          editorDirty = false;
        }
      } catch (e) {
        label.innerText = \`❌ 오류: \` + e.message;
        editor.value = "";
        editorOriginal = "";
        editorDirty = false;
      }
    }

    function refreshDirtyState() {
      const editor = document.getElementById("fileEditor");
      const label = document.getElementById("currentFileName");
      if (!currentSelectedFile || editor.disabled) return;
      editorDirty = (editor.value !== editorOriginal);
      const mark = editorDirty ? " ●" : "";
      label.innerText = \`📄 \${currentSelectedFile}\${mark}\`;
    }`;
cockpitTxt = replaceOnce(cockpitTxt, F3_2_OLD, F3_2_NEW, "F3-2 cockpit selectFileToEdit 교체 + refreshDirtyState 신설");


// ============================================================================
// F3-3. textarea에 input+Ctrl+S 바인딩 (cockpit.html)
// ============================================================================
const F3_3_OLD = `          <textarea class="editor-textarea" id="fileEditor" placeholder="내용 없음" disabled></textarea>`;
const F3_3_NEW = `          <textarea class="editor-textarea" id="fileEditor" placeholder="내용 없음" disabled oninput="refreshDirtyState()" onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();saveCurrentFile();}"></textarea>`;
cockpitTxt = replaceOnce(cockpitTxt, F3_3_OLD, F3_3_NEW, "F3-3 cockpit textarea oninput/onkeydown 바인딩");


// ============================================================================
// F3-4. saveCurrentFile 성공 시 dirty 해제 (cockpit.html)
// ============================================================================
const F3_4_OLD = `        if (d.ok) {
          alert(\`✅ \${currentSelectedFile} 저장 완료 (스냅샷 생성됨)\`);`;
const F3_4_NEW = `        if (d.ok) {
          editorOriginal = content;
          editorDirty = false;
          refreshDirtyState();
          alert(\`✅ \${currentSelectedFile} 저장 완료 (스냅샷 생성됨)\`);`;
cockpitTxt = replaceOnce(cockpitTxt, F3_4_OLD, F3_4_NEW, "F3-4 cockpit saveCurrentFile dirty 해제");


// ============================================================================
// F5. #28 템플릿 선택 생성 (cockpit.html)
// ============================================================================
// F5-1 새 페이지 행에 템플릿 select 추가
const F5_1_OLD = `        <button class="btn" onclick="createNewPage()">＋ 새 페이지</button>`;
const F5_1_NEW = `        <button class="btn" onclick="createNewPage()">＋ 새 페이지</button>
        <select id="newPageTemplate" style="background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:6px;font-size:12px;padding:4px 8px;">
          <option value="blank">빈 페이지</option>
          <option value="dashboard">대시보드형</option>
          <option value="cards">카드 목록형</option>
        </select>`;
cockpitTxt = replaceOnce(cockpitTxt, F5_1_OLD, F5_1_NEW, "F5-1 cockpit 템플릿 select 추가");

// F5-2 createNewPage 교체 (B1a 적용본 기준 OLD — data-gemgem-root 포함)
const F5_2_OLD = `    async function createNewPage() {
      const raw = prompt("새 페이지 파일명 (소문자·숫자·하이픈만, .html 자동 추가):", "my-page");
      if (raw === null) return;
      const base = String(raw).trim().toLowerCase().replace(/\\.html$/, "");
      if (!/^[a-z0-9-]{1,40}$/.test(base)) { alert("파일명이 올바르지 않습니다."); return; }
      const name = base + ".html";
      try {
        const lr = await fetch("/api/files");
        const ld = await lr.json();
        if (ld.ok && Array.isArray(ld.files) && ld.files.some(f => f.name === name)) { alert("이미 있는 파일명입니다."); return; }
        const skeleton = '<!DOCTYPE html>\\n<html lang="ko">\\n<head><meta charset="UTF-8"><title>' + base + '</title></head>\\n<body data-gemgem-root>\\n<h1>' + base + '</h1>\\n</body>\\n</html>\\n';
        const r = await fetch("/api/files/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content: skeleton }) });
        const d = await r.json();
        if (!d.ok) { alert("생성 실패: " + (d.error || "오류")); return; }
        await loadWorkspaceFiles();
        alert("생성됨: " + name + " (주인: gemgem)");
      } catch (e) { alert("오류: " + e.message); }
    }`;

const F5_2_NEW = `    function buildSkeleton(kind, base) {
      const head = '<!DOCTYPE html>\\n<html lang="ko">\\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">\\n<title>' + base + '</title>\\n<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:24px}h1{font-size:20px}a{color:#38bdf8}.grid{display:grid;gap:12px}.card{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px}@media(max-width:600px){body{padding:12px}}</style>\\n</head>\\n<body data-gemgem-root>\\n<h1>' + base + '</h1>\\n';
      if (kind === "dashboard") {
        return head + '<div class="grid" style="grid-template-columns:repeat(3,1fr)"><div class="card"><h2>상태</h2><p>여기에 상태 표시</p></div><div class="card"><h2>차트</h2><p>여기에 차트</p></div><div class="card"><h2>로그</h2><p>여기에 로그</p></div></div>\\n</body>\\n</html>\\n';
      }
      if (kind === "cards") {
        return head + '<div class="grid"><div class="card"><h2>카드 1</h2><p>설명 1</p></div><div class="card"><h2>카드 2</h2><p>설명 2</p></div><div class="card"><h2>카드 3</h2><p>설명 3</p></div></div>\\n</body>\\n</html>\\n';
      }
      return head + '<p>빈 페이지 — 여기서 시작하세요.</p>\\n</body>\\n</html>\\n';
    }

    async function createNewPage() {
      const raw = prompt("새 페이지 파일명 (소문자·숫자·하이픈만, .html 자동 추가):", "my-page");
      if (raw === null) return;
      const base = String(raw).trim().toLowerCase().replace(/\\.html$/, "");
      if (!/^[a-z0-9-]{1,40}$/.test(base)) { alert("파일명이 올바르지 않습니다."); return; }
      const name = base + ".html";
      const sel = document.getElementById("newPageTemplate");
      const kind = sel ? sel.value : "blank";
      try {
        const lr = await fetch("/api/files");
        const ld = await lr.json();
        if (ld.ok && Array.isArray(ld.files) && ld.files.some(f => f.name === name)) { alert("이미 있는 파일명입니다."); return; }
        const skeleton = buildSkeleton(kind, base);
        const r = await fetch("/api/files/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content: skeleton }) });
        const d = await r.json();
        if (!d.ok) { alert("생성 실패: " + (d.error || "오류")); return; }
        await loadWorkspaceFiles();
        alert("생성됨: " + name + " (주인: gemgem, 템플릿: " + kind + ")");
      } catch (e) { alert("오류: " + e.message); }
    }`;
cockpitTxt = replaceOnce(cockpitTxt, F5_2_OLD, F5_2_NEW, "F5-2 cockpit createNewPage (템플릿 지원)");


// ============================================================================
// 파일 쓰기 및 문법 검증
// ============================================================================
try {
  fs.writeFileSync(FILES.server, serverTxt, "utf8");
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

// 2) cockpit.html: <script> 전 블록 문법 검사
checkHtmlScripts(cockpitTxt, "cockpit.html");

console.log("\n🎉 B2 패치 적용 및 전 항목 문법 검증 완료!");
