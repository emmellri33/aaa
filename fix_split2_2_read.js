// TITLE: EYES 분할2 (2/5) — server read 범위 필수·full-read 로그
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

// 2) ReAct tool `read`: 범위 지정 필수화, full-read 거부 및 로그 기록
const search2 = `  // 3. read: { file, start, end } (1회 최대 200줄)
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
    const lines = fs.readFileSync(fullPath, "utf8").split("\\n");
    const startLine = Math.max(1, parseInt(args.start, 10) || 1);
    const rawEnd = parseInt(args.end, 10) || (startLine + 199);
    const endLine = Math.min(lines.length, Math.min(startLine + 199, Math.max(startLine, rawEnd)));
    const slice = lines.slice(startLine - 1, endLine).map((l, i) => (startLine + i) + ": " + l).join("\\n");
    const out = "[" + targetFile + " " + startLine + "~" + endLine + "줄]\\n" + slice;
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\\n...(2000자 절단됨)" : out
    };
  }`;

const replace2 = `  // 3. read: { file, start, end } (1회 최대 200줄, 범위 지정 필수, full-read 금지 및 로그)
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

    const lines = fs.readFileSync(fullPath, "utf8").split("\\n");
    const startLine = Math.max(1, parseInt(args.start, 10) || 1);
    const rawEnd = parseInt(args.end, 10) || (startLine + 199);
    const endLine = Math.min(lines.length, Math.min(startLine + 199, Math.max(startLine, rawEnd)));

    // 전체 파일을 통째로 읽으려는 시도 감지 및 기록
    if (startLine === 1 && endLine >= lines.length && lines.length > 50) {
      console.warn("[FULL-READ LOG] 전체 줄 범위 읽기 감지: file=" + targetFile + " lines=" + lines.length);
      recordSecurityOrToolFailure("full-read 감지 로그", "file=" + targetFile + " (" + lines.length + "줄)", "분할 read 권장");
    }

    const slice = lines.slice(startLine - 1, endLine).map((l, i) => (startLine + i) + ": " + l).join("\\n");
    const out = "[" + targetFile + " " + startLine + "~" + endLine + "줄]\\n" + slice;
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\\n...(2000자 절단됨)" : out
    };
  }`;

content = patchOnce(content, search2, replace2, "read 도구 범위 지정 필수화");
fs.writeFileSync(file, content, 'utf8');
console.log('PASS (2/5) server read 범위');
