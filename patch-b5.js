#!/usr/bin/env node
/**
 * patch-b5.js — B5 시각 검증 고도화 및 런타임 에러 포착 패처
 * 규칙:
 * 1) 파일 통갈이 금지 — 정확히 1회 매치되는 앵커 치환만 수행
 * 2) 앵커 매치 횟수가 정확히 1회가 아니면 즉시 중단 및 원복 (fail-closed)
 * 3) server.js `node --check` (무변경 확인용 하네스 유지) + blank.html <script> 전 블록 문법 검사 통과 필수
 * 4) server.js, cockpit.html, manifest.json은 일절 수정하지 않음.
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
  if (typeof originals.blank === "string") {
    try {
      fs.writeFileSync(FILES.blank, originals.blank, "utf8");
    } catch (e) {
      console.error(`⚠️ 원복 실패 (${FILES.blank}): ${e.message}`);
    }
  }
  console.error("↩️ blank.html 원본 상태로 원복 완료.");
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

// ============================================================================
// T1. 미리보기 버튼 3개 (blank.html — #5·#6·#26 진입점)
// ============================================================================
const T1_OLD = `            <button class="small-btn" id="vpPhoneBtn" title="폰 뷰포트 390px">📱 390</button>
            <button class="small-btn" id="vpDeskBtn" title="데스크톱 1920px">🖥 1920</button>
            <button class="small-btn" id="vpResetBtn" title="뷰포트 리셋">↩ 리셋</button>
            <button class="small-btn" onclick="loadIndexCode()">🔄 새로고침</button>`;

const T1_NEW = `            <button class="small-btn" id="vpPhoneBtn" title="폰 뷰포트 390px">📱 390</button>
            <button class="small-btn" id="vpDeskBtn" title="데스크톱 1920px">🖥 1920</button>
            <button class="small-btn" id="vpResetBtn" title="뷰포트 리셋">↩ 리셋</button>
            <button class="small-btn" onclick="loadIndexCode()">🔄 새로고침</button>
            <button class="small-btn" id="toggleStageBtn" title="스테이징/라이브 전환">🔀 원본/스테이징</button>
            <button class="small-btn" id="inspectBtn" title="미리보기 요소 클릭 선택">🎯 요소 선택</button>
            <button class="small-btn" id="cmpShotBtn" title="적용 전/후 스크린샷 비교">📸 전/후</button>`;

blankTxt = replaceOnce(blankTxt, T1_OLD, T1_NEW, "T1 blank 미리보기 버튼 3개 추가");

// ============================================================================
// W1. 스테이지 도구 JS (blank.html — 버튼 배선 + 헬퍼)
// ============================================================================
const W1_OLD = `    (function wireViewportBtns() {
      const p = document.getElementById("vpPhoneBtn");
      const d = document.getElementById("vpDeskBtn");
      const r = document.getElementById("vpResetBtn");
      if (p) p.onclick = () => { setPreviewViewport(390); runEyeReport("뷰포트 390"); };
      if (d) d.onclick = () => { setPreviewViewport(1920); runEyeReport("뷰포트 1920"); };
      if (r) r.onclick = () => { setPreviewViewport(0); runEyeReport("리셋"); };
    })();`;

const W1_NEW = `    (function wireViewportBtns() {
      const p = document.getElementById("vpPhoneBtn");
      const d = document.getElementById("vpDeskBtn");
      const r = document.getElementById("vpResetBtn");
      if (p) p.onclick = () => { setPreviewViewport(390); runEyeReport("뷰포트 390"); };
      if (d) d.onclick = () => { setPreviewViewport(1920); runEyeReport("뷰포트 1920"); };
      if (r) r.onclick = () => { setPreviewViewport(0); runEyeReport("리셋"); };
    })();
    window.__stagedHtml = null;
    window.__preShot = null;
    window.__postShot = null;
    (function wireStageTools() {
      const tg = document.getElementById("toggleStageBtn");
      if (tg) tg.onclick = () => {
        if (isStagingPreview) { setStagingMode(false); }
        else if (window.__stagedHtml) { setStagingMode(true, window.__stagedHtml); }
      };
      const ib = document.getElementById("inspectBtn");
      if (ib) ib.onclick = () => toggleInspector();
      const cb = document.getElementById("cmpShotBtn");
      if (cb) cb.onclick = () => showShotCompare();
    })();
    function cssPathFor(el) {
      try {
        if (!el || el.nodeType !== 1) return null;
        if (el.id) return "#" + el.id;
        const parts = [];
        let cur = el;
        while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== "html" && parts.length < 5) {
          const tag = cur.tagName.toLowerCase();
          let nth = "";
          try {
            const par = cur.parentElement;
            if (par) {
              const same = [...par.children].filter(c => c.tagName === cur.tagName);
              if (same.length > 1) nth = ":nth-of-type(" + (same.indexOf(cur) + 1) + ")";
            }
          } catch {}
          let seg = tag + nth;
          if (cur.hasAttribute && cur.hasAttribute("data-gemgem-root")) seg += "[data-gemgem-root]";
          else if (cur.className && typeof cur.className === "string" && cur.className.trim() && !/\\s/.test(cur.className.trim())) seg += "." + cur.className.trim();
          parts.unshift(seg);
          cur = cur.parentElement;
        }
        return parts.join(" > ");
      } catch { return null; }
    }
    function findLineForSelector(sel) {
      try {
        const src = (typeof contextText !== "undefined" && contextText.value) || "";
        if (!src || !sel) return -1;
        const lines = src.split("\\n");
        let key = sel;
        const m = sel.match(/#([\\w\\-]+)/);
        if (m) key = m[1];
        else {
          const t = sel.match(/([\\w\\-]+)(?:\\.|#|:|\\[|$)/);
          if (t) key = t[1]; else return -1;
        }
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(key)) return i + 1;
        }
        return -1;
      } catch { return -1; }
    }
    let __inspecting = false;
    function toggleInspector() {
      const btn = document.getElementById("inspectBtn");
      const frame = document.getElementById("indexPreview");
      __inspecting = !__inspecting;
      if (btn) btn.style.background = __inspecting ? "#ea580c" : "";
      try { if (frame) frame.style.pointerEvents = "auto"; } catch {}
      if (__inspecting && frame) {
        try {
          const doc = frame.contentDocument;
          if (doc) doc.addEventListener("click", __inspectClick, true);
        } catch {}
      }
    }
    function __inspectClick(e) {
      if (!__inspecting) return;
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      __inspecting = false;
      const btn = document.getElementById("inspectBtn");
      if (btn) btn.style.background = "";
      let sel = null;
      try { sel = cssPathFor(e.target); } catch {}
      if (!sel) return;
      const ln = findLineForSelector(sel);
      try {
        chatInput.value = sel + (ln > 0 ? " (" + ln + "행)" : "");
        adjustTextareaHeight();
        chatInput.focus();
      } catch {}
    }
    function showShotCompare() {
      try {
        const pre = document.getElementById("cmpImgPre");
        const post = document.getElementById("cmpImgPost");
        const note = document.getElementById("cmpNote");
        const hasPre = !!window.__preShot, hasPost = !!window.__postShot;
        if (pre) { pre.src = hasPre ? window.__preShot : ""; pre.style.display = hasPre ? "block" : "none"; }
        if (post) { post.src = hasPost ? window.__postShot : ""; post.style.display = hasPost ? "block" : "none"; }
        if (note) note.style.display = (hasPre && hasPost) ? "none" : "block";
        document.getElementById("shotModal").classList.add("open");
      } catch {}
    }`;

blankTxt = replaceOnce(blankTxt, W1_OLD, W1_NEW, "W1 blank 스테이지 도구 JS 및 헬퍼 삽입");

// ============================================================================
// M3. 전/후 모달 DOM (blank.html — #26)
// ============================================================================
const M3_OLD = `  <!-- 모달 2: 대화 목록 관리 -->`;
const M3_NEW = `  <!-- 모달: 전/후 스크린샷 비교 -->
  <div class="modal-backdrop" id="shotModal">
    <div class="modal-box">
      <div class="modal-header">
        <span>📸 적용 전 / 후 비교</span>
        <button class="small-btn" onclick="closeModal('shotModal')">닫기</button>
      </div>
      <div class="modal-body">
        <div id="cmpNote" style="font-size:12px;color:#64748b;">스냅샷이 없습니다. 패치를 1건 진행하면 전/후가 저장됩니다.</div>
        <div style="display:flex;gap:8px;">
          <div style="flex:1;"><div style="font-size:12px;font-weight:700;margin-bottom:4px;">적용 전</div><img id="cmpImgPre" style="width:100%;border:1px solid #cbd5e1;border-radius:6px;" /></div>
          <div style="flex:1;"><div style="font-size:12px;font-weight:700;margin-bottom:4px;">적용 후</div><img id="cmpImgPost" style="width:100%;border:1px solid #cbd5e1;border-radius:6px;" /></div>
        </div>
      </div>
    </div>
  </div>

  <!-- 모달 2: 대화 목록 관리 -->`;

blankTxt = replaceOnce(blankTxt, M3_OLD, M3_NEW, "M3 blank 전/후 모달 DOM 추가");

// ============================================================================
// E1. 런타임 수집기 (blank.html — #15, 초기화 시점에 후크)
// ============================================================================
const E1_OLD = `    loadIndexCode();
    reloadIndexBtn.onclick = loadIndexCode;`;

const E1_NEW = `    loadIndexCode();
    reloadIndexBtn.onclick = loadIndexCode;
    window.__rtErrors = [];
    (function __hookIframeRt() {
      const fr = document.getElementById("indexPreview");
      if (!fr || fr.__rtHooked) return;
      fr.__rtHooked = true;
      fr.addEventListener("load", () => {
        try {
          const w = fr.contentWindow;
          if (!w) return;
          w.addEventListener("error", (e) => {
            try {
              const sig = String((e && e.message) || "error") + "@" + String((e && e.filename) || "") + ":" + String((e && e.lineno) || "");
              if (window.__rtErrors.length < 20) window.__rtErrors.push({ sig: sig.slice(0, 200), at: Date.now() });
            } catch {}
          });
          w.addEventListener("unhandledrejection", (e) => {
            try {
              const r = e && e.reason;
              const sig = "unhandledrejection: " + String((r && (r.message || r)) || "");
              if (window.__rtErrors.length < 20) window.__rtErrors.push({ sig: sig.slice(0, 200), at: Date.now() });
            } catch {}
          });
        } catch {}
      });
    })();`;

blankTxt = replaceOnce(blankTxt, E1_OLD, E1_NEW, "E1 blank iframe 런타임 수집기 후크 설치");

// ============================================================================
// M1. 스테이징 저장 (blank.html — #5 원본 + #26 전샷)
// ============================================================================
const M1_OLD = `          setStagingMode(true, working);
          statusSpan.style.color = "#2563eb";
          statusSpan.innerText = \`✅ 검증 통과(\${edits.length}조각, 스냅샷済 · 스테이징 렌더됨) — 확정하려면 한 번 더 누르세요\`;
          try { await runEyeReport("스테이징", { reload: false }); } catch (e) { statusSpan.innerText += " (스테이징 눈 실패)"; }`;

const M1_NEW = `          setStagingMode(true, working);
          window.__stagedHtml = working;
          statusSpan.style.color = "#2563eb";
          statusSpan.innerText = \`✅ 검증 통과(\${edits.length}조각, 스냅샷済 · 스테이징 렌더됨) — 확정하려면 한 번 더 누르세요\`;
          try { await runEyeReport("스테이징", { reload: false }); } catch (e) { statusSpan.innerText += " (스테이징 눈 실패)"; }
          try {
            const _tr0 = (typeof patch !== "undefined" && patch && patch.target) ? patch.target : ((typeof targetPageSelect !== "undefined" && targetPageSelect && targetPageSelect.value) || "index.html");
            const _sr0 = await fetch("/api/observe-shot?target=" + encodeURIComponent(_tr0 === "index" ? "index.html" : _tr0));
            const _sd0 = await _sr0.json();
            window.__preShot = (_sd0 && _sd0.ok && _sd0.image) ? ("data:image/png;base64," + _sd0.image) : null;
          } catch { window.__preShot = null; }`;

blankTxt = replaceOnce(blankTxt, M1_OLD, M1_NEW, "M1 blank stagedHtml 및 preShot 저장");

// ============================================================================
// E2a. 베이스라인 (blank.html — #15, 확정 클릭 직전)
// ============================================================================
const E2A_OLD = `        backupContent = current;`;
const E2A_NEW = `        backupContent = current;
        window.__rtBase = Date.now();`;

blankTxt = replaceOnce(blankTxt, E2A_OLD, E2A_NEW, "E2a blank 런타임 에러 타임스탬프 베이스라인 기록");

// ============================================================================
// M2. 후샷 저장 (blank.html — #26)
// ============================================================================
const M2_OLD = `              const shotData = await shotRes.json();
              if (shotData.ok && shotData.image) {`;

const M2_NEW = `              const shotData = await shotRes.json();
              window.__postShot = (shotData && shotData.ok && shotData.image) ? ("data:image/png;base64," + shotData.image) : null;
              if (shotData.ok && shotData.image) {`;

blankTxt = replaceOnce(blankTxt, M2_OLD, M2_NEW, "M2 blank postShot 저장");

// ============================================================================
// E2b. 신규 에러 판정 (blank.html — #15, 기존 검증 뒤)
// ============================================================================
const E2B_OLD = `            } catch (e) {
              rollbackReason = "iframe 렌더 검증 예외: " + e.message;
            }`;

const E2B_NEW = `            } catch (e) {
              rollbackReason = "iframe 렌더 검증 예외: " + e.message;
            }
            try {
              const _rtT0 = Date.now();
              let _rtSeen = (window.__rtErrors || []).filter(e => e && e.at >= (window.__rtBase || 0));
              while (_rtSeen.length === 0 && !rollbackReason && (Date.now() - _rtT0) < 2500) {
                await new Promise(r => setTimeout(r, 250));
                _rtSeen = (window.__rtErrors || []).filter(e => e && e.at >= (window.__rtBase || 0));
              }
            } catch {}
            const freshRt = (window.__rtErrors || []).filter(e => e && e.at >= (window.__rtBase || 0));
            if (!rollbackReason && freshRt.length > 0) {
              rollbackReason = "런타임 에러(" + freshRt.length + "건): " + String(freshRt[0].sig || "").slice(0, 120);
            }`;

blankTxt = replaceOnce(blankTxt, E2B_OLD, E2B_NEW, "E2b blank 신규 런타임 에러 정착 대기 및 판정");

// ============================================================================
// V25. 판정 사유 표시 (blank.html — #25)
// ============================================================================
const V25_OLD = `                if (!verifyData.ok) {
                  rollbackReason = \`시각적 깨짐: \${verifyData.reason}\`;
                }`;

const V25_NEW = `                if (!verifyData.ok) {
                  rollbackReason = \`시각적 깨짐: \${verifyData.reason}\`;
                } else {
                  try { window.__lastVerifyReason = String(verifyData.reason || "깨짐 없음"); } catch {}
                }`;

blankTxt = replaceOnce(blankTxt, V25_OLD, V25_NEW, "V25 blank 시각 판정 사유(__lastVerifyReason) 저장");

// ============================================================================
// V25b. 판정 사유 덧붙임 (blank.html — #25, 성공 경로)
// ============================================================================
const V25B_OLD = `          statusSpan.innerText = \`전 조각(\${edits.length}개) 원자적 반영됨 (렌더 검증 통과)\`;
          try { await runEyeReport("적응 후"); } catch (e) { statusSpan.innerText += " (눈 실패)"; }`;

const V25B_NEW = `          statusSpan.innerText = \`전 조각(\${edits.length}개) 원자적 반영됨 (렌더 검증 통과)\`;
          try { await runEyeReport("적응 후"); } catch (e) { statusSpan.innerText += " (눈 실패)"; }
          try { const _vr = window.__lastVerifyReason; if (_vr) document.getElementById("eyeReport").innerText += " · 시각 판정: " + String(_vr).slice(0, 200); } catch {}`;

blankTxt = replaceOnce(blankTxt, V25B_OLD, V25B_NEW, "V25b blank 눈 보고 뒤에 시각 판정 사유 덧붙임");

// ============================================================================
// 파일 쓰기 및 문법 검증
// ============================================================================
try {
  fs.writeFileSync(FILES.blank, blankTxt, "utf8");
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

// 2) blank.html: <script> 전 블록 문법 검사
checkHtmlScripts(blankTxt, "blank.html");

console.log("\n🎉 B5 패치 적용 및 전 항목 문법 검증 완료!");
