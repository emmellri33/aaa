// patch-b5f.js — B5f 전/후 동일본 레이스 (버튼 비활성화안). fail-closed.
const fs = require("fs");
const { execSync } = require("child_process");
const BLOCKS = [
{ name: "F1a", old: `          setStagingMode(true, working);
          window.__stagedHtml = working;`, neu: `          setStagingMode(true, working);
          window.__stagedHtml = working;
          window.__stagingReady = false;
          try {
            applyBtn.disabled = true;
            applyBtn.style.opacity = "0.5";
            applyBtn.style.cursor = "not-allowed";
            applyBtn.innerText = "⏳ 스테이징 준비 중…";
            setTimeout(() => {
              try {
                if (window.__stagingReady !== true && armedForConfirm) {
                  statusSpan.style.color = "#dc2626";
                  statusSpan.innerText = "❌ 스테이징이 준비되지 않았습니다. 🗑️ 폐기 후 다시 시도해주세요";
                }
              } catch {}
            }, 10000);
          } catch {}` },
{ name: "F1b", old: `          } catch { window.__preShot = null; }`, neu: `          } catch { window.__preShot = null; }
          window.__stagingReady = true;
          try {
            applyBtn.disabled = false;
            applyBtn.style.opacity = "1";
            applyBtn.style.cursor = "pointer";
            applyBtn.innerText = "⚠️ 확정 적용 (다시 클릭)";
          } catch {}` },
{ name: "F2a", old: `      const disarmConfirm = () => {
        armedForConfirm = false;
        applyBtn.innerText = "✅ 전 조각 일괄 적용";
        applyBtn.style.background = "#2563eb";
        if (discardBtn) discardBtn.style.display = "none";
      };`, neu: `      const disarmConfirm = () => {
        armedForConfirm = false;
        applyBtn.innerText = "✅ 전 조각 일괄 적용";
        applyBtn.style.background = "#2563eb";
        try { applyBtn.disabled = false; applyBtn.style.opacity = "1"; applyBtn.style.cursor = "pointer"; } catch {}
        if (discardBtn) discardBtn.style.display = "none";
      };` },
{ name: "F2b", old: `        if (discardBtn) discardBtn.style.display = "none";

        backupContent = current;`, neu: `        if (discardBtn) discardBtn.style.display = "none";
        if (applyBtn.disabled) return;

        backupContent = current;` },
];
if (!fs.existsSync("blank.html")) { console.error("ABORT: 파일 없음"); process.exit(1); }
const b = fs.readFileSync("blank.html", "utf8");
try { fs.writeFileSync("blank.html.bak-b5f", b, "utf8"); } catch (e) { console.error("ABORT: 백업 실패"); process.exit(1); }
let out = b;
for (const blk of BLOCKS) {
  const n = out.split(blk.old).length - 1;
  if (n !== 1) {
    try { fs.writeFileSync("blank.html", b, "utf8"); } catch {}
    console.error("ABORT " + blk.name + ": OLD " + n + "회 (원복함)");
    process.exit(1);
  }
  out = out.replace(blk.old, () => blk.neu);
  console.log("OK " + blk.name + " (blank.html)");
}
fs.writeFileSync("blank.html", out, "utf8");
const scripts = [...out.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
for (let i = 0; i < scripts.length; i++) {
  try { new Function(scripts[i]); } catch (e) { console.error("ABORT: script[" + i + "] 파싱 실패"); process.exit(1); }
}
console.log("OK blank <script> 전 블록 검사 (" + scripts.length + "개)");
try { fs.unlinkSync("blank.html.bak-b5f"); } catch {}
console.log("DONE patch-b5f 적용 완료. V1: 적용 연타 → 두 번째 클릭 무시·준비 후 활성화 확인.");
