#!/usr/bin/env node
/**
 * patch-b1a.js — B1a 다중 페이지 롤백·렌더 앵커 코어 복구 패처
 * 규칙:
 * 1) 파일 통갈이 금지 — 정확히 1회 매치되는 앵커 치환만 수행
 * 2) 앵커 매치 횟수가 정확히 1회가 아니면 즉시 중단 및 전 파일 원복 (fail-closed)
 * 3) server.js `node --check` + blank.html / cockpit.html <script> 문법 검사 통과 필수
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
  console.error("↩️ 3개 파일(server.js, blank.html, cockpit.html) 모두 원본 상태로 원복 완료.");
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
    const code = match[1];
    try {
      new Function(code);
    } catch (e) {
      abort(`${fileLabel} <script #${idx}> 문법검사`, e.message);
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
// F1-1. server.js — saveSnapshotToDisk 교체 (346~353)
// ============================================================================
const F1_1_OLD = `function saveSnapshotToDisk(content) {
  try {
    fs.writeFileSync(SNAPSHOT_META_PATH, JSON.stringify({ content, timestamp: new Date().toISOString() }, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}`;

const F1_1_NEW = `function saveSnapshotToDisk(content, filename) {
  try {
    let t = String(filename || "index.html").trim() || "index.html";
    if (t === "index") t = "index.html";
    let meta = { byTarget: {} };
    if (fs.existsSync(SNAPSHOT_META_PATH)) {
      try {
        const raw = JSON.parse(fs.readFileSync(SNAPSHOT_META_PATH, "utf8"));
        if (raw && typeof raw === "object") {
          if (raw.byTarget && typeof raw.byTarget === "object" && !Array.isArray(raw.byTarget)) {
            meta.byTarget = { ...raw.byTarget };
          }
          if (typeof raw.content === "string") {
            if (!meta.byTarget["index.html"]) {
              meta.byTarget["index.html"] = {
                content: raw.content,
                timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date(0).toISOString()
              };
            }
          }
        }
      } catch (e) {}
    }
    meta.byTarget[t] = { content: String(content), timestamp: new Date().toISOString() };
    const keys = Object.keys(meta.byTarget);
    if (keys.length > 10) {
      keys.sort((a, b) => {
        const ta = (meta.byTarget[a] && meta.byTarget[a].timestamp) || "";
        const tb = (meta.byTarget[b] && meta.byTarget[b].timestamp) || "";
        return ta.localeCompare(tb);
      });
      while (Object.keys(meta.byTarget).length > 10) {
        const oldest = keys.shift();
        if (!oldest) break;
        delete meta.byTarget[oldest];
      }
    }
    fs.writeFileSync(SNAPSHOT_META_PATH, JSON.stringify({ byTarget: meta.byTarget }, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}`;

serverTxt = replaceOnce(serverTxt, F1_1_OLD, F1_1_NEW, "F1-1 server saveSnapshotToDisk");

// ============================================================================
// F1-2. server.js — loadSnapshotFromDisk 교체 (354~362)
// ============================================================================
const F1_2_OLD = `function loadSnapshotFromDisk() {
  try {
    if (!fs.existsSync(SNAPSHOT_META_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(SNAPSHOT_META_PATH, "utf8"));
    return typeof data.content === "string" ? data.content : null;
  } catch (e) {
    return null;
  }
}`;

const F1_2_NEW = `function loadSnapshotFromDisk(filename) {
  try {
    if (!fs.existsSync(SNAPSHOT_META_PATH)) return null;
    let t = String(filename || "index.html").trim() || "index.html";
    if (t === "index") t = "index.html";
    const data = JSON.parse(fs.readFileSync(SNAPSHOT_META_PATH, "utf8"));
    if (data && data.byTarget && typeof data.byTarget === "object") {
      const entry = data.byTarget[t];
      if (entry && typeof entry.content === "string") return entry.content;
    }
    if (t === "index.html" && data && typeof data.content === "string") {
      return data.content;
    }
    return null;
  } catch (e) {
    return null;
  }
}`;

serverTxt = replaceOnce(serverTxt, F1_2_OLD, F1_2_NEW, "F1-2 server loadSnapshotFromDisk");

// ============================================================================
// F1-3. server.js — 호출 3곳에 파일명 전달 (반드시 직전 const p 행 포함 3줄 이상 앵커)
// ============================================================================
const F1_3A_OLD = `    const p = path.join(__dirname, target);
    if (req.body && typeof req.body.content === 'string' && fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, 'utf8'));
    }`;

const F1_3A_NEW = `    const p = path.join(__dirname, target);
    if (req.body && typeof req.body.content === 'string' && fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, 'utf8'), target);
    }`;

serverTxt = replaceOnce(serverTxt, F1_3A_OLD, F1_3A_NEW, "F1-3a server middleware saveSnapshotToDisk(, target)");

const F1_3B_OLD = `    const p = path.join(__dirname, filename);

    if (fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, "utf8"));`;

const F1_3B_NEW = `    const p = path.join(__dirname, filename);

    if (fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, "utf8"), filename);`;

serverTxt = replaceOnce(serverTxt, F1_3B_OLD, F1_3B_NEW, "F1-3b server /api/files/write saveSnapshotToDisk(, filename)");

const F1_3C_OLD = `    const p = path.join(__dirname, file);
    if (fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, "utf8"));`;

const F1_3C_NEW = `    const p = path.join(__dirname, file);
    if (fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, "utf8"), file);`;

serverTxt = replaceOnce(serverTxt, F1_3C_OLD, F1_3C_NEW, "F1-3c server /api/cockpit/target saveSnapshotToDisk(, file)");

// ============================================================================
// F1-4. server.js — /api/rollback 전체 교체 (1490~1508)
// ============================================================================
const F1_4_OLD = `app.post('/api/rollback', async (req, res) => {
  try {
    const backup = loadSnapshotFromDisk();
    if (!backup) {
      return res.status(404).json({ ok: false, error: "복원할 디스크 스냅샷이 없습니다." });
    }
    fs.writeFileSync(INDEX_PATH, backup, 'utf8');
    const verified = fs.readFileSync(INDEX_PATH, 'utf8') === backup;
    if (!verified) {
      recordSecurityOrToolFailure("롤백 실패", "복원 후 재확인 불일치", "디스크 복원 검증 실패");
      return res.status(500).json({ ok: false, error: "복원 후 재확인 실패" });
    }
    recordSecurityOrToolFailure("확정 후 자동롤백 실행", "렌더 검증 실패로 디스크 백업본 원복 완료", "디스크 스냅샷 복원＋재확인 성공");
    res.json({ ok: true, verified: true, message: "자동 롤백 완료" });
  } catch (e) {
    recordSecurityOrToolFailure("롤백 실패", e.message, "디스크 복원 중 예외 발생");
    res.status(500).json({ ok: false, error: e.message });
  }
});`;

const F1_4_NEW = `app.post('/api/rollback', async (req, res) => {
  try {
    let target = (req.body && typeof req.body.target === "string" && req.body.target.trim()) ? req.body.target.trim() : "index.html";
    if (target === "index") target = "index.html";
    if (isForbiddenFileName(target)) {
      return res.status(400).json({ ok: false, error: "거부됨(400): 허용되지 않은 대상 파일명입니다." });
    }
    const backup = loadSnapshotFromDisk(target);
    if (!backup) {
      return res.status(404).json({ ok: false, error: "복원할 디스크 스냅샷이 없습니다: " + target });
    }
    const targetPath = path.join(__dirname, target);
    fs.writeFileSync(targetPath, backup, 'utf8');
    const verified = fs.readFileSync(targetPath, 'utf8') === backup;
    if (!verified) {
      recordSecurityOrToolFailure("롤백 실패 (" + target + ")", "복원 후 재확인 불일치", "디스크 복원 검증 실패");
      return res.status(500).json({ ok: false, error: "복원 후 재확인 실패: " + target });
    }
    recordSecurityOrToolFailure("확정 후 자동롤백 실행 (" + target + ")", target + " 렌더 검증 실패로 디스크 백업본 원복 완료", "디스크 스냅샷 복원＋재확인 성공");
    res.json({ ok: true, target, verified: true, message: "자동 롤백 완료 (" + target + ")" });
  } catch (e) {
    recordSecurityOrToolFailure("롤백 실패", e.message, "디스크 복원 중 예외 발생");
    res.status(500).json({ ok: false, error: e.message });
  }
});`;

serverTxt = replaceOnce(serverTxt, F1_4_OLD, F1_4_NEW, "F1-4 server /api/rollback");

// ============================================================================
// F2. blank.html — 605~606행 교체 (반드시 removeAttribute 행 포함 2줄 앵커)
// ============================================================================
const F2_OLD = `        try { frame.removeAttribute("srcdoc"); } catch {}
        frame.src = "index.html?t=" + Date.now();`;

const F2_NEW = `        try { frame.removeAttribute("srcdoc"); } catch {}
        frame.src = ((typeof targetPageSelect !== "undefined" && targetPageSelect && targetPageSelect.value) || "index.html") + "?t=" + Date.now();`;

blankTxt = replaceOnce(blankTxt, F2_OLD, F2_NEW, "F2 blank setStagingMode target fallback");

// ============================================================================
// F3a. blank.html — 1374행 _wantSrc 교체
// ============================================================================
const F3A_OLD = `              const _wantSrc = (typeof _ptF !== "undefined" && _ptF === "cockpit.html") ? "cockpit.html" : "index.html";`;

const F3A_NEW = `              let _wantSrc = (typeof _ptF !== "undefined" && _ptF) ? _ptF : "index.html"; if (_wantSrc === "index") _wantSrc = "index.html";`;

blankTxt = replaceOnce(blankTxt, F3A_OLD, F3A_NEW, "F3a blank _wantSrc");

// ============================================================================
// F3b. blank.html — 1349행 confirmSelector 교체
// ============================================================================
const F3B_OLD = `        const confirmSelector = (patch && patch.confirmSelector) ? patch.confirmSelector : (_ptF === "cockpit.html" ? ".header-title" : "#hello");`;

const F3B_NEW = `        const confirmSelector = (patch && patch.confirmSelector) ? patch.confirmSelector : null;`;

blankTxt = replaceOnce(blankTxt, F3B_OLD, F3B_NEW, "F3b blank confirmSelector init");

// ============================================================================
// F3c. blank.html — 1388~1389행 confirmSelector 폴백 검증 교체
// ============================================================================
const F3C_OLD = `                if (!doc.querySelector(confirmSelector)) {
                  rollbackReason = \`패치 카드 확인 선택자(\${confirmSelector})가 렌더에 존재하지 않음\`;`;

const F3C_NEW = `                let _sel = confirmSelector;
                if (!_sel) {
                  if (_wantSrc === "cockpit.html") _sel = ".header-title";
                  else if (_wantSrc === "index.html") _sel = "#hello";
                  else _sel = doc.querySelector("[data-gemgem-root]") ? "[data-gemgem-root]" : "body";
                }
                if (!doc.querySelector(_sel)) {
                  rollbackReason = \`패치 카드 확인 선택자(\${_sel})가 렌더에 존재하지 않음\`;`;

blankTxt = replaceOnce(blankTxt, F3C_OLD, F3C_NEW, "F3c blank confirmSelector fallback verify");

// ============================================================================
// F4. blank.html — 1424행 /api/rollback 호출 교체
// ============================================================================
const F4_OLD = `              const rbRes = await fetch("/api/rollback", { method: "POST" });`;

const F4_NEW = `              const _rbT = (typeof _ptF !== "undefined" && _ptF) ? _ptF : ((typeof targetPageSelect !== "undefined" && targetPageSelect && targetPageSelect.value) || "index.html");
              const rbRes = await fetch("/api/rollback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: _rbT }) });`;

blankTxt = replaceOnce(blankTxt, F4_OLD, F4_NEW, "F4 blank /api/rollback target fetch");

// ============================================================================
// F5. cockpit.html — 350행 skeleton에 data-gemgem-root 추가
// (역슬래시-n 2문자로 된 리터럴 문자열 매치)
// ============================================================================
const F5_OLD = "</title></head>\\n<body>\\n<h1>";
const F5_NEW = "</title></head>\\n<body data-gemgem-root>\\n<h1>";

cockpitTxt = replaceOnce(cockpitTxt, F5_OLD, F5_NEW, "F5 cockpit skeleton data-gemgem-root");

// ============================================================================
// 파일 쓰기 및 문법 검증 (실패 시 즉시 원복)
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

// 2) blank.html & cockpit.html: <script> 문법 검사
checkHtmlScripts(blankTxt, "blank.html");
checkHtmlScripts(cockpitTxt, "cockpit.html");

console.log("\n🎉 B1a 패치 적용 및 전 항목 문법 검증 완료!");