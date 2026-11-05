// 파일명: /workspaces/aaa/patch-w1-w3-w4.js
// 실행: node /workspaces/aaa/patch-w1-w3-w4.js
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const SERVER_PATH = path.join(ROOT, "server.js");
const BLANK_PATH = path.join(ROOT, "blank.html");
const COCKPIT_PATH = path.join(ROOT, "cockpit.html");

const origServer = fs.readFileSync(SERVER_PATH, "utf8");
const origBlank = fs.readFileSync(BLANK_PATH, "utf8");
const origCockpit = fs.readFileSync(COCKPIT_PATH, "utf8");

let server = origServer;
let blank = origBlank;
let cockpit = origCockpit;

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function replaceOnceOrAbort(section, fileLabel, source, anchor, replacement) {
  const cnt = countOccurrences(source, anchor);
  if (cnt !== 1) {
    console.error(`[ABORT][${section}] ${fileLabel} 앵커 매치 실패 (발견 횟수: ${cnt}회)\n--- 앵커 ---\n${anchor}`);
    process.exit(1);
  }
  return source.replace(anchor, () => replacement);
}

function checkInlineScriptSyntax(fileLabel, htmlContent) {
  const m = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
  if (!m || !m[1]) {
    console.error(`[ABORT] ${fileLabel} <script> 블록을 찾을 수 없습니다.`);
    process.exit(1);
  }
  try {
    new Function(m[1]);
  } catch (e) {
    console.error(`[ABORT] ${fileLabel} 인라인 스크립트 문법 오류: ${e.message}`);
    process.exit(1);
  }
}

