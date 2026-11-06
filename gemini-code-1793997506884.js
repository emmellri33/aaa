// TITLE: 2. server.js에 신호 감지 및 router-pending 헬퍼 추가 (step2_signal_helpers.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `const PINS_PATH = path.join(__dirname, "target-pins.json");`;

const replace = `// --- ROUTER 분할4: 3단계 신호 감지 및 router-pending.md 헬퍼 ---
const PENDING_PATH = path.join(__dirname, "router-pending.md");
const CASES_PATH = path.join(__dirname, "router-cases.md");

function recordRouterPending(instruction, routeResult, answerPath, signalType) {
  try {
    const clean = (s) => String(s || "").replace(/\\r?\\n/g, " ").trim();
    const inst = clean(instruction).slice(0, 150);
    const line = \`- "\${inst}" → \${clean(answerPath)} (감지: \${clean(signalType)}, 라우팅: \${clean(routeResult)})\\n\`;
    
    if (!fs.existsSync(PENDING_PATH)) {
      fs.writeFileSync(PENDING_PATH, '# router-pending.md 대기열\\n\\n', 'utf8');
    }
    const current = fs.readFileSync(PENDING_PATH, 'utf8');
    if (!current.includes(\`"\${inst}"\`)) {
      fs.appendFileSync(PENDING_PATH, line, 'utf8');
      console.log(\`ROUTER pipe=신호감지 [\${signalType}] 저장: "\${inst}" -> \${answerPath}\`);
    } else {
      console.log(\`ROUTER pipe=신호감지 [\${signalType}] 중복 생략\`);
    }
  } catch (e) {
    console.error("router-pending 기록 실패:", e.message);
  }
}

// 승인 트리거 편입 함수 (골든셋 검증기 통과 필수)
function applyApprovedPendingCases() {
  try {
    if (!fs.existsSync(PENDING_PATH)) return { ok: false, error: "대기열 파일 없음" };
    const rawPending = fs.readFileSync(PENDING_PATH, 'utf8');
    const lines = rawPending.split("\\n").filter(l => l.startsWith("- "));
    if (lines.length === 0) return { ok: false, error: "편입할 대기열 항목 없음" };

    // 1. 골든셋 검증기 사전 점검
    const { execSync } = require('child_process');
    try {
      execSync('node verify-router-cases.js', { cwd: __dirname, encoding: 'utf8' });
    } catch (err) {
      console.error("골든셋 검증 실패 — 편입 중단 (머지 금지):", err.message);
      return { ok: false, error: "골든셋 검증 실패로 편입 중단" };
    }

    // 2. 검증 통과 시 router-cases.md에 편입
    let casesContent = fs.readFileSync(CASES_PATH, 'utf8');
    let addedCount = 0;
    lines.forEach(l => {
      // 신호 메타를 제외한 순수 매핑 라인 추출
      const match = l.match(/^(- "[^"]+" → (?:명확|애매|묻기))/);
      if (match && !casesContent.includes(match[1])) {
        casesContent += match[1] + "\\n";
        addedCount++;
      }
    });

    if (addedCount > 0) {
      fs.writeFileSync(CASES_PATH, casesContent, 'utf8');
      // 대기열 비우기
      fs.writeFileSync(PENDING_PATH, '# router-pending.md 대기열\\n\\n', 'utf8');
      console.log(\`ROUTER pipe=대기열편입성공 (\${addedCount}건 편입)\`);
      return { ok: true, count: addedCount };
    }
    return { ok: true, count: 0, message: "이미 모두 편입됨" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const PINS_PATH = path.join(__dirname, "target-pins.json");`;

if (content.split(search).length !== 2) {
  console.error('❌ step2_signal_helpers.js: 앵커 매칭 실패 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step2_signal_helpers.js 적용 완료');