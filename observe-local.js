// 로컬 관찰자: blank.html + index.html을 headless Chromium으로 열어
// 콘솔·페이지에러·선택자 표시상태·스크린샷을 수집하고 G 형식 JSON을 stdout에 출력한다.
// 사용: node observe-local.js (성공=exit 0, JSON 1개)
// 스크린샷은 repo 밖 /tmp에만 저장한다(레포 오염 금지).
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.env.OBSERVE_BASE || "http://localhost:3000";
const TARGETS = [String(process.argv[2] || "index.html")];
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1920, height: 1080 },
];
const SELECTORS = ["body", "h1", "#hello", "#counter"];

(async () => {
  const browser = await chromium.launch();
  const report = {
    "언제": new Date().toISOString(),
    "대상URL": [],
    "뷰포트": [],
    "스크린샷경로": [],
    "콘솔요약": [],
    "에러유무": false,
    "선택자보고": [],
  };
  try {
    for (const t of TARGETS) {
      const url = BASE + "/" + t;
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        const logs = [];
        page.on("console", (m) => { logs.push("[" + m.type() + "] " + m.text().slice(0, 200)); });
        page.on("pageerror", (e) => {
          logs.push("[pageerror] " + String((e && e.message) || e).slice(0, 200));
          report["에러유무"] = true;
        });
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(2000);
        const shot = "/tmp/observe-" + t.replace(".html", "") + "-" + vp.name + ".png";
        await page.screenshot({ path: shot });
        report["대상URL"].push(url);
        report["뷰포트"].push(vp.name);
        report["스크린샷경로"].push(shot);
        for (const line of logs.slice(0, 20)) report["콘솔요약"].push("[" + t + "/" + vp.name + "] " + line);
        const display = await page.evaluate((sels) => {
          const out = {};
          sels.forEach((s) => {
            const el = document.querySelector(s);
            out[s] = el ? getComputedStyle(el).display : "(없음)";
          });
          return out;
        }, SELECTORS);
        report["선택자보고"].push({ page: t, viewport: vp.name, display: display });
        await page.close();
      }
    }
  } catch (e) {
    report["에러유무"] = true;
    report["콘솔요약"].push("[observe 실패] " + String((e && e.message) || e).slice(0, 200));
    console.log(JSON.stringify(report));
    await browser.close();
    process.exit(1);
  }
  await browser.close();
  try {
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    const row = "| " + ts + " | 관찰(" + report["대상URL"].length + "페이지) | 에러" + (report["에러유무"] ? "있음" : "없음") + " | 스크린샷 " + report["스크린샷경로"].length + "장 /tmp |\n";
    let cur = "";
    try { cur = fs.readFileSync("failures.md", "utf8"); } catch (e) { cur = ""; }
    if (!cur) cur = "# 실패 일지 (failures.md)\n\n| 언제 | 뭐가 | 왜 | 어떻게 |\n|---|---|---|---|\n";
    fs.writeFileSync("failures.md", cur + row, "utf8");
    fs.writeFileSync("/tmp/observe-last.json", JSON.stringify(report), "utf8");  } catch (e) { console.error("[observe 기록 실패] " + e.message); }
  console.log(JSON.stringify(report));
})().catch((e) => { console.error("[observe 치명] " + ((e && e.message) || e)); process.exit(1); });