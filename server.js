require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
let memoryApiKey = process.env.GEMINI_API_KEY || "";
const GEMINI_API_KEY = (memoryApiKey || (memoryApiKey || process.env.GEMINI_API_KEY)) || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    const reply = (response && response.text) ? response.text : '(응답 없음)';
    return res.json({ reply });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    let friendly = '서버 오류가 발생했습니다.';
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

// --- AI 기반 수정 도우미 (프롬프트/페이지) ---
function stripMarkdown(text) {
  return text.replace(/```html\n/g, '').replace(/```\n/g, '').replace(/```/g, '').trim();
}

app.post('/api/ai-modify', async (req, res) => {
  try {
    const { instruction, target, currentContent } = req.body || {};
    if (!instruction || !target) return res.status(400).json({ error: 'instruction and target required' });
    if (!GEMINI_API_KEY) {
      return res.json({ result: '(데모 모드) "' + instruction + '" 을(를) ' + target + ' 에 적용했습니다.' });
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    let prompt = '';
    if (target === 'index') {
      prompt = `You are a skilled web developer. Modify the following HTML file according to the user's instruction. Output ONLY the complete modified HTML document. Do not include markdown code blocks, explanations, or extra text.

User Instruction: ${instruction}

Current HTML:
${currentContent || ''}`;
    } else if (target === 'prompt') {
      prompt = `You are a prompt engineer. Rewrite the following system prompt according to the user's instruction. Output ONLY the new prompt text. Do not include markdown code blocks, explanations, or extra text.

User Instruction: ${instruction}

Current Prompt:
${currentContent || ''}`;
    } else {
      return res.status(400).json({ error: 'unsupported target' });
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    let result = stripMarkdown(response.text || '');
    return res.json({ result });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    let friendly = '서버 오류가 발생했습니다.';
    if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
      friendly = 'Gemini API 키가 유효하지 않습니다. .env의 GEMINI_API_KEY를 확인하세요.';
    }
    return res.status(500).json({ error: friendly });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
  if (!GEMINI_API_KEY) console.log('GEMINI_API_KEY not set: using demo replies.');
});
