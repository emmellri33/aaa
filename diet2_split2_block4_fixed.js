// TITLE: 4. bypassActive 호이스트(핸들러 상단), 성공 notice 동봉, A4 본문 자동조립 (step4_bypass_and_a4_fixed.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

// 0. bypassActive 선언을 핸들러 상단으로 호이스트 (성공 return이 patch-if 블록 밖이라 함수 스코프 필요)
const searchTop = `    if (!instruction || !target) return res.status(400).json({ error: 'instruction and target required' });`;

const replaceTop = `    if (!instruction || !target) return res.status(400).json({ error: 'instruction and target required' });

    // --- DIET 분할2: 우회 허용 플래그 (함수 스코프 — patch 게이트와 공용 성공 return에서 참조) ---
    const bypassActive = instruction.includes("알고 있어, 그래도 해");`;

if (content.split(searchTop).length !== 2) {
  console.error('❌ 상단 가드 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchTop, replaceTop);

// 1. failedChunk 앞 선언 제거, 사용만 남김
const searchBypass = `      finalParsed.edits = rawEdits;
      finalParsed.search = rawEdits[0].search;
      finalParsed.replace = rawEdits[0].replace;
      if (failedChunkBody && typeof failedChunkBody.search === "string") {
        const bypassBlock = instruction.includes("알고 있어, 그래도 해");
        if (!bypassBlock) {`;

const replaceBypass = `      finalParsed.edits = rawEdits;
      finalParsed.search = rawEdits[0].search;
      finalParsed.replace = rawEdits[0].replace;
      if (failedChunkBody && typeof failedChunkBody.search === "string") {
        if (!bypassActive) {`;

if (content.split(searchBypass).length !== 2) {
  console.error('❌ bypassActive 호이스트 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchBypass, replaceBypass);

// 2. bypassG2G8 교체
const searchG2Bypass = `      // --- EYES 분할4: G3(증거), G5(가설 대조), G4(서명 차단) ---
      const bypassG2G8 = instruction.includes("알고 있어, 그래도 해");
      const isExcerptModeForGates = htmlSource && htmlSource.split("\\n").length > 60;
      
      if (!bypassG2G8) {`;

const replaceG2Bypass = `      // --- EYES 분할4: G3(증거), G5(가설 대조), G4(서명 차단) ---
      const isExcerptModeForGates = htmlSource && htmlSource.split("\\n").length > 60;

      if (!bypassActive) {`;

if (content.split(searchG2Bypass).length !== 2) {
  console.error('❌ bypassG2G8 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchG2Bypass, replaceG2Bypass);

const searchG2Bypass2 = `      // --- EYES 분할3: G2(존재 게이트 엄격판) & G8(합본 문법 게이트) & G6(먹이 첨부 재요청 유도) ---
      if (!bypassG2G8) {`;

const replaceG2Bypass2 = `      // --- EYES 분할3: G2(존재 게이트 엄격판) & G8(합본 문법 게이트) & G6(먹이 첨부 재요청 유도) ---
      if (!bypassActive) {`;

if (content.split(searchG2Bypass2).length !== 2) {
  console.error('❌ bypassG2G8 2차 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchG2Bypass2, replaceG2Bypass2);

// 3. A4 본문 자동 조립 교체 (workingContent 미사용, htmlSource 기준)
const searchA4 = `      const exp = String(finalParsed.explanation || "").trim();
      if (!exp.includes("[뭘]") || !exp.includes("[왜]")) {
        const lines = exp.split("\\n").filter(Boolean);
      finalParsed.explanation = "[뭘] [추측] " + (lines[0] || "요청하신 코드 조각 수정") + "\\n[왜] [추측] 근거 없음 — 원본 대조 없이 생성됨";
      }`;

const replaceA4 = `      // --- DIET 분할2: A4 본문 자동조립 (스코프 밖 workingContent 사용 없음, htmlSource 기준) ---
      const exp = String(finalParsed.explanation || "").trim();
      if (!exp.includes("[뭘]") || !exp.includes("[왜]")) {
        const ranges = rawEdits.map(ed => {
          const idx = htmlSource.indexOf(ed.search);
          if (idx === -1) return "미확인";
          const startLine = htmlSource.slice(0, idx).split("\\n").length;
          const editLines = ed.search.split("\\n").length;
          const endLine = startLine + editLines - 1;
          return startLine === endLine ? \`\${startLine}\` : \`\${startLine}~\${endLine}\`;
        });
        const flags = [];
        if (exp.includes("[추측]")) flags.push("[추측]");
        if (exp.includes("[위험]")) flags.push("[위험]");
        const flagSuffix = flags.length > 0 ? " " + flags.join(" ") : "";
        finalParsed.explanation = "[뭘] " + (finalParsed.target || targetFile) + " " + rawEdits.length + "조각 / [왜] " + ranges.join(", ") + "행 매치" + flagSuffix;
      }`;

if (content.split(searchA4).length !== 2) {
  console.error('❌ A4 자동조립 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchA4, replaceA4);

// 4. 성공 return에 notice: "지시대로 수행" 추가
const searchReturn = `    return res.json({ ok: true, result: JSON.stringify(finalParsed), patch: finalParsed, toolRounds: toolRoundsUsed, usage });`;
const replaceReturn = `    return res.json({ ok: true, result: JSON.stringify(finalParsed), patch: finalParsed, toolRounds: toolRoundsUsed, usage, ...(bypassActive ? { notice: "지시대로 수행" } : {}) });`;

if (content.split(searchReturn).length !== 2) {
  console.error('❌ 성공 return 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchReturn, replaceReturn);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ step4_bypass_and_a4_fixed.js 완료: bypassActive 호이스트 및 A4 조립식, notice 동봉 완료');
