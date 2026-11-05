#!/usr/bin/env node
/**
 * patch-b6b.js — B6b 부분 적용, 모델 라우팅 & 비상 백업 체계 패처
 * 규칙:
 * 1) 파일 통갈이 금지 — 정확히 1회 매치되는 앵커 치환만 수행
 * 2) 앵커 매치 횟수가 정확히 1회가 아니면 즉시 중단 및 원복 (fail-closed)
 * 3) server node --check 및 blank.html / cockpit.html <script> 전 블록 문법 검사 통과 필수
 * 4) server.js, manifest.json은 일절 수정하지 않음.
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

let blankTxt = originals.blank;
let cockpitTxt = originals.cockpit;


// ============================================================================
// P1. 조각 체크박스 (blank.html)
// ============================================================================
const P1_OLD = `            <div style="font-size:11.5px; font-weight:700; color:#334155; margin-bottom:4px;">🧩 조각 \${idx + 1} / \${edits.length} — <span>\${badge}\${impact}</span></div>`;
const P1_NEW = `            <div style="font-size:11.5px; font-weight:700; color:#334155; margin-bottom:4px;"><input type="checkbox" class="piece-check" data-i="\${idx}" checked style="margin-right:6px;transform:scale(1.2);">🧩 조각 \${idx + 1} / \${edits.length} — <span>\${badge}\${impact}</span></div>`;

blankTxt = replaceOnce(blankTxt, P1_OLD, P1_NEW, "P1 blank.html 조각 체크박스 DOM 추가");


// ============================================================================
// P2. 선택 조각만 적용 (blank.html)
// ============================================================================
const P2_OLD = `        let working = current;`;
const P2_NEW = `        let working = current;
        const edits = baseEditsFilter();
        function baseEditsFilter() {
          try {
            const boxes = [...bubble.querySelectorAll(".piece-check")];
            const idx = boxes.filter(c => c.checked).map(c => +c.getAttribute("data-i"));
            if (!idx.length) return null;
            const base = normalizePatchEdits(patch);
            return base.filter((_, i) => idx.includes(i));
          } catch { return null; }
        }
        if (!edits || !edits.length) {
          try { applyBtn.innerText = "✅ 선택 조각 적용"; } catch {}
          statusSpan.style.color = "#dc2626";
          statusSpan.innerText = "❌ 선택된 조각이 없습니다 (체크박스를 1개 이상 선택하세요)";
          try { disarmConfirm(); } catch {}
          return;
        }
        try { applyBtn.innerText = "✅ 선택 " + edits.length + "조각 적용"; } catch {}`;

blankTxt = replaceOnce(blankTxt, P2_OLD, P2_NEW, "P2 blank.html 선택 조각만 적용 및 버튼 텍스트 변경");


// ============================================================================
// M1. Auto 옵션 (blank.html)
// ============================================================================
const M1_OLD = `          <option value="gemini-3.8-flash" selected>Gemini 3.8 Flash (메인)</option>`;
const M1_NEW = `          <option value="gemini-3.8-flash" selected>Gemini 3.8 Flash (메인)</option>
          <option value="auto">✨ Auto (자동 선택)</option>`;

blankTxt = replaceOnce(blankTxt, M1_OLD, M1_NEW, "M1 blank.html 모델 선택기에 Auto 옵션 추가");


// ============================================================================
// M2. Auto 해소 함수 (blank.html)
// ============================================================================
const M2_OLD = `    modelSelect.onchange = () => { saveRoomPin(); };`;
const M2_NEW = `    modelSelect.onchange = () => { saveRoomPin(); };
    function resolveModel(kind) {
      try {
        const sel = (typeof modelSelect !== "undefined" && modelSelect && modelSelect.value) || "";
        if (sel && sel !== "auto") return sel;
        const ctxLen = ((typeof contextText !== "undefined" && contextText.value) ? contextText.value.length : 0) + ((typeof chatInput !== "undefined" && chatInput.value) ? chatInput.value.length : 0);
        if (kind === "patch") return "gemini-3.8-flash";
        if (ctxLen > 24000) return "gemini-3.1-pro-preview";
        return "gemini-3.8-flash";
      } catch { return "gemini-3.8-flash"; }
    }`;

blankTxt = replaceOnce(blankTxt, M2_OLD, M2_NEW, "M2 blank.html resolveModel 함수 추가");


// ============================================================================
// M3. 채팅 전송 Auto (blank.html)
// ============================================================================
const M3_OLD = `body: JSON.stringify({ message: promptPayload, pageContext: (typeof contextText !== "undefined" ? contextText.value : ""), model: modelSelect.value, roomId: currentRoomId, images: imageFiles, recentTurns: buildRecentTurns() })`;
const M3_NEW = `body: JSON.stringify({ message: promptPayload, pageContext: (typeof contextText !== "undefined" ? contextText.value : ""), model: resolveModel("chat"), roomId: currentRoomId, images: imageFiles, recentTurns: buildRecentTurns() })`;

blankTxt = replaceOnce(blankTxt, M3_OLD, M3_NEW, "M3 blank.html /api/chat 호출 시 resolveModel 사용");


// ============================================================================
// M4. 패치 전송 Auto (blank.html)
// ============================================================================
const M4_OLD = `          model: modelSelect.value,
          images: imageFiles,
          recentTurns: buildRecentTurns()`;
const M4_NEW = `          model: resolveModel("patch"),
          images: imageFiles,
          recentTurns: buildRecentTurns()`;

blankTxt = replaceOnce(blankTxt, M4_OLD, M4_NEW, "M4 blank.html /api/ai-modify 호출 시 resolveModel 사용");


// ============================================================================
// F1. 경고 배너 DOM (blank.html)
// ============================================================================
const F1_OLD = `      <div class="attachment-preview" id="attachmentPreview" style="display: none;"></div>`;
const F1_NEW = `      <div class="attachment-preview" id="attachmentPreview" style="display: none;"></div>
      <div id="failBanner" style="display:none;align-items:center;gap:8px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:6px 10px;font-size:12px;color:#92400e;margin:6px 10px 0;"><span id="failBannerText" style="flex:1;"></span><button class="small-btn" onclick="refreshFailBanner()">↻</button><button class="small-btn" onclick="document.getElementById('failBanner').style.display='none'">✕</button></div>`;

blankTxt = replaceOnce(blankTxt, F1_OLD, F1_NEW, "F1 blank.html failBanner DOM 추가");


// ============================================================================
// F2. 배너 JS (blank.html)
// ============================================================================
const F2_OLD = `    document.getElementById("menuOpenFiles").onclick = openFilesModal;`;
const F2_NEW = `    document.getElementById("menuOpenFiles").onclick = openFilesModal;
    async function refreshFailBanner() {
      try {
        const r = await fetch("/api/failures");
        const d = await r.json();
        const box = document.getElementById("failBanner");
        const tx = document.getElementById("failBannerText");
        if (!box || !tx) return;
        const txt = String((d && d.content) || "");
        const rows = txt.split("\\n").map(s => s.trim()).filter(l => /^\\|/.test(l) && !/^\\|[\\s|\\-:]+$/.test(l) && !/^\\|\\s*언제/.test(l)).slice(-3);
        if (!rows.length) { box.style.display = "none"; return; }
        box.style.display = "flex";
        tx.innerText = "⚠️ 최근 실패 " + rows.length + "건: " + rows.map(rr => (rr.split("|")[2] || "").trim()).join(" / ").slice(0, 160);
      } catch {}
    }
    refreshFailBanner();`;

blankTxt = replaceOnce(blankTxt, F2_OLD, F2_NEW, "F2 blank.html refreshFailBanner 함수 추가");


// ============================================================================
// X1. 백업 버튼 (cockpit.html)
// ============================================================================
const X1_OLD = `            <button class="btn" onclick="submitCommit()">커밋</button>`;
const X1_NEW = `            <button class="btn" onclick="submitCommit()">커밋</button>
            <button class="btn" onclick="exportBackup()">⬇ 백업(zip)</button>`;

cockpitTxt = replaceOnce(cockpitTxt, X1_OLD, X1_NEW, "X1 cockpit.html 커밋 탭 백업 버튼 추가");


// ============================================================================
// X2. 백업 JS (cockpit.html)
// ============================================================================
const X2_OLD = `    async function loadGitStatus() {`;
const X2_NEW = `    async function exportBackup() {
      const msg = document.getElementById("commitResultMsg");
      try {
        if (msg) { msg.style.color = "#94a3b8"; msg.innerText = "⏳ 백업 준비 중..."; }
        if (!window.JSZip) {
          await new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
            s.onload = res;
            s.onerror = () => rej(new Error("JSZip CDN 로드 실패"));
            document.head.appendChild(s);
          });
        }
        const lr = await fetch("/api/files");
        const ld = await lr.json();
        const files = ((ld && ld.files) || []).filter(f => f && f.name && (f.size || 0) <= 512000);
        if (!files.length) throw new Error("백업할 파일이 없습니다");
        const zip = new window.JSZip();
        for (const f of files) {
          try {
            const r = await fetch("/api/files/read?name=" + encodeURIComponent(f.name));
            const d = await r.json();
            if (d.ok) zip.file(f.name, d.content || "");
          } catch {}
        }
        const blob = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
        a.href = URL.createObjectURL(blob);
        a.download = "backup-" + stamp + ".zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (msg) { msg.style.color = "#22c55e"; msg.innerText = "✅ 백업 다운로드 시작 (" + files.length + "개 파일)"; }
      } catch (e) { if (msg) { msg.style.color = "#ef4444"; msg.innerText = "❌ 백업 실패: " + e.message; } }
    }
    async function loadGitStatus() {`;

cockpitTxt = replaceOnce(cockpitTxt, X2_OLD, X2_NEW, "X2 cockpit.html exportBackup 함수 추가");


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

console.log("\n🎉 B6b 패치 적용 및 전 항목 문법 검증 완료!");
