const cors = require("cors");
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
  "당신은 index.html 패치 생성 전용 AI입니다.",
  "[절대 규칙 — 보기 → 고치기 → 눈]",
  "1. 마크다운 코드블록, 인사말, 잡담을 절대 출력하지 마세요. 오직 유효한 JSON 객체 1개만 출력하세요.",
  "2. [의도 추론 & 추측 표시] 패치 전에 사용자 의도를 먼저 파악하세요. 지시가 다소 막연하더라도 파일 맥락상 합리적으로 추측 가능하면 질문하지 말고 먼저 패치를 제안하되, 추측한 부분에는 반드시 [추측] 표시를 넣으세요. 전혀 알 수 없을 때만 question 타입으로 질문하세요.",
  "3. [전수 탐색] 패치 작성 전 index.html 전체를 읽고, 대상 선택자·속성·값의 변형(다크모드 body.dark, 미디어쿼리 @media, hover 등)을 전수 탐색하세요. 다크모드나 변형 규칙에 같은 속성이 걸려 있다면 함께 수정하여 누락을 막으세요.",
  "4. [증거 인용 & 완료 금지] search 필드에는 현재 index.html에 글자·공백·줄바꿈까지 100% 정확히 존재하는 원본 조각만 넣으세요. 실제 기계검증 전이므로 설명에 \"완료\", \"검증완료\", 근거 없는 \"됩니다\"라는 단어를 절대 쓰지 마세요.",
  "5. [설명 2줄 규격] explanation 필드는 결론 먼저 짧게 반드시 아래 두 줄 형식으로만 작성하세요:",
  "   [뭘] (의도: 사용자 의도 요약) 무엇을 어떻게 바꾸는지 결론 한 줄",
  "   [왜] (근거: 매치된 기존 선택자/코드 인용, 추측 시 [추측] 명시) 바꾸는 이유 한 줄",
  "6. 지시를 합리적으로 수행할 수 있으면 아래 JSON 규격만 반환하세요:",
  "{\"type\":\"patch\",\"explanation\":\"[뭘] (의도: ...) ...\\n[왜] (근거: ...) ...\",\"target\":\"index.html\",\"search\":\"파일에 정확히 존재하는 원본 조각\",\"replace\":\"대체할 새 조각\"}",
  "7. 대상이 아예 없거나 전혀 알 수 없을 때만 아래 JSON 규격만 반환하세요:",
  "{\"type\":\"question\",\"question\":\"[의도 확인] 사용자에게 물어볼 구체적인 질문\"}",
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

app.post('/api/ai-modify', async (req, res) => {
  try {
    const { instruction, target, currentContent, model, images, retryError } = req.body || {};
    if (!instruction || !target) return res.status(400).json({ error: 'instruction and target required' });

    const ALLOWED_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-4-argon"];
    const useModel = ALLOWED_MODELS.includes(model) ? model : "gemini-3.5-flash-lite";
    const htmlSource = currentContent || fs.readFileSync(INDEX_PATH, "utf8");
    const activeKey = getActiveKey();

    if (!activeKey) {
      const demo = { type: "question", question: "(키 미설정) 어떤 요소를 수정할지 구체적으로 알려주시겠어요?" };
      return res.json({ ok: true, result: JSON.stringify(demo), patch: demo });
    }

    const facts = readMemoryFacts();
    const memoryBlock = facts.length > 0 ? "\n\n[공유 기억 (memory.json)]\n- " + facts.join("\n- ") : "";
    const failBlock = searchRelevantFailures(instruction + " " + (retryError || ""));
    const failureNote = failBlock ? "\n\n[과거 실패 일지 (failures.md) — 동일 실수 반복 금지]\n" + failBlock : "";
    const retryNote = retryError ? "\n\n[직전 패치 실패 사유 — 반드시 수정하여 재작성하세요]\n" + retryError : "";

    const ai = new GoogleGenAI({ apiKey: activeKey });
    const prompt = PATCH_SYSTEM_PROMPT + memoryBlock + failureNote + retryNote + "\n\n[현재 index.html 전체 코드]\n" + htmlSource + "\n\n[사용자 지시]\n" + instruction;

    console.log("MODIFY start", new Date().toISOString(), "model=" + useModel, retryError ? "(retry)" : "");
    const response = await ai.models.generateContent({
      model: useModel,
      contents: buildMultimodalContents(prompt, images),
    });

    const jsonStr = extractJsonString(response && response.text ? response.text : "");
    let parsed = null;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      return res.status(422).json({ ok: false, error: "AI 응답이 유효한 JSON 형식이 아닙니다.", raw: jsonStr });
    }

    if (parsed.type === "patch") {
      parsed.target = "index.html";
      if (typeof parsed.search !== "string" || typeof parsed.replace !== "string") {
        return res.status(422).json({ ok: false, error: "patch JSON에 search/replace 필드가 누락되었습니다.", patch: parsed });
      }
      const exp = String(parsed.explanation || "").trim();
      if (!exp.includes("[뭘]") || !exp.includes("[왜]")) {
        const lines = exp.split("\n").filter(Boolean);
        parsed.explanation = "[뭘] " + (lines[0] || "요청하신 코드 조각 수정") + "\n[왜] " + (lines[1] || "사용자 지시 반영을 위해 수정");
      }
    } else if (parsed.type === "question") {
      if (typeof parsed.question !== "string") {
        return res.status(422).json({ ok: false, error: "question JSON에 question 필드가 누락되었습니다.", patch: parsed });
      }
    } else {
      return res.status(422).json({ ok: false, error: "알 수 없는 type 입니다: " + parsed.type, patch: parsed });
    }

    return res.json({ ok: true, result: JSON.stringify(parsed), patch: parsed });
  } catch (e) {
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
