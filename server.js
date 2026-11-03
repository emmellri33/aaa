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

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- 채팅 (AI 답변 생성) ---
app.post('/api/chat', async (req, res) => {
  try {
    const { message, pageContext } = req.body || {};
    const ALLOWED_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-4-argon"];
    const useModel = ALLOWED_MODELS.includes(req.body && req.body.model) ? req.body.model : GEMINI_MODEL;
    const msg = (message || '').toString().trim();
    if (!msg) return res.status(400).json({ error: 'message required' });

    if (!GEMINI_API_KEY) {
      return res.json({ reply: ' (AI 키 미설정) 데모 응답: "' + msg + '" 라고 하셨군요.' });
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const context = (pageContext || '').toString().slice(0, 4000);
    const prompt =
      'You are a helpful assistant. Reply in Korean.\n\n' +
      (context ? '[현재 페이지 내용]\n' + context + '\n\n' : '') +
      '사용자 메시지: ' + msg;

    console.log("CHAT start", new Date().toISOString(), "keylen=" + String(GEMINI_API_KEY).length, "model=" + (typeof useModel !== "undefined" ? useModel : GEMINI_MODEL));
    const response = await ai.models.generateContent({
      model: useModel,
      contents: prompt,
    });
    const reply = (response && response.text) ? response.text : '(응답 없음)';
    return res.json({ reply });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    let friendly = '서버 오류가 발생했습니다. [' + ((e && e.message) ? e.message : String(e)).slice(0, 200) + ']';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      friendly = 'Gemini API 키가 유효하지 않습니다. .env의 GEMINI_API_KEY를 확인하세요.';
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

// --- AI 기반 수정 도우미 (패치 JSON 규격 & 시스템 프롬프트) ---
const PATCH_SYSTEM_PROMPT = [
  "당신은 index.html 패치 생성 전용 AI입니다.",
  "[절대 규칙]",
  "1. 마크다운 코드블록(```), 인사말, 잡담, 부가 설명을 절대 출력하지 마세요. 오직 유효한 JSON 객체 1개만 출력하세요.",
  "2. 한 번에 딱 한 조각(단일 위치)만 수정하세요.",
  "3. search 필드에는 현재 index.html 파일에 글자·공백·줄바꿈까지 100% 정확히 존재하는 원본 문자열 조각만 넣으세요.",
  "4. 지시가 명확하면 아래 JSON 규격만 반환하세요:",
  "{\"type\":\"patch\",\"explanation\":\"수정 내용 요약\",\"target\":\"index.html\",\"search\":\"파일에 정확히 존재하는 원본 조각\",\"replace\":\"대체할 새 조각\"}",
  "5. 지시가 모호하거나 대상이 불분명하면 아래 JSON 규격만 반환하세요:",
  "{\"type\":\"question\",\"question\":\"사용자에게 물어볼 구체적인 질문\"}"
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
    const { instruction, target, currentContent, model } = req.body || {};
    if (!instruction || !target) return res.status(400).json({ error: 'instruction and target required' });

    const ALLOWED_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-4-argon"];
    const useModel = ALLOWED_MODELS.includes(model) ? model : "gemini-3.5-flash-lite";
    const htmlSource = currentContent || fs.readFileSync(INDEX_PATH, "utf8");

    if (!GEMINI_API_KEY) {
      const demo = { type: "question", question: "(키 미설정) 어떤 요소를 수정할지 구체적으로 알려주시겠어요?" };
      return res.json({ ok: true, result: JSON.stringify(demo), patch: demo });
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = PATCH_SYSTEM_PROMPT + "\n\n[현재 index.html 전체 코드]\n" + htmlSource + "\n\n[사용자 지시]\n" + instruction;

    const response = await ai.models.generateContent({
      model: useModel,
      contents: prompt,
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
      friendly = 'Gemini API 키가 유효하지 않습니다. .env의 GEMINI_API_KEY를 확인하세요.';
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

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
  if (!GEMINI_API_KEY) console.log('GEMINI_API_KEY not set: using demo replies.');
});