// ============================================================================
// [섹션 W1] Complex 버튼 + 단순 전송 (/api/chat pageContext 반영 + 기본 모델 Lite)
// ============================================================================
{
  // B1. blank handleSend 시그니처
  blank = replaceOnceOrAbort(
    "W1-B1",
    "blank.html",
    blank,
    "    async function handleSend() {",
    "    async function handleSend(isComplex = false) {"
  );

  // B2. blank renderAttachments(); 직후 단순 전송 분기 삽입
  const b2Anchor = [
    "      attachedFiles = [];",
    "      renderAttachments();",
    "",
    "      const loadingMsg = document.createElement(\"div\");"
  ].join("\n");

  const b2Replace = [
    "      attachedFiles = [];",
    "      renderAttachments();",
    "      if (!isComplex) {",
    "        const chatLoading = document.createElement(\"div\");",
    "        chatLoading.className = \"msg ai\";",
    "        chatLoading.innerHTML = '<div class=\"avatar\">G</div><div class=\"bubble\">생각 중... (중지 가능)</div>';",
    "        chatMessages.appendChild(chatLoading);",
    "        chatMessages.scrollTop = chatMessages.scrollHeight;",
    "        currentAbortController = new AbortController();",
    "        setPendingState(true);",
    "        try {",
    "          const cr = await fetch(\"/api/chat\", {",
    "            method: \"POST\",",
    "            headers: { \"Content-Type\": \"application/json\" },",
    "            body: JSON.stringify({ message: promptPayload, pageContext: (typeof contextText !== \"undefined\" ? contextText.value : \"\"), model: modelSelect.value, roomId: currentRoomId, images: imageFiles }),",
    "            signal: currentAbortController.signal",
    "          });",
    "          const cd = await cr.json();",
    "          chatLoading.remove();",
    "          appendMsg(\"ai\", (cd && (cd.reply || cd.error)) || \"(응답 없음)\");",
    "        } catch (e) {",
    "          chatLoading.remove();",
    "          appendMsg(\"ai\", e && e.name === \"AbortError\" ? \"사용자에 의해 요청이 중지되었습니다.\" : \"오류 발생: \" + e.message);",
    "        } finally {",
    "          setPendingState(false);",
    "          updateTargetPageSelect();",
    "        }",
    "        return;",
    "      }",
    "",
    "      const loadingMsg = document.createElement(\"div\");"
  ].join("\n");

  blank = replaceOnceOrAbort("W1-B2", "blank.html", blank, b2Anchor, b2Replace);

  // B3. blank sendBtn 바로 뒤에 Complex 버튼 생성 코드 삽입
  const b3Anchor = '    const sendBtn = document.getElementById("sendBtn");';
  const b3Replace = [
    '    const sendBtn = document.getElementById("sendBtn");',
    '    const complexBtn = document.createElement("button");',
    '    complexBtn.className = "action-btn";',
    '    complexBtn.id = "complexBtn";',
    '    complexBtn.title = "파이프라인 실행 (도구＋패치)";',
    '    complexBtn.innerText = "Complex";',
    '    sendBtn.parentNode.insertBefore(complexBtn, sendBtn.nextSibling);',
    '    complexBtn.onclick = () => handleSend(true);'
  ].join("\n");

  blank = replaceOnceOrAbort("W1-B3", "blank.html", blank, b3Anchor, b3Replace);

  // B4. server chat 프롬프트에 pageContext 반영 (for문 앞 pageBlock 선언 + 배열 내 교체)
  const b4Anchor = [
    "    let finalReply = \"\";",
    "",
    "    for (let round = 1; round <= MAX_CHAT_ROUNDS; round++) {",
    "      const historySection = toolHistoryBlocks.length > 0 ? (\"\\n\\n\" + toolHistoryBlocks.join(\"\\n\\n\")) : \"\";",
    "      const prompt = [",
    "        \"사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.\",",
    "        \"\",",
    "        \"당신은 정확하고 신중한 한국어 웹 개발 도우미입니다. 추가 확인이 필요하면 grep 또는 read 도구를 호출하세요.\",",
    "        \"쓰기 도구(run 포함)는 허용되지 않습니다. 오직 grep과 read만 허용됩니다.\",",
    "        \"마지막에는 [의도] ... 형식으로 시작하는 최종 답변을 출력하세요.\",",
    "        \"\",",
    "        memoryBlock + historySection,",
    "        \"\",",
    "        \"사용자 메시지: \" + msg",
    "      ].join(\"\\n\");"
  ].join("\n");

  const b4Replace = [
    "    let finalReply = \"\";",
    "    const pageBlock = pageContext ? \"[현재 파일 내용]\\n\" + String(pageContext).slice(0, 12000) + \"\\n\\n\" : \"\";",
    "",
    "    for (let round = 1; round <= MAX_CHAT_ROUNDS; round++) {",
    "      const historySection = toolHistoryBlocks.length > 0 ? (\"\\n\\n\" + toolHistoryBlocks.join(\"\\n\\n\")) : \"\";",
    "      const prompt = [",
    "        \"사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.\",",
    "        \"\",",
    "        \"당신은 정확하고 신중한 한국어 웹 개발 도우미입니다. 추가 확인이 필요하면 grep 또는 read 도구를 호출하세요.\",",
    "        \"쓰기 도구(run 포함)는 허용되지 않습니다. 오직 grep과 read만 허용됩니다.\",",
    "        \"마지막에는 [의도] ... 형식으로 시작하는 최종 답변을 출력하세요.\",",
    "        \"\",",
    "        memoryBlock + pageBlock + historySection,",
    "        \"\",",
    "        \"사용자 메시지: \" + msg",
    "      ].join(\"\\n\");"
  ].join("\n");

  server = replaceOnceOrAbort("W1-B4", "server.js", server, b4Anchor, b4Replace);

  // B5. server GEMINI_MODEL 기본값 라이트로 변경
  server = replaceOnceOrAbort(
    "W1-B5",
    "server.js",
    server,
    "const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';",
    "const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';"
  );

  console.log("[OK] W1 앵커 검증 및 변환 통과");
}

