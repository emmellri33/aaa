// TITLE: 5. /api/ai-modify res.json 직전 dirtyBadge 판정 및 첨부 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search = `    const usage = logUsageCall({
      route: "complex",
      model: useModel,
      inChars: totalIn,
      outChars: totalOut,
      inTok: lastUsage?.promptTokenCount ?? null,
      outTok: lastUsage?.candidatesTokenCount ?? null
    });
    return res.json({ ok: true, result: JSON.stringify(finalParsed), patch: finalParsed, toolRounds: toolRoundsUsed, usage });`;

const replace = `    const usage = logUsageCall({
      route: "complex",
      model: useModel,
      inChars: totalIn,
      outChars: totalOut,
      inTok: lastUsage?.promptTokenCount ?? null,
      outTok: lastUsage?.candidatesTokenCount ?? null
    });

    // C2 ②: 카드 전송 전 비교 (question 타입은 스킵, mismatch면 dirtyBadge 추가)
    if (finalParsed && finalParsed.type === "patch") {
      const currentDiskHash = getDiskFileHash(finalParsed.target || targetFile);
      if (initialDiskHash !== currentDiskHash) {
        finalParsed.dirtyBadge = "그 사이 파일 바뀜";
      }
    }

    return res.json({ ok: true, result: JSON.stringify(finalParsed), patch: finalParsed, toolRounds: toolRoundsUsed, usage });`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('server.js', content.replace(search, replace), 'utf8');
console.log('✅ 블록 5 적용 완료');