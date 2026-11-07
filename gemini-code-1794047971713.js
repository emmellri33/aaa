// TITLE: 4. server.js GET / POST /api/session 라우트 등록 (step4_session_api.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `// --- 기억 파일 (memory.json) GET / POST / DELETE ---`;

const replace = `// --- SESSION 분할1: 세션 기록 API (/api/session) ---
app.get('/api/session', (req, res) => {
  const roomId = sanitizeSessionRoomId(req.query.roomId);
  if (!roomId) {
    return res.status(400).json({ ok: false, error: "유효하지 않은 roomId입니다 (../, /, \\\\, # 금지)" });
  }

  let fullContent = readSessionFile();
  fullContent = ensureRoomSection(fullContent, roomId);
  const section = getRoomSection(fullContent, roomId);
  res.json({ ok: true, section });
});

app.post('/api/session', (req, res) => {
  const { roomId: rawRoomId, tag, status, fact, next, replaceIndex, line: customLine } = req.body || {};
  const roomId = sanitizeSessionRoomId(rawRoomId);
  if (!roomId) {
    return res.status(400).json({ ok: false, error: "유효하지 않은 roomId입니다 (../, /, \\\\, # 금지)" });
  }

  const lineRegex = /^#\\s+\\[[^\\]\\r\\n]+\\]\\s+\\(\\d{4}-\\d{2}-\\d{2}\\)\\s+\\[(완료|진행|대기)\\]:\\s+.+?\\s+→\\s+.+?(?:\\s+\\[fp:[a-f0-9]{8}\\])?$/;

  let newLine = "";
  let detailFile = null;

  if (customLine && typeof customLine === "string") {
    newLine = customLine.trim();
    if (!lineRegex.test(newLine)) {
      return res.status(400).json({ ok: false, error: "줄 문법이 올바르지 않습니다 (# [태그] (날짜) [상태]: 사실 → 상태/다음)" });
    }
  } else {
    const cleanTag = String(tag || "").trim().replace(/^\\[|\\]$/g, "");
    if (!cleanTag) {
      return res.status(400).json({ ok: false, error: "tag가 누락되었습니다." });
    }

    const rawStatus = String(status || "").trim().replace(/^\\[|\\]$/g, "");
    if (!["완료", "진행", "대기"].includes(rawStatus)) {
      return res.status(400).json({ ok: false, error: "상태 토큰은 [완료], [진행], [대기]만 허용됩니다." });
    }

    let cleanFact = String(fact || "").trim();
    if (!cleanFact) {
      return res.status(400).json({ ok: false, error: "fact가 누락되었습니다." });
    }

    const cleanNext = String(next || "").trim();
    if (!cleanNext) {
      return res.status(400).json({ ok: false, error: "next가 누락되었습니다." });
    }

    const dateStr = String(req.body.date || "").trim() || new Date().toISOString().slice(0, 10);

    // 200자 초과 시 session-detail/<날짜>-<주제>.md로 분리
    if (cleanFact.length > 200) {
      if (!fs.existsSync(SESSION_DETAIL_DIR)) {
        fs.mkdirSync(SESSION_DETAIL_DIR, { recursive: true });
      }
      const cleanTopic = cleanTag.replace(/[^a-zA-Z0-9가-힣_-]/g, "") || "상세";
      let fname = \`\${dateStr}-\${cleanTopic}.md\`;
      if (fs.existsSync(path.join(SESSION_DETAIL_DIR, fname))) {
        fname = \`\${dateStr}-\${cleanTopic}-\${Date.now().toString().slice(-4)}.md\`;
      }
      fs.writeFileSync(path.join(SESSION_DETAIL_DIR, fname), cleanFact, 'utf8');
      detailFile = "session-detail/" + fname;
      cleanFact = detailFile;
    }

    const sessionFp = calcSessionFp();
    const isMilestone = req.body.milestone !== false;
    const fpSuffix = isMilestone ? \` [fp:\${sessionFp}]\` : "";

    newLine = \`# [\${cleanTag}] (\${dateStr}) [\${rawStatus}]: \${cleanFact} → \${cleanNext}\${fpSuffix}\`;

    if (!lineRegex.test(newLine)) {
      return res.status(400).json({ ok: false, error: "조립된 줄 문법이 올바르지 않습니다 (# [태그] (날짜) [상태]: 사실 → 상태/다음)" });
    }
  }

  let warning = null;
  let fullContent = readSessionFile();
  ensureRoomSection(fullContent, roomId);
  fullContent = readSessionFile();

  updateRoomSection(fullContent, roomId, (secBody) => {
    const lines = secBody.split('\\n').map(l => l.trim()).filter(l => l.startsWith('# '));
    if (lines.includes(newLine)) {
      warning = "완전중복: 동일한 줄이 이미 존재합니다.";
    }

    const hasReplaceIdx = replaceIndex !== undefined && replaceIndex !== null && String(replaceIndex).trim() !== '';
    const rIdx = parseInt(replaceIndex, 10);

    if (hasReplaceIdx && !isNaN(rIdx) && rIdx >= 0 && rIdx < lines.length) {
      lines[rIdx] = newLine;
    } else {
      lines.unshift(newLine);
    }
    return '\\n' + lines.join('\\n') + '\\n';
  });

  res.json({
    ok: true,
    line: newLine,
    ...(warning ? { warning } : {}),
    ...(detailFile ? { detailFile } : {})
  });
});

// --- 기억 파일 (memory.json) GET / POST / DELETE ---`;

if (content.split(search).length !== 2) {
  console.error('❌ step4_session_api.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step4_session_api.js 완료');