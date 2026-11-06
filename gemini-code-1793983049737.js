// TITLE: 2. 도구 결과 크기 기록 지원 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search1 = `    const out = hits.length > 0 ? hits.join("\\n") : "(매치 결과 없음: " + pattern + ")";
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\\n...(2000자 절단됨)" : out
    };`;

const replace1 = `    const out = hits.length > 0 ? hits.join("\\n") : "(매치 결과 없음: " + pattern + ")";
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\\n...(2000자 절단됨)" : out,
      resultLength: hits.length
    };`;

if (content.split(search1).length !== 2) {
  console.error('❌ 블록 2-1 앵커 불일치');
  process.exit(1);
}
content = content.replace(search1, replace1);

const search2 = `    const slice = lines.slice(startLine - 1, endLine).map((l, i) => (startLine + i) + ": " + l).join("\\n");
    const out = "[" + targetFile + " " + startLine + "~" + endLine + "줄]\\n" + slice;
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\\n...(2000자 절단됨)" : out
    };`;

const replace2 = `    const slice = lines.slice(startLine - 1, endLine).map((l, i) => (startLine + i) + ": " + l).join("\\n");
    const out = "[" + targetFile + " " + startLine + "~" + endLine + "줄]\\n" + slice;
    return {
      ok: true,
      status: 200,
      tool,
      output: out.length > 2000 ? out.slice(0, 2000) + "\\n...(2000자 절단됨)" : out,
      resultLength: slice.length > 0 ? 1 : 0
    };`;

if (content.split(search2).length !== 2) {
  console.error('❌ 블록 2-2 앵커 불일치');
  process.exit(1);
}
content = content.replace(search2, replace2);

const search3 = `    execFile(bin, args, { cwd: __dirname, timeout: runTimeout }, (err, stdout, stderr) => {
      const combined = (String(stdout || "") + (stderr ? "\\n" + String(stderr) : "")).trim();
      const truncated = combined.length > 2000 ? combined.slice(0, 2000) + "\\n...(2000자 절단됨)" : combined;
      if (err && err.code !== 1) {
        return resolve({ ok: false, status: 200, output: (truncated || err.message).slice(0, 2000) });
      }
      resolve({ ok: true, status: 200, output: truncated || "(출력 없음)" });
    });`;

const replace3 = `    execFile(bin, args, { cwd: __dirname, timeout: runTimeout }, (err, stdout, stderr) => {
      const combined = (String(stdout || "") + (stderr ? "\\n" + String(stderr) : "")).trim();
      const truncated = combined.length > 2000 ? combined.slice(0, 2000) + "\\n...(2000자 절단됨)" : combined;
      if (err && err.code !== 1) {
        return resolve({ ok: false, status: 200, output: (truncated || err.message).slice(0, 2000), resultLength: combined.length });
      }
      resolve({ ok: true, status: 200, output: truncated || "(출력 없음)", resultLength: combined.length });
    });`;

if (content.split(search3).length !== 2) {
  console.error('❌ 블록 2-3 앵커 불일치');
  process.exit(1);
}
content = content.replace(search3, replace3);
fs.writeFileSync('server.js', content, 'utf8');
console.log('✅ 블록 2 적용 완료');