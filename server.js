require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
let memoryApiKey = process.env.GEMINI_API_KEY || "";
const GEMINI_API_KEY = (memoryApiKey || (memoryApiKey || process.env.GEMINI_API_KEY)) || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const INDEX_PATH = path.join(__dirname, 'index.html');
const MEMORY_PATH = path.join(__dirname, 'memory.json');
const FAILURES_PATH = path.join(__dirname, 'failures.md');
const { execFile } = require('child_process');

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- 헬퍼: 기억(memory.json), 실패일지(failures.md), 관련 코드 발췌 ---
function getActiveKey() {
  return memoryApiKey || process.env.GEMINI_API_KEY || "";
}

function readMemoryFacts() {
  try {
    if (!fs.existsSync(MEMORY_PATH)) return [];
    const data = JSON.parse(fs.readFileSync(MEMORY_PATH, "utf8"));
    return Array.isArray(data.facts) ? data.facts : [];
  } catch (e) {
    return [];
  }
}

function searchRelevantFailures(queryText) {
  try {
    if (!fs.existsSync(FAILURES_PATH)) return "";
    const raw = fs.readFileSync(FAILURES_PATH, "utf8");
    const lines = raw.split("\n").filter(l => l.startsWith("|") && !l.includes("|---") && !l.includes("| 언제 |"));
    if (lines.length === 0) return "";
    const words = String(queryText || "").split(/\s+/).filter(w => w.length >= 2);
    const matched = lines.filter(line => words.some(w => line.includes(w)));
    const picked = (matched.length > 0 ? matched : lines).slice(-5);
    return picked.join("\n");
  } catch (e) {
    return "";
  }
}

function extractRelevantHtmlSnippet(html, queryText) {
  const full = String(html || "");
  if (!full) return "(index.html 비어 있음)";
  const lines = full.split("\n");
  const words = String(queryText || "").toLowerCase().split(/\s+/).filter(w => w.length >= 2);
  const hitIndices = new Set();
  lines.forEach((line, idx) => {
    const low = line.toLowerCase();
    if (words.some(w => low.includes(w))) {
      for (let i = Math.max(0, idx - 3); i <= Math.min(lines.length - 1, idx + 3); i++) {
        hitIndices.add(i);
      }
    }
  });
  if (hitIndices.size === 0) {
    return lines.slice(0, 25).join("\n") + (lines.length > 25 ? "\n... (이하 생략 - 필요 시 구체적 요소를 질문하세요)" : "");
  }
  const sorted = Array.from(hitIndices).sort((a, b) => a - b).slice(0, 45);
  return sorted.map(i => (i + 1) + ": " + lines[i]).join("\n");
}

function buildMultimodalContents(textPrompt, images) {
  const parts = [{ text: textPrompt }];
  if (Array.isArray(images)) {
    images.forEach(img => {
      if (img && img.data && img.mimeType) {
        const cleanBase64 = String(img.data).includes(",") ? String(img.data).split(",")[1] : String(img.data);
        parts.push({ inlineData: { mimeType: String(img.mimeType), data: cleanBase64 } });
      }
    });
  }
  return [{ role: "user", parts }];
}

// --- 채팅 (AI 답변 생성) ---
app.post('/api/chat', async (req, res) => {
  try {
    const { message, pageContext, model, images } = req.body || {};
    const ALLOWED_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-4-argon"];
    const useModel = ALLOWED_MODELS.includes(model) ? model : GEMINI_MODEL;
    const msg = (message || '').toString().trim();
    if (!msg && (!Array.isArray(images) || images.length === 0)) {
      return res.status(400).json({ error: 'message required' });
    }

    const activeKey = getActiveKey();
    if (!activeKey) {
      return res.json({ reply: '(AI 키 미설정) 데모 응답: "' + msg + '"' });
    }

    const ai = new GoogleGenAI({ apiKey: activeKey });
    const htmlRaw = pageContext || (fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, "utf8") : "");
    const snippet = extractRelevantHtmlSnippet(htmlRaw, msg);
    const facts = readMemoryFacts();
    const memoryBlock = facts.length > 0 ? "[공유 기억 (memory.json)]\n- " + facts.join("\n- ") + "\n\n" : "";

    const prompt = [
      "사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.",
      "",
      "당신은 정확하고 신중한 한국어 웹 개발 도우미입니다.",
      "[대화 및 증거 규칙]",
      "1. 답변 맨 첫 줄에 반드시 사용자의 의도를 한 줄로 먼저 적고 시작하세요. 형식: [의도] ...",
      "2. 막연한 지시는 합리적으로 추측해 먼저 제안하고 추측한 부분에는 반드시 [추측] 표시를 붙이세요. 도저히 알 수 없을 때만 질문하세요.",
      "3. 단정적인 설명은 반드시 아래 제공된 코드 발췌본의 실제 줄 번호나 선택자를 인용(근거 제시)하며 작성하세요. 근거 없는 \"됩니다\"나 확인 전 \"완료·검증완료\" 문구는 절대 금지합니다.",
      "4. [판단 루브릭] '뭐가 나을지' 분석·판단 요청을 받으면 반드시 이 순서로 따져 답하세요: 목표 부합 → 가역성(실패 시 되돌리기) → 폭발 반경(잘못됐을 때 피해) → 비용(구현·유지·검증) → 검증 가능성(통과/실패 테스트). 항목을 건너뛰지 마세요.",
      "5. [증거 규칙] 작업 완료·'됐다'는 보고에는 증거 3종(앵커 grep 실물·실행 결과·수용 테스트)을 반드시 붙이세요. 셋 중 하나라도 없으면 '됐다' 대신 부족한 증거를 명시하고, 기억 인용(본 적 없는 파일·줄 번호)은 절대 금지합니다.",
      "",
      memoryBlock + "[index.html 관련 발췌 코드]\n" + snippet,
      "",
      "사용자 메시지: " + msg
    ].join("\n");

    console.log("CHAT start", new Date().toISOString(), "keylen=" + String(activeKey).length, "model="+ useModel);
    const response = await ai.models.generateContent({
      model: useModel,
      contents: buildMultimodalContents(prompt, images),
    });
    const reply = (response && response.text) ? response.text : '(응답 없음)';
    return res.json({ reply });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    let friendly = '서버 오류가 발생했습니다. [' + msg.slice(0, 200) + ']';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      friendly = 'Gemini API 키가 유효하지 않습니다.';
    }
    return res.status(500).json({ error: friendly });
  }
});

