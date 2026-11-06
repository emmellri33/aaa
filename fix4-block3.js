// TITLE: 3p. evidenceLog 분리 (관찰 요약 파손 수정)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search1 = `    const ai = activeKey ? new GoogleGenAI({ apiKey: activeKey }) : null;
    const seenSignatures = new Set();
    const toolHistoryBlocks = [];
    const observedSummaries = [];`;
const replace1 = `    const ai = activeKey ? new GoogleGenAI({ apiKey: activeKey }) : null;
    const seenSignatures = new Set();
    const toolHistoryBlocks = [];
    const observedSummaries = [];
    const evidenceLog = [];`;
if (content.split(search1).length !== 2) {
  console.error('FAIL 3p. evidenceLog 분리 (관찰 요약 파손 수정) anchor 1');
  process.exit(1);
}
content = content.replace(search1, replace1);

const search2 = `          const summaryLabel = toolName + "(" + JSON.stringify((callObj && callObj.args) || {}) + ")";
          observedSummaries.push(summaryLabel + " -> " + String(tRes.output || "").split("\\n")[0].slice(0, 60));
          roundOutputs.push("▶ " + summaryLabel + "\\n" + String(tRes.output || tRes.error || "(출력 없음)"));`;
const replace2 = `          const summaryLabel = toolName + "(" + JSON.stringify((callObj && callObj.args) || {}) + ")";
          observedSummaries.push(summaryLabel + " -> " + String(tRes.output || "").split("\\n")[0].slice(0, 60));
          evidenceLog.push({ tool: toolName, args: (callObj && callObj.args) || {}, ok: tRes.ok, resultLength: tRes.resultLength || 0 });
          roundOutputs.push("▶ " + summaryLabel + "\\n" + String(tRes.output || tRes.error || "(출력 없음)"));`;
if (content.split(search2).length !== 2) {
  console.error('FAIL 3p. evidenceLog 분리 (관찰 요약 파손 수정) anchor 2');
  process.exit(1);
}
content = content.replace(search2, replace2);

fs.writeFileSync('server.js', content, 'utf8');
console.log('OK 3p. evidenceLog 분리 (관찰 요약 파손 수정)');
