// TITLE: 1. 서명 해시 헬퍼 및 실패 일지(G4) 확장 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search = `const { execFile } = require('child_process');

app.use(express.json({ limit: '20mb' }));`;

const replace = `const { execFile } = require('child_process');
const crypto = require('crypto');

app.use(express.json({ limit: '20mb' }));`;

if (content.split(search).length !== 2) {
  console.error('❌ 블록 1-1 앵커 불일치');
  process.exit(1);
}
content = content.replace(search, replace);

const search2 = `function recordSecurityOrToolFailure(what, why, how) {
  try {
    const clean = (v) => String(v || "-").replace(/\\|/g, "/").replace(/\\r?\\n/g, " ").trim();
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    const cWhat = clean(what);
    const cWhy = clean(why);
    const cHow = clean(how);

    if (!fs.existsSync(FAILURES_PATH)) {
      fs.writeFileSync(FAILURES_PATH, "# 실패 일지 (failures.md)\\n\\n| 언제 | 뭐가 | 왜 | 어떻게 |\\n|---|---|---|---|\\n", "utf8");
    }

    const raw = fs.readFileSync(FAILURES_PATH, "utf8");
    const allLines = raw.split("\\n");
    let header = "";
    let lines = [];
    
    let pastHeader = false;
    for (const line of allLines) {
      if (!pastHeader) {
        header += line + "\\n";
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
        const match = currentHow.match(/(.*?)\\s*×(\\d+)$/);
        if (match) {
          count = parseInt(match[2], 10);
          currentHow = match[1].trim();
        }
        count++;
        lines[i] = \`| \${ts} | \${cWhat} | \${cWhy} | \${currentHow} ×\${count} |\`;
        found = true;
        break;
      }
    }

    if (!found) {
      lines.push(\`| \${ts} | \${cWhat} | \${cWhy} | \${cHow} |\`);
    }

    let coldLines = [];
    if (lines.length > 20) {
      coldLines = lines.splice(0, lines.length - 20);
    }

    fs.writeFileSync(FAILURES_PATH, header + lines.join("\\n") + "\\n", "utf8");

    if (coldLines.length > 0) {
      if (!fs.existsSync(FAILURES_COLD_PATH)) {
        fs.writeFileSync(FAILURES_COLD_PATH, "# 실패 일지 콜드 (failures-cold.md)\\n\\n| 언제 | 뭐가 | 왜 | 어떻게 |\\n|---|---|---|---|\\n", "utf8");
      }
      fs.appendFileSync(FAILURES_COLD_PATH, coldLines.join("\\n") + "\\n", "utf8");
    }
  } catch (e) {}
}`;

const replace2 = `function recordSecurityOrToolFailure(what, why, how, sig = "") {
  try {
    const clean = (v) => String(v || "-").replace(/\\|/g, "/").replace(/\\r?\\n/g, " ").trim();
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    const cWhat = clean(what);
    const cWhy = clean(why);
    const cHow = clean(how);
    const cSig = clean(sig);

    if (!fs.existsSync(FAILURES_PATH)) {
      fs.writeFileSync(FAILURES_PATH, "# 실패 일지 (failures.md)\\n\\n| 언제 | 뭐가 | 왜 | 어떻게 | 서명 |\\n|---|---|---|---|---|\\n", "utf8");
    }

    const raw = fs.readFileSync(FAILURES_PATH, "utf8");
    const allLines = raw.split("\\n");
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
        header += hLine + "\\n";
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
        const match = currentHow.match(/(.*?)\\s*×(\\d+)$/);
        if (match) {
          count = parseInt(match[2], 10);
          currentHow = match[1].trim();
        }
        count++;
        lines[i] = \`| \${ts} | \${cWhat} | \${cWhy} | \${currentHow} ×\${count} |\${cSig ? " " + cSig + " |" : ""}\`;
        found = true;
        break;
      }
    }

    if (!found) {
      lines.push(\`| \${ts} | \${cWhat} | \${cWhy} | \${cHow} |\${cSig ? " " + cSig + " |" : ""}\`);
    }

    let coldLines = [];
    if (lines.length > 20) {
      coldLines = lines.splice(0, lines.length - 20);
    }

    fs.writeFileSync(FAILURES_PATH, header + lines.join("\\n") + "\\n", "utf8");

    if (coldLines.length > 0) {
      if (!fs.existsSync(FAILURES_COLD_PATH)) {
        fs.writeFileSync(FAILURES_COLD_PATH, "# 실패 일지 콜드 (failures-cold.md)\\n\\n| 언제 | 뭐가 | 왜 | 어떻게 | 서명 |\\n|---|---|---|---|---|\\n", "utf8");
      }
      fs.appendFileSync(FAILURES_COLD_PATH, coldLines.join("\\n") + "\\n", "utf8");
    }
  } catch (e) {}
}

function generatePatchSignature(target, search) {
  const normSearch = String(search || "").replace(/\\r?\\n/g, "\\n").trim();
  const raw = String(target || "") + "\\n" + normSearch;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
}`;

if (content.split(search2).length !== 2) {
  console.error('❌ 블록 1-2 앵커 불일치');
  process.exit(1);
}
content = content.replace(search2, replace2);
fs.writeFileSync('server.js', content, 'utf8');
console.log('✅ 블록 1 적용 완료');