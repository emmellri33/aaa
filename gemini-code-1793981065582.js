// TITLE: 2. /api/check 에 공통 함수 적용 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search = `    if (filename.endsWith(".html")) {
      const re = /<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi;
      let m; let idx = 0; const errors = [];
      while ((m = re.exec(text)) !== null) {
        idx++;
        try { new Function(m[1]); } catch (e) { errors.push("script #" + idx + ": " + e.message); }
      }
      if (errors.length) return res.json({ ok: false, file: filename, error: errors.join("\\n").slice(0, 2000) });
      return res.json({ ok: true, file: filename, blocks: idx });
    }`;

const replace = `    if (filename.endsWith(".html")) {
      const checkRes = verifyHtmlScriptsSyntax(text);
      if (!checkRes.ok) return res.json({ ok: false, file: filename, error: checkRes.error.slice(0, 2000) });
      return res.json({ ok: true, file: filename, blocks: checkRes.blocks });
    }`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('server.js', content.replace(search, replace), 'utf8');
console.log('✅ 블록 2 적용 완료');