// ============================================================================
// [섹션 W3] usage.log + ask + 콕핏 숨김 사용량 뷰
// ============================================================================
{
  // S1. setCreator 뒤에 USAGE_LOG_PATH + logUsageCall 헬퍼 추가
  const s1Anchor = [
    "function setCreator(filename, who) {",
    "  try {",
    "    let manifest = {};",
    "    if (fs.existsSync(MANIFEST_PATH)) {",
    "      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, \"utf8\"));",
    "    }",
    "    manifest[filename] = who;",
    "    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), \"utf8\");",
    "  } catch (e) {}",
    "}"
  ].join("\n");

  const s1Replace = s1Anchor + "\n\n" + [
    "const USAGE_LOG_PATH = path.join(__dirname, \"usage.log\");",
    "",
    "function logUsageCall({ route, model, inChars, outChars, inTok, outTok }) {",
    "  const inC = Math.max(0, Number(inChars) || 0);",
    "  const outC = Math.max(0, Number(outChars) || 0);",
    "  const inLo = Math.ceil(inC / 4);",
    "  const inHi = Math.ceil(inC / 1.5);",
    "  const outLo = Math.ceil(outC / 4);",
    "  const outHi = Math.ceil(outC / 1.5);",
    "  const summary = { model: String(model || GEMINI_MODEL), inLo, inHi, outLo, outHi };",
    "  try {",
    "    let totals = { all: { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0 }, byDay: {} };",
    "    let rawLines = [];",
    "    if (fs.existsSync(USAGE_LOG_PATH)) {",
    "      const lines = fs.readFileSync(USAGE_LOG_PATH, \"utf8\").split(\"\\n\").filter(Boolean);",
    "      if (lines.length > 0 && lines[0].startsWith(\"#TOTALS \")) {",
    "        try {",
    "          const parsed = JSON.parse(lines[0].slice(8));",
    "          if (parsed && typeof parsed === \"object\") {",
    "            if (parsed.all && typeof parsed.all === \"object\") totals.all = parsed.all;",
    "            if (parsed.byDay && typeof parsed.byDay === \"object\") totals.byDay = parsed.byDay;",
    "          }",
    "        } catch (e) {}",
    "        rawLines = lines.slice(1);",
    "      } else {",
    "        rawLines = lines;",
    "      }",
    "    }",
    "    const addStats = (bucket) => {",
    "      bucket.calls = (Number(bucket.calls) || 0) + 1;",
    "      bucket.inLo = (Number(bucket.inLo) || 0) + inLo;",
    "      bucket.inHi = (Number(bucket.inHi) || 0) + inHi;",
    "      bucket.outLo = (Number(bucket.outLo) || 0) + outLo;",
    "      bucket.outHi = (Number(bucket.outHi) || 0) + outHi;",
    "    };",
    "    addStats(totals.all);",
    "    const nowIso = new Date().toISOString();",
    "    const dayKey = nowIso.slice(0, 10);",
    "    if (!totals.byDay[dayKey]) {",
    "      totals.byDay[dayKey] = { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0 };",
    "    }",
    "    addStats(totals.byDay[dayKey]);",
    "    const dayKeys = Object.keys(totals.byDay).sort();",
    "    while (dayKeys.length > 90) {",
    "      const oldKey = dayKeys.shift();",
    "      delete totals.byDay[oldKey];",
    "    }",
    "    const entry = JSON.stringify({",
    "      t: nowIso.slice(0, 19) + \"Z\",",
    "      route: String(route || \"chat\"),",
    "      model: String(model || GEMINI_MODEL),",
    "      inC,",
    "      outC,",
    "      inLo,",
    "      inHi,",
    "      outLo,",
    "      outHi",
    "    });",
    "    rawLines.push(entry);",
    "    if (rawLines.length > 20) {",
    "      rawLines = rawLines.slice(-20);",
    "    }",
    "    const outContent = \"#TOTALS \" + JSON.stringify(totals) + \"\\n\" + rawLines.join(\"\\n\") + \"\\n\";",
    "    fs.writeFileSync(USAGE_LOG_PATH, outContent, \"utf8\");",
    "  } catch (e) {}",
    "  return summary;",
    "}"
  ].join("\n");

  server = replaceOnceOrAbort("W3-S1", "server.js", server, s1Anchor, s1Replace);

  // S2. /api/chat 요청당 1줄 누적 로그 + 응답 usage 추가
  const s2LoopAnchor = [
    "    let finalReply = \"\";",
    "    const pageBlock = pageContext ? \"[현재 파일 내용]\\n\" + String(pageContext).slice(0, 12000) + \"\\n\\n\" : \"\";",
    "",
    "    for (let round = 1; round <= MAX_CHAT_ROUNDS; round++) {"
  ].join("\n");

  const s2LoopReplace = [
    "    let finalReply = \"\";",
    "    const pageBlock = pageContext ? \"[현재 파일 내용]\\n\" + String(pageContext).slice(0, 12000) + \"\\n\\n\" : \"\";",
    "    let totalIn = 0, totalOut = 0, lastUsage = null;",
    "",
    "    for (let round = 1; round <= MAX_CHAT_ROUNDS; round++) {"
  ].join("\n");

  server = replaceOnceOrAbort("W3-S2-init", "server.js", server, s2LoopAnchor, s2LoopReplace);

  const s2GenAnchor = [
    "      let rawText = \"\";",
    "      try {",
    "        const response = await ai.models.generateContent({",
    "          model: useModel,",
    "          contents: buildMultimodalContents(prompt, round === 1 ? images : []),",
    "        });",
    "        rawText = (response && response.text) ? response.text : \"\";",
    "      } catch (e) {",
    "        rawText = \"채팅 오류 발생: \" + e.message;",
    "      }"
  ].join("\n");

  const s2GenReplace = [
    "      let rawText = \"\";",
    "      try {",
    "        const response = await ai.models.generateContent({",
    "          model: useModel,",
    "          contents: buildMultimodalContents(prompt, round === 1 ? images : []),",
    "        });",
    "        rawText = (response && response.text) ? response.text : \"\";",
    "        totalIn += prompt.length;",
    "        totalOut += rawText.length;",
    "        lastUsage = response.usageMetadata || null;",
    "      } catch (e) {",
    "        rawText = \"채팅 오류 발생: \" + e.message;",
    "      }"
  ].join("\n");

  server = replaceOnceOrAbort("W3-S2-acc", "server.js", server, s2GenAnchor, s2GenReplace);

  const s2ResAnchor = [
    "    if (!String(finalReply).trimStart().startsWith(\"[의도]\")) {",
    "      finalReply = \"[의도] 사용자 질문 답변\\n\" + finalReply;",
    "    }",
    "",
    "    res.json({ reply: finalReply });"
  ].join("\n");

  const s2ResReplace = [
    "    if (!String(finalReply).trimStart().startsWith(\"[의도]\")) {",
    "      finalReply = \"[의도] 사용자 질문 답변\\n\" + finalReply;",
    "    }",
    "",
    "    const usage = logUsageCall({",
    "      route: \"chat\",",
    "      model: useModel,",
    "      inChars: totalIn,",
    "      outChars: totalOut,",
    "      inTok: lastUsage?.promptTokenCount ?? null,",
    "      outTok: lastUsage?.candidatesTokenCount ?? null",
    "    });",
    "    res.json({ reply: finalReply, usage });"
  ].join("\n");

  server = replaceOnceOrAbort("W3-S2-res", "server.js", server, s2ResAnchor, s2ResReplace);

  // S3. /api/ai-modify (complex) 요청당 1줄 누적 로그 + 응답 usage 추가
  const s3LoopAnchor = [
    "    let finalParsed = null;",
    "",
    "    for (let round = 1; round <= MAX_ROUNDS; round++) {"
  ].join("\n");

  const s3LoopReplace = [
    "    let finalParsed = null;",
    "    let totalIn = 0, totalOut = 0, lastUsage = null;",
    "",
    "    for (let round = 1; round <= MAX_ROUNDS; round++) {"
  ].join("\n");

  server = replaceOnceOrAbort("W3-S3-init", "server.js", server, s3LoopAnchor, s3LoopReplace);

  const s3GenAnchor = [
    "      let rawText = \"\";",
    "      if (Array.isArray(mockResponses) && mockResponses.length >= round) {",
    "        rawText = typeof mockResponses[round - 1] === \"string\"",
    "          ? mockResponses[round - 1]",
    "          : JSON.stringify(mockResponses[round - 1]);",
    "      } else {",
    "        const response = await ai.models.generateContent({",
    "          model: useModel,",
    "          contents: buildMultimodalContents(prompt, round === 1 ? images : []),",
    "        });",
    "        rawText = (response && response.text) ? response.text : \"\";",
    "      }"
  ].join("\n");

  const s3GenReplace = [
    "      let rawText = \"\";",
    "      if (Array.isArray(mockResponses) && mockResponses.length >= round) {",
    "        rawText = typeof mockResponses[round - 1] === \"string\"",
    "          ? mockResponses[round - 1]",
    "          : JSON.stringify(mockResponses[round - 1]);",
    "        totalIn += prompt.length;",
    "        totalOut += rawText.length;",
    "        lastUsage = null;",
    "      } else {",
    "        const response = await ai.models.generateContent({",
    "          model: useModel,",
    "          contents: buildMultimodalContents(prompt, round === 1 ? images : []),",
    "        });",
    "        rawText = (response && response.text) ? response.text : \"\";",
    "        totalIn += prompt.length;",
    "        totalOut += rawText.length;",
    "        lastUsage = response.usageMetadata || null;",
    "      }"
  ].join("\n");

  server = replaceOnceOrAbort("W3-S3-acc", "server.js", server, s3GenAnchor, s3GenReplace);

  const s3ResAnchor = "    return res.json({ ok: true, result: JSON.stringify(finalParsed), patch: finalParsed, toolRounds: toolRoundsUsed });  } catch (e) {";
  const s3ResReplace = [
    "    const usage = logUsageCall({",
    "      route: \"complex\",",
    "      model: useModel,",
    "      inChars: totalIn,",
    "      outChars: totalOut,",
    "      inTok: lastUsage?.promptTokenCount ?? null,",
    "      outTok: lastUsage?.candidatesTokenCount ?? null",
    "    });",
    "    return res.json({ ok: true, result: JSON.stringify(finalParsed), patch: finalParsed, toolRounds: toolRoundsUsed, usage });",
    "  } catch (e) {"
  ].join("\n");

  server = replaceOnceOrAbort("W3-S3-res", "server.js", server, s3ResAnchor, s3ResReplace);

  // S4. /api/run 라우트에 ask 분기 추가 (셸 검사보다 앞)
  const s4Anchor = [
    "// --- 읽기 전용 터미널 실행 (/api/run) ---",
    "app.post('/api/run', (req, res) => {",
    "  const rawCmd = String((req.body && req.body.command) || \"\").trim();",
    "  if (!rawCmd) return res.status(400).json({ ok: false, error: \"명령어를 입력하세요.\" });",
    "",
    "  // 1. 셸 이어붙이기·리다이렉션 금지"
  ].join("\n");

  const s4Replace = [
    "// --- 읽기 전용 터미널 실행 (/api/run) ---",
    "app.post('/api/run', async (req, res) => {",
    "  const rawCmd = String((req.body && (req.body.command || req.body.cmd)) || \"\").trim();",
    "  if (!rawCmd) return res.status(400).json({ ok: false, error: \"명령어를 입력하세요.\" });",
    "",
    "  if (rawCmd === \"ask\" || rawCmd.startsWith(\"ask \")) {",
    "    const question = rawCmd === \"ask\" ? \"\" : rawCmd.slice(4).trim().slice(0, 2000);",
    "    if (!question) {",
    "      return res.status(400).json({ ok: false, error: \"질문을 입력하세요.\" });",
    "    }",
    "    try {",
    "      const askPrompt = USER_PROFILE_HEADER + \"\\n\\n[질문]\\n\" + question;",
    "      const activeKey = getActiveKey();",
    "      if (!activeKey) {",
    "        const demoReply = '(AI 키 미설정) 데모 응답: \"' + question + '\"';",
    "        const usage = logUsageCall({ route: \"ask\", model: GEMINI_MODEL, inChars: askPrompt.length, outChars: demoReply.length, inTok: null, outTok: null });",
    "        return res.json({ ok: true, output: demoReply, usage });",
    "      }",
    "      const ai = new GoogleGenAI({ apiKey: activeKey });",
    "      const response = await ai.models.generateContent({",
    "        model: GEMINI_MODEL,",
    "        contents: askPrompt,",
    "      });",
    "      const reply = (response && response.text) ? response.text : \"(응답 없음)\";",
    "      const uMeta = response && response.usageMetadata ? response.usageMetadata : null;",
    "      const usage = logUsageCall({",
    "        route: \"ask\",",
    "        model: GEMINI_MODEL,",
    "        inChars: askPrompt.length,",
    "        outChars: reply.length,",
    "        inTok: uMeta?.promptTokenCount ?? null,",
    "        outTok: uMeta?.candidatesTokenCount ?? null",
    "      });",
    "      return res.json({ ok: true, output: reply, usage });",
    "    } catch (e) {",
    "      return res.status(500).json({ ok: false, error: \"ask 오류: \" + ((e && e.message) ? e.message : String(e)) });",
    "    }",
    "  }",
    "",
    "  // 1. 셸 이어붙이기·리다이렉션 금지"
  ].join("\n");

  server = replaceOnceOrAbort("W3-S4", "server.js", server, s4Anchor, s4Replace);

  // S5. cockpit.html 4번째 탭 (📊 사용량) 버튼 + pane + switchMainTab + loadUsage()
  const s5NavAnchor = [
    "    <div class=\"nav-tabs\">",
    "      <button class=\"tab-btn active\" onclick=\"switchMainTab('termTab')\">💻 터미널</button>",
    "      <button class=\"tab-btn\" onclick=\"switchMainTab('filesTab')\">📁 파일 편집</button>",
    "      <button class=\"tab-btn\" onclick=\"switchMainTab('commitTab')\">🌿 커밋 관리</button>",
    "    </div>"
  ].join("\n");

  const s5NavReplace = [
    "    <div class=\"nav-tabs\">",
    "      <button class=\"tab-btn active\" onclick=\"switchMainTab('termTab')\">💻 터미널</button>",
    "      <button class=\"tab-btn\" onclick=\"switchMainTab('filesTab')\">📁 파일 편집</button>",
    "      <button class=\"tab-btn\" onclick=\"switchMainTab('commitTab')\">🌿 커밋 관리</button>",
    "      <button class=\"tab-btn\" onclick=\"switchMainTab('usageTab')\">📊 사용량</button>",
    "    </div>"
  ].join("\n");

  cockpit = replaceOnceOrAbort("W3-S5-nav", "cockpit.html", cockpit, s5NavAnchor, s5NavReplace);

  const s5PaneAnchor = [
    "        <div class=\"card\">",
    "          <div class=\"card-title\">📜 최근 커밋 이력 (최근 5건)</div>",
    "          <div class=\"pre-box\" id=\"gitLogPre\">불러오는 중...</div>",
    "        </div>",
    "      </div>",
    "    </div>",
    "  </div>"
  ].join("\n");

  const s5PaneReplace = [
    "        <div class=\"card\">",
    "          <div class=\"card-title\">📜 최근 커밋 이력 (최근 5건)</div>",
    "          <div class=\"pre-box\" id=\"gitLogPre\">불러오는 중...</div>",
    "        </div>",
    "      </div>",
    "    </div>",
    "",
    "    <!-- 4. 사용량 탭 -->",
    "    <div class=\"tab-pane\" id=\"usageTab\">",
    "      <div class=\"commit-layout\" style=\"max-width: 960px;\">",
    "        <div style=\"display: flex; justify-content: space-between; align-items: center;\">",
    "          <span style=\"font-size: 13px; color: #94a3b8;\">추정식: 하한=글자/4, 상한=글자/1.5 (모든 수치는 추정치)</span>",
    "          <button class=\"btn\" onclick=\"loadUsage()\">🔄 새로고침</button>",
    "        </div>",
    "        <div id=\"usageSummaryGrid\" style=\"display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;\">",
    "          <div class=\"card\"><div class=\"card-title\">📅 오늘 (일)</div><div id=\"usageDayBox\" style=\"font-size: 13px;\">불러오는 중...</div></div>",
    "          <div class=\"card\"><div class=\"card-title\">🗓️ 최근 7일 (주)</div><div id=\"usageWeekBox\" style=\"font-size: 13px;\">불러오는 중...</div></div>",
    "          <div class=\"card\"><div class=\"card-title\">📊 최근 30일 (월)</div><div id=\"usageMonthBox\" style=\"font-size: 13px;\">불러오는 중...</div></div>",
    "        </div>",
    "        <div class=\"card\" style=\"flex: 1; overflow: hidden;\">",
    "          <div class=\"card-title\">🕒 최근 20건 호출 기록 (usage.log)</div>",
    "          <div style=\"overflow-y: auto; flex: 1;\">",
    "            <table style=\"width: 100%; border-collapse: collapse; font-size: 12px; font-family: monospace; text-align: left;\">",
    "              <thead>",
    "                <tr style=\"border-bottom: 1px solid #334155; color: #94a3b8;\">",
    "                  <th style=\"padding: 6px;\">시각(UTC)</th>",
    "                  <th style=\"padding: 6px;\">경로</th>",
    "                  <th style=\"padding: 6px;\">모델</th>",
    "                  <th style=\"padding: 6px;\">입력(글자)</th>",
    "                  <th style=\"padding: 6px;\">출력(글자)</th>",
    "                  <th style=\"padding: 6px;\">입력 추정(토큰)</th>",
    "                  <th style=\"padding: 6px;\">출력 추정(토큰)</th>",
    "                </tr>",
    "              </thead>",
    "              <tbody id=\"usageRecentBody\">",
    "                <tr><td colspan=\"7\" style=\"padding: 8px; color: #94a3b8;\">불러오는 중...</td></tr>",
    "              </tbody>",
    "            </table>",
    "          </div>",
    "        </div>",
    "      </div>",
    "    </div>",
    "  </div>"
  ].join("\n");

  cockpit = replaceOnceOrAbort("W3-S5-pane", "cockpit.html", cockpit, s5PaneAnchor, s5PaneReplace);

  const s5SwitchAnchor = [
    "      if (tabId === \"commitTab\") {",
    "        document.querySelectorAll(\".tab-btn\")[2].classList.add(\"active\");",
    "        loadGitStatus();",
    "      }",
    "    }"
  ].join("\n");

  const s5SwitchReplace = [
    "      if (tabId === \"commitTab\") {",
    "        document.querySelectorAll(\".tab-btn\")[2].classList.add(\"active\");",
    "        loadGitStatus();",
    "      }",
    "      if (tabId === \"usageTab\") {",
    "        document.querySelectorAll(\".tab-btn\")[3].classList.add(\"active\");",
    "        loadUsage();",
    "      }",
    "    }",
    "",
    "    async function loadUsage() {",
    "      const dayEl = document.getElementById(\"usageDayBox\");",
    "      const weekEl = document.getElementById(\"usageWeekBox\");",
    "      const monthEl = document.getElementById(\"usageMonthBox\");",
    "      const tbody = document.getElementById(\"usageRecentBody\");",
    "      const setEmpty = (msg) => {",
    "        dayEl.innerText = msg;",
    "        weekEl.innerText = msg;",
    "        monthEl.innerText = msg;",
    "        tbody.innerHTML = `<tr><td colspan=\"7\" style=\"padding: 8px; color: #94a3b8;\">${msg}</td></tr>`;",
    "      };",
    "      try {",
    "        const r = await fetch(\"/api/files/read?name=usage.log\");",
    "        if (r.status === 404) { setEmpty(\"기록 없음\"); return; }",
    "        const d = await r.json();",
    "        if (!d.ok || !d.content) { setEmpty(\"기록 없음\"); return; }",
    "        const lines = String(d.content).split(\"\\n\").filter(Boolean);",
    "        if (lines.length === 0) { setEmpty(\"기록 없음\"); return; }",
    "        let totals = { all: { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0 }, byDay: {} };",
    "        let rawLines = lines;",
    "        if (lines[0].startsWith(\"#TOTALS \")) {",
    "          try { totals = JSON.parse(lines[0].slice(8)); } catch (e) {}",
    "          rawLines = lines.slice(1);",
    "        }",
    "        const byDay = (totals && totals.byDay) || {};",
    "        const now = new Date();",
    "        const sumDays = (daysCount) => {",
    "          const acc = { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0 };",
    "          for (let i = 0; i < daysCount; i++) {",
    "            const dt = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);",
    "            const b = byDay[dt];",
    "            if (b) {",
    "              acc.calls += Number(b.calls) || 0;",
    "              acc.inLo += Number(b.inLo) || 0;",
    "              acc.inHi += Number(b.inHi) || 0;",
    "              acc.outLo += Number(b.outLo) || 0;",
    "              acc.outHi += Number(b.outHi) || 0;",
    "            }",
    "          }",
    "          return acc;",
    "        };",
    "        const fmtBox = (s) => `호출: <strong>${s.calls}회</strong><br>입력 추정: ${s.inLo} ~ ${s.inHi}<br>출력 추정: ${s.outLo} ~ ${s.outHi}`;",
    "        dayEl.innerHTML = fmtBox(sumDays(1));",
    "        weekEl.innerHTML = fmtBox(sumDays(7));",
    "        monthEl.innerHTML = fmtBox(sumDays(30));",
    "        const parsedRows = rawLines.slice(-20).reverse().map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);",
    "        if (parsedRows.length === 0) {",
    "          tbody.innerHTML = '<tr><td colspan=\"7\" style=\"padding: 8px; color: #94a3b8;\">기록 없음</td></tr>';",
    "        } else {",
    "          tbody.innerHTML = parsedRows.map(row => `<tr style=\"border-bottom: 1px solid #1e293b;\">",
    "            <td style=\"padding: 6px;\">${row.t || \"-\"}</td>",
    "            <td style=\"padding: 6px;\">${row.route || \"-\"}</td>",
    "            <td style=\"padding: 6px;\">${row.model || \"-\"}</td>",
    "            <td style=\"padding: 6px;\">${row.inC ?? 0}</td>",
    "            <td style=\"padding: 6px;\">${row.outC ?? 0}</td>",
    "            <td style=\"padding: 6px;\">${row.inLo ?? 0} ~ ${row.inHi ?? 0}</td>",
    "            <td style=\"padding: 6px;\">${row.outLo ?? 0} ~ ${row.outHi ?? 0}</td>",
    "          </tr>`).join(\"\");",
    "        }",
    "      } catch (e) {",
    "        setEmpty(\"불러오기 오류: \" + e.message);",
    "      }",
    "    }"
  ].join("\n");

  cockpit = replaceOnceOrAbort("W3-S5-js", "cockpit.html", cockpit, s5SwitchAnchor, s5SwitchReplace);

  console.log("[OK] W3 앵커 검증 및 변환 통과");
}

