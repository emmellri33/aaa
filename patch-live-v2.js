// 파일명: /workspaces/aaa/patch-live-v2.js  (수정판 v2 — 중복 route 제거, 미들웨어 방식)
// 실행법: VS Code 에디터에 이 전문을 붙여넣어 저장 후, 터미널에서 -> node /workspaces/aaa/patch-live-v2.js
// (server.js＋blank.html＋.gitignore에 적용됩니다.)
const fs = require("fs");
const path = require("path");

const ROOT = "/workspaces/aaa";
const serverFile = path.join(ROOT, "server.js");
const blankFile = path.join(ROOT, "blank.html");
let srv = fs.readFileSync(serverFile, "utf8");

// --- [A] server.js: 저장 직전 스냅샷 미들웨어 ＋ /api/rollback ---
const MARK = "live-v2-snapshot-middleware";
if (srv.includes(MARK)) {
  console.log("server.js already patched. Skipping server patch.");
} else {
  const pageIndexAnchor = "app.post('/api/page/index', (req, res) => {";
  const snapshotAnchor = "app.post('/api/snapshot', async (req, res) => {";
  if (!srv.includes(pageIndexAnchor)) {
    console.log("SKIP: server.js page/index anchor not found");
  } else if (!srv.includes(snapshotAnchor)) {
    console.log("SKIP: server.js snapshot anchor not found");
  } else {
    const middleware = `// --- live 보호 v2 (${MARK}): 저장 직전 디스크 스냅샷 (원본 핸들러로 next() 통과, 중복 route 없음) ---
const SNAPSHOT_META_PATH = path.join(__dirname, 'snapshot-meta.json');
function saveSnapshotToDisk(content) {
  try {
    fs.writeFileSync(SNAPSHOT_META_PATH, JSON.stringify({ content, timestamp: new Date().toISOString() }, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}
function loadSnapshotFromDisk() {
  try {
    if (!fs.existsSync(SNAPSHOT_META_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(SNAPSHOT_META_PATH, "utf8"));
    return typeof data.content === "string" ? data.content : null;
  } catch (e) {
    return null;
  }
}
app.post('/api/page/index', (req, res, next) => {
  try {
    if (req.body && typeof req.body.content === 'string' && fs.existsSync(INDEX_PATH)) {
      saveSnapshotToDisk(fs.readFileSync(INDEX_PATH, 'utf8'));
    }
  } catch (e) {}
  next();
});

`;
    srv = srv.replace(pageIndexAnchor, middleware + pageIndexAnchor);

    const rollbackRoute = `// --- live 보호 v2: 디스크 스냅샷 자동 복원 (복원 후 재확인 포함) ---
app.post('/api/rollback', async (req, res) => {
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
});

`;
    srv = srv.replace(snapshotAnchor, rollbackRoute + snapshotAnchor);
    fs.writeFileSync(serverFile, srv, "utf8");
    console.log("patched: server.js snapshot middleware & rollback route added");
  }
}

// --- [B] blank.html: 렌더 기준 트리거(health·확인 선택자) 및 자동 롤백 ---
let blk = fs.readFileSync(blankFile, "utf8");

