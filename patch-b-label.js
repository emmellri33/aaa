// patch-b-label.js — B: 소스/미리보기 라벨이 대상 선택을 따라가게. fail-closed.
const fs = require("fs");
const BLOCKS = [
{ name: "B1", old: `<span>📄 index.html 소스 코드</span>`, neu: `<span>📄 <span id="sourceTitleFile">index.html</span> 소스 코드</span>` },
{ name: "B2", old: `<span>🖥️ index.html 실시간 미리보기</span>`, neu: `<span>🖥️ <span id="previewTitleFile">index.html</span> 실시간 미리보기</span>` },
{ name: "B3", old: `    async function loadIndexCode() {
      try {
        const target = targetPageSelect ? targetPageSelect.value : "index.html";`,
neu: `    async function loadIndexCode() {
      try {
        const target = targetPageSelect ? targetPageSelect.value : "index.html";
        try {
          const _sf = document.getElementById("sourceTitleFile");
          if (_sf) _sf.innerText = target;
          const _pf = document.getElementById("previewTitleFile");
          if (_pf) _pf.innerText = target;
        } catch {}` },
{ name: "B4", old: `if (_ld && _ld.ok && typeof _ld.content === "string") { contextText.value = _ld.content; setStagingMode(false); }`, neu: `if (_ld && _ld.ok && typeof _ld.content === "string") { contextText.value = _ld.content; setStagingMode(false); try { const _sf2 = document.getElementById("sourceTitleFile"); if (_sf2) _sf2.innerText = _lf; const _pf2 = document.getElementById("previewTitleFile"); if (_pf2) _pf2.innerText = _lf; } catch {} }` },
];
if (!fs.existsSync("blank.html")) { console.error("ABORT: 파일 없음"); process.exit(1); }
const b = fs.readFileSync("blank.html", "utf8");
try { fs.writeFileSync("blank.html.bak-b", b, "utf8"); } catch (e) { console.error("ABORT: 백업 실패"); process.exit(1); }
const contents = b;
let out = contents;
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
console.log("OK blank <script> 전 블록 검사 — 브라우저에서 드롭다운 바꿔서 라벨 확인.");
try { fs.unlinkSync("blank.html.bak-b"); } catch {}
console.log("DONE patch-b-label 적용 완료.");
