#!/usr/bin/env node
/**
 * patch-b2f1.js — B2 후속 미니패치: 구 manifest 승격 (cockpit.html gemgem → cockpit)
 * - B2 F1-1의 MUST-DECIDE("구 manifest도 cockpit으로 승격")와 구현 불일치 수정
 * - fail-closed: 앵커 1회 아니면 abort+원복, node --check 필수
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FILE = path.join(__dirname, "server.js");
if (!fs.existsSync(FILE)) { console.error("❌ server.js 없음"); process.exit(1); }
const original = fs.readFileSync(FILE, "utf8");
let txt = original;

function abort(reason) {
  console.error(`\n❌ [ABORT] ${reason}`);
  try { fs.writeFileSync(FILE, original, "utf8"); } catch (e) {}
  console.error("↩️ server.js 원복 완료.");
  process.exit(1);
}

const OLD = `    if (filename === "blank.html" || filename === "cockpit.html") {
      const raw = manifest[filename];
      if (!raw) return "cockpit";
      return normalizeOwner(raw, filename);
    }`;

const NEW = `    if (filename === "blank.html" || filename === "cockpit.html") {
      const raw = manifest[filename];
      if (!raw) return "cockpit";
      const o = normalizeOwner(raw, filename);
      if (o === "gemgem") return "cockpit"; // 구 manifest 승격 (B1a 이전 기록 호환)
      return o;
    }`;

const parts = txt.split(OLD);
if (parts.length - 1 !== 1) abort(`앵커 매치 횟수가 1회가 아닙니다 (실제 매치: ${parts.length - 1}회)`);
console.log("✅ [F1-1u 구 manifest 승격] 앵커 1회 정확 매치 및 치환 완료");
txt = parts[0] + NEW + parts[1];

try {
  fs.writeFileSync(FILE, txt, "utf8");
} catch (e) { abort("파일 저장 실패: " + e.message); }

try {
  execFileSync(process.execPath, ["--check", FILE], { stdio: "pipe" });
  console.log("✅ [server.js] node --check 통과");
} catch (e) {
  abort("node --check 실패: " + ((e.stderr && e.stderr.toString()) || e.message));
}

console.log("\n🎉 B2f1 미니패치 완료!");
