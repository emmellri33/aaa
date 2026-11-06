// TITLE: 3. /api/ai-modify 진입부 신호 감지 및 승인 처리 연동 (수정판 - withPrevContext 대응)
// fail-closed: 앵커 1회 아니면 exit 1 + 미기록 원복
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    // --- ROUTER 분할3: 4단계 lite 분류를 위한 3관 분기 확장 ---
    const codingToggle = (req.body && req.body.codingToggle === "ON") ? "ON" : "OFF";`;

const replace = `    // --- ROUTER 분할4: 인간 승인 트리거 ("대기열 승인 편입") 처리 ---
    // blank withPrevContext가 지시문 앞에 메타를 붙이므로 tail 추출 후 매칭 (exact 매칭 보호)
    let instText = String(instruction || "").trim();
    const tailMarker = "[사용자 이번 요청]";
    const tailIdx = instText.lastIndexOf(tailMarker);
    const signalText = (tailIdx >= 0 ? instText.slice(tailIdx + tailMarker.length) : instText).trim();
    if (signalText === "대기열 승인 편입") {
      const approveRes = applyApprovedPendingCases();
      const doneMsg = approveRes.ok
        ? "✅ 대기열 " + approveRes.count + "건이 router-cases.md에 안전하게 편입되었습니다."
        : "대기열 편입 중단: " + approveRes.error;
      const doneCard = { type: "question", question: doneMsg };
      return res.json({ ok: true, result: JSON.stringify(doneCard), patch: doneCard, toolRounds: 0 });
    }

    // --- ROUTER 분할4: 신호 감지 (사용자 정정, 유사 재질문) ---
    const detectedSignals = [];

    // 1) 사용자 정정 신호 (부정 패턴 7종 — 브리프 해석 목록. 변경 시 주석에 사유 명기)
    const correctionRegex = /^(?:아니|그거\\s*아니야|아니야|잘못|틀렸|취소|되돌려)(?:\\b|[\\s,!?.])/i;
    const corrMatch = signalText.match(correctionRegex);
    if (corrMatch) {
      detectedSignals.push("사용자정정");
    }

    // 정정 접두어 제거 후 남은 지문 (정답 경로 판정용)
    let remainderText = signalText;
    if (corrMatch) {
      remainderText = signalText.slice(corrMatch[0].length).trim().replace(/^[\\s,!?.]+/, "");
    }

    // 2) 동일/유사 주제 재질문 신호 (최근 4턴 윈도우 — 요청값에 시각이 없어 시간창 대신 사용. 근거: recentTurns는 최대 4턴 텍스트만 전달. TODO(소유분할): SESSION 시각 연동 시 n분 창으로 교체)
    if (recentTurns && typeof recentTurns === "string") {
      const pastTurns = recentTurns.split("\\n").filter(l => l.startsWith("[user]")).map(l => l.replace("[user]", "").trim());
      // 유사 기준: 완전일치 또는 양방향 포함 (근거: 재질문은 축약·상세화 양방향으로 발생)
      const hasRecentDuplicate = pastTurns.some(past => past.length >= 3 && (past === signalText || (signalText.length > 5 && (past.includes(signalText) || signalText.includes(past)))));
      if (hasRecentDuplicate && !detectedSignals.includes("사용자정정")) {
        detectedSignals.push("동일재질문");
      }
    }

    // 신호 감지 시 router-pending.md에 대기열 1건 기록 (중복 신호는 1건으로 통합)
    if (detectedSignals.length > 0) {
      const combinedSignal = detectedSignals.join("+");
      // 정답 경로: 접두어 제거 지문을 judgeThreeSlots으로 판정 (규칙 기반). 명확이면 "명확", 아니면 "묻기". 지문 없으면 "묻기".
      let answerPath = "묻기";
      try {
        const rj = judgeThreeSlots(remainderText, targetFile);
        if (rj && rj.isExplicit) answerPath = "명확";
      } catch (e) { answerPath = "묻기"; }
      // 라우팅 결과: 기록 시점이 라우팅 전이므로 "판정전"으로 기록
      recordRouterPending(signalText, "판정전", answerPath, combinedSignal);
    }

    // --- ROUTER 분할3: 4단계 lite 분류를 위한 3관 분기 확장 ---
    const codingToggle = (req.body && req.body.codingToggle === "ON") ? "ON" : "OFF";`;

if (content.split(search).length !== 2) {
  console.error('❌ 블록 3 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ 블록 3: 신호 감지 및 승인 처리 적용 완료 (수정판)');
