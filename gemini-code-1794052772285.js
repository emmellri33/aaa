// TITLE: 2. server.js 마일스톤 자동 기록 훅 배선 (step2_server_milestones.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

// 1. 적용 마일스톤 훅 배선 (/api/page/:target)
const searchApply = `  fs.writeFile(p, content, 'utf8', (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });`;

const replaceApply = `  fs.writeFile(p, content, 'utf8', (err) => {
    if (err) return res.status(500).json({ error: err.message });
    // --- SESSION 분할4: 마일스톤 [적용] 자동 기록 ---
    if (roomId) {
      recordSessionEntry({
        roomId,
        tag: "적용",
        status: "진행",
        fact: \`\${target} 파일 패치 적용\`,
        next: "검증 진행",
        milestone: true
      });
    }
    res.json({ ok: true });
  });`;

if (content.split(searchApply).length !== 2) {
  console.error('❌ step2_server_milestones.js: 적용 마일스톤 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchApply, replaceApply);

// 2. 패치 수신 마일스톤 훅 배선 (/api/ai-modify)
const searchPatchRecv = `    if (finalParsed.type === "patch") {
      if (!finalParsed.target) {
        finalParsed.target = targetFile;
      }`;

const replacePatchRecv = `    if (finalParsed.type === "patch") {
      if (!finalParsed.target) {
        finalParsed.target = targetFile;
      }
      // --- SESSION 분할4: 마일스톤 [패치 수신] 자동 기록 ---
      if (sessionRoomId) {
        recordSessionEntry({
          roomId: sessionRoomId,
          tag: "패치",
          status: "대기",
          fact: \`\${finalParsed.target || targetFile} 패치 제안 생성 (\${(finalParsed.edits && finalParsed.edits.length) || 1}조각)\`,
          next: "적용 대기",
          milestone: false
        });
      }`;

if (content.split(searchPatchRecv).length !== 2) {
  console.error('❌ step2_server_milestones.js: 패치 수신 마일스톤 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchPatchRecv, replacePatchRecv);

// 3. 검증 통과/실패 훅 배선 (/api/verify-render & /api/rollback)
const searchVerifyRender = `    res.json({ ok: Boolean(parsed.ok), reason: parsed.reason || "알 수 없음" });
  } catch (e) {`;

const replaceVerifyRender = `    // --- SESSION 분할4: 마일스톤 [검증 통과·실패] 자동 기록 ---
    const vRoomId = req.body && req.body.roomId;
    if (vRoomId) {
      if (parsed.ok) {
        recordSessionEntry({
          roomId: vRoomId,
          tag: "검증",
          status: "완료",
          fact: \`\${target} 렌더 검증 통과\`,
          next: "작업 완료",
          milestone: false
        });
      } else {
        recordSessionEntry({
          roomId: vRoomId,
          tag: "검증",
          status: "진행",
          fact: \`\${target} 렌더 검증 실패 (\${parsed.reason || "시각적 깨짐"})\`,
          next: "자동 롤백 대기",
          milestone: false
        });
      }
    }
    res.json({ ok: Boolean(parsed.ok), reason: parsed.reason || "알 수 없음" });
  } catch (e) {`;

if (content.split(searchVerifyRender).length !== 2) {
  console.error('❌ step2_server_milestones.js: verify-render 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchVerifyRender, replaceVerifyRender);

const searchRollback = `    // --- ROUTER 분할4: 롤백/자가수복 발동 신호 감지 후크 ---
    recordRouterPending(\`롤백 발동: \${target}\`, "쓰기", "묻기", "롤백발동");

    res.json({ ok: true, target, verified: true, message: "자동 롤백 완료 (" + target + ")" });`;

const replaceRollback = `    // --- ROUTER 분할4: 롤백/자가수복 발동 신호 감지 후크 ---
    recordRouterPending(\`롤백 발동: \${target}\`, "쓰기", "묻기", "롤백발동");

    // --- SESSION 분할4: 마일스톤 [검증 실패 후 롤백 복원] 자동 기록 ---
    const rbRoomId = req.body && req.body.roomId;
    if (rbRoomId) {
      recordSessionEntry({
        roomId: rbRoomId,
        tag: "검증",
        status: "진행",
        fact: \`\${target} 렌더 검증 실패로 디스크 백업본 복원\`,
        next: "원인 분석 및 재시도",
        milestone: true
      });
    }

    res.json({ ok: true, target, verified: true, message: "자동 롤백 완료 (" + target + ")" });`;

if (content.split(searchRollback).length !== 2) {
  console.error('❌ step2_server_milestones.js: rollback 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchRollback, replaceRollback);

// 4. 사용자 결정 훅 배선 (/api/target/confirm)
const searchTargetConfirm = `    _pins[_key] = { target: _t, model: String(model || ""), at: new Date().toISOString() };
    writePins(_pins);
    res.json({ ok: true, pin: _pins[_key] });`;

const replaceTargetConfirm = `    _pins[_key] = { target: _t, model: String(model || ""), at: new Date().toISOString() };
    writePins(_pins);
    // --- SESSION 분할4: 마일스톤 [사용자 결정] 자동 기록 ---
    if (roomId) {
      recordSessionEntry({
        roomId,
        tag: "결정",
        status: "완료",
        fact: \`작업 대상 파일 확정 (\${_t})\`,
        next: "지시 대기",
        milestone: false
      });
    }
    res.json({ ok: true, pin: _pins[_key] });`;

if (content.split(searchTargetConfirm).length !== 2) {
  console.error('❌ step2_server_milestones.js: target/confirm 앵커 불일치');
  process.exit(1);
}
content = content.replace(searchTargetConfirm, replaceTargetConfirm);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ step2_server_milestones.js 완료');