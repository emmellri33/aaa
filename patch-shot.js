// patch-shot.js — 전/후 동일본(60초 캐시) + 줌. fail-closed.
const fs = require("fs");
const BLOCKS = [
{ file: "server.js", name: "S1", old: `      if (ageMs < 60000) {
        return returnImage();
      }`, neu: `      if (ageMs < 60000 && req.query.fresh !== "1") {
        return returnImage();
      }` },
{ file: "blank.html", name: "S2", old: "const shotRes = await fetch(`/api/observe-shot?target=${encodeURIComponent(targetPage)}`);", neu: "const shotRes = await fetch(`/api/observe-shot?target=${encodeURIComponent(targetPage)}&fresh=1`);" },
{ file: "blank.html", name: "Z1a", old: `<img id="cmpImgPre" style="width:100%;border:1px solid #cbd5e1;border-radius:6px;" />`, neu: `<img id="cmpImgPre" style="width:100%;border:1px solid #cbd5e1;border-radius:6px;cursor:zoom-in;" onclick="zoomShot(this)" title="클릭하면 크게 보기" />` },
{ file: "blank.html", name: "Z1b", old: `<img id="cmpImgPost" style="width:100%;border:1px solid #cbd5e1;border-radius:6px;" />`, neu: `<img id="cmpImgPost" style="width:100%;border:1px solid #cbd5e1;border-radius:6px;cursor:zoom-in;" onclick="zoomShot(this)" title="클릭하면 크게 보기" />` },
{ file: "blank.html", name: "Z2", old: `        document.getElementById("shotModal").classList.add("open");
      } catch {}
    }`, neu: `        document.getElementById("shotModal").classList.add("open");
      } catch {}
    }
    function zoomShot(img) {
      try {
        if (!img || !img.src) return;
        let ov = document.getElementById("shotZoomOv");
        if (ov) { ov.remove(); return; }
        ov = document.createElement("div");
        ov.id = "shotZoomOv";
        ov.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:24px;";
        const big = document.createElement("img");
        big.src = img.src;
        big.style.cssText = "max-width:100%;max-height:100%;border-radius:8px;background:#fff;";
        ov.appendChild(big);
        ov.onclick = () => { try { ov.remove(); } catch {} };
        document.body.appendChild(ov);
      } catch {}
    }` },
];
const FILES = ["server.js", "blank.html"];
for (const f of FILES) { if (!fs.existsSync(f)) { console.error("ABORT: 파일 없음 " + f); process.exit(1); } }
const orig = {};
for (const f of FILES) {
  orig[f] = fs.readFileSync(f, "utf8");
  try { fs.writeFileSync(f + ".bak-shot", orig[f], "utf8"); } catch (e) { console.error("ABORT: 백업 실패"); process.exit(1); }
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
try { require("child_process").execSync("node --check server.js", { stdio: "pipe" }); } catch (e) { console.error("ABORT: node --check 실패"); process.exit(1); }
console.log("OK node --check server.js");
for (const f of ["blank.html"]) {
  const scripts = [...contents[f].matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  for (let i = 0; i < scripts.length; i++) {
    try { new Function(scripts[i]); } catch (e) { console.error("ABORT: " + f + " script[" + i + "] 파싱 실패"); process.exit(1); }
  }
  console.log("OK " + f + " <script> 전 블록 검사 (" + scripts.length + "개)");
}
for (const f of FILES) { try { fs.unlinkSync(f + ".bak-shot"); } catch {} }
console.log("DONE patch-shot 적용 완료. V1: 패치 확정 후 전/후 다른지 + 이미지 클릭 확대 확인.");
