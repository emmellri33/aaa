#!/usr/bin/env node
/**
 * patch-b1b.js — B1b 도구 규격·자가수복·스크린샷 잠재 버그 수선
 * 규칙:
 * 1) 파일 통갈이 금지 — 앵커 치환 (정확히 1회 매치)
 * 2) 앵커 매치 횟수 불일치 또는 문법 검사 실패 시 즉시 중단 및 원복 (fail-closed)
 * 3) server node --check 및 blank.html 인라인 <script> 전 블록 검사
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FILES = {
  server: path.join(__dirname, "server.js"),
  blank: path.join(__dirname, "blank.html"),
  observe: path.join(__dirname, "observe-local.js")
};

const originals = {};

function abort(step, reason) {
  console.error(`\n❌ [ABORT - ${step}] ${reason}`);
  for (const [key, filePath] of Object.entries(FILES)) {
    if (typeof originals[key] === "string") {
      try {
        fs.writeFileSync(filePath, originals[key], "utf8");
      } catch (e) {
        console.error(`⚠️ 원복 실패 (${filePath}): ${e.message}`);
      }
    }
  }
  console.error("↩️ 수정된 파일 모두 원본 상태로 원복 완료.");
  process.exit(1);
}

function replaceOnce(content, oldStr, newStr, label) {
  const parts = content.split(oldStr);
  const count = parts.length - 1;
  if (count !== 1) {
    abort(label, `앵커 매치 횟수가 1회가 아닙니다 (실제 매치: ${count}회)`);
  }
  console.log(`✅ [${label}] 앵커 1회 정확 매치 및 치환 완료`);
  return parts[0] + newStr + parts[1];
}

function replaceRegexOnce(content, regex, newStr, label) {
  const matches = [...content.matchAll(regex)];
  if (matches.length !== 1) {
    abort(label, `정규식 매치 횟수가 1회가 아닙니다 (실제 매치: ${matches.length}회)`);
  }
  console.log(`✅ [${label}] 정규식 1회 정확 매치 및 치환 완료`);
  return content.replace(regex, newStr);
}

function checkHtmlScripts(htmlContent, fileLabel) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let idx = 0;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    idx++;
    const code = match[1].trim();
    if (code) {
      try {
        new Function(code);
      } catch (e) {
        abort(`${fileLabel} <script #${idx}> 문법검사`, e.message);
      }
    }
  }
  if (idx === 0) {
    abort(`${fileLabel} <script> 검사`, "<script> 블록을 찾을 수 없습니다.");
  }
  console.log(`✅ [${fileLabel}] <script> ${idx}개 블록 문법 검사 통과`);
}

// 0. 원본 파일 로드 및 백업
for (const [key, filePath] of Object.entries(FILES)) {
  if (!fs.existsSync(filePath)) {
    // observe-local.js가 없을 수 있는 환경 대비 예외 처리
    if (key === "observe") {
      console.warn(`⚠️ [경고] ${filePath} 가 존재하지 않아 패치를 건너뜁니다.`);
      continue;
    }
    abort("초기화", `대상 파일이 존재하지 않습니다: ${filePath}`);
  }
  originals[key] = fs.readFileSync(filePath, "utf8");
}

let serverTxt = originals.server;
let blankTxt = originals.blank;
let observeTxt = originals.observe;

// ============================================================================
// F1. server.js — #18 동적 허용 (isAllowedToolFile 및 grep 제한 교체)
// ============================================================================
const F1_OLD_1 = `function isAllowedToolFile(name) {
  const n = String(name || "").trim();
  if (!n || isForbiddenFileName(n)) return false;
  return ALLOWED_TOOL_FILES.includes(n);
}`;

const F1_NEW_1 = `function isAllowedToolFile(name) {
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
}`;
serverTxt = replaceOnce(serverTxt, F1_OLD_1, F1_NEW_1, "F1-1 server isAllowedToolFile 동적 허용");

const F1_OLD_2 = `    const allowedGrepFiles = ["index.html", "blank.html", "server.js", "failures.md", "memory.json", "package.json"];
    if (!allowedGrepFiles.includes(targetFile)) {
      return res.status(400).json({ ok: false, error: "거부됨: grep 대상 파일은 워크스페이스 일반 파일만 허용됩니다." });
    }`;

const F1_NEW_2 = `    if (!isAllowedToolFile(targetFile)) {
      return res.status(400).json({ ok: false, error: "거부됨: grep 대상 파일은 워크스페이스 일반 파일만 허용됩니다." });
    }`;
serverTxt = replaceOnce(serverTxt, F1_OLD_2, F1_NEW_2, "F1-2 server allowedGrepFiles 통합");


// ============================================================================
// F2. blank.html — ⑤ 자가수복 타깃 초기화 (들여쓰기 7칸 포함)
// ============================================================================
const F2_OLD = `       target: __explicitTarget(originalInstruction) || "index",`;
const F2_NEW = `       target: __explicitTarget(originalInstruction) || ((typeof targetPageSelect !== "undefined" && targetPageSelect && targetPageSelect.value) || "index"),`;
blankTxt = replaceOnce(blankTxt, F2_OLD, F2_NEW, "F2 blank requestSelfHealRetry target fallback");


// ============================================================================
// F3. server.js — ⑥ /api/chat 도구 규격
// ============================================================================
const F3_OLD = `"당신은 정확하고 신중한 한국어 웹 개발 도우미입니다. 추가 확인이 필요하면 grep 또는 read 도구를 호출하세요.",`;
const F3_NEW = `"당신은 정확하고 신중한 한국어 웹 개발 도우미입니다. 추가 확인이 필요하면 아래 JSON 규격으로 grep 또는 read 도구를 호출하세요: {\\"type\\":\\"tool_calls\\",\\"calls\\":[{\\"tool\\":\\"grep\\",\\"args\\":{\\"pattern\\":\\"...\\",\\"file\\":\\"...\\"}}]} — 1회차에 해결 못하면 question으로 끝내세요.",`;
serverTxt = replaceOnce(serverTxt, F3_OLD, F3_NEW, "F3 server /api/chat tool prompt");


// ============================================================================
// F4. 스크린샷 동적 인자
// ============================================================================
const F4_OLD_SERVER = `  // Run observe-local.js dynamically if needed
  execFile("node", ["observe-local.js"], { cwd: __dirname, timeout: 120000 }, (err) => {`;
const F4_NEW_SERVER = `  // Run observe-local.js dynamically if needed
  execFile("node", ["observe-local.js", String(req.query.target || "index.html")], { cwd: __dirname, timeout: 120000 }, (err) => {`;
serverTxt = replaceOnce(serverTxt, F4_OLD_SERVER, F4_NEW_SERVER, "F4 server execFile args");

if (observeTxt) {
  const F4_REGEX_OBSERVE = /const\s+TARGETS\s*=\s*\[.*?\];?/g;
  const F4_NEW_OBSERVE = `const TARGETS = [String(process.argv[2] || "index.html")];`;
  observeTxt = replaceRegexOnce(observeTxt, F4_REGEX_OBSERVE, F4_NEW_OBSERVE, "F4 observe-local.js TARGETS args");
}


// ============================================================================
// F5. blank.html — ⑧ 복수 script 검사
// ============================================================================
const F5_OLD = `      const scriptMatch = htmlStr.match(/<script>([\\s\\S]*?)<\\/script>/);
      if (scriptMatch && scriptMatch[1]) {
        try {
          new Function(scriptMatch[1]);
        } catch (syntaxErr) {
          return { ok: false, reason: "JavaScript 문법 오류: " + syntaxErr.message };
        }
      }`;

const F5_NEW = `      const scriptMatches = [...htmlStr.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)];
      for (const match of scriptMatches) {
        if (match[1] && match[1].trim()) {
          try {
            new Function(match[1]);
          } catch (syntaxErr) {
            return { ok: false, reason: "JavaScript 문법 오류: " + syntaxErr.message };
          }
        }
      }`;
blankTxt = replaceOnce(blankTxt, F5_OLD, F5_NEW, "F5 blank validatePatchedHtml (다중 script 검사)");


// ============================================================================
// 파일 쓰기 및 문법 검증
// ============================================================================
try {
  fs.writeFileSync(FILES.server, serverTxt, "utf8");
  fs.writeFileSync(FILES.blank, blankTxt, "utf8");
  if (observeTxt) fs.writeFileSync(FILES.observe, observeTxt, "utf8");
} catch (writeErr) {
  abort("파일 저장", writeErr.message);
}

// 1) server.js: node --check
try {
  execFileSync(process.execPath, ["--check", FILES.server], { stdio: "pipe" });
  console.log("✅ [server.js] node --check 통과");
} catch (chkErr) {
  const stderr = chkErr.stderr ? chkErr.stderr.toString() : chkErr.message;
  abort("server.js node --check", stderr);
}

// 2) blank.html: <script> 전 블록 문법 검사
checkHtmlScripts(blankTxt, "blank.html");

console.log("\n🎉 B1b 패치 적용 및 전 항목 문법 검증 완료!");