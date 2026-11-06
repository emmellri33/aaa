// TITLE: 4. /api/rollback 에 롤백 발동 신호 감지 후크 배선 (step4_rollback_signal.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    recordSecurityOrToolFailure("확정 후 자동롤백 실행 (" + target + ")", target + " 렌더 검증 실패로 디스크 백업본 원복 완료", "디스크 스냅샷 복원＋재확인 성공");
    res.json({ ok: true, target, verified: true, message: "자동 롤백 완료 (" + target + ")" });`;

const replace = `    recordSecurityOrToolFailure("확정 후 자동롤백 실행 (" + target + ")", target + " 렌더 검증 실패로 디스크 백업본 원복 완료", "디스크 스냅샷 복원＋재확인 성공");
    
    // --- ROUTER 분할4: 롤백/자가수복 발동 신호 감지 후크 ---
    recordRouterPending(\`롤백 발동: \${target}\`, "쓰기", "묻기", "롤백발동");

    res.json({ ok: true, target, verified: true, message: "자동 롤백 완료 (" + target + ")" });`;

if (content.split(search).length !== 2) {
  console.error('❌ step4_rollback_signal.js: 앵커 매칭 실패 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step4_rollback_signal.js 적용 완료');