// ============================================================================
// [섹션 W4] 콕핏 페이지 생성 버튼 (＋ 새 페이지)
// ============================================================================
{
  // C1. filesTab 안, files-layout 앞에 버튼행 삽입
  const c1Anchor = [
    "    <!-- 2. 파일 편집 탭 -->",
    "    <div class=\"tab-pane\" id=\"filesTab\">",
    "      <div class=\"files-layout\">"
  ].join("\n");

  const c1Replace = [
    "    <!-- 2. 파일 편집 탭 -->",
    "    <div class=\"tab-pane\" id=\"filesTab\">",
    "      <div style=\"display:flex;gap:8px;margin-bottom:8px;\">",
    "        <button class=\"btn\" onclick=\"createNewPage()\">＋ 새 페이지</button>",
    "      </div>",
    "      <div class=\"files-layout\">"
  ].join("\n");

  cockpit = replaceOnceOrAbort("W4-C1", "cockpit.html", cockpit, c1Anchor, c1Replace);

  // C2. loadWorkspaceFiles 앞에 createNewPage 함수 추가
  const c2Anchor = "    async function loadWorkspaceFiles() {";
  const c2Replace = [
    "    async function createNewPage() {",
    "      const raw = prompt(\"새 페이지 파일명 (소문자·숫자·하이픈만, .html 자동 추가):\", \"my-page\");",
    "      if (raw === null) return;",
    "      const base = String(raw).trim().toLowerCase().replace(/\\.html$/, \"\");",
    "      if (!/^[a-z0-9-]{1,40}$/.test(base)) { alert(\"파일명이 올바르지 않습니다.\"); return; }",
    "      const name = base + \".html\";",
    "      try {",
    "        const lr = await fetch(\"/api/files\");",
    "        const ld = await lr.json();",
    "        if (ld.ok && Array.isArray(ld.files) && ld.files.some(f => f.name === name)) { alert(\"이미 있는 파일명입니다.\"); return; }",
    "        const skeleton = '<!DOCTYPE html>\\n<html lang=\"ko\">\\n<head><meta charset=\"UTF-8\"><title>' + base + '</title></head>\\n<body>\\n<h1>' + base + '</h1>\\n</body>\\n</html>\\n';",
    "        const r = await fetch(\"/api/files/write\", { method: \"POST\", headers: { \"Content-Type\": \"application/json\" }, body: JSON.stringify({ name, content: skeleton }) });",
    "        const d = await r.json();",
    "        if (!d.ok) { alert(\"생성 실패: \" + (d.error || \"오류\")); return; }",
    "        await loadWorkspaceFiles();",
    "        alert(\"생성됨: \" + name + \" (주인: gemgem)\");",
    "      } catch (e) { alert(\"오류: \" + e.message); }",
    "    }",
    "",
    "    async function loadWorkspaceFiles() {"
  ].join("\n");

  cockpit = replaceOnceOrAbort("W4-C2", "cockpit.html", cockpit, c2Anchor, c2Replace);

  console.log("[OK] W4 앵커 검증 및 변환 통과");
}

// ============================================================================
// [검증 게이트] 인라인 JS 문법 검사 + 파일 기록 + server.js node --check
// ============================================================================
checkInlineScriptSyntax("blank.html", blank);
checkInlineScriptSyntax("cockpit.html", cockpit);

try {
  fs.writeFileSync(SERVER_PATH, server, "utf8");
  fs.writeFileSync(BLANK_PATH, blank, "utf8");
  fs.writeFileSync(COCKPIT_PATH, cockpit, "utf8");

  execFileSync(process.execPath, ["--check", SERVER_PATH], { stdio: "pipe" });
  console.log("[SUCCESS] W1 + W3 + W4 패치 적용 및 node --check 검증 통과");
} catch (err) {
  // 실패 시 전 파일 즉시 원복 (fail-closed)
  fs.writeFileSync(SERVER_PATH, origServer, "utf8");
  fs.writeFileSync(BLANK_PATH, origBlank, "utf8");
  fs.writeFileSync(COCKPIT_PATH, origCockpit, "utf8");
  console.error("[ROLLBACK] 검증 실패로 모든 파일을 원복했습니다:", err.message);
  process.exit(1);
}