// --- 인덱스 페이지 조회/저장 ---
app.get('/api/page/index', (req, res) => {
  fs.readFile(INDEX_PATH, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ content: data });
  });
});

app.post('/api/page/index', (req, res) => {
  const { content } = req.body || {};
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  if (!content.includes('<html') || !content.includes('</html>')) {
    return res.status(400).json({ error: 'invalid html: <html>...</html> 구조가 필요합니다.' });
  }
  fs.writeFile(INDEX_PATH, content, 'utf8', (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

const USER_PROFILE_HEADER = "사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.";

const PATCH_SYSTEM_PROMPT = [
  USER_PROFILE_HEADER,
  "",
  "당신은 index.html 패치 및 코드 확인 전용 AI입니다.",
  "[절대 규칙 — 보기(ReAct 도구) → 고치기(다조각) → 눈(공백 엄수)]",
  "1. 마크다운 코드블록(```), 인사말, 잡담을 절대 출력하지 마세요. 오직 유효한 JSON 객체 1개만 출력하세요.",
  "2. [의도 추론 & 추측 표시] 지시가 다소 막연하더라도 파일 맥락상 합리적으로 추측 가능하면 질문하지 말고 먼저 패치를 제안하되, 추측한 부분에는 반드시 [추측] 표시를 넣으세요. 사용자가 단순 질문(예: 특정 선택자의 색상이 무엇인지 등)을 한 경우에는 패치하지 말고 도구(grep/read)로 확인한 뒤 question 필드에 줄 번호·코드를 인용하여 답변하세요.",
  "3. [전수 탐색 & 다조각 edits 필수] 패치 전 대상 선택자·속성·값의 모든 변형(예: 기본 선택자와 다크모드 body.dark 변형, 미디어쿼리 등)을 전수 탐색하세요. 변형이 여러 곳에 존재하면 절대 1곳만 고치지 말고, 반드시 edits 배열에 모든 조각을 빠짐없이 담아 한 번에 반환하세요.",
  "4. [공백·줄바꿈·기존 속성 100% 보존] search에는 원본 index.html에 존재하는 글자·들여쓰기 공백·줄바꿈(\n)을 토씨 하나 틀리지 않고 그대로 넣으세요. replace 작성 시에도 수정 대상 값만 바꾸고, 같은 블록 내 다른 속성(예: font-size: 64px;, font-weight: bold; 등)과 줄바꿈·들여쓰기·콜론 뒤 공백을 원본과 100% 똑같이 유지하세요.",
  "5. [증거 인용 & 완료 문구 금지] 단정은 반드시 grep·read 결과나 줄 번호 인용과 함께 작성하세요. 실제 기계검증 전이므로 설명에 \"완료\", \"검증완료\", 근거 없는 \"됩니다\"라는 단어를 절대 쓰지 마세요.",
  "6. [설명 2줄 규격] explanation 필드는 결론 먼저 짧게 반드시 아래 두 줄 형식으로만 작성하세요:",
  "   [뭘] (의도: 사용자 의도 요약) 무엇을 어떻게 바꾸는지 결론 한 줄 (다조각이면 총 몇 곳인지 명시)",
  "   [왜] (근거: 매치된 기존 선택자/코드 인용, 추측 시 [추측] 명시) 바꾸는 이유 한 줄",
  "7. [ReAct 도구 호출 규격 (최대 3라운드)] 추가 파일 검색이나 줄 번호/코드 확인이 필요할 때만 아래 JSON 규격으로 도구를 호출하세요 (예시 1개):",
  "   {\"type\":\"tool_calls\",\"calls\":[{\"tool\":\"grep\",\"args\":{\"pattern\":\"#hello\",\"file\":\"index.html\"}}]}",
  "   - 사용 가능 도구: grep({pattern, file?}), read({file, start, end}), run({cmd})",
  "   - 1회차에 이미 받은 전체 코드 내용을 불필요하게 반복 read하지 마세요. 단, 사용자가 질문만 했거나 다른 파일/정확한 줄 번호 인용이 필요하면 grep을 1회 호출해 확인하세요.",
  "   - 같은 호출 반복 금지. 라운드당 run 도구는 최대 1회만 허용됩니다.",
  "   - 반드시 3회 안에 patch 또는 question으로 끝내세요. 3회 안에 못 찾겠으면 question에 지금까지 본 것과 필요한 증거를 적으세요.",
  "8. 지시를 패치로 수행할 수 있으면 아래 다조각 JSON 규격만 반환하세요:",
  "{\"type\":\"patch\",\"explanation\":\"[뭘] (의도: ...) ...\\n[왜] (근거: ...) ...\",\"target\":\"index.html\",\"edits\":[{\"search\":\"원본 조각 1\",\"replace\":\"새 조각 1\"},{\"search\":\"원본 조각 2\",\"replace\":\"새 조각 2\"}]}",
  "9. 단순 질문에 대한 코드 인용 답변이거나, 대상이 아예 없어 확인이 필요할 때는 아래 JSON 규격만 반환하세요:",
  "{\"type\":\"question\",\"question\":\"[의도/근거 인용 또는 확인 질문] 구체적인 답변 또는 질문\"}",
  "10. [위험 자가검토] 원본 30줄 이상 삭제·파일 전체 교체·핵심 기능 제거로 판단되면 patch 전에 explanation [왜] 끝에 [위험] 한 줄(되돌릴 수 없는 범위와 이유)을 의무로 적으세요. 복구 비용이 크면 patch 대신 question으로 전환하고, 거절 이유＋안전한 대안(조각 분할·주석처리)을 함께 제시하세요. '하라면 한다'는 금지입니다."
].join("\n");

function extractJsonString(raw) {
  const txt = String(raw || "").trim();
  const first = txt.indexOf("{");
  const last = txt.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return txt.slice(first, last + 1);
  }
  return txt;
}

function checkWhitespaceAndProps(searchStr, replaceStr) {
  const sLines = String(searchStr).split("\n");
  const rLines = String(replaceStr).split("\n");
  if (sLines.length > 1 && rLines.length === 1) {
    return { ok: false, reason: "다중 줄(multi-line) 블록의 줄바꿈이 증발했습니다." };
  }
  const cssPropRegex = /([a-zA-Z-]+)\s*:/g;
  const sProps = [];
  let m;
  while ((m = cssPropRegex.exec(searchStr)) !== null) {
    const p = m[1].toLowerCase();
    if (!["http", "https", "javascript"].includes(p)) sProps.push(p);
  }
  for (const prop of sProps) {
    const propKeepRegex = new RegExp(prop + "\\s*:", "i");
    if (!propKeepRegex.test(replaceStr)) {
      return { ok: false, reason: "원본에 있던 속성(" + prop + ")이 replace에서 증발했습니다." };
    }
  }
  return { ok: true };
}

// --- ReAct 도구 실행부 (grep / read / run) & 보안 가드 ---
const ALLOWED_TOOL_FILES = ["index.html", "blank.html", "server.js", "failures.md", "memory.json", "package.json"];

function recordSecurityOrToolFailure(what, why, how) {
  try {
    const clean = (v) => String(v || "-").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    const row = "| " + ts + " | " + clean(what) + " | " + clean(why) + " | " + clean(how) + " |\n";
    if (!fs.existsSync(FAILURES_PATH)) {
      fs.writeFileSync(FAILURES_PATH, "# 실패 일지 (failures.md)\n\n| 언제 | 뭐가 | 왜 | 어떻게 |\n|---|---|---|---|\n", "utf8");
    }
    fs.appendFileSync(FAILURES_PATH, row, "utf8");
  } catch (e) {}
}

function hasSensitiveKeyword(str) {
  const raw = String(str || "");
  const low = raw.toLowerCase();
  return (
    low.includes(".env") ||
    raw.includes("키") ||
    low.includes("apikey") ||
    low.includes("api_key") ||
    low.includes("gemini_api_key") ||
    low.includes("memoryapikey") ||
    low.includes("node_modules")
  );
}

function isAllowedToolFile(name) {
  const n = String(name || "").trim();
  if (!n || isForbiddenFileName(n)) return false;
  return ALLOWED_TOOL_FILES.includes(n);
}

function runAllowedCommandAsync(rawCmd) {
  return new Promise((resolve) => {
    const cmd = String(rawCmd || "").trim();
    if (!cmd) {
      return resolve({ ok: false, status: 400, error: "명령어가 비어 있습니다." });
    }
    const chainChars = [";", "&&", "||", "|", "`", "$(", ">", "<", "\n", "\r"];
    if (chainChars.some(ch => cmd.includes(ch))) {
      recordSecurityOrToolFailure("run 도구 셸 이어붙이기 차단", cmd, "단일 allowlist 명령만 허용");
      return resolve({ ok: false, status: 400, error: "거부됨(400): 셸 이어붙이기 및 리다이렉션 금지" });
    }
    const lowCmd = cmd.toLowerCase();
    if (
      lowCmd.includes(".env") ||
      cmd.includes("키") ||
      lowCmd.includes("key") ||
      lowCmd.includes("gemini") ||
      lowCmd.includes("memoryapikey")
    ) {
      recordSecurityOrToolFailure("run 도구 기밀 키워드 차단", cmd, ".env·키·GEMINI 접근 금지");
      return resolve({ ok: false, status: 400, error: "거부됨(400): 보안 정책상 .env·키·GEMINI 관련 명령 금지" });
    }

    let bin = "";
    let args = [];
    if (cmd === "git status") {
      bin = "git";
      args = ["status"];
    } else if (cmd === "git log --oneline -5") {
      bin = "git";
      args = ["log", "--oneline", "-5"];
    } else if (
      cmd === "tail /tmp/server.log" ||
      cmd === "tail -n 20 /tmp/server.log" ||
      cmd === "tail -n 50 /tmp/server.log" ||
      cmd === "tail 로그"
    ) {
      bin = "tail";
      args = ["-n", "30", "/tmp/server.log"];
    } else if (
      cmd === "curl health" ||
      cmd === "curl http://localhost:3000/health" ||
      cmd === "curl -s http://localhost:3000/health" ||
      cmd === "curl localhost:3000/health"
    ) {
      bin = "curl";
      args = ["-s", "http://localhost:3000/health"];
    } else if (cmd.startsWith("grep ")) {
      const tokens = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      const cleanTokens = tokens.slice(1).map(t => t.replace(/^["']|["']$/g, ""));
      if (cleanTokens.length < 2) {
        return resolve({ ok: false, status: 400, error: "거부됨(400): grep 사용법: grep [옵션] 패턴 파일명" });
      }
      const targetFile = cleanTokens[cleanTokens.length - 1];
      if (!isAllowedToolFile(targetFile)) {
        recordSecurityOrToolFailure("run grep 허용 외 파일 차단", targetFile, "ALLOWED_TOOL_FILES만 허용");
        return resolve({ ok: false, status: 400, error: "거부됨(400): grep 대상 파일은 allowlist 파일만 허용됩니다." });
      }
      const flags = cleanTokens.slice(0, -2);
      if (flags.some(f => !["-n", "-i", "-E", "-F", "-c", "-nE", "-ni"].includes(f))) {
        return resolve({ ok: false, status: 400, error: "거부됨(400): 허용되지 않은 grep 옵션입니다." });
      }
      bin = "grep";
      args = cleanTokens;
    } else {
      recordSecurityOrToolFailure("run allowlist 외 명령 차단", cmd, "읽기 전용 allowlist 명령만 허용");
      return resolve({ ok: false, status: 400, error: "거부됨(400): allowlist 외 명령입니다." });
    }

    execFile(bin, args, { cwd: __dirname, timeout: 5000 }, (err, stdout, stderr) => {
      const combined = (String(stdout || "") + (stderr ? "\n" + String(stderr) : "")).trim();
      const truncated = combined.length > 2000 ? combined.slice(0, 2000) + "\n...(2000자 절단됨)" : combined;
      if (err && err.code !== 1) {
        return resolve({ ok: false, status: 200, output: (truncated || err.message).slice(0, 2000) });
      }
      resolve({ ok: true, status: 200, output: truncated || "(출력 없음)" });
    });
  });
}

async function executeReactToolCall(call, seenSignatures = new Set()) {
  if (!call || typeof call !== "object") {
    return { ok: false, status: 400, error: "유효하지 않은 tool_call 형식입니다." };
  }
  const tool = String(call.tool || "").trim();
  const args = (call.args && typeof call.args === "object") ? call.args : call;

  // 1. 쓰기 도구 및 미지원 도구 호출 시 즉시 422 + 실패일지 기록
  if (!["grep", "read", "run"].includes(tool)) {
    const msg = "거부됨(422): 쓰기 또는 허용되지 않은 도구 호출 금지 (" + (tool || "unknown") + ")";
    recordSecurityOrToolFailure("허용 외 도구 호출 차단(422)", "tool=" + tool, "쓰기는 패치 카드 경로만 허용");
    return { ok: false, status: 422, error: msg };
  }

  // 중복 호출 방지용 시그니처 체크
  const sig = tool + ":" + JSON.stringify(args);
  if (seenSignatures.has(sig)) {
    return { ok: true, status: 200, tool, output: "(이미 동일한 내용 조회함 — 중복 호출 생략)" };
  }
  seenSignatures.add(sig);

  // 2. grep: { pattern, file? }
  if (tool === "grep") {
    const pattern = String(args.pattern || "").trim();
    const targetFile = args.file ? String(args.file).trim() : "index.html";
    if (!pattern) {
      return { ok: false, status: 400, error: "거부됨(400): grep pattern이 비어 있습니다." };
    }
    if (hasSensitiveKeyword(pattern) || hasSensitiveKeyword(targetFile) || !isAllowedToolFile(targetFile)) {
      const msg = "거부됨(400): allowlist 밖이거나 기밀 파일/키워드 접근 금지 (" + targetFile + ")";
      recordSecurityOrToolFailure("grep 금지 파일/키워드 차단(400)", "file=" + targetFile + " pattern=" + pattern, "allowlist 파일만 검색");
      return { ok: false, status: 400, error: msg };
    }
    const fullPath = path.join(__dirname, targetFile);
    if (!fs.existsSync(fullPath)) {
      return { ok: true, status: 200, tool, output: "(파일 없음: " + targetFile + ")" };
    }
    const lines = fs.readFileSync(fullPath, "utf8").split("\n");
    let re = null;
    try {
      re = new RegExp(pattern, "i");
    } catch (e) {
      re = null;
    }
    const hits = [];
    lines.forEach((line, idx) => {
      const matched = re ? re.test(line) : line.toLowerCase().includes(pattern.toLowerCase());
      if (matched) {
        hits.push(targetFile + ":" + (idx + 1) + ": " + line);
      }
    });
    const out = hits.length > 0 ? hits.join("\n") : "(매치 결과 없음: " + pattern + ")";
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\n...(2000자 절단됨)" : out
    };
  }

  // 3. read: { file, start, end } (1회 최대 200줄)
  if (tool === "read") {
    const targetFile = String(args.file || "").trim();
    if (!targetFile || hasSensitiveKeyword(targetFile) || !isAllowedToolFile(targetFile)) {
      const msg = "거부됨(400): allowlist 밖이거나 접근 금지된 파일입니다 (" + (targetFile || "empty") + ")";
      recordSecurityOrToolFailure("read 금지 파일 차단(400)", "file=" + targetFile, "allowlist 파일만 read 허용");
      return { ok: false, status: 400, error: msg };
    }
    const fullPath = path.join(__dirname, targetFile);
    if (!fs.existsSync(fullPath)) {
      return { ok: false, status: 404, error: "파일이 존재하지 않습니다: " + targetFile };
    }
    const lines = fs.readFileSync(fullPath, "utf8").split("\n");
    const startLine = Math.max(1, parseInt(args.start, 10) || 1);
    const rawEnd = parseInt(args.end, 10) || (startLine + 199);
    const endLine = Math.min(lines.length, Math.min(startLine + 199, Math.max(startLine, rawEnd)));
    const slice = lines.slice(startLine - 1, endLine).map((l, i) => (startLine + i) + ": " + l).join("\n");
    const out = "[" + targetFile + " " + startLine + "~" + endLine + "줄]\n" + slice;
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\n...(2000자 절단됨)" : out
    };
  }

  // 4. run: { cmd }
  if (tool === "run") {
    const cmd = String(args.cmd || args.command || "").trim();
    const res = await runAllowedCommandAsync(cmd);
    if (!res.ok && res.status === 400) {
      return { ok: false, status: 400, error: res.error };
    }
    return { ok: true, status: 200, tool, output: res.output };
  }

  return { ok: false, status: 422, error: "알 수 없는 도구입니다." };
}

app.post('/api/ai-modify', async (req, res) => {
  try {
    const { instruction, target, currentContent, model, images, retryError, testToolCall, mockResponses } = req.body || {};
    if (testToolCall) {
      const tRes = await executeReactToolCall(testToolCall);
      return res.status(tRes.status || 200).json(tRes);
    }
    if (!instruction || !target) return res.status(400).json({ error: 'instruction and target required' });

    const ALLOWED_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-4-argon"];
    const useModel = ALLOWED_MODELS.includes(model) ? model : "gemini-3.5-flash-lite";
    const htmlSource = currentContent || fs.readFileSync(INDEX_PATH, "utf8");
    const activeKey = getActiveKey();

    if (!activeKey && (!Array.isArray(mockResponses) || mockResponses.length === 0)) {
      const demo = { type: "question", question: "(키 미설정) 어떤 요소를 수정할지 구체적으로 알려주시겠어요?" };
      return res.json({ ok: true, result: JSON.stringify(demo), patch: demo });
    }

    const facts = readMemoryFacts();
    const memoryBlock = facts.length > 0 ? "\n\n[공유 기억 (memory.json)]\n- " + facts.join("\n- ") : "";
    const failBlock = searchRelevantFailures(instruction + " " + (retryError || ""));
    const failureNote = failBlock ? "\n\n[과거 실패 일지 (failures.md) — 동일 실수 반복 금지]\n" + failBlock : "";
    const retryNote = retryError ? "\n\n[직전 패치 실패 사유 — 반드시 수정하여 재작성하세요]\n" + retryError : "";

    const ai = activeKey ? new GoogleGenAI({ apiKey: activeKey }) : null;
    const seenSignatures = new Set();
    const toolHistoryBlocks = [];
    const observedSummaries = [];
    let toolRoundsUsed = 0;
    const loopStartTime = Date.now();
    const MAX_ROUNDS = 3;
    const TIME_LIMIT_MS = 120000;

    let finalParsed = null;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (Date.now() - loopStartTime > TIME_LIMIT_MS) {
        recordSecurityOrToolFailure("ReAct 루프 시간 초과(120초)", instruction.slice(0, 80), "질문 카드로 강제 종료");
        finalParsed = {
          type: "question",
          question: "[시간 초과 중단] 도구 탐색이 120초를 초과하여 중단했습니다. 지금까지 확인한 내용: " + (observedSummaries.join(" / ") || "없음") + ". 수정할 위치의 코드 조각을 직접 알려주시겠어요?",
          toolRounds: toolRoundsUsed
        };
        break;
      }

      // 1회차에만 전체 코드 전달, 2회차부터는 토큰 절약을 위해 생략 문구로 대체
      const codeSection = (round === 1)
        ? ("\n\n[현재 index.html 전체 코드]\n" + htmlSource)
        : "\n\n[현재 index.html 전체 코드]\n(1회차에 이미 전달된 전체 코드는 생략 — 위 1회차 코드 및 아래 도구 결과를 참고하고, 이미 받은 내용은 재조회하지 마세요)";

      const historySection = toolHistoryBlocks.length > 0
        ? ("\n\n" + toolHistoryBlocks.join("\n\n"))
        : "";

      const roundHint = (round > 1)
        ? ("\n\n[현재 라운드: " + round + "/" + MAX_ROUNDS + "] 같은 도구 호출을 반복하지 말고, 충분한 근거가 모였으면 즉시 patch 또는 question JSON을 출력하세요.")
        : "";

      const prompt = PATCH_SYSTEM_PROMPT + memoryBlock + failureNote + retryNote + codeSection + historySection + roundHint + "\n\n[사용자 지시]\n" + instruction;

      console.log("MODIFY round=" + round, new Date().toISOString(), "model=" + useModel, retryError ? "(retry)" : "");

      let rawText = "";
      if (Array.isArray(mockResponses) && mockResponses.length >= round) {
        rawText = typeof mockResponses[round - 1] === "string"
          ? mockResponses[round - 1]
          : JSON.stringify(mockResponses[round - 1]);
      } else {
        const response = await ai.models.generateContent({
          model: useModel,
          contents: buildMultimodalContents(prompt, round === 1 ? images : []),
        });
        rawText = (response && response.text) ? response.text : "";
      }

      const jsonStr = extractJsonString(rawText);
      let parsed = null;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (err) {
        return res.status(422).json({ ok: false, error: "AI 응답이 유효한 JSON 형식이 아닙니다.", raw: jsonStr });
      }

      if (parsed.type === "patch" || parsed.type === "question") {
        finalParsed = parsed;
        break;
      }

      if (parsed.type === "tool_calls" && Array.isArray(parsed.calls) && parsed.calls.length > 0) {
        if (round === MAX_ROUNDS) {
          // 3회차에서도 patch/question이 안 나오면 강제 question 종료
          recordSecurityOrToolFailure("ReAct 3회차 초과 미결", instruction.slice(0, 80), "3회 탐색 후 question 종료");
          finalParsed = {
            type: "question",
            question: "3번 봐도 못 찾음 — 지금까지 본 것: [" + (observedSummaries.join("; ") || "도구 호출 시도") + "]. 필요한 증거: 수정하려는 대상의 정확한 선택자나 텍스트 조각을 붙여주시겠어요?",
            toolRounds: toolRoundsUsed
          };
          break;
        }

        toolRoundsUsed++;
        let runCountInRound = 0;
        const roundOutputs = [];

        for (let cIdx = 0; cIdx < parsed.calls.length; cIdx++) {
          const callObj = parsed.calls[cIdx];
          const toolName = String((callObj && callObj.tool) || "").trim();

          if (toolName === "run") {
            runCountInRound++;
            if (runCountInRound > 1) {
              roundOutputs.push("[call #" + (cIdx + 1) + " run 제한] 라운드당 run 도구는 1회만 허용되어 생략되었습니다.");
              continue;
            }
          }

          const tRes = await executeReactToolCall(callObj, seenSignatures);
          if (!tRes.ok && (tRes.status === 400 || tRes.status === 422)) {
            return res.status(tRes.status).json({ ok: false, error: tRes.error });
          }

          const summaryLabel = toolName + "(" + JSON.stringify((callObj && callObj.args) || {}) + ")";
          observedSummaries.push(summaryLabel + " -> " + String(tRes.output || "").split("\n")[0].slice(0, 60));
          roundOutputs.push("▶ " + summaryLabel + "\n" + String(tRes.output || tRes.error || "(출력 없음)"));
        }

        toolHistoryBlocks.push("[도구 결과 " + round + "회차]\n" + roundOutputs.join("\n---\n"));
        continue;
      }

      return res.status(422).json({ ok: false, error: "알 수 없는 type 입니다: " + parsed.type, patch: parsed });
    }

    if (!finalParsed) {
      finalParsed = {
        type: "question",
        question: "3번 봐도 못 찾음 — 지금까지 본 것: [" + (observedSummaries.join("; ") || "없음") + "]. 필요한 증거: 대상 요소의 정확한 이름이나 코드를 알려주시겠어요?",
        toolRounds: toolRoundsUsed
      };
    }

    if (toolRoundsUsed > 0) {
      finalParsed.toolRounds = toolRoundsUsed;
    }

    if (finalParsed.type === "patch") {
      finalParsed.target = "index.html";
      let rawEdits = [];
      if (Array.isArray(finalParsed.edits) && finalParsed.edits.length > 0) {
        rawEdits = finalParsed.edits;
      } else if (typeof finalParsed.search === "string" && typeof finalParsed.replace === "string") {
        rawEdits = [{ search: finalParsed.search, replace: finalParsed.replace }];
      } else {
        return res.status(422).json({ ok: false, error: "patch JSON에 edits 배열 또는 search/replace 필드가 누락되었습니다.", patch: finalParsed });
      }

       for (let i = 0; i < rawEdits.length; i++) {
        const ed = rawEdits[i];
        if (!ed || typeof ed.search !== "string" || !ed.search || typeof ed.replace !== "string") {
          return res.status(422).json({ ok: false, error: "조각 #" + (i + 1) + "의 search/replace 형식이 올바르지 않습니다.", patch: finalParsed });
        }
        const wsCheck = checkWhitespaceAndProps(ed.search, ed.replace);
        if (!wsCheck.ok) {
          return res.status(422).json({ ok: false, error: "조각 #" + (i + 1) + " 공백/속성 검증 실패: " + wsCheck.reason, patch: finalParsed });
        }
      }
      let totalRemoved = 0, totalAdded = 0;
      for (const ed of rawEdits) {
        totalRemoved += String(ed.search).split("\n").length;
        totalAdded += String(ed.replace).split("\n").length;
      }
      const netRemoved = totalRemoved - totalAdded;
      if (netRemoved >= 30 && !String(finalParsed.explanation || "").includes("[위험]")) {
        recordSecurityOrToolFailure("위험표기 누락 차단(422)", "순삭제 " + netRemoved + "줄", "[위험] 1줄 추가 후 재요청");
        return res.status(422).json({ ok: false, error: "거부됨(422): 순삭제 " + netRemoved + "줄 — explanation [왜] 끝에 [위험] 한 줄(되돌릴 수 없는 범위와 이유)을 추가하세요.", patch: finalParsed });
      }
      if (totalRemoved - totalAdded >= 50) {
        recordSecurityOrToolFailure("대규모 삭제 차단(422)", "순삭제 " + (totalRemoved - totalAdded) + "줄", "조각 분할 후 재요청");
        return res.status(422).json({ ok: false, error: "거부됨(422): 대규모 삭제 감지(순삭제 " + (totalRemoved - totalAdded) + "줄). 삭제 범위를 조각으로 나누거나 유지할 부분을 명시해 다시 요청하세요.", patch: finalParsed });
      }

      finalParsed.edits = rawEdits;
      finalParsed.search = rawEdits[0].search;
      finalParsed.replace = rawEdits[0].replace;

      const exp = String(finalParsed.explanation || "").trim();
      if (!exp.includes("[뭘]") || !exp.includes("[왜]")) {
        const lines = exp.split("\n").filter(Boolean);
      finalParsed.explanation = "[뭘] [추측] " + (lines[0] || "요청하신 코드 조각 수정") + "\n[왜] [추측] 근거 없음 — 원본 대조 없이 생성됨";
      }
    } else if (finalParsed.type === "question") {
      if (typeof finalParsed.question !== "string") {
        return res.status(422).json({ ok: false, error: "question JSON에 question 필드가 누락되었습니다.", patch: finalParsed });
      }
    } else {
      return res.status(422).json({ ok: false, error: "알 수 없는 type 입니다: " + finalParsed.type, patch: finalParsed });
    }

    const banWords = ["검증완료", "됩니다", "완료"];
    const scanText = String(finalParsed.explanation || "") + "\n" + String(finalParsed.question || "");
    const hitBan = banWords.find(w => scanText.includes(w));
    if (hitBan) {
      recordSecurityOrToolFailure("완료표현 차단(422)", "발견: " + hitBan, "증거 기준 재작성");
      return res.status(422).json({ ok: false, error: "거부됨(422): 근거 없는 완료 표현 금지(발견: \"" + hitBan + "\"). 증거(앵커·실행 결과) 기준으로 다시 작성하세요.", patch: finalParsed });
    }

    return res.json({ ok: true, result: JSON.stringify(finalParsed), patch: finalParsed, toolRounds: toolRoundsUsed });  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    let friendly = '서버 오류가 발생했습니다. [' + msg.slice(0, 200) + ']';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      friendly = 'Gemini API 키가 유효하지 않습니다.';
    }
    return res.status(500).json({ ok: false, error: friendly });
  }
});

app.get("/api/key/status", (req, res) => {
  res.json({ hasKey: Boolean(memoryApiKey || process.env.GEMINI_API_KEY) });
});
app.post("/api/key", (req, res) => {
  memoryApiKey = (req.body && req.body.apiKey) || "";
  res.json({ ok: true, hasKey: Boolean(memoryApiKey) });
});

// --- 기억 파일 (memory.json) GET / POST ---
app.get('/api/memory', (req, res) => {
  try {
    const facts = readMemoryFacts();
    res.json({ ok: true, facts, content: JSON.stringify({ facts }, null, 2) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/memory', (req, res) => {
  try {
    const { facts, addFacts, rawJson } = req.body || {};
    let nextFacts = readMemoryFacts();
    if (typeof rawJson === "string") {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed.facts)) {
        return res.status(400).json({ ok: false, error: "memory.json은 { \"facts\": [...] } 형식이어야 합니다." });
      }
      nextFacts = parsed.facts.map(x => String(x).trim()).filter(Boolean);
    } else if (Array.isArray(facts)) {
      nextFacts = facts.map(x => String(x).trim()).filter(Boolean);
    } else if (Array.isArray(addFacts)) {
      addFacts.forEach(item => {
        const clean = String(item || "").trim();
        if (clean && !nextFacts.includes(clean)) nextFacts.push(clean);
      });
    } else {
      return res.status(400).json({ ok: false, error: "facts 또는 addFacts가 필요합니다." });
    }
    fs.writeFileSync(MEMORY_PATH, JSON.stringify({ facts: nextFacts }, null, 2) + "\n", "utf8");
    res.json({ ok: true, facts: nextFacts });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// --- 실패 일지 (failures.md) GET / POST ---
app.get('/api/failures', (req, res) => {
  try {
    const content = fs.existsSync(FAILURES_PATH) ? fs.readFileSync(FAILURES_PATH, "utf8") : "";
    res.json({ ok: true, content });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/failures', (req, res) => {
  try {
    const { when, what, why, how } = req.body || {};
    const clean = (v) => String(v || "-").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
    const ts = clean(when || new Date().toISOString().slice(0, 16).replace("T", " "));
    const row = "| " + ts + " | " + clean(what) + " | " + clean(why) + " | " + clean(how) + " |\n";
    if (!fs.existsSync(FAILURES_PATH)) {
      fs.writeFileSync(FAILURES_PATH, "# 실패 일지 (failures.md)\n\n| 언제 | 뭐가 | 왜 | 어떻게 |\n|---|---|---|---|\n", "utf8");
    }
    fs.appendFileSync(FAILURES_PATH, row, "utf8");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- 폴더 파일 목록 & 읽기 (/api/files) ---
function isForbiddenFileName(name) {
  const n = String(name || "");
  const low = n.toLowerCase();
  if (!n || n.includes("..") || n.includes("/") || n.includes("\\")) return true;
  if (n.startsWith(".") || low.includes(".env") || low.includes("key") || n === "node_modules") return true;
  return false;
}

app.get('/api/files', (req, res) => {
  try {
    const entries = fs.readdirSync(__dirname, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && !isForbiddenFileName(e.name))
      .map(e => {
        const stat = fs.statSync(path.join(__dirname, e.name));
        return { name: e.name, size: stat.size };
      });
    res.json({ ok: true, files });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/files/read', (req, res) => {
  try {
    const name = String((req.query && req.query.name) || "").trim();
    if (isForbiddenFileName(name)) {
      return res.status(400).json({ ok: false, error: "접근이 금지된 파일입니다." });
    }
    const targetPath = path.join(__dirname, name);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ ok: false, error: "파일이 존재하지 않습니다." });
    }
    const content = fs.readFileSync(targetPath, "utf8").slice(0, 20000);
    res.json({ ok: true, name, content });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- 읽기 전용 터미널 실행 (/api/run) ---
app.post('/api/run', (req, res) => {
  const rawCmd = String((req.body && req.body.command) || "").trim();
  if (!rawCmd) return res.status(400).json({ ok: false, error: "명령어를 입력하세요." });

  // 1. 셸 이어붙이기·리다이렉션 금지
  const chainChars = [";", "&&", "||", "|", "`", "$(", ">", "<", "\n", "\r"];
  if (chainChars.some(ch => rawCmd.includes(ch))) {
    return res.status(400).json({ ok: false, error: "거부됨: 셸 이어붙이기 및 리다이렉션은 금지되어 있습니다." });
  }

  // 2. 민감 키워드(.env, 키, GEMINI, memoryApiKey) 절대 금지
  const lowCmd = rawCmd.toLowerCase();
  if (
    lowCmd.includes(".env") ||
    rawCmd.includes("키") ||
    lowCmd.includes("key") ||
    lowCmd.includes("gemini") ||
    lowCmd.includes("memoryapikey")
  ) {
    return res.status(400).json({ ok: false, error: "거부됨: 보안 정책상 .env·키·GEMINI 관련 명령은 실행할 수 없습니다." });
  }

  // 3. 읽기 전용 Allowlist 검사
  let bin = "";
  let args = [];

  if (rawCmd === "git status") {
    bin = "git";
    args = ["status"];
  } else if (rawCmd === "git log --oneline -5") {
    bin = "git";
    args = ["log", "--oneline", "-5"];
  } else if (
    rawCmd === "tail /tmp/server.log" ||
    rawCmd === "tail -n 20 /tmp/server.log" ||
    rawCmd === "tail -n 50 /tmp/server.log" ||
    rawCmd === "tail 로그"
  ) {
    bin = "tail";
    args = ["-n", "30", "/tmp/server.log"];
  } else if (
    rawCmd === "curl health" ||
    rawCmd === "curl http://localhost:3000/health" ||
    rawCmd === "curl -s http://localhost:3000/health" ||
    rawCmd === "curl localhost:3000/health"
  ) {
    bin = "curl";
    args = ["-s", "http://localhost:3000/health"];
  } else if (rawCmd.startsWith("grep ")) {
    const tokens = rawCmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const cleanTokens = tokens.slice(1).map(t => t.replace(/^["']|["']$/g, ""));
    if (cleanTokens.length < 2) {
      return res.status(400).json({ ok: false, error: "거부됨: grep 사용법: grep [옵션] 패턴 파일명" });
    }
    const targetFile = cleanTokens[cleanTokens.length - 1];
    const allowedGrepFiles = ["index.html", "blank.html", "server.js", "failures.md", "memory.json", "package.json"];
    if (!allowedGrepFiles.includes(targetFile)) {
      return res.status(400).json({ ok: false, error: "거부됨: grep 대상 파일은 워크스페이스 일반 파일만 허용됩니다." });
    }
    const flags = cleanTokens.slice(0, -2);
    if (flags.some(f => !["-n", "-i", "-E", "-F", "-c", "-nE", "-ni"].includes(f))) {
      return res.status(400).json({ ok: false, error: "거부됨: 허용되지 않은 grep 옵션입니다." });
    }
    bin = "grep";
    args = cleanTokens;
  } else {
    return res.status(400).json({
      ok: false,
      error: "거부됨(allowlist 외): 허용 명령은 [git status], [git log --oneline -5], [tail /tmp/server.log], [curl health], [grep ... 파일명] 뿐입니다."
    });
  }

  execFile(bin, args, { cwd: __dirname, timeout: 5000 }, (err, stdout, stderr) => {
    const combined = (String(stdout || "") + (stderr ? "\n" + String(stderr) : "")).trim();
    const truncated = combined.length > 2000 ? combined.slice(0, 2000) + "\n...(2000자 절단됨)" : combined;
    if (err && err.code !== 1) {
      return res.json({ ok: false, output: (truncated || err.message).slice(0, 2000) });
    }
    res.json({ ok: true, output: truncated || "(출력 없음)" });
  });
});

// --- 스냅샷 한 방 (/api/snapshot: add -> commit -> push) ---
function runGitStep(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: __dirname, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        const out = (String(stdout || "") + " " + String(stderr || "")).trim();
        return reject(new Error(out || err.message));
      }
      resolve((String(stdout || "") + " " + String(stderr || "")).trim());
    });
  });
}

app.post('/api/snapshot', async (req, res) => {
  try {
    await runGitStep(["add", "-A"]);
    const statusOut = await runGitStep(["status", "--short"]);
    const changedCount = statusOut ? statusOut.split("\n").filter(Boolean).length : 0;
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const commitMsg = "snapshot: " + stamp + " (" + changedCount + " files)";

    let commitResult = "";
    try {
      commitResult = await runGitStep(["commit", "-m", commitMsg]);
    } catch (commitErr) {
      if (!String(commitErr.message).includes("nothing to commit")) {
        throw commitErr;
      }
      commitResult = "변경사항 없음(기존 커밋 유지)";
    }

    let pushResult = "push 완료";
    try {
      await runGitStep(["push"]);
    } catch (pushErr) {
      pushResult = "로컬 커밋 완료 (push 알림: " + String(pushErr.message).slice(0, 80) + ")";
    }

    const line = "📸 스냅샷 완료 [" + commitMsg + "] — " + pushResult;
    res.json({ ok: true, summary: line });
  } catch (e) {
    res.status(500).json({ ok: false, error: "스냅샷 실패: " + String(e.message).slice(0, 200) });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
  if (!GEMINI_API_KEY) console.log('GEMINI_API_KEY not set: using demo replies.');
});