// 원본 22행 통째 교체(조각末尾 `} else {`가 원본 else를 대체, 원본 else 본문·self-heal은 유지)
const blankOldLines = [
"        backupContent = current;",
"        const r = await fetch(\"/api/page/index\", {",
"          method: \"POST\",",
"          headers: { \"Content-Type\": \"application/json\" },",
"          body: JSON.stringify({ content: working })",
"        });",
"        const resData = await r.json();",
"        if (resData.ok) {",
"          await loadIndexCode();",
"          applyBtn.disabled = true;",
"          applyBtn.innerText = \"✅ 적용됨\";",
"          applyBtn.style.opacity = \"0.5\";",
"          applyBtn.style.cursor = \"not-allowed\";",
"          undoBtn.disabled = false;",
"          undoBtn.style.opacity = \"1\";",
"          undoBtn.style.cursor = \"pointer\";",
"          undoBtn.style.background = \"#ea580c\";",
"          statusSpan.style.color = \"#059669\";",
"          statusSpan.innerText = `✅ 전 조각(${edits.length}개) 원자적 반영됨 (1차 글자·공백 통과)`;",
"          try { await runEyeReport(\"적용 후\"); } catch (e) { statusSpan.innerText += \" (눈 실패)\"; }",
"        } else {",
];
const blankOld = blankOldLines.join("\n");const rollbackClientCode = `        backupContent = current;
        // live 보호 v2: 패치 카드 확인 선택자(없으면 기본 #hello)로 렌더 검증 후 자동 롤백
        const confirmSelector = (patch && patch.confirmSelector) ? patch.confirmSelector : "#hello";

        const r = await fetch("/api/page/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: working })
        });
        const resData = await r.json();
        if (resData.ok) {
          await loadIndexCode();

          // [렌더 기준 트리거 검증]
          let rollbackReason = "";
          // 1) Health 체크 실패
          try {
            const hRes = await fetch("/health");
            if (!hRes.ok) rollbackReason = "Health 체크 실패";
          } catch {
            rollbackReason = "Health 서버 통신 불가";
          }

          // 2) 렌더(iframe) 검증: 확인 선택자 존재 여부
          if (!rollbackReason) {
            try {
              const frame = document.getElementById("indexPreview");
              const win = frame ? frame.contentWindow : null;
              const doc = win ? win.document : null;
              if (!doc) {
                rollbackReason = "iframe document 접근 불가";
              } else {
                if (!doc.querySelector(confirmSelector)) {
                  rollbackReason = \`패치 카드 확인 선택자(\${confirmSelector})가 렌더에 존재하지 않음\`;
                }
              }
            } catch (e) {
              rollbackReason = "iframe 렌더 검증 예외: " + e.message;
            }
          }

          // [자동 롤백 실행]
          if (rollbackReason) {
            try {
              const rbRes = await fetch("/api/rollback", { method: "POST" });
              const rbJson = await rbRes.json();
              if (!rbJson.ok) throw new Error(rbJson.error || "rollback failed");
              await loadIndexCode();
              await runEyeReport("자동 롤백 후", { reload: true });
              disarmConfirm();
              applyBtn.disabled = false;
              applyBtn.style.opacity = "1";
              applyBtn.style.cursor = "pointer";
              statusSpan.style.color = "#dc2626";
              statusSpan.innerText = \`자동 롤백됨 (사유: \${rollbackReason})\`;
              await logFailureToServer("렌더 검증 실패 자동 롤백", rollbackReason, "디스크 스냅샷으로 즉시 복원됨");
              return;
            } catch (rbErr) {
              statusSpan.style.color = "#dc2626";
              statusSpan.innerText = "롤백 실패: " + rbErr.message;
              await logFailureToServer("롤백 실패", rbErr.message, "복원 중단");
              return;
            }
          }

          applyBtn.disabled = true;
          applyBtn.innerText = "적용됨";
          applyBtn.style.opacity = "0.5";
          applyBtn.style.cursor = "not-allowed";
          undoBtn.disabled = false;
          undoBtn.style.opacity = "1";
          undoBtn.style.cursor = "pointer";
          undoBtn.style.background = "#ea580c";
          statusSpan.style.color = "#059669";
          statusSpan.innerText = \`전 조각(\${edits.length}개) 원자적 반영됨 (렌더 검증 통과)\`;
          try { await runEyeReport("적응 후"); } catch (e) { statusSpan.innerText += " (눈 실패)"; }
        } else {`;

if (blk.includes("api/rollback")) {
  console.log("blank.html rollback logic already exists. Skipping blank patch.");
} else if (!blk.includes(blankOld)) {
  console.log("SKIP: blank.html anchor block not found (multi-line mismatch)");
} else {
  fs.writeFileSync("/tmp/blank.html.pre-v2.bak", blk, "utf8");
  blk = blk.replace(blankOld, rollbackClientCode);
  fs.writeFileSync(blankFile, blk, "utf8");
  console.log("patched: blank.html render-based trigger and automatic rollback applied");
}

// --- [C] .gitignore에 snapshot-meta.json 추가 (git add -A 오포함 방지) ---
const giFile = path.join(ROOT, ".gitignore");
try {
  let gi = fs.readFileSync(giFile, "utf8");
  if (gi.split("\n").some((l) => l.trim() === "snapshot-meta.json")) {
    console.log(".gitignore already covers snapshot-meta.json.");
  } else {
    if (!gi.endsWith("\n")) gi += "\n";
    fs.writeFileSync(giFile, gi + "snapshot-meta.json\n", "utf8");
    console.log("patched: .gitignore += snapshot-meta.json");
  }
} catch (e) {
  console.log("SKIP: .gitignore not readable (" + e.message + ")");
}
console.log("DONE");