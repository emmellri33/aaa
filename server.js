require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
let memoryApiKey = process.env.GEMINI_API_KEY || "";
const GEMINI_API_KEY = (memoryApiKey || (memoryApiKey || process.env.GEMINI_API_KEY)) || '';
// USD 단가표 (1M 토큰 기준, 2026-11-05 사용자 확정값)
const USD_PRICE = {
  "flash-lite": { in: 0.30, out: 2.50 },
  "3.8-flash": { in: 0.75, out: 3.75 },
  "pro": { in: 2.00, out: 12.00 },
  "argon": { in: 2.00, out: 10.00 }
};
function costOf(model, inTok, outTok) {
  try {
    const m = String(model || "");
    const it = Number(inTok), ot = Number(outTok);
    if (!(it > 0) && !(ot > 0)) return 0;
    let key = null;
    if (m.includes("argon")) key = "argon";
    else if (m.includes("pro")) key = "pro";
    else if (m.includes("3.8-flash")) key = "3.8-flash";
    else if (m.includes("flash-lite")) key = "flash-lite";
    else if (m.includes("flash")) key = "flash-lite";
    if (!key) return 0;
    const p = USD_PRICE[key];
    return (Math.max(0, it) / 1e6) * p.in + (Math.max(0, ot) / 1e6) * p.out;
  } catch (e) { return 0; }
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const INDEX_PATH = path.join(__dirname, 'index.html');
const MEMORY_PATH = path.join(__dirname, 'memory.json');
const FAILURES_PATH = path.join(__dirname, 'failures.md');
const FAILURES_COLD_PATH = path.join(__dirname, 'failures-cold.md');
const MANIFEST_PATH = path.join(__dirname, 'manifest.json');
const { execFile } = require('child_process');
const crypto = require('crypto');

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

function readMemoryData() {
  try {
    if (!fs.existsSync(MEMORY_PATH)) return { global: [], rooms: {} };
    const raw = fs.readFileSync(MEMORY_PATH, "utf8");
    const data = JSON.parse(raw);
    
    // 마이그레이션: 기존 { facts: [...] } 구조인 경우
    if (Array.isArray(data.facts) && !data.global && !data.rooms) {
      return { global: data.facts, rooms: {} };
    }
    
    return {
      global: Array.isArray(data.global) ? data.global : [],
      rooms: (data.rooms && typeof data.rooms === "object") ? data.rooms : {}
    };
  } catch (e) {
    return { global: [], rooms: {} };
  }
}

function readMemoryFacts(roomId) {
  const data = readMemoryData();
  let facts = [...data.global];
  if (roomId && data.rooms[roomId] && Array.isArray(data.rooms[roomId])) {
    facts = facts.concat(data.rooms[roomId]);
  }
  return facts;
}

function searchRelevantFailures(queryText) {
  try {
    if (!fs.existsSync(FAILURES_PATH)) return "";
    const rawHot = fs.readFileSync(FAILURES_PATH, "utf8");
    const hotLines = rawHot.split("\n").filter(l => l.startsWith("|") && !l.includes("|---") && !l.includes("| 언제 |"));
    
    const recentHot = hotLines.slice(-5);
    const words = String(queryText || "").split(/\s+/).filter(w => w.length >= 2);
    
    const hotMatched = recentHot.some(line => words.some(w => line.includes(w)));
    let resultLines = [...recentHot];
    
    if (!hotMatched && words.length > 0 && fs.existsSync(FAILURES_COLD_PATH)) {
      const rawCold = fs.readFileSync(FAILURES_COLD_PATH, "utf8");
      const coldLines = rawCold.split("\n").filter(l => l.startsWith("|") && !l.includes("|---") && !l.includes("| 언제 |"));
      const matchedCold = coldLines.filter(line => words.some(w => line.includes(w)));
      if (matchedCold.length > 0) {
        resultLines = resultLines.concat(matchedCold.slice(-5));
      }
    }
    
    if (resultLines.length === 0) return "";
    return resultLines.join("\n");
  } catch (e) {
    return "";
  }
}

// --- EYES 분할2: 스켈레톤 추출기 (정규식 기반 id, 함수명, 주요 class / 상한 20줄) ---
function extractSkeletonMap(sourceText) {
  try {
    const text = String(sourceText || "");
    if (!text.trim()) return "(스켈레톤 없음: 빈 파일)";
    const lines = [];

    // id 추출
    const ids = [];
    const idRegex = /\bid=["']([a-zA-Z0-9_-]+)["']/g;
    let m;
    while ((m = idRegex.exec(text)) !== null) {
      if (!ids.includes(m[1])) ids.push(m[1]);
      if (ids.length >= 8) break;
    }
    if (ids.length > 0) lines.push("- id: #" + ids.join(", #"));

    // 함수명 추출 (function foo, const foo = () =>, function* foo)
    const funcs = [];
    const fnRegex = /(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>)/g;
    while ((m = fnRegex.exec(text)) !== null) {
      const fnName = m[1] || m[2];
      if (fnName && !funcs.includes(fnName)) funcs.push(fnName);
      if (funcs.length >= 8) break;
    }
    if (funcs.length > 0) lines.push("- 함수: " + funcs.join("(), ") + "()");

    // 주요 class 추출 (class="...")
    const classes = [];
    const clsRegex = /\bclass=["']([^"']+)["']/g;
    while ((m = clsRegex.exec(text)) !== null) {
      const clsTokens = m[1].split(/\s+/).filter(Boolean);
      for (const c of clsTokens) {
        if (!classes.includes(c) && !["dark", "active", "open", "hidden"].includes(c)) classes.push(c);
        if (classes.length >= 10) break;
      }
      if (classes.length >= 10) break;
    }
    if (classes.length > 0) lines.push("- class: ." + classes.join(", ."));

    // 태그/헤딩 구조 요약
    const tags = [];
    const tagRegex = /<(h[1-3]|header|nav|main|aside|footer|article|section)\b[^>]*>/gi;
    while ((m = tagRegex.exec(text)) !== null) {
      const tg = m[1].toLowerCase();
      if (!tags.includes(tg)) tags.push(tg);
      if (tags.length >= 6) break;
    }
    if (tags.length > 0) lines.push("- 주요 태그: <" + tags.join(">, <") + ">");

    return lines.slice(0, 20).join("\n") || "(스켈레톤 추출 요소 없음)";
  } catch (e) {
    return "(스켈레톤 추출 오류: " + e.message + ")";
  }
}

// 파일명 판정: 풀네임 일치 또는 유일 부분일치 판정 (ambiguous면 matching 배열 반환)
function resolveTargetFileName(rawName) {
  try {
    const raw = String(rawName || "").trim();
    if (!raw) return { status: "empty" };
    const entries = fs.readdirSync(__dirname, { withFileTypes: true })
      .filter(e => e.isFile() && !isForbiddenFileName(e.name))
      .map(e => e.name);

    if (entries.includes(raw)) return { status: "exact", file: raw };

    const withHtml = raw.endsWith(".html") ? raw : (raw + ".html");
    if (entries.includes(withHtml)) return { status: "exact", file: withHtml };

    const matched = entries.filter(f => f.toLowerCase().includes(raw.toLowerCase()));
    if (matched.length === 1) return { status: "unique_partial", file: matched[0] };
    if (matched.length > 1) return { status: "ambiguous", matches: matched };
    return { status: "none" };
  } catch (e) {
    return { status: "error", error: e.message };
  }
}

// --- ROUTER 분할1: 3칸 판정 함수 (파일·위치·내용) ---
function judgeThreeSlots(instructionText, targetOverride) {
  const text = String(instructionText || "").trim();

  // 1. 파일 칸: resolveTargetFileName 호출 연결 (TODO-1)
  let extractedTarget = "";
  const targetMatch = text.match(/(?:target\s*=\s*|file\s*=\s*)([a-zA-Z0-9_.-]+)/i);
  if (targetMatch) {
    extractedTarget = targetMatch[1];
  } else if (targetOverride) {
    extractedTarget = targetOverride;
  }

  const fileRes = resolveTargetFileName(extractedTarget);
  let fileSlot = false;
  let fileStatus = fileRes.status;
  let resolvedFile = null;
  if (fileRes.status === "exact" || fileRes.status === "unique_partial") {
    fileSlot = true;
    resolvedFile = fileRes.file;
  }

  // 2. 위치 칸: 줄 번호, 선택자, 태그명, 함수명 등 위치 단서 확인
  const locRegex = /(?:\d+\s*(?:행|줄|line)|#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+|\b(?:title|button|btn|header|nav|footer|body|h[1-6]|input|form)\b|함수|선택자)/i;
  const locationSlot = locRegex.test(text);

  // 3. 내용 칸: 바꿀 대상, 속성값, 색상 등 내용 단서 확인
  const vagueHeadRegex = /^(?:안\s*돼|이거\s*왜\s*안\s*돼\??|다시\s*해줘|제목\s*바꿔줘|거기\s*색만\s*바꿔|고쳐줘|수정해줘)$/i;
  let contentSlot = false;
  if (!vagueHeadRegex.test(text)) {
    const valRegex = /(?:[가-힣a-zA-Z0-9_-]+(?:(으)?로|을|를)|['"][^'"]+['"]|빨강|파랑|초록|검정|흰색|color|background|font|크기|색상|빈페이지)/i;
    contentSlot = valRegex.test(text);
  }

  const isExplicit = (fileSlot && locationSlot && contentSlot && fileStatus !== "ambiguous");

  // G3 모드 플래그: mode: "full" | "excerpt"
  // TODO(소유분할): EYES G3 조건 분기 교체는 통합 패스 때 진행 예정 (TODO-3)
  return {
    isExplicit,
    slots: { file: fileSlot, location: locationSlot, content: contentSlot },
    fileStatus,
    matches: fileRes.matches || [],
    resolvedFile,
    mode: isExplicit ? "excerpt" : "full"
  };
}

// 기억 제목 요약 목록 (앞 5자~40자 제목만)
function getMemoryHeadersSummary(roomId) {
  try {
    const facts = readMemoryFacts(roomId);
    if (!facts || !facts.length) return "기억 없음";
    return facts.map((f, i) => `${i + 1}. ${String(f).slice(0, 40)}`).join("\n");
  } catch (e) { return "(기억 읽기 실패)"; }
}

// 실패 일지 제목 요약 목록 (언제/뭐가 컬럼만)
function getFailuresHeadersSummary() {
  try {
    if (!fs.existsSync(FAILURES_PATH)) return "실패 일지 없음";
    const rawHot = fs.readFileSync(FAILURES_PATH, "utf8");
    const lines = rawHot.split("\n").filter(l => l.startsWith("|") && !l.includes("|---") && !l.includes("| 언제 |"));
    return lines.slice(-5).map(l => {
      const cols = l.split("|").map(c => c.trim());
      return `- [${cols[1] || "-"}] ${cols[2] || "-"}`;
    }).join("\n") || "실패 일지 없음";
  } catch (e) { return "(실패 일지 요약 실패)"; }
}

function extractRelevantHtmlSnippet(html, queryText) {
  const full = String(html || "");
  if (!full) return "(코드 비어 있음)";
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

function normalizeOwner(raw, filename) {
  const o = String(raw || "").trim().toLowerCase();
  if (o === "system" || o === "cockpit" || o === "gemgem" || o === "user") return o;
  if (filename === "cockpit.html" || filename === "blank.html") return "cockpit";
  return o || "user";
}
function getCreator(filename) {
  try {
    if (!fs.existsSync(MANIFEST_PATH)) {
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ "index.html": "system" }, null, 2), "utf8");
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    if (filename === "index.html") return "system";
    if (filename === "blank.html" || filename === "cockpit.html") {
      const raw = manifest[filename];
      if (!raw) return "cockpit";
      const o = normalizeOwner(raw, filename);
      if (o === "gemgem") return "cockpit"; // 구 manifest 승격 (B1a 이전 기록 호환)
      return o;
    }
    const raw = manifest[filename];
    if (!raw) return "user";
    return normalizeOwner(raw, filename);
  } catch (e) {
    if (filename === "index.html") return "system";
    if (filename === "blank.html" || filename === "cockpit.html") return "cockpit";
    return "user";
  }
}

function setCreator(filename, who) {
  try {
    let manifest = {};
    if (fs.existsSync(MANIFEST_PATH)) {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    }
    manifest[filename] = who;
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  } catch (e) {}
}

const USAGE_LOG_PATH = path.join(__dirname, "usage.log");

const CALIB_DEFAULT_IN = 0.25, CALIB_DEFAULT_OUT = 0.25;
function readCalibFactors() {
  try {
    if (!fs.existsSync(USAGE_LOG_PATH)) return { in: CALIB_DEFAULT_IN, out: CALIB_DEFAULT_OUT, n: 0 };
    const lines = fs.readFileSync(USAGE_LOG_PATH, "utf8").split("\n").filter(Boolean);
    for (const l of lines) {
      if (l.startsWith("#CALIB ")) {
        try {
          const p = JSON.parse(l.slice(7));
          const fi = Number(p.in), fo = Number(p.out), nn = Math.max(0, Math.floor(Number(p.n) || 0));
          if (fi > 0.01 && fi < 5 && fo > 0.01 && fo < 5) return { in: fi, out: fo, n: nn };
        } catch (e) {}
        break;
      }
    }
  } catch (e) {}
  return { in: CALIB_DEFAULT_IN, out: CALIB_DEFAULT_OUT, n: 0 };
}
function logUsageCall({ route, model, inChars, outChars, inTok, outTok }) {
  const inC = Math.max(0, Number(inChars) || 0);
  const outC = Math.max(0, Number(outChars) || 0);
  const inLo = Math.ceil(inC / 4);
  const inHi = Math.ceil(inC / 1.5);
  const outLo = Math.ceil(outC / 4);
  const outHi = Math.ceil(outC / 1.5);
  const summary = { model: String(model || GEMINI_MODEL), inLo, inHi, outLo, outHi };
  const callCost = costOf(model, inTok, outTok);
  summary.inTok = (Number(inTok) > 0) ? Number(inTok) : null;
  summary.outTok = (Number(outTok) > 0) ? Number(outTok) : null;
  summary.cost = callCost;
  const calibNow = readCalibFactors();
  summary.inEst = Math.max(1, Math.round(inC * calibNow.in));
  summary.outEst = Math.max(1, Math.round(outC * calibNow.out));
  let calibWrite = calibNow;
  if (Number(inTok) > 0 && Number(outTok) > 0 && inC > 20 && outC > 0) {
    const rIn = Math.min(2, Math.max(0.05, Number(inTok) / inC));
    const rOut = Math.min(2, Math.max(0.05, Number(outTok) / outC));
    const w = Math.min(0.3, 1 / (calibNow.n + 1));
    calibWrite = { in: calibNow.in * (1 - w) + rIn * w, out: calibNow.out * (1 - w) + rOut * w, n: calibNow.n + 1 };
  }
  try {
    let totals = { all: { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0 }, byDay: {} };
    let rawLines = [];
    if (fs.existsSync(USAGE_LOG_PATH)) {
      const lines = fs.readFileSync(USAGE_LOG_PATH, "utf8").split("\n").filter(Boolean);
      if (lines.length > 0 && lines[0].startsWith("#TOTALS ")) {
        try {
          const parsed = JSON.parse(lines[0].slice(8));
          if (parsed && typeof parsed === "object") {
            if (parsed.all && typeof parsed.all === "object") totals.all = parsed.all;
            if (parsed.byDay && typeof parsed.byDay === "object") totals.byDay = parsed.byDay;
          }
        } catch (e) {}
        rawLines = lines.slice(1).filter(l => !l.startsWith("#"));
      } else {
        rawLines = lines.filter(l => !l.startsWith("#"));
      }
    }
    const addStats = (bucket) => {
      bucket.calls = (Number(bucket.calls) || 0) + 1;
      bucket.inLo = (Number(bucket.inLo) || 0) + inLo;
      bucket.inHi = (Number(bucket.inHi) || 0) + inHi;
      bucket.outLo = (Number(bucket.outLo) || 0) + outLo;
      bucket.outHi = (Number(bucket.outHi) || 0) + outHi;
      bucket.cost = (Number(bucket.cost) || 0) + callCost;
    };
    addStats(totals.all);
    const nowIso = new Date().toISOString();
    const dayKey = nowIso.slice(0, 10);
    if (!totals.byDay[dayKey]) {
      totals.byDay[dayKey] = { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0, cost: 0 };
    }
    addStats(totals.byDay[dayKey]);
    const dayKeys = Object.keys(totals.byDay).sort();
    while (dayKeys.length > 90) {
      const oldKey = dayKeys.shift();
      delete totals.byDay[oldKey];
    }
    const _dk = new Date().toISOString().slice(0, 10);
    const _db = (totals.byDay && totals.byDay[_dk]) || {};
    summary.dayCost = (Number(_db.cost) || 0);
    const entry = JSON.stringify({
      t: nowIso.slice(0, 19) + "Z",
      route: String(route || "chat"),
      model: String(model || GEMINI_MODEL),
      inC,
      outC,
      inLo,
      inHi,
      outLo,
      outHi,
      inTok: (Number(inTok) > 0) ? Number(inTok) : null,
      outTok: (Number(outTok) > 0) ? Number(outTok) : null,
      cost: callCost
    });
    rawLines.push(entry);
    if (rawLines.length > 20) {
      rawLines = rawLines.slice(-20);
    }
    const outContent = "#TOTALS " + JSON.stringify(totals) + "\n" + "#CALIB " + JSON.stringify({ in: calibWrite.in, out: calibWrite.out, n: calibWrite.n }) + "\n" + rawLines.join("\n") + "\n";
    fs.writeFileSync(USAGE_LOG_PATH, outContent, "utf8");
  } catch (e) {}
  return summary;
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
    const { message, pageContext, model, images, roomId, recentTurns } = req.body || {};
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
    const facts = readMemoryFacts(roomId);
    const memoryBlock = facts.length > 0 ? "[공유 기억 (memory.json)]\n- " + facts.join("\n- ") + "\n\n" : "";

    const seenSignatures = new Set();
    const toolHistoryBlocks = [];
    const observedSummaries = [];
    const MAX_CHAT_ROUNDS = 5;

    let finalReply = "";
    const pageBlock = pageContext ? "[현재 파일 내용]\n" + String(pageContext).slice(0, 12000) + "\n\n" : "";
    const recentBlock = recentTurns ? "\n\n[최근 대화 (최대 4턴)]\n" + String(recentTurns).slice(0, 2000) : "";
    let totalIn = 0, totalOut = 0, lastUsage = null;

    for (let round = 1; round <= MAX_CHAT_ROUNDS; round++) {
      const historySection = toolHistoryBlocks.length > 0 ? ("\n\n" + toolHistoryBlocks.join("\n\n")) : "";
      const prompt = [
        "사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.",
        "",
        "당신은 정확하고 신중한 한국어 웹 개발 도우미입니다. 추가 확인이 필요하면 아래 JSON 규격으로 grep 또는 read 도구를 호출하세요: {\"type\":\"tool_calls\",\"calls\":[{\"tool\":\"grep\",\"args\":{\"pattern\":\"...\",\"file\":\"...\"}}]} — 1회차에 해결 못하면 question으로 끝내세요.",
        "쓰기 도구(run 포함)는 허용되지 않습니다. 오직 grep과 read만 허용됩니다.",
        "마지막에는 [의도] ... 형식으로 시작하는 최종 답변을 출력하세요.",
        "",
        memoryBlock + pageBlock + recentBlock + historySection,
        "",
        "사용자 메시지: " + msg
      ].join("\n");

      let rawText = "";
      try {
        const response = await ai.models.generateContent({
          model: useModel,
          contents: buildMultimodalContents(prompt, round === 1 ? images : []),
        });
        rawText = (response && response.text) ? response.text : "";
        totalIn += prompt.length;
        totalOut += rawText.length;
        lastUsage = response.usageMetadata || null;
      } catch (e) {
        rawText = "채팅 오류 발생: " + e.message;
      }

      const jsonStr = extractJsonString(rawText);
      let parsed = null;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (err) {}

      if (parsed && parsed.type === "tool_calls" && Array.isArray(parsed.calls) && parsed.calls.length > 0) {
        const roundOutputs = [];
        for (let cIdx = 0; cIdx < parsed.calls.length; cIdx++) {
          const callObj = parsed.calls[cIdx];
          const toolName = String((callObj && callObj.tool) || "").trim();
          
          if (toolName !== "grep" && toolName !== "read") {
            roundOutputs.push("[차단] 채팅에서는 grep, read 도구만 허용됩니다.");
            continue;
          }

          const tRes = await executeReactToolCall(callObj, seenSignatures);
          if (!tRes.ok && tRes.status === 422) {
            roundOutputs.push("[도구 거부 422]: " + tRes.error);
            continue;
          }
          const summaryLabel = toolName + "(" + JSON.stringify((callObj && callObj.args) || {}) + ")";
          observedSummaries.push(summaryLabel);
          roundOutputs.push("▶ " + summaryLabel + "\n" + String(tRes.output || tRes.error || "(출력 없음)"));
        }
        toolHistoryBlocks.push("[도구 결과 " + round + "회차]\n" + roundOutputs.join("\n---\n"));
        continue;
      }

      finalReply = rawText;
      break;
    }

    if (!finalReply) {
      finalReply = "[의도] 요청 처리 완료\n도구 탐색을 마쳤으나 최종 응답이 생성되지 않았습니다.";
    }

    if (!String(finalReply).trimStart().startsWith("[의도]")) {
      finalReply = "[의도] 사용자 질문 답변\n" + finalReply;
    }

    const usage = logUsageCall({
      route: "chat",
      model: useModel,
      inChars: totalIn,
      outChars: totalOut,
      inTok: lastUsage?.promptTokenCount ?? null,
      outTok: lastUsage?.candidatesTokenCount ?? null
    });
    res.json({ reply: finalReply, usage });
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

// --- live 보호 v2 (live-v2-snapshot-middleware): 저장 직전 디스크 스냅샷 (원본 핸들러로 next() 통과, 중복 route 없음) ---
const SNAPSHOT_META_PATH = path.join(__dirname, 'snapshot-meta.json');
function saveSnapshotToDisk(content, filename) {
  try {
    let t = String(filename || "index.html").trim() || "index.html";
    if (t === "index") t = "index.html";
    let meta = { byTarget: {} };
    if (fs.existsSync(SNAPSHOT_META_PATH)) {
      try {
        const raw = JSON.parse(fs.readFileSync(SNAPSHOT_META_PATH, "utf8"));
        if (raw && typeof raw === "object") {
          if (raw.byTarget && typeof raw.byTarget === "object" && !Array.isArray(raw.byTarget)) {
            meta.byTarget = { ...raw.byTarget };
          }
          if (typeof raw.content === "string") {
            if (!meta.byTarget["index.html"]) {
              meta.byTarget["index.html"] = {
                content: raw.content,
                timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date(0).toISOString()
              };
            }
          }
        }
      } catch (e) {}
    }
    meta.byTarget[t] = { content: String(content), timestamp: new Date().toISOString() };
    const keys = Object.keys(meta.byTarget);
    if (keys.length > 10) {
      keys.sort((a, b) => {
        const ta = (meta.byTarget[a] && meta.byTarget[a].timestamp) || "";
        const tb = (meta.byTarget[b] && meta.byTarget[b].timestamp) || "";
        return ta.localeCompare(tb);
      });
      while (Object.keys(meta.byTarget).length > 10) {
        const oldest = keys.shift();
        if (!oldest) break;
        delete meta.byTarget[oldest];
      }
    }
    fs.writeFileSync(SNAPSHOT_META_PATH, JSON.stringify({ byTarget: meta.byTarget }, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}
function loadSnapshotFromDisk(filename) {
  try {
    if (!fs.existsSync(SNAPSHOT_META_PATH)) return null;
    let t = String(filename || "index.html").trim() || "index.html";
    if (t === "index") t = "index.html";
    const data = JSON.parse(fs.readFileSync(SNAPSHOT_META_PATH, "utf8"));
    if (data && data.byTarget && typeof data.byTarget === "object") {
      const entry = data.byTarget[t];
      if (entry && typeof entry.content === "string") return entry.content;
    }
    if (t === "index.html" && data && typeof data.content === "string") {
      return data.content;
    }
    return null;
  } catch (e) {
    return null;
  }
}
app.post('/api/page/:target', (req, res, next) => {
  try {
    let target = req.params.target;
    if (target === "index") target = "index.html";
    const p = path.join(__dirname, target);
    if (req.body && typeof req.body.content === 'string' && fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, 'utf8'), target);
    }
  } catch (e) {}
  next();
});

app.post('/api/page/:target', (req, res) => {
  let target = req.params.target;
  if (target === "index") target = "index.html";
  const p = path.join(__dirname, target);

  if (target !== "index.html" && getCreator(target) === "user") {
    return res.status(403).json({ error: 'forbidden: 사용자 소유 파일은 덮어쓸 수 없습니다.' });
  }

  const { content, confirmed, roomId } = req.body || {};

  // C2 적용 재확인: confirmed가 아닐 때 stash 대조 후 mismatch면 409
  if (!confirmed) {
    const rKey = (roomId && String(roomId).trim()) || "global";
    const stashKey = rKey + ":" + target;
    let initialHash = c2stash.get(stashKey);
    if (initialHash === undefined) { for (const _kv of c2stash) { if (typeof _kv[0] === "string" && _kv[0].endsWith(":" + target)) { initialHash = _kv[1]; break; } } }
    if (initialHash !== undefined) {
      const currentHash = getDiskFileHash(target);
      if (initialHash !== currentHash) {
        return res.status(409).json({
          ok: false,
          error: "conflict(409): 요청 이후 파일이 변경되었습니다. 변경 내용을 확인 후 덮어쓰려면 확인을 눌러주세요.",
          dirty: true
        });
      }
    }
  }
  if (typeof content !== 'string') return res.status(400).json({ error: 'content required' });
  if (target.endsWith('.html') && (!content.includes('<html') || !content.includes('</html>'))) {
    return res.status(400).json({ error: 'invalid html: <html>...</html> 구조가 필요합니다.' });
  }

  // 신규 파일이면 manifest에 등록
  if (!fs.existsSync(p)) {
    setCreator(target, "gemgem");
  }

  fs.writeFile(p, content, 'utf8', (err) => {
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
  "3. [전수 탐색 & 2회+ 변형 스윕 의무] 패치 전 대상 선택자·속성·값의 모든 변형(기본·다크모드 body.dark·미디어쿼리 등)을 전수 탐색하세요. 특히 동일 선택자나 속성이 원본에 2회 이상 출현하면 반드시 넓혀 보기(G7)로 전 위치를 확인하고, 변형이 여러 곳에 존재하면 edits 배열에 빠짐없이 담아 한 번에 반환하세요.",
  "4. [공백·줄바꿈·기존 속성 100% 보존] search에는 원본 index.html에 존재하는 글자·들여쓰기 공백·줄바꿈(\n)을 토씨 하나 틀리지 않고 그대로 넣으세요. replace 작성 시에도 수정 대상 값만 바꾸고, 같은 블록 내 다른 속성(예: font-size: 64px;, font-weight: bold; 등)과 줄바꿈·들여쓰기·콜론 뒤 공백을 원본과 100% 똑같이 유지하세요.",
  "5. [가설수립·전복 & 증거 인용] 매 라운드 가설 2~3개(예: 색 미반영? 변형 누락? 캐시/다른 선택자?)를 세우고 grep·read 증거로 대조하여 탈락시키세요. 같은 실패가 반복되면 기존 가설을 완전히 폐기하고 새 가설로 갈아타야 합니다. 단정은 반드시 grep·read 결과나 줄 번호 인용과 함께 작성하세요. 실제 기계검증 전이므로 설명에 \"완료\", \"검증완료\", 근거 없는 \"됩니다\"라는 단어를 절대 쓰지 마세요.",
  "6. [설명 2줄 규격] explanation 필드는 결론 먼저 짧게 반드시 아래 두 줄 형식으로만 작성하세요:",
  "   [뭘] (의도: 사용자 의도 요약) 무엇을 어떻게 바꾸는지 결론 한 줄 (다조각이면 총 몇 곳인지 명시)",
  "   [왜] (근거: 매치된 기존 선택자/코드 인용, 추측 시 [추측] 명시) 바꾸는 이유 한 줄",
  "7. [ReAct 도구 호출 규격 (최대 10라운드, 누적 12회 제한)] 추가 파일 검색이나 줄 번호/코드 확인이 필요할 때만 아래 JSON 규격으로 도구를 호출하세요 (예시 1개):",
  "   {\"type\":\"tool_calls\",\"calls\":[{\"tool\":\"grep\",\"args\":{\"pattern\":\"#hello\",\"file\":\"index.html\"}}]}",
  "   - 사용 가능 도구: grep({pattern, file?}), read({file, start, end}), run({cmd})",
  "   - 1회차에 이미 받은 전체 코드 내용을 불필요하게 반복 read하지 마세요. 단, 사용자가 질문만 했거나 다른 파일/정확한 줄 번호 인용이 필요하면 grep을 1회 호출해 확인하세요.",
  "   - 같은 호출 반복 금지. 라운드당 run 도구는 최대 1회만 허용됩니다.",
  "   - 반드시 최대 10라운드 안에 patch 또는 question으로 끝내세요. 누적 도구 호출이 12회를 초과하거나 10라운드 안에 못 찾겠으면 question에 지금까지 본 것과 필요한 증거를 적으세요.",
  "8. 지시를 패치로 수행할 수 있으면 아래 다조각 JSON 규격만 반환하세요. target은 사용자가 지시문에 target=파일명으로 명시한 값을 최우선 그대로 사용하고, 명시 없을 때만 index.html:",
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

function verifyHtmlScriptsSyntax(text) {
  if (!text.includes("<html") && !text.includes("</html>") && !text.includes("<script")) return { ok: true };
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m; let idx = 0; const errors = [];
  while ((m = re.exec(text)) !== null) {
    idx++;
    try { new Function(m[1]); } catch (e) { errors.push("script #" + idx + ": " + e.message); }
  }
  if (errors.length) return { ok: false, error: errors.join("\n") };
  return { ok: true, blocks: idx };
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

function recordSecurityOrToolFailure(what, why, how, sig = "") {
  try {
    const clean = (v) => String(v || "-").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim();
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    const cWhat = clean(what);
    const cWhy = clean(why);
    const cHow = clean(how);
    const cSig = clean(sig);

    if (!fs.existsSync(FAILURES_PATH)) {
      fs.writeFileSync(FAILURES_PATH, "# 실패 일지 (failures.md)\n\n| 언제 | 뭐가 | 왜 | 어떻게 | 서명 |\n|---|---|---|---|---|\n", "utf8");
    }

    const raw = fs.readFileSync(FAILURES_PATH, "utf8");
    const allLines = raw.split("\n");
    let header = "";
    let lines = [];
    
    let pastHeader = false;
    for (const line of allLines) {
      if (!pastHeader) {
        let hLine = line;
        if (hLine.startsWith("| 언제 | 뭐가 | 왜 | 어떻게 |") && !hLine.includes("서명")) {
          hLine = "| 언제 | 뭐가 | 왜 | 어떻게 | 서명 |";
        } else if (hLine.startsWith("|---|---|---|---|") && !hLine.includes("---|---|---|---|---")) {
          hLine = "|---|---|---|---|---|";
        }
        header += hLine + "\n";
        if (hLine.startsWith("|---|")) {
          pastHeader = true;
        }
      } else {
        if (line.trim()) lines.push(line);
      }
    }

    let found = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      const cols = lines[i].split("|").map(s => s.trim());
      if (cols.length >= 5 && cols[2] === cWhat && cols[3] === cWhy && (!cSig || cols[5] === cSig)) {
        let currentHow = cols[4];
        let count = 1;
        const match = currentHow.match(/(.*?)\s*×(\d+)$/);
        if (match) {
          count = parseInt(match[2], 10);
          currentHow = match[1].trim();
        }
        count++;
        lines[i] = `| ${ts} | ${cWhat} | ${cWhy} | ${currentHow} ×${count} |${cSig ? " " + cSig + " |" : ""}`;
        found = true;
        break;
      }
    }

    if (!found) {
      lines.push(`| ${ts} | ${cWhat} | ${cWhy} | ${cHow} |${cSig ? " " + cSig + " |" : ""}`);
    }

    let coldLines = [];
    if (lines.length > 20) {
      coldLines = lines.splice(0, lines.length - 20);
    }

    fs.writeFileSync(FAILURES_PATH, header + lines.join("\n") + "\n", "utf8");

    if (coldLines.length > 0) {
      if (!fs.existsSync(FAILURES_COLD_PATH)) {
        fs.writeFileSync(FAILURES_COLD_PATH, "# 실패 일지 콜드 (failures-cold.md)\n\n| 언제 | 뭐가 | 왜 | 어떻게 | 서명 |\n|---|---|---|---|---|\n", "utf8");
      }
      fs.appendFileSync(FAILURES_COLD_PATH, coldLines.join("\n") + "\n", "utf8");
    }
  } catch (e) {}
}

function generatePatchSignature(target, search) {
  const normSearch = String(search || "").replace(/\r?\n/g, "\n").trim();
  const raw = String(target || "") + "\n" + normSearch;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
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
  if (ALLOWED_TOOL_FILES.includes(n)) return true;
  if (n === "usage.log") return true;
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
      if (manifest[n]) return true;
    }
  } catch (e) {}
  return false;
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
    } else if (cmd === "observe") {
      bin = "node";
      args = ["observe-local.js"];
    } else {
      recordSecurityOrToolFailure("run allowlist 외 명령 차단", cmd, "읽기 전용 allowlist 명령만 허용");
      return resolve({ ok: false, status: 400, error: "거부됨(400): allowlist 외 명령입니다." });
    }
    const runTimeout = (bin === "node" ? 180000 : 5000);
    execFile(bin, args, { cwd: __dirname, timeout: runTimeout }, (err, stdout, stderr) => {
      const combined = (String(stdout || "") + (stderr ? "\n" + String(stderr) : "")).trim();
      const truncated = combined.length > 2000 ? combined.slice(0, 2000) + "\n...(2000자 절단됨)" : combined;
      if (err && err.code !== 1) {
        return resolve({ ok: false, status: 200, output: (truncated || err.message).slice(0, 2000), resultLength: combined.length });
      }
      resolve({ ok: true, status: 200, output: truncated || "(출력 없음)", resultLength: combined.length });
    });
  });
}

async function executeReactToolCall(call, seenSignatures = new Set(), strictRepeat = false) {
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

  // 중복·고착 호출 방지용 시그니처 체크 (정확일치＋유사)
  const sig = tool + ":" + JSON.stringify(args);
  const sigFile = (tool === "grep") ? String(args.file || "index.html").trim() : ((tool === "read") ? String(args.file || "").trim() : "(run)");
  const sigRaw = String((tool === "grep") ? args.pattern : ((tool === "read") ? (args.file + " " + args.start + "-" + args.end) : args.cmd) || "");
  const sigNP = sigRaw.toLowerCase().replace(/[^가-힣a-z0-9#._-]/g, "");
  if (!seenSignatures._hist) seenSignatures._hist = [];
  const priorHit = seenSignatures._hist.find((h) => h.tool === tool && h.file === sigFile && sigNP && h.np && (h.np === sigNP || (h.np.length >= 4 && sigNP.length >= 4 && (h.np.indexOf(sigNP) >= 0 || sigNP.indexOf(h.np) >= 0))));
  if (seenSignatures.has(sig) || priorHit) {
    const prior = priorHit ? (priorHit.tool + " " + priorHit.file + " " + priorHit.raw) : sig;
    if (strictRepeat) {
      return { ok: false, status: 200, error: "[고착 차단] 이미 시도한 탐색입니다 (" + prior + "). 같은 파일·패턴 재시도 금지 — 위 [폐기·시도済 명단]을 보고 완전히 다른 가설로 가세요." };
    }
    return { ok: true, status: 200, tool, output: "(이미 동일한 내용 조회함 — 중복 호출 생략)" };
  }
  seenSignatures._hist.push({ tool: tool, file: sigFile, np: sigNP, raw: sigRaw.slice(0, 80) });
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
      output: out.length > 2000 ? out.slice(0, 2000) + "\n...(2000자 절단됨)" : out,
      resultLength: hits.length
    };
  }

  // 3. read: { file, start, end } (1회 최대 200줄, 범위 지정 필수, full-read 금지 및 로그)
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

    const hasStart = (args.start !== undefined && args.start !== null && String(args.start).trim() !== "");
    const hasEnd = (args.end !== undefined && args.end !== null && String(args.end).trim() !== "");
    if (!hasStart && !hasEnd) {
      recordSecurityOrToolFailure("read 범위 미지정(full-read) 차단", "file=" + targetFile, "start/end 범위 지정 필수");
      console.warn("[FULL-READ LOG] 범위 없는 read 차단됨: file=" + targetFile);
      return {
        ok: false,
        status: 400,
        error: "거부됨(400): read 도구는 start와 end 범위를 반드시 지정해야 합니다 (통째 반환 금지). 여러 번 나누어 필요한 구간만 조회하세요."
      };
    }

    const lines = fs.readFileSync(fullPath, "utf8").split("\n");
    const startLine = Math.max(1, parseInt(args.start, 10) || 1);
    const rawEnd = parseInt(args.end, 10) || (startLine + 199);
    const endLine = Math.min(lines.length, Math.min(startLine + 199, Math.max(startLine, rawEnd)));

    // 전체 파일을 통째로 읽으려는 시도 감지 및 기록
    if (startLine === 1 && endLine >= lines.length && lines.length > 50) {
      console.warn("[FULL-READ LOG] 전체 줄 범위 읽기 감지: file=" + targetFile + " lines=" + lines.length);
      recordSecurityOrToolFailure("full-read 감지 로그", "file=" + targetFile + " (" + lines.length + "줄)", "분할 read 권장");
    }

    const slice = lines.slice(startLine - 1, endLine).map((l, i) => (startLine + i) + ": " + l).join("\n");
    const out = "[" + targetFile + " " + startLine + "~" + endLine + "줄]\n" + slice;
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\n...(2000자 절단됨)" : out,
      resultLength: slice.length > 0 ? 1 : 0
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
    const { instruction, target, currentContent, model, images, retryError, recentTurns, testToolCall, mockResponses, failedChunk } = req.body || {};
    if (testToolCall) {
      const tRes = await executeReactToolCall(testToolCall);
      return res.status(tRes.status || 200).json(tRes);
    }
    if (!instruction || !target) return res.status(400).json({ error: 'instruction and target required' });

    let targetFile = target;
    if (targetFile === "index") targetFile = "index.html";
    try {
      const _pinsA = readPins();
      const _keyA = (req.body && req.body.roomId && String(req.body.roomId).trim()) || "global";
      let _pinT = (_pinsA[_keyA] && _pinsA[_keyA].target) ? String(_pinsA[_keyA].target).trim() : "";
      if (_pinT === "index") _pinT = "index.html";
      if (_pinT && fs.existsSync(path.join(__dirname, _pinT))) {
        targetFile = _pinT;
        console.log("PIN target으로 강제: " + targetFile);
      }
    } catch {}

    const creator = getCreator(targetFile);
    if (targetFile !== "index.html" && creator === "user") {
      recordSecurityOrToolFailure("user 소유 파일 AI 패치 시도", targetFile, "403 거부");
      return res.status(403).json({ error: "거부됨(403): 사용자 소유 파일은 AI 패치가 허용되지 않습니다." });
    }
    if (targetFile === "blank.html" || targetFile === "server.js" || (targetFile === "cockpit.html" && !(creator === "gemgem" || creator === "cockpit"))) {
      return res.status(403).json({ error: "거부됨(403): 시스템 핵심 파일은 패치 대상이 아닙니다." });
    }

    const ALLOWED_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview", "gemini-4-argon"];
    const useModel = ALLOWED_MODELS.includes(model) ? model : "gemini-3.5-flash-lite";

    // C2 ①: 요청 진입 시 디스크 기준 해시 기록 (신규 파일이면 null)
    const c2RoomKey = (req.body && req.body.roomId && String(req.body.roomId).trim()) || "global";
    const c2StashKey = c2RoomKey + ":" + targetFile;
    const initialDiskHash = getDiskFileHash(targetFile);
    c2stash.set(c2StashKey, initialDiskHash);
    
    let htmlSource = currentContent;
    if (!htmlSource) {
      const p = path.join(__dirname, targetFile);
      htmlSource = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    }
    const activeKey = getActiveKey();

    if (!activeKey && (!Array.isArray(mockResponses) || mockResponses.length === 0)) {
      const demo = { type: "question", question: "(키 미설정) 어떤 요소를 수정할지 구체적으로 알려주시겠어요?" };
      return res.json({ ok: true, result: JSON.stringify(demo), patch: demo });
    }

    const facts = readMemoryFacts(req.body ? req.body.roomId : null);
    const memoryBlock = facts.length > 0 ? "\n\n[공유 기억 (memory.json)]\n- " + facts.join("\n- ") : "";
    const failBlock = searchRelevantFailures(instruction + " " + (retryError || ""));
    const failureNote = failBlock ? "\n\n[과거 실패 일지 (failures.md) — 동일 실수 반복 금지]\n" + failBlock : "";
    const failedChunkBody = failedChunk || null;
    const failedChunkBlock = (failedChunkBody && typeof failedChunkBody.search === "string") ? "\n\n[실패 조각 — 아래 search/replace 그대로 재제출 금지, 반드시 다른 가설로]\n[target: " + String(failedChunkBody.target || "") + "]\n[search]\n" + String(failedChunkBody.search).slice(0, 2000) + "\n[replace]\n" + String(failedChunkBody.replace || "").slice(0, 2000) : "";
    const retryNote = retryError ? ("\n\n[직전 패치 실패 사유 — 반드시 수정하여 재작성하세요]\n" + retryError + failedChunkBlock) : (failedChunkBlock || "");
    const recentBlock = recentTurns ? "\n\n[최근 대화 (최대 4턴)]\n" + String(recentTurns).slice(0, 2000) : "";

    const ai = activeKey ? new GoogleGenAI({ apiKey: activeKey }) : null;
    const seenSignatures = new Set();
    const toolHistoryBlocks = [];
    const observedSummaries = [];
    const evidenceLog = [];
    let toolRoundsUsed = 0;
    let totalToolCallsCount = 0;
    const loopStartTime = Date.now();
    const MAX_ROUNDS = 10;
    const TIME_LIMIT_MS = 120000;

    let finalParsed = null;
    let totalIn = 0, totalOut = 0, lastUsage = null;

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (Date.now() - loopStartTime > TIME_LIMIT_MS || totalToolCallsCount > 12) {
        recordSecurityOrToolFailure("ReAct 루프 제한 초과(시간 또는 12회 초과)", instruction.slice(0, 80), "질문 카드로 강제 종료");
        finalParsed = {
          type: "question",
          question: "[12회 초과 및 제한 중단] 도구 탐색 누적 횟수(" + totalToolCallsCount + "회)가 12회를 초과했거나 제한에 도달했습니다. 지금까지 본 것: " + (observedSummaries.join(" / ") || "없음") + ". 필요한 증거와 함께 수정할 위치의 코드 조각을 직접 알려주시겠어요?",
          toolRounds: toolRoundsUsed
        };
        break;
      }

      // --- EYES 분할2 서빙부: 명확(3칸 참) vs 애매(빈칸) 분기 + 스켈레톤 맵 항상 포함 ---
      const skeletonMap = extractSkeletonMap(htmlSource);
      const skeletonBlock = "\n\n[대상 파일 스켈레톤 맵 (최대 20줄 목차)]\n" + skeletonMap;

      let codeSection = "";
      if (round === 1) {
        // --- ROUTER 분할1: 3칸 판정 (TODO-1, TODO-16: 단어 매칭 삭제 후 정적 규칙 대체) ---
        // C0 준수: 타겟 최종 결정은 EYES C0(targetFile) 고정. 라우터 판정은 서빙 모드 결정용.
        const routeResult = judgeThreeSlots(instruction, targetFile);
        const lines = htmlSource ? htmlSource.split("\n") : [];

        // 위치 특정: 줄 번호 명시가 있으면 해당 줄, 없으면 0행(첫 줄) 기준 발췌
        let targetLineIdx = 0;
        const lineNumMatch = String(instruction || "").match(/(\d+)\s*(?:행|줄|line)/i);
        if (lineNumMatch) {
          targetLineIdx = Math.max(0, parseInt(lineNumMatch[1], 10) - 1);
        }

        if (routeResult.isExplicit && lines.length > 60) {
          // 명확 건: 위치 발췌 앞뒤 25줄 자동 제공 + 스켈레톤
          const startL = Math.max(0, targetLineIdx - 25);
          const endL = Math.min(lines.length, targetLineIdx + 26);
          const excerpt = lines.slice(startL, endL).map((l, i) => (startL + i + 1) + ": " + l).join("\n");
          codeSection = "\n\n[현재 " + targetFile + " 관련 위치 발췌 (" + (startL + 1) + "~" + endL + "줄, 총 " + lines.length + "줄 중)]\n" + excerpt +
                        "\n(주의: 필요 시 read 도구로 추가 범위를 당겨오세요.)" + skeletonBlock;
        } else if (lines.length <= 60 && lines.length > 0) {
          // 60줄 이하 소형 파일 전체 제공 예외 유지
          codeSection = "\n\n[현재 " + targetFile + " 전체 코드 (" + lines.length + "줄)]\n" + htmlSource + skeletonBlock;
        } else {
          // 애매 건: 목록만 서빙 (파일 목록·기억 제목·실패 제목) + 직전 가설 쪽지 200자
          let workspaceFileList = [];
          try {
            workspaceFileList = fs.readdirSync(__dirname, { withFileTypes: true })
              .filter(e => e.isFile() && !isForbiddenFileName(e.name))
              .map(e => e.name);
          } catch {}

          const ambiguousNote = (routeResult.fileStatus === "ambiguous")
            ? "\n[⚠️ 파일 후보 다수 발견: " + routeResult.matches.join(", ") + " 중 어느 파일인지 먼저 확인하세요]\n"
            : "";

          // 직전 가설 쪽지 200자: 최근 대화 및 관찰 재료에서 발췌
          const prevContextSnippet = String(recentTurns || observedSummaries.slice(-2).join("; ") || "직전 가설 없음").slice(0, 200);

          codeSection = "\n\n[애매 경로 안내 — 코드 통째 반환 생략 (pull 방식)]" + ambiguousNote + "\n" +
                        "- 사용 가능 파일 목록: " + workspaceFileList.join(", ") + "\n" +
                        "- 공유 기억 목록:\n" + getMemoryHeadersSummary(req.body ? req.body.roomId : null) + "\n" +
                        "- 최근 실패 일지:\n" + getFailuresHeadersSummary() + "\n" +
                        "- 직전 가설 쪽지 (200자): " + prevContextSnippet + "\n" +
                        "(코드가 필요하면 read 도구로 범위를 지정해 필요한 조각을 직접 당겨오세요.)" + skeletonBlock;
        }
      } else {
        codeSection = "\n\n[현재 " + targetFile + " 코드]\n(1회차 발췌/스켈레톤 및 이전 도구 결과를 참고하세요. 추가 코드는 read({file, start, end})로 당겨오세요.)";
      }

      const historySection = toolHistoryBlocks.length > 0
        ? ("\n\n" + toolHistoryBlocks.join("\n\n"))
        : "";

      const bannedBlock = observedSummaries.length > 0
        ? ("\n[폐기·시도済 명단 — 같은 파일·선택자·패턴 재시도 금지, 반드시 다른 가설로]\n- " + observedSummaries.slice(-8).join("\n- "))
        : "";
      const roundHint = (round > 1)
        ? ("\n\n[현재 라운드: " + round + "/" + MAX_ROUNDS + "] 직전 가설을 유지하거나 같은 실패 패턴/호출을 반복하지 마시고, 새 가설 2~3개를 세운 뒤 grep/read 증거로 대조하여 즉시 patch 또는 question JSON을 출력하세요." + bannedBlock)
        : "";

      const targetHeader = "[확정 작업 대상 파일: " + targetFile + "]\n(주의: 지시문이나 이전 대화의 다른 target 표기와 무관하게, 이번 작업 대상 파일은 오직 \"" + targetFile + "\" 1개로 고정됩니다. JSON 응답의 target 필드에도 반드시 \"" + targetFile + "\"을 출력하세요.)\n\n";
      const prompt = targetHeader + PATCH_SYSTEM_PROMPT + memoryBlock + failureNote + retryNote + recentBlock + codeSection + historySection + roundHint + "\n\n[사용자 지시]\n" + instruction;

      console.log("MODIFY round=" + round, new Date().toISOString(), "model=" + useModel, retryError ? "(retry)" : "");

      let rawText = "";
      if (Array.isArray(mockResponses) && mockResponses.length >= round) {
        rawText = typeof mockResponses[round - 1] === "string"
          ? mockResponses[round - 1]
          : JSON.stringify(mockResponses[round - 1]);
        totalIn += prompt.length;
        totalOut += rawText.length;
        lastUsage = null;
      } else {
        const response = await ai.models.generateContent({
          model: useModel,
          contents: buildMultimodalContents(prompt, round === 1 ? images : []),
        });
        rawText = (response && response.text) ? response.text : "";
        totalIn += prompt.length;
        totalOut += rawText.length;
        lastUsage = response.usageMetadata || null;
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
        totalToolCallsCount += parsed.calls.length;
        if (round === MAX_ROUNDS || totalToolCallsCount > 12) {
          // 최대 라운드 또는 누적 12회 초과 시 강제 question 종료
          recordSecurityOrToolFailure("ReAct 최대 라운드 또는 12회 초과 미결", instruction.slice(0, 80), "탐색 후 question 종료");
          finalParsed = {
            type: "question",
            question: "12회 초과 또는 탐색 한계 도달 — 지금까지 본 것: [" + (observedSummaries.join("; ") || "도구 호출 시도") + "]. 필요한 증거와 함께 수정할 위치의 코드 조각을 직접 알려주시겠어요?",
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

          const tRes = await executeReactToolCall(callObj, seenSignatures, true);
          if (!tRes.ok && (tRes.status === 400 || tRes.status === 422)) {
            return res.status(tRes.status).json({ ok: false, error: tRes.error });
          }

          const summaryLabel = toolName + "(" + JSON.stringify((callObj && callObj.args) || {}) + ")";
          observedSummaries.push(summaryLabel + " -> " + String(tRes.output || "").split("\n")[0].slice(0, 60));
          evidenceLog.push({ tool: toolName, args: (callObj && callObj.args) || {}, ok: tRes.ok, resultLength: tRes.resultLength || 0 });
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
        question: "탐색 한계 도달 — 지금까지 본 것: [" + (observedSummaries.join("; ") || "없음") + "]. 필요한 증거: 대상 요소의 정확한 이름이나 코드를 알려주시겠어요?",
        toolRounds: toolRoundsUsed
      };
    }

    if (toolRoundsUsed > 0) {
      finalParsed.toolRounds = toolRoundsUsed;
    }

    if (finalParsed.type === "patch") {
      if (!finalParsed.target) {
        finalParsed.target = targetFile;
      }
      
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
      if (failedChunkBody && typeof failedChunkBody.search === "string") {
        const bypassBlock = instruction.includes("알고 있어, 그래도 해");
        if (!bypassBlock) {
          const _fcT = String(failedChunkBody.target || "") === "index" ? "index.html" : String(failedChunkBody.target || "");
          const _curT = String(finalParsed.target || targetFile);
          if (_fcT && _curT === _fcT) {
            for (let _fi = 0; _fi < rawEdits.length; _fi++) {
              if (rawEdits[_fi].search === failedChunkBody.search) {
                return res.status(422).json({ ok: false, error: "거부됨(422): [동일 조각 재제출 금지] " + (_fi + 1) + "번째 조각이 실패 조각과 동일합니다. 다른 가설로 다시 작성하세요.", patch: finalParsed });
              }
            }
          }
        }
      }

      // --- EYES 분할4: G3(증거), G5(가설 대조), G4(서명 차단) ---
      const bypassG2G8 = instruction.includes("알고 있어, 그래도 해");
      const isExcerptModeForGates = htmlSource && htmlSource.split("\n").length > 60;
      
      if (!bypassG2G8) {
        // G3: 증거 게이트 (발췌 모드인데 도구 로그 0건이면 차단. 질 검증 포함)
        if (isExcerptModeForGates) {
          const validEvidence = evidenceLog.some(e => e.ok && (e.resultLength > 0 || (e.args && String(e.args.pattern || "").includes("없음"))));
          if (!validEvidence) {
            return res.status(422).json({ ok: false, error: "[기계컷: 증거 미첨부] 발췌 모드에서는 파일의 일부만 보입니다. 대상 코드를 read/grep 도구로 직접 확인(증거 확보)한 뒤에 패치를 제안하세요.", patch: finalParsed });
          }
        }

        // G5: 가설 검증 (최대 3개 모양 검사, 코드로 대조)
        // TODO(EYES-ROUTER-DIET): 프롬프트 조립부에 가설 JSON 형식을 넣지 않았으므로 현재 AI는 가설을 제출하지 않음. 제출 시 활성화됨.
        if (Array.isArray(finalParsed.hypotheses) && finalParsed.hypotheses.length > 0) {
          const validHypo = finalParsed.hypotheses.find(h => {
             if (!h.target || !h.location || !h.action || !h.reason) return false;
             return htmlSource.includes(h.location) || htmlSource.includes(h.reason); // 매우 기초적인 grep 대조 (향후 정교화 가능)
          });
          if (!validHypo) {
             return res.status(422).json({ ok: false, error: "[기계컷: 가설 대조 실패] 제출하신 가설들이 현재 원본 코드와 일치하지 않습니다. 도구로 다시 확인하고 새 가설을 수립하세요.", patch: finalParsed });
          }
        }

        // G4: 서명 차단 (당일 동일 시그니처 재시도 차단)
        if (finalParsed.type === "patch" && rawEdits.length > 0) {
          const sig = generatePatchSignature(finalParsed.target || targetFile, rawEdits[0].search);
          if (fs.existsSync(FAILURES_PATH)) {
            const rawFailures = fs.readFileSync(FAILURES_PATH, "utf8").split("\n");
            const today = new Date().toISOString().slice(0, 10);
            const isBlocked = rawFailures.some(l => l.includes(today) && l.includes(sig));
            if (isBlocked) {
               return res.status(422).json({ ok: false, error: "[기계컷: 동일 시그니처 재시도] 오늘 이미 실패로 기록된 동일한 수정 사항(서명: " + sig + ")입니다. 전혀 다른 접근법을 사용하세요.", patch: finalParsed });
            }
          }
        }
      }
      // -------------------------------------------------------------------------

      // --- EYES 분할3: G2(존재 게이트 엄격판) & G8(합본 문법 게이트) & G6(먹이 첨부 재요청 유도) ---
      if (!bypassG2G8) {
        let workingContent = htmlSource;
        const isExcerptMode = htmlSource && htmlSource.split("\n").length > 60;

        for (let i = 0; i < rawEdits.length; i++) {
          const ed = rawEdits[i];
          const count = workingContent.split(ed.search).length - 1;
          
          if (count === 0) {
            try { recordSecurityOrToolFailure("G2 원본 불일치 차단(422)", targetFile + " " + (i + 1) + "번째 조각 0회 매치", "search 재확인 후 재요청", generatePatchSignature(targetFile, ed.search)); } catch (e) {}
            let errorMsg = `[기계컷: 원본 불일치 ${i + 1}번째 조각 0회 매치] 해당 조각이 메모리상 복사본(순차 적용 중 상태)에 존재하지 않습니다. search를 100% 동일하게 맞춰주세요.`;
            if (isExcerptMode) errorMsg += "\n(발췌 모드 참고: 파일 전체를 보지 못해 생긴 오차일 수 있습니다. 도구로 정확한 위치를 다시 확인하세요.)";
            return res.status(422).json({ ok: false, error: errorMsg, patch: finalParsed, failedChunk: { target: targetFile, search: ed.search, replace: ed.replace } });
          }
          if (count >= 2) {
            try { recordSecurityOrToolFailure("G2 다매치 차단(422)", targetFile + " " + (i + 1) + "번째 조각 " + count + "회 매치", "search 재확인 후 재요청", generatePatchSignature(targetFile, ed.search)); } catch (e) {}
            let errorMsg = `[기계컷: ${i + 1}번째 조각 ${count}회 매치 — 위아래 3줄 추가 포함해 유일하게] 해당 조각이 여러 곳에 존재합니다. 고치려는 위치가 특정되도록 search 영역을 넓혀주세요.`;
            if (isExcerptMode) {
               const firstIdx = workingContent.indexOf(ed.search);
               if (firstIdx !== -1) {
                 const before = workingContent.slice(Math.max(0, firstIdx - 200), firstIdx);
                 const after = workingContent.slice(firstIdx + ed.search.length, firstIdx + ed.search.length + 200);
                 errorMsg += "\n[참고 주변 코드 (첫 발견 위치)]\n..." + before.split('\n').slice(-3).join('\n') + "\n" + ed.search + "\n" + after.split('\n').slice(0, 3).join('\n') + "...";
               }
            }
            return res.status(422).json({ ok: false, error: errorMsg, patch: finalParsed, failedChunk: { target: targetFile, search: ed.search, replace: ed.replace } });
          }
          workingContent = workingContent.replace(ed.search, ed.replace);
        }
        
        if (targetFile.endsWith(".html")) {
          const checkRes = verifyHtmlScriptsSyntax(workingContent);
          if (!checkRes.ok) {
            try { recordSecurityOrToolFailure("G8 합본 문법 차단(422)", targetFile + " 합본 문법 오류", "search 재확인 후 재요청", generatePatchSignature(targetFile, rawEdits[0].search)); } catch (e) {}
            const errorMsg = `[기계컷: 합본 문법 오류 — 원인] 패치 적용 후 코드 구문 에러 발생:\n${checkRes.error}`;
            return res.status(422).json({ ok: false, error: errorMsg, patch: finalParsed, failedChunk: { target: targetFile, search: rawEdits[0].search, replace: rawEdits[0].replace } });
          }
        }
      }
      // ----------------------------------------------------------------------------------------------------

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

    const usage = logUsageCall({
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

    return res.json({ ok: true, result: JSON.stringify(finalParsed), patch: finalParsed, toolRounds: toolRoundsUsed, usage });
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
app.delete("/api/key", (req, res) => {
  memoryApiKey = "";
  res.json({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) });
});

// --- 기억 파일 (memory.json) GET / POST / DELETE ---
app.get('/api/memory', (req, res) => {
  try {
    const roomId = req.query.roomId;
    const data = readMemoryData();
    const facts = readMemoryFacts(roomId);
    res.json({ ok: true, data, facts, content: JSON.stringify(data, null, 2) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/memory', (req, res) => {
  try {
    const { facts, addFacts, rawJson, roomId } = req.body || {};
    let data = readMemoryData();
    let currentFacts = roomId && roomId !== "global" ? (data.rooms[roomId] || []) : data.global;

    if (typeof rawJson === "string") {
      const parsed = JSON.parse(rawJson);
      if (parsed.global || parsed.rooms || Array.isArray(parsed.facts)) {
        if (Array.isArray(parsed.facts)) {
          data.global = parsed.facts.map(x => String(x).trim()).filter(Boolean);
          data.rooms = {};
        } else {
          data.global = Array.isArray(parsed.global) ? parsed.global.map(x => String(x).trim()).filter(Boolean) : data.global;
          data.rooms = (parsed.rooms && typeof parsed.rooms === "object") ? parsed.rooms : data.rooms;
        }
      } else {
        return res.status(400).json({ ok: false, error: "유효한 memory.json 형식이 아닙니다." });
      }
    } else if (Array.isArray(facts)) {
      currentFacts = facts.map(x => String(x).trim()).filter(Boolean);
      if (roomId && roomId !== "global") data.rooms[roomId] = currentFacts;
      else data.global = currentFacts;
    } else if (Array.isArray(addFacts)) {
      addFacts.forEach(item => {
        const clean = String(item || "").trim();
        if (clean && !currentFacts.includes(clean)) currentFacts.push(clean);
      });
      if (roomId && roomId !== "global") data.rooms[roomId] = currentFacts;
      else data.global = currentFacts;
    } else {
      return res.status(400).json({ ok: false, error: "facts, addFacts 또는 rawJson이 필요합니다." });
    }
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
    res.json({ ok: true, data, facts: readMemoryFacts(roomId) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// --- EYES 분할5: C2 더티 핑거프린트 stash (roomId + target 키 map) ---
const c2stash = new Map();

function getDiskFileHash(filename) {
  try {
    const fullPath = path.join(__dirname, filename);
    if (!fs.existsSync(fullPath)) return null;
    const raw = fs.readFileSync(fullPath, 'utf8');
    return crypto.createHash('sha1').update(raw).digest('hex');
  } catch (e) {
    return null;
  }
}

const PINS_PATH = path.join(__dirname, "target-pins.json");
function readPins() {
  try {
    if (!fs.existsSync(PINS_PATH)) return {};
    const _d = JSON.parse(fs.readFileSync(PINS_PATH, "utf8"));
    return (_d && typeof _d === "object") ? _d : {};
  } catch { return {}; }
}
function writePins(_pins) {
  fs.writeFileSync(PINS_PATH, JSON.stringify(_pins, null, 2) + "\n", "utf8");
}
app.post('/api/target/confirm', (req, res) => {
  try {
    const { roomId, target, model } = req.body || {};
    const _t = String(target || "").trim();
    if (!_t) return res.status(400).json({ ok: false, error: "target이 필요합니다." });
    const _key = (roomId && String(roomId).trim()) || "global";
    const _pins = readPins();
    _pins[_key] = { target: _t, model: String(model || ""), at: new Date().toISOString() };
    writePins(_pins);
    res.json({ ok: true, pin: _pins[_key] });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});
app.get('/api/target/confirm', (req, res) => {
  try {
    const _key = (req.query.roomId && String(req.query.roomId).trim()) || "global";
    const _pins = readPins();
    let _pin = _pins[_key] || null;
    if (_pin && _pin.target) {
      let _pt = String(_pin.target).trim();
      if (_pt === "index") _pt = "index.html";
      if (!fs.existsSync(path.join(__dirname, _pt))) {
        try { delete _pins[_key]; writePins(_pins); } catch {}
        _pin = null;
      }
    }
    res.json({ ok: true, pin: _pin });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.delete('/api/memory', (req, res) => {
  try {
    const { removeFact, roomId } = req.body || {};
    let data = readMemoryData();
    
    if (removeFact) {
      const cleanFact = String(removeFact).trim();
      if (roomId && roomId !== "global" && data.rooms[roomId]) {
        data.rooms[roomId] = data.rooms[roomId].filter(f => f !== cleanFact);
      } else {
        data.global = data.global.filter(f => f !== cleanFact);
      }
    } else if (roomId && roomId !== "global") {
      delete data.rooms[roomId];
    } else {
      data.global = [];
    }

    fs.writeFileSync(MEMORY_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
    res.json({ ok: true, data, facts: readMemoryFacts(roomId) });
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
    const cWhat = clean(what);
    const cWhy = clean(why);
    const cHow = clean(how);

    if (!fs.existsSync(FAILURES_PATH)) {
      fs.writeFileSync(FAILURES_PATH, "# 실패 일지 (failures.md)\n\n| 언제 | 뭐가 | 왜 | 어떻게 |\n|---|---|---|---|\n", "utf8");
    }

    const raw = fs.readFileSync(FAILURES_PATH, "utf8");
    const allLines = raw.split("\n");
    let header = "";
    let lines = [];
    
    let pastHeader = false;
    for (const line of allLines) {
      if (!pastHeader) {
        header += line + "\n";
        if (line.startsWith("|---|")) {
          pastHeader = true;
        }
      } else {
        if (line.trim()) lines.push(line);
      }
    }

    let found = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      const cols = lines[i].split("|").map(s => s.trim());
      if (cols.length >= 5 && cols[2] === cWhat && cols[3] === cWhy) {
        let currentHow = cols[4];
        let count = 1;
        const match = currentHow.match(/(.*?)\s*×(\d+)$/);
        if (match) {
          count = parseInt(match[2], 10);
          currentHow = match[1].trim();
        }
        count++;
        lines[i] = `| ${ts} | ${cWhat} | ${cWhy} | ${currentHow} ×${count} |`;
        found = true;
        break;
      }
    }

    if (!found) {
      lines.push(`| ${ts} | ${cWhat} | ${cWhy} | ${cHow} |`);
    }

    let coldLines = [];
    if (lines.length > 20) {
      coldLines = lines.splice(0, lines.length - 20);
    }

    fs.writeFileSync(FAILURES_PATH, header + lines.join("\n") + "\n", "utf8");

    if (coldLines.length > 0) {
      if (!fs.existsSync(FAILURES_COLD_PATH)) {
        fs.writeFileSync(FAILURES_COLD_PATH, "# 실패 일지 콜드 (failures-cold.md)\n\n| 언제 | 뭐가 | 왜 | 어떻게 |\n|---|---|---|---|\n", "utf8");
      }
      fs.appendFileSync(FAILURES_COLD_PATH, coldLines.join("\n") + "\n", "utf8");
    }

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
    let manifest = { "index.html": "system" };
    if (fs.existsSync(MANIFEST_PATH)) {
      try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")); } catch(e) {}
    }
    const files = entries
      .filter(e => e.isFile() && !isForbiddenFileName(e.name))
      .map(e => {
        const stat = fs.statSync(path.join(__dirname, e.name));
        return { name: e.name, size: stat.size, owner: getCreator(e.name) };
      });
    res.json({ ok: true, files });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/files/write', (req, res) => {
  try {
    const { name, content, confirmed, roomId } = req.body || {};
    const filename = String(name || "").trim();
    if (!filename || isForbiddenFileName(filename)) {
      return res.status(403).json({ ok: false, error: "거부됨: 쓰기 금지된 파일명입니다." });
    }

    // C2 적용 재확인: confirmed가 아닐 때 stash 대조 후 mismatch면 409
    if (!confirmed) {
      const rKey = (roomId && String(roomId).trim()) || "global";
      const stashKey = rKey + ":" + filename;
      let initialHash = c2stash.get(stashKey);
      if (initialHash === undefined) { for (const _kv of c2stash) { if (typeof _kv[0] === "string" && _kv[0].endsWith(":" + filename)) { initialHash = _kv[1]; break; } } }
      if (initialHash !== undefined) {
        const currentHash = getDiskFileHash(filename);
        if (initialHash !== currentHash) {
          return res.status(409).json({
            ok: false,
            error: "conflict(409): 요청 이후 파일이 변경되었습니다. 변경 내용을 확인 후 덮어쓰려면 확인을 눌러주세요.",
            dirty: true
          });
        }
      }
    }

    const p = path.join(__dirname, filename);

    if (fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, "utf8"), filename);
    } else if (filename.endsWith('.html')) {
      setCreator(filename, "gemgem");
    }

    fs.writeFileSync(p, content || "", "utf8");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/files/delete', (req, res) => {
  try {
    const { name } = req.body || {};
    const filename = String(name || "").trim();
    if (!filename || isForbiddenFileName(filename)) {
      return res.status(403).json({ ok: false, error: "거부됨: 쓰기 금지된 파일명입니다." });
    }
    if (!filename.endsWith(".html")) {
      return res.status(403).json({ ok: false, error: "거부됨: .html만 삭제할 수 있습니다." });
    }
    if (["index.html", "blank.html", "cockpit.html", "server.js"].includes(filename)) {
      return res.status(403).json({ ok: false, error: "거부됨: 시스템·콕핏 파일은 삭제할 수 없습니다." });
    }
    const owner = getCreator(filename);
    if (owner !== "gemgem") {
      return res.status(403).json({ ok: false, error: "거부됨: gemgem 소유만 삭제할 수 있습니다 (현재: " + owner + ")." });
    }
    const p = path.join(__dirname, filename);
    if (!fs.existsSync(p)) {
      return res.status(404).json({ ok: false, error: "파일이 존재하지 않습니다: " + filename });
    }
    saveSnapshotToDisk(fs.readFileSync(p, "utf8"), filename);
    fs.unlinkSync(p);
    try {
      if (fs.existsSync(MANIFEST_PATH)) {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
        if (manifest[filename]) { delete manifest[filename]; fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8"); }
      }
    } catch (e) {}
    res.json({ ok: true, name: filename });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/files/rename', (req, res) => {
  try {
    const { name, newName } = req.body || {};
    const oldN = String(name || "").trim();
    const newN = String(newName || "").trim();
    if (!oldN || isForbiddenFileName(oldN) || !newN || isForbiddenFileName(newN)) {
      return res.status(403).json({ ok: false, error: "거부됨: 쓰기 금지된 파일명입니다." });
    }
    if (!oldN.endsWith(".html") || !newN.endsWith(".html")) {
      return res.status(403).json({ ok: false, error: "거부됨: .html끼리만 이름을 바꿀 수 있습니다." });
    }
    if (["index.html", "blank.html", "cockpit.html", "server.js"].includes(oldN) || ["index.html", "blank.html", "cockpit.html", "server.js"].includes(newN)) {
      return res.status(403).json({ ok: false, error: "거부됨: 시스템·콕핏 파일은 이름을 바꿀 수 없습니다." });
    }
    if (!/^[a-z0-9-]{1,40}\.html$/.test(newN)) {
      return res.status(400).json({ ok: false, error: "새 파일명이 올바르지 않습니다 (소문자·숫자·하이픈, 40자 이내)." });
    }
    const owner = getCreator(oldN);
    if (owner !== "gemgem") {
      return res.status(403).json({ ok: false, error: "거부됨: gemgem 소유만 이름을 바꿀 수 있습니다 (현재: " + owner + ")." });
    }
    const po = path.join(__dirname, oldN);
    const pn = path.join(__dirname, newN);
    if (!fs.existsSync(po)) {
      return res.status(404).json({ ok: false, error: "파일이 존재하지 않습니다: " + oldN });
    }
    if (fs.existsSync(pn)) {
      return res.status(400).json({ ok: false, error: "이미 있는 파일명입니다: " + newN });
    }
    const content = fs.readFileSync(po, "utf8");
    saveSnapshotToDisk(content, oldN);
    fs.writeFileSync(pn, content, "utf8");
    saveSnapshotToDisk(content, newN);
    fs.unlinkSync(po);
    try {
      let manifest = {};
      if (fs.existsSync(MANIFEST_PATH)) { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")); }
      const ow = manifest[oldN] || "gemgem";
      delete manifest[oldN];
      manifest[newN] = ow;
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
    } catch (e) {}
    res.json({ ok: true, name: newN, oldName: oldN });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/check', (req, res) => {
  try {
    const { file, content } = req.body || {};
    const filename = String(file || "").trim();
    if (!filename || isForbiddenFileName(filename)) {
      return res.status(400).json({ ok: false, error: "거부됨(400): 허용되지 않은 파일명입니다." });
    }
    const text = String(content == null ? "" : content);
    if (filename === "server.js" || filename.endsWith(".js")) {
      const tmp = path.join("/tmp", "check-" + Date.now() + "-" + Math.floor(Math.random() * 1000000) + ".js");
      try { fs.writeFileSync(tmp, text, "utf8"); } catch (e) { return res.status(500).json({ ok: false, error: "임시 파일 쓰기 실패: " + e.message }); }
      execFile(process.execPath, ["--check", tmp], { timeout: 10000 }, (err, stdout, stderr) => {
        try { fs.unlinkSync(tmp); } catch (e) {}
        if (err) {
          return res.json({ ok: false, file: filename, error: String((stderr || stdout || err.message) || "문법 오류").slice(0, 2000) });
        }
        return res.json({ ok: true, file: filename });
      });
      return;
    }
    if (filename.endsWith(".html")) {
      const checkRes = verifyHtmlScriptsSyntax(text);
      if (!checkRes.ok) return res.json({ ok: false, file: filename, error: checkRes.error.slice(0, 2000) });
      return res.json({ ok: true, file: filename, blocks: checkRes.blocks });
    }
    return res.json({ ok: true, file: filename });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/git/status', (req, res) => {
  execFile("git", ["status", "--short"], { cwd: __dirname }, (err1, stdout1) => {
    execFile("git", ["log", "--oneline", "-5"], { cwd: __dirname }, (err2, stdout2) => {
      const statusText = String(stdout1 || "").trim() || "No changes";
      const logText = String(stdout2 || "").trim() || "No commits";
      res.json({ ok: true, status: statusText, log: logText });
    });
  });
});

app.post('/api/git/commit', (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ ok: false, error: "커밋 메시지가 필요합니다." });
  }

  execFile("git", ["add", "-A"], { cwd: __dirname }, (err) => {
    if (err) return res.status(500).json({ ok: false, error: "git add 실패: " + err.message });

    const commitArgs = [
      "-c", "user.name=gemgem",
      "-c", "user.email=gemgem@example.com",
      "commit", "-m", message.trim()
    ];

    execFile("git", commitArgs, { cwd: __dirname }, (err2, stdout2) => {
      if (err2) {
        if (err2.stdout && err2.stdout.includes("nothing to commit")) {
          return res.json({ ok: true, message: "변경사항이 없어 커밋할 내용이 없습니다." });
        }
        return res.status(500).json({ ok: false, error: "git commit 실패: " + err2.message });
      }
      res.json({ ok: true, message: "커밋 성공", output: String(stdout2).trim() });
    });
  });
});

// --- 격리 편집 라우트 (/api/cockpit/target) ---
app.post('/api/cockpit/target', (req, res) => {
  try {
    const { file, content, confirmed, roomId } = req.body || {};
    if (file !== "blank.html" && file !== "cockpit.html") {
      return res.status(403).json({ ok: false, error: "격리 라우트에서는 blank.html과 cockpit.html만 수정 가능합니다." });
    if (!confirmed) {
      const _rk = (roomId && String(roomId).trim()) || "global";
      let _ih = c2stash.get(_rk + ":" + file);
      if (_ih === undefined) { for (const _q of c2stash) { if (typeof _q[0] === "string" && _q[0].endsWith(":" + file)) { _ih = _q[1]; break; } } }
      if (_ih !== undefined && _ih !== getDiskFileHash(file)) {
        return res.status(409).json({ ok: false, error: "conflict(409): 요청 이후 파일이 변경되었습니다. 변경 내용을 확인 후 덮어쓰려면 확인을 눌러주세요.", dirty: true });
      }
    }
    }
    const p = path.join(__dirname, file);
    if (fs.existsSync(p)) {
      saveSnapshotToDisk(fs.readFileSync(p, "utf8"), file);
    }
    fs.writeFileSync(p, content || "", "utf8");
    res.json({ ok: true });
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
    const content = fs.readFileSync(targetPath, "utf8");
    res.json({ ok: true, name, content });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- 읽기 전용 터미널 실행 (/api/run) ---
app.post('/api/run', async (req, res) => {
  const rawCmd = String((req.body && (req.body.command || req.body.cmd)) || "").trim();
  if (!rawCmd) return res.status(400).json({ ok: false, error: "명령어를 입력하세요." });

  const lowHead = rawCmd.toLowerCase();
  if (lowHead === "ask" || lowHead.startsWith("ask ")) {
    const question = lowHead === "ask" ? "" : rawCmd.slice(4).trim().slice(0, 2000);
    if (!question) {
      return res.status(400).json({ ok: false, error: "질문을 입력하세요." });
    }
    try {
      const askPrompt = USER_PROFILE_HEADER + "\n\n[질문]\n" + question;
      const activeKey = getActiveKey();
      if (!activeKey) {
        const demoReply = '(AI 키 미설정) 데모 응답: "' + question + '"';
        const usage = logUsageCall({ route: "ask", model: GEMINI_MODEL, inChars: askPrompt.length, outChars: demoReply.length, inTok: null, outTok: null });
        return res.json({ ok: true, output: demoReply, usage });
      }
      const ai = new GoogleGenAI({ apiKey: activeKey });
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: askPrompt,
      });
      const reply = (response && response.text) ? response.text : "(응답 없음)";
      const uMeta = response && response.usageMetadata ? response.usageMetadata : null;
      const usage = logUsageCall({
        route: "ask",
        model: GEMINI_MODEL,
        inChars: askPrompt.length,
        outChars: reply.length,
        inTok: uMeta?.promptTokenCount ?? null,
        outTok: uMeta?.candidatesTokenCount ?? null
      });
      return res.json({ ok: true, output: reply, usage });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "ask 오류: " + ((e && e.message) ? e.message : String(e)) });
    }
  }

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
    if (!isAllowedToolFile(targetFile)) {
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

// --- 스크린샷 반환 API (/api/observe-shot) ---
app.get('/api/observe-shot', (req, res) => {
  const target = req.query.target || "index.html";
  const nameBase = target.replace(".html", "");
  const shotPath = `/tmp/observe-${nameBase}-desktop.png`;
  const infoPath = `/tmp/observe-last.json`;

  const returnImage = () => {
    try {
      const buffer = fs.readFileSync(shotPath);
      const base64 = buffer.toString('base64');
      const stat = fs.statSync(shotPath);
      res.json({ ok: true, image: base64, takenAt: stat.mtime.toISOString() });
    } catch (e) {
      res.status(500).json({ ok: false, error: "스크린샷 읽기 실패: " + e.message });
    }
  };

  try {
    if (fs.existsSync(shotPath)) {
      const stat = fs.statSync(shotPath);
      const ageMs = Date.now() - stat.mtime.getTime();
      if (ageMs < 60000 && req.query.fresh !== "1") {
        return returnImage();
      }
    }
  } catch (e) {}

  // Run observe-local.js dynamically if needed
  execFile("node", ["observe-local.js", String(req.query.target || "index.html")], { cwd: __dirname, timeout: 120000 }, (err) => {
    returnImage();
  });
});

// --- 시각 판정·롤백 연동 (/api/verify-render) ---
app.post('/api/verify-render', async (req, res) => {
  try {
    const { target, screenshot } = req.body || {};
    if (!target || !screenshot) return res.status(400).json({ ok: false, error: 'target and screenshot required' });
    const activeKey = getActiveKey();
    if (!activeKey) return res.status(500).json({ ok: false, error: 'API 키가 등록되어 있지 않습니다.' });

    const ai = new GoogleGenAI({ apiKey: activeKey });
    const prompt = `사용자가 웹 페이지 디자인을 변경했습니다. 제공된 스크린샷은 수정된 페이지의 렌더링 결과입니다.
시각적 요소에 심각한 깨짐 현상(예: 텍스트가 컨테이너를 벗어나거나 잘림, 중요 요소가 겹침, 글자색과 배경색이 유사하여 가독성이 매우 떨어짐 등)이 있는지 확인하세요.
정상이면 { "ok": true, "reason": "정상" } 을, 깨짐 현상이 있으면 { "ok": false, "reason": "문제가 있는 부분에 대한 짧은 설명" } 을 JSON으로만 응답하세요. 백틱(\`\`\`)은 쓰지 마세요.`;

    const images = [{ mimeType: "image/png", data: screenshot }];
    
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: buildMultimodalContents(prompt, images),
    });
    
    const reply = (response && response.text) ? response.text : '';
    const jsonStr = extractJsonString(reply);
    const parsed = JSON.parse(jsonStr);
    
    res.json({ ok: Boolean(parsed.ok), reason: parsed.reason || "알 수 없음" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- live 보호 v2: 디스크 스냅샷 자동 복원 (복원 후 재확인 포함) ---
app.post('/api/rollback', async (req, res) => {
  try {
    let target = (req.body && typeof req.body.target === "string" && req.body.target.trim()) ? req.body.target.trim() : "index.html";
    if (target === "index") target = "index.html";
    if (isForbiddenFileName(target)) {
      return res.status(400).json({ ok: false, error: "거부됨(400): 허용되지 않은 대상 파일명입니다." });
    }
    const backup = loadSnapshotFromDisk(target);
    if (!backup) {
      return res.status(404).json({ ok: false, error: "복원할 디스크 스냅샷이 없습니다: " + target });
    }
    const targetPath = path.join(__dirname, target);
    fs.writeFileSync(targetPath, backup, 'utf8');
    const verified = fs.readFileSync(targetPath, 'utf8') === backup;
    if (!verified) {
      recordSecurityOrToolFailure("롤백 실패 (" + target + ")", "복원 후 재확인 불일치", "디스크 복원 검증 실패");
      return res.status(500).json({ ok: false, error: "복원 후 재확인 실패: " + target });
    }
    recordSecurityOrToolFailure("확정 후 자동롤백 실행 (" + target + ")", target + " 렌더 검증 실패로 디스크 백업본 원복 완료", "디스크 스냅샷 복원＋재확인 성공");
    res.json({ ok: true, target, verified: true, message: "자동 롤백 완료 (" + target + ")" });
  } catch (e) {
    recordSecurityOrToolFailure("롤백 실패", e.message, "디스크 복원 중 예외 발생");
    res.status(500).json({ ok: false, error: e.message });
  }
});

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
