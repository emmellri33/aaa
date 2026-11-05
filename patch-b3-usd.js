#!/usr/bin/env node
/**
 * patch-b3-usd.js — B3-USD 토큰 실측 + USD 결산 패처
 * 규칙:
 * 1) 파일 통갈이 금지 — 앵커 1회 매치 치환
 * 2) 앵커 매치 횟수 불일치 또는 문법 검사 실패 시 즉각 중단 및 원복 (fail-closed)
 * 3) server node --check 및 blank.html / cockpit.html <script> 전 블록 문법 검사
 * 기준: B3-USD-brief.md (OLD 전수 1회 실측済). 전제 B3-CALIB 적용済.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FILES = {
  server: path.join(__dirname, "server.js"),
  blank: path.join(__dirname, "blank.html"),
  cockpit: path.join(__dirname, "cockpit.html"),
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
  console.error("↩️ 수정된 3개 파일 모두 원본 상태로 원복 완료.");
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
    abort("초기화", `대상 파일이 존재하지 않습니다: ${filePath}`);
  }
  originals[key] = fs.readFileSync(filePath, "utf8");
}

let serverTxt = originals.server;
let blankTxt = originals.blank;
let cockpitTxt = originals.cockpit;


// ============================================================================
// F1. server.js — 단가표 + 실측 누적 (6곳)
// ============================================================================

// F1-1 단가표 + costOf 삽입 (OLD 1줄 → NEW 블록, OLD행이 NEW 마지막 줄에 포함)
const F1_1_OLD = `const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';`;
const F1_1_NEW = `// USD 단가표 (1M 토큰 기준, 2026-11-05 사용자 확정값)
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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';`;
serverTxt = replaceOnce(serverTxt, F1_1_OLD, F1_1_NEW, "F1-1 server 단가표+costOf 삽입");

// F1-2 summary 실측 필드
const F1_2_OLD = `  const summary = { model: String(model || GEMINI_MODEL), inLo, inHi, outLo, outHi };`;
const F1_2_NEW = `  const summary = { model: String(model || GEMINI_MODEL), inLo, inHi, outLo, outHi };
  const callCost = costOf(model, inTok, outTok);
  summary.inTok = (Number(inTok) > 0) ? Number(inTok) : null;
  summary.outTok = (Number(outTok) > 0) ? Number(outTok) : null;
  summary.cost = callCost;`;
serverTxt = replaceOnce(serverTxt, F1_2_OLD, F1_2_NEW, "F1-2 server summary 실측 필드");

// F1-3 누적에 cost
const F1_3_OLD = `      bucket.outHi = (Number(bucket.outHi) || 0) + outHi;`;
const F1_3_NEW = `      bucket.outHi = (Number(bucket.outHi) || 0) + outHi;
      bucket.cost = (Number(bucket.cost) || 0) + callCost;`;
serverTxt = replaceOnce(serverTxt, F1_3_OLD, F1_3_NEW, "F1-3 server 누적 cost");

// F1-4 byDay 초기값
const F1_4_OLD = `      totals.byDay[dayKey] = { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0 };`;
const F1_4_NEW = `      totals.byDay[dayKey] = { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0, cost: 0 };`;
serverTxt = replaceOnce(serverTxt, F1_4_OLD, F1_4_NEW, "F1-4 server byDay 초기값");

// F1-5 dayCost (dayHi 삭제 — _db는 addStats 이후라 당회 포함, + callCost 금지)
const F1_5_OLD = `    summary.dayHi = (Number(_db.inHi) || 0) + (Number(_db.outHi) || 0);`;
const F1_5_NEW = `    summary.dayCost = (Number(_db.cost) || 0);`;
serverTxt = replaceOnce(serverTxt, F1_5_OLD, F1_5_NEW, "F1-5 server dayCost");

// F1-6 entry 실측 기록
const F1_6_OLD = `      inLo,
      inHi,
      outLo,
      outHi
    });`;
const F1_6_NEW = `      inLo,
      inHi,
      outLo,
      outHi,
      inTok: (Number(inTok) > 0) ? Number(inTok) : null,
      outTok: (Number(outTok) > 0) ? Number(outTok) : null,
      cost: callCost
    });`;
serverTxt = replaceOnce(serverTxt, F1_6_OLD, F1_6_NEW, "F1-6 server entry 실측 기록");


// ============================================================================
// F2. blank.html — 배지 + 경고 USD (4곳)
// ============================================================================

// F2-1 배지 USD + 구메시지 fallback (6행 블록)
const F2_1_OLD = `      if (role === "ai" && usage && (usage.inEst != null || usage.inHi != null)) {
        const badge = document.createElement("div");
        badge.className = "usage-badge";
        const iu = usage.inEst != null ? usage.inEst : usage.inHi;
        const ou = usage.outEst != null ? usage.outEst : usage.outHi;
        badge.innerText = \`🔢 약 \${Number(iu || 0) + Number(ou || 0)} tok · \${usage.model || ""}\`;`;
const F2_1_NEW = `      if (role === "ai" && usage && (Number(usage.inTok) > 0 || usage.inEst != null || usage.inHi != null)) {
        const badge = document.createElement("div");
        badge.className = "usage-badge";
        if (Number(usage.inTok) > 0) {
          const it = Number(usage.inTok) || 0, ot = Number(usage.outTok) || 0;
          const cs = (Number(usage.cost) || 0).toFixed(4);
          badge.innerText = \`⚡ \${usage.model || ""} · \${(it + ot).toLocaleString()} tok (입 \${it.toLocaleString()}/출 \${ot.toLocaleString()}) · $\${cs}\`;
        } else {
          const iu = usage.inEst != null ? usage.inEst : usage.inHi;
          const ou = usage.outEst != null ? usage.outEst : usage.outHi;
          badge.innerText = \`🔢 약 \${Number(iu || 0) + Number(ou || 0)} tok · \${usage.model || ""}\`;
        }`;
blankTxt = replaceOnce(blankTxt, F2_1_OLD, F2_1_NEW, "F2-1 blank 배지 USD+fallback");

// F2-2 채팅 호출부
const F2_2_OLD = `          refreshBudgetBadge(cd && cd.usage && cd.usage.dayHi);`;
const F2_2_NEW = `          refreshBudgetBadge(cd && cd.usage && cd.usage.dayCost);`;
blankTxt = replaceOnce(blankTxt, F2_2_OLD, F2_2_NEW, "F2-2 blank 채팅 호출부 dayCost");

// F2-3 Complex 호출부
const F2_3_OLD = `          refreshBudgetBadge(d && d.usage && d.usage.dayHi);`;
const F2_3_NEW = `          refreshBudgetBadge(d && d.usage && d.usage.dayCost);`;
blankTxt = replaceOnce(blankTxt, F2_3_OLD, F2_3_NEW, "F2-3 blank Complex 호출부 dayCost");

// F2-4 경고 USD + 마이그레이션 (함수 전체)
const F2_4_OLD = `    function refreshBudgetBadge(dayHi) {
      try {
        const lim = Number(localStorage.getItem("gemgem-budget-daily") || "200000");
        const el = document.getElementById("budgetBadge");
        if (!el) return;
        if ((Number(dayHi) || 0) >= lim) {
          el.hidden = false;
          el.innerText = \`⚠️ 오늘 토큰 상한 초과 (\${Math.round(Number(dayHi) / 1000)}k/\${Math.round(lim / 1000)}k)\`;
        } else { el.hidden = true; }
      } catch (e) {}
    }`;
const F2_4_NEW = `    function refreshBudgetBadge(dayCost) {
      try {
        let lim = Number(localStorage.getItem("gemgem-budget-daily") || "1.00");
        if (lim >= 1000) { lim = 1.00; try { localStorage.setItem("gemgem-budget-daily", "1.00"); } catch (e2) {} }
        const el = document.getElementById("budgetBadge");
        if (!el) return;
        if ((Number(dayCost) || 0) >= lim) {
          el.hidden = false;
          el.innerText = \`⚠️ 오늘 상한 초과 ($\${(Number(dayCost) || 0).toFixed(4)}/$\${lim.toFixed(2)})\`;
        } else { el.hidden = true; }
      } catch (e) {}
    }`;
blankTxt = replaceOnce(blankTxt, F2_4_OLD, F2_4_NEW, "F2-4 blank 경고 USD+마이그레이션");


// ============================================================================
// F3. cockpit.html — 집계 + 상한 USD (9곳)
// ============================================================================

// F3-1 안내 문구
const F3_1_OLD = `          <span style="font-size: 13px; color: #94a3b8;">추정식: 하한=글자/4, 상한=글자/1.5 (모든 수치는 추정치)</span>`;
const F3_1_NEW = `          <span style="font-size: 13px; color: #94a3b8;">API 실측 토큰 및 공식 단가 기반 비용(USD) 결산</span>`;
cockpitTxt = replaceOnce(cockpitTxt, F3_1_OLD, F3_1_NEW, "F3-1 cockpit 안내 문구");

// F3-2 상한 입력칸
const F3_2_OLD = `          <label style="font-size:12px;color:#94a3b8;">일일 상한 <input id="budgetInput" type="number" min="1000" step="1000" style="width:110px;background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:6px;padding:3px 8px;" /> <button class="btn" onclick="saveBudget()">저장</button></label>`;
const F3_2_NEW = `          <label style="font-size:12px;color:#94a3b8;">일일 상한($) <input id="budgetInput" type="number" min="0.01" step="0.01" placeholder="1.00" style="width:110px;background:#1e293b;color:#f8fafc;border:1px solid #334155;border-radius:6px;padding:3px 8px;" /> <button class="btn" onclick="saveBudget()">저장</button></label>`;
cockpitTxt = replaceOnce(cockpitTxt, F3_2_OLD, F3_2_NEW, "F3-2 cockpit 상한 입력칸 USD");

// F3-3 입력 기본값 + 마이그레이션
const F3_3_OLD = `    function loadBudgetInput() { try { const el = document.getElementById("budgetInput"); if (el) el.value = localStorage.getItem("gemgem-budget-daily") || "200000"; } catch (e) {} }`;
const F3_3_NEW = `    function loadBudgetInput() { try { const el = document.getElementById("budgetInput"); if (el) { let v = localStorage.getItem("gemgem-budget-daily") || "1.00"; if (Number(v) >= 1000) { v = "1.00"; try { localStorage.setItem("gemgem-budget-daily", v); } catch (e2) {} } el.value = v; } } catch (e) {} }`;
cockpitTxt = replaceOnce(cockpitTxt, F3_3_OLD, F3_3_NEW, "F3-3 cockpit 기본값+마이그레이션");

// F3-4 저장
const F3_4_OLD = `        const v = Math.max(1000, Math.floor(Number(el && el.value) || 200000));
        localStorage.setItem("gemgem-budget-daily", String(v));
        if (el) el.value = String(v);
        alert("✅ 일일 상한 저장: " + v);`;
const F3_4_NEW = `        const v = Math.max(0.01, Math.round((Number(el && el.value) || 1.00) * 100) / 100);
        localStorage.setItem("gemgem-budget-daily", String(v));
        if (el) el.value = String(v);
        alert("✅ 일일 상한 저장: $" + Number(v).toFixed(2));`;
cockpitTxt = replaceOnce(cockpitTxt, F3_4_OLD, F3_4_NEW, "F3-4 cockpit 저장 USD");

// F3-5 집계 cost (2앵커)
const F3_5_A_OLD = `          const acc = { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0 };`;
const F3_5_A_NEW = `          const acc = { calls: 0, inLo: 0, inHi: 0, outLo: 0, outHi: 0, inTok: 0, outTok: 0, cost: 0 };`;
cockpitTxt = replaceOnce(cockpitTxt, F3_5_A_OLD, F3_5_A_NEW, "F3-5A cockpit 집계 초기값");

const F3_5_B_OLD = `            acc.outHi += Number(b.outHi) || 0;`;
const F3_5_B_NEW = `            acc.outHi += Number(b.outHi) || 0;
            acc.inTok += Number(b.inTok) || 0;
            acc.outTok += Number(b.outTok) || 0;
            acc.cost += Number(b.cost) || 0;`;
cockpitTxt = replaceOnce(cockpitTxt, F3_5_B_OLD, F3_5_B_NEW, "F3-5B cockpit 집계 누적");

// F3-6 요약 박스
const F3_6_OLD = "        const fmtBox = (s) => `호출: <strong>${s.calls}회</strong><br>입력 추정: ${s.inLo} ~ ${s.inHi}<br>출력 추정: ${s.outLo} ~ ${s.outHi}`;";
const F3_6_NEW = "        const fmtBox = (s) => `호출: <strong>${s.calls}회</strong><br>입력: ${s.inTok} tok<br>출력: ${s.outTok} tok<br>비용: $${(Number(s.cost) || 0).toFixed(4)}`;";
cockpitTxt = replaceOnce(cockpitTxt, F3_6_OLD, F3_6_NEW, "F3-6 cockpit 요약 박스");

// F3-7 테이블 헤더
const F3_7_OLD = `                  <th style="padding: 6px;">입력 추정(토큰)</th>
                  <th style="padding: 6px;">출력 추정(토큰)</th>`;
const F3_7_NEW = `                  <th style="padding: 6px;">입력(Tok)</th>
                  <th style="padding: 6px;">출력(Tok)</th>
                  <th style="padding: 6px;">비용(USD)</th>`;
cockpitTxt = replaceOnce(cockpitTxt, F3_7_OLD, F3_7_NEW, "F3-7 cockpit 테이블 헤더");

// F3-8 테이블 행
const F3_8_OLD = `            <td style="padding: 6px;">\${row.inLo ?? 0} ~ \${row.inHi ?? 0}</td>
            <td style="padding: 6px;">\${row.outLo ?? 0} ~ \${row.outHi ?? 0}</td>`;
const F3_8_NEW = `            <td style="padding: 6px;">\${row.inTok ?? 0}</td>
            <td style="padding: 6px;">\${row.outTok ?? 0}</td>
            <td style="padding: 6px;">$\${(Number(row.cost) || 0).toFixed(4)}</td>`;
cockpitTxt = replaceOnce(cockpitTxt, F3_8_OLD, F3_8_NEW, "F3-8 cockpit 테이블 행");

// F3-9 colspan 7→8 (3곳)
const F3_9_A_OLD = `<tr><td colspan="7" style="padding: 8px; color: #94a3b8;">\${msg}</td></tr>`;
const F3_9_A_NEW = `<tr><td colspan="8" style="padding: 8px; color: #94a3b8;">\${msg}</td></tr>`;
cockpitTxt = replaceOnce(cockpitTxt, F3_9_A_OLD, F3_9_A_NEW, "F3-9A cockpit colspan setEmpty");

const F3_9_B_OLD = `              <tbody id="usageRecentBody">
                <tr><td colspan="7" style="padding: 8px; color: #94a3b8;">불러오는 중...</td></tr>
              </tbody>`;
const F3_9_B_NEW = `              <tbody id="usageRecentBody">
                <tr><td colspan="8" style="padding: 8px; color: #94a3b8;">불러오는 중...</td></tr>
              </tbody>`;
cockpitTxt = replaceOnce(cockpitTxt, F3_9_B_OLD, F3_9_B_NEW, "F3-9B cockpit colspan 초기행");

const F3_9_C_OLD = `          tbody.innerHTML = '<tr><td colspan="7" style="padding: 8px; color: #94a3b8;">기록 없음</td></tr>';`;
const F3_9_C_NEW = `          tbody.innerHTML = '<tr><td colspan="8" style="padding: 8px; color: #94a3b8;">기록 없음</td></tr>';`;
cockpitTxt = replaceOnce(cockpitTxt, F3_9_C_OLD, F3_9_C_NEW, "F3-9C cockpit colspan 기록없음");


// ============================================================================
// 파일 쓰기 및 문법 검증
// ============================================================================
try {
  fs.writeFileSync(FILES.server, serverTxt, "utf8");
  fs.writeFileSync(FILES.blank, blankTxt, "utf8");
  fs.writeFileSync(FILES.cockpit, cockpitTxt, "utf8");
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

// 2) blank.html & cockpit.html: <script> 전 블록 문법 검사
checkHtmlScripts(blankTxt, "blank.html");
checkHtmlScripts(cockpitTxt, "cockpit.html");

console.log("\n🎉 B3-USD 패치 적용 및 전 항목 문법 검증 완료!");
