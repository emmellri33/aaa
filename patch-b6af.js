// patch-b6af.js — B6a-f (R1 캐시무력화·T1/T2 탭유지·B1b/B1c 히스토리 일원화). fail-closed.
const fs = require("fs");
const BLOCKS = [
{ file: "cockpit.html", name: "R1a", old: `        const r = await fetch("/api/files/read?name=" + encodeURIComponent(filename));`, neu: `        const r = await fetch("/api/files/read?name=" + encodeURIComponent(filename) + "&_t=" + Date.now(), { cache: "no-store" });` },
{ file: "blank.html", name: "R1b", old: `        const r = await fetch("/api/files/read?name=" + encodeURIComponent(filename));`, neu: `        const r = await fetch("/api/files/read?name=" + encodeURIComponent(filename) + "&_t=" + Date.now(), { cache: "no-store" });` },
{ file: "blank.html", name: "R1c", old: `        const r = await fetch("/api/files/read?name=" + encodeURIComponent(target));`, neu: `        const r = await fetch("/api/files/read?name=" + encodeURIComponent(target) + "&_t=" + Date.now(), { cache: "no-store" });` },
{ file: "blank.html", name: "R1d", old: `              const _lr = await fetch("/api/files/read?name=" + encodeURIComponent(_lf));`, neu: `              const _lr = await fetch("/api/files/read?name=" + encodeURIComponent(_lf) + "&_t=" + Date.now(), { cache: "no-store" });` },
{ file: "cockpit.html", name: "T1", old: `      const pane = document.getElementById(tabId);
      if (pane) pane.classList.add("active");`, neu: `      const pane = document.getElementById(tabId);
      if (pane) pane.classList.add("active");
      try { sessionStorage.setItem("cockpitTab", tabId); } catch {}` },
{ file: "cockpit.html", name: "T2", old: `    // 초기화
    addTerminalSession();`, neu: `    // 초기화
    addTerminalSession();
    try {
      const savedTab = sessionStorage.getItem("cockpitTab");
      if (savedTab && document.getElementById(savedTab)) switchMainTab(savedTab);
    } catch {}` },
{ file: "blank.html", name: "B1b", old: `      if (e.key === "Enter") {
        const v = termInput.value;
        if (v.trim()) { try { __termHist.push(v); } catch {} }
        __termHistIdx = -1;
        executeTerminalCommand(v);`, neu: `      if (e.key === "Enter") {
        const v = termInput.value;
        __termHistIdx = -1;
        executeTerminalCommand(v);` },
{ file: "blank.html", name: "B1c", old: `    async function executeTerminalCommand(cmd) {
      const clean = String(cmd || "").trim();
      if (!clean) return;`, neu: `    async function executeTerminalCommand(cmd) {
      const clean = String(cmd || "").trim();
      if (!clean) return;
      try { if (typeof __termHist !== "undefined" && __termHist[__termHist.length - 1] !== clean) __termHist.push(clean); __termHistIdx = -1; } catch {}` },
];
const FILES = ["cockpit.html", "blank.html"];
for (const f of FILES) { if (!fs.existsSync(f)) { console.error("ABORT: 파일 없음 " + f); process.exit(1); } }
const orig = {};
for (const f of FILES) {
  orig[f] = fs.readFileSync(f, "utf8");
  try { fs.writeFileSync(f + ".bak-b6af", orig[f], "utf8"); } catch (e) { console.error("ABORT: 백업 실패"); process.exit(1); }
}
const contents = { ...orig };
for (const blk of BLOCKS) {
  const n = contents[blk.file].split(blk.old).length - 1;
  if (n !== 1) {
    for (const f of FILES) { try { fs.writeFileSync(f, orig[f], "utf8"); } catch {} }
    console.error("ABORT " + blk.name + ": OLD " + n + "회 (원복함)");
    process.exit(1);
  }
  contents[blk.file] = contents[blk.file].replace(blk.old, () => blk.neu);
  console.log("OK " + blk.name + " (" + blk.file + ")");
}
for (const f of FILES) fs.writeFileSync(f, contents[f], "utf8");
for (const f of FILES) {
  const scripts = [...contents[f].matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (let i = 0; i < scripts.length; i++) {
    try { new Function(scripts[i]); } catch (e) { console.error("ABORT: " + f + " script[" + i + "] 파싱 실패"); process.exit(1); }
  }
  console.log("OK " + f + " <script> 전 블록 검사 (" + scripts.length + "개)");
}
for (const f of FILES) { try { fs.unlinkSync(f + ".bak-b6af"); } catch {} }
console.log("DONE patch-b6af 적용 완료. V1: 롤백 후 에디터 즉시갱신·새로고침 탭유지·터미널 3경로 히스토리 확인.");
