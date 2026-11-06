// TITLE: EYES 분할2 (1/5) — server 스켈레톤·헬퍼 추가
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

function patchOnce(target, search, replace, label) {
  const parts = target.split(search);
  if (parts.length !== 2) {
    console.error('FAIL [' + label + ']: ' + (parts.length - 1) + '회 발견 - 파일 미기록 원복');
    process.exit(1);
  }
  return parts[0] + replace + parts[1];
}

// 1) 헬퍼 함수 추가: 스켈레톤 추출기, 유일 파일명 판정기, 애매/명확 판정기, 요약 제목 추출기
const search1 = `function extractRelevantHtmlSnippet(html, queryText) {`;
const replace1 = `// --- EYES 분할2: 스켈레톤 추출기 (정규식 기반 id, 함수명, 주요 class / 상한 20줄) ---
function extractSkeletonMap(sourceText) {
  try {
    const text = String(sourceText || "");
    if (!text.trim()) return "(스켈레톤 없음: 빈 파일)";
    const lines = [];

    // id 추출
    const ids = [];
    const idRegex = /\\bid=["']([a-zA-Z0-9_-]+)["']/g;
    let m;
    while ((m = idRegex.exec(text)) !== null) {
      if (!ids.includes(m[1])) ids.push(m[1]);
      if (ids.length >= 8) break;
    }
    if (ids.length > 0) lines.push("- id: #" + ids.join(", #"));

    // 함수명 추출 (function foo, const foo = () =>, function* foo)
    const funcs = [];
    const fnRegex = /(?:function\\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\\s+([a-zA-Z0-9_$]+)\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|[a-zA-Z0-9_$]+)\\s*=>)/g;
    while ((m = fnRegex.exec(text)) !== null) {
      const fnName = m[1] || m[2];
      if (fnName && !funcs.includes(fnName)) funcs.push(fnName);
      if (funcs.length >= 8) break;
    }
    if (funcs.length > 0) lines.push("- 함수: " + funcs.join("(), ") + "()");

    // 주요 class 추출 (class="...")
    const classes = [];
    const clsRegex = /\\bclass=["']([^"']+)["']/g;
    while ((m = clsRegex.exec(text)) !== null) {
      const clsTokens = m[1].split(/\\s+/).filter(Boolean);
      for (const c of clsTokens) {
        if (!classes.includes(c) && !["dark", "active", "open", "hidden"].includes(c)) classes.push(c);
        if (classes.length >= 10) break;
      }
      if (classes.length >= 10) break;
    }
    if (classes.length > 0) lines.push("- class: ." + classes.join(", ."));

    // 태그/헤딩 구조 요약
    const tags = [];
    const tagRegex = /<(h[1-3]|header|nav|main|aside|footer|article|section)\\b[^>]*>/gi;
    while ((m = tagRegex.exec(text)) !== null) {
      const tg = m[1].toLowerCase();
      if (!tags.includes(tg)) tags.push(tg);
      if (tags.length >= 6) break;
    }
    if (tags.length > 0) lines.push("- 주요 태그: <" + tags.join(">, <") + ">");

    return lines.slice(0, 20).join("\\n") || "(스켈레톤 추출 요소 없음)";
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

// 기억 제목 요약 목록 (앞 5자~40자 제목만)
function getMemoryHeadersSummary(roomId) {
  try {
    const facts = readMemoryFacts(roomId);
    if (!facts || !facts.length) return "기억 없음";
    return facts.map((f, i) => \`\${i + 1}. \${String(f).slice(0, 40)}\`).join("\\n");
  } catch (e) { return "(기억 읽기 실패)"; }
}

// 실패 일지 제목 요약 목록 (언제/뭐가 컬럼만)
function getFailuresHeadersSummary() {
  try {
    if (!fs.existsSync(FAILURES_PATH)) return "실패 일지 없음";
    const rawHot = fs.readFileSync(FAILURES_PATH, "utf8");
    const lines = rawHot.split("\\n").filter(l => l.startsWith("|") && !l.includes("|---") && !l.includes("| 언제 |"));
    return lines.slice(-5).map(l => {
      const cols = l.split("|").map(c => c.trim());
      return \`- [\${cols[1] || "-"}] \${cols[2] || "-"}\`;
    }).join("\\n") || "실패 일지 없음";
  } catch (e) { return "(실패 일지 요약 실패)"; }
}

function extractRelevantHtmlSnippet(html, queryText) {`;

content = patchOnce(content, search1, replace1, "스켈레톤 및 헬퍼 추가");
fs.writeFileSync(file, content, 'utf8');
console.log('PASS (1/5) server 스켈레톤·헬퍼');
