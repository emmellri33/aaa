// TITLE: EYES 분할1 Fix A — 자가수복 원문 기준 (blank.html, JS 패처, 미미 3블록 적용 후 실행)
const fs = require('fs');
const F = 'blank.html';
const orig = fs.readFileSync(F, 'utf8');
let content = orig;
function once(needle, label) {
  const c = content.split(needle).length - 1;
  if (c !== 1) { console.error('FAIL ' + label + ': ' + c + '회 발견 - 파일 미기록 원복'); process.exit(1); }
}
once('    async function requestSelfHealRetry(originalInstruction, errorReason, attempt, failedChunk) {', 'A-1');
content = content.replace('    async function requestSelfHealRetry(originalInstruction, errorReason, attempt, failedChunk) {', '    async function requestSelfHealRetry(originalInstruction, errorReason, attempt, failedChunk, trueOriginal) {');
once('        const res = await fetchAiModifyWithRetry({\n          target: resolveEffectiveTarget(originalInstruction),\n          instruction: originalInstruction,', 'A-2 (미미 블록2 먼저 필요)');
content = content.replace('        const res = await fetchAiModifyWithRetry({\n          target: resolveEffectiveTarget(originalInstruction),\n          instruction: originalInstruction,', '        const res = await fetchAiModifyWithRetry({\n          target: resolveEffectiveTarget(trueOriginal || originalInstruction),\n          instruction: originalInstruction,');
once('          await requestSelfHealRetry(originalInstruction, d.error || "유효한 패치 JSON 생성 실패", attempt + 1);', 'A-3');
content = content.replace('          await requestSelfHealRetry(originalInstruction, d.error || "유효한 패치 JSON 생성 실패", attempt + 1);', '          await requestSelfHealRetry(originalInstruction, d.error || "유효한 패치 JSON 생성 실패", attempt + 1, null, trueOriginal || originalInstruction);');
once('        await requestSelfHealRetry(originalInstruction, e.message, attempt + 1);', 'A-4');
content = content.replace('        await requestSelfHealRetry(originalInstruction, e.message, attempt + 1);', '        await requestSelfHealRetry(originalInstruction, e.message, attempt + 1, null, trueOriginal || originalInstruction);');
const s5 = '          await requestSelfHealRetry(effectiveInstruction, d.error || "유효한 AI 응답이 아님", 1, (d && d.patch && typeof d.patch.search === "string") ? {target: d.patch.target || null, search: d.patch.search, replace: (typeof d.patch.replace === "string" ? d.patch.replace : null)} : null);';
const r5 = '          await requestSelfHealRetry(effectiveInstruction, d.error || "유효한 AI 응답이 아님", 1, (d && d.patch && typeof d.patch.search === "string") ? {target: d.patch.target || null, search: d.patch.search, replace: (typeof d.patch.replace === "string" ? d.patch.replace : null)} : null, promptPayload);';
once(s5, 'A-5');
content = content.replace(s5, r5);
fs.writeFileSync(F, content, 'utf8');
console.log('PASS Fix A (A-1~A-5)');
