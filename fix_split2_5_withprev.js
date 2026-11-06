// TITLE: EYES 분할2 (5/5) — blank 직전 가설 쪽지 메타 명시
const fs = require('fs');

const file = 'blank.html';
let content = fs.readFileSync(file, 'utf8');

function patchOnce(target, search, replace, label) {
  const parts = target.split(search);
  if (parts.length !== 2) {
    console.error('FAIL [' + label + ']: ' + (parts.length - 1) + '회 발견 - 파일 미기록 원복');
    process.exit(1);
  }
  return parts[0] + replace + parts[1];
}

// withPrevContext 직전 가설 쪽지(200자) 메타 동봉 강화 (C0에 따라 타겟 결정엔 사용 금지, AI 참고·라우팅용으로만)
const search1 = `    function withPrevContext(instruction) {
      if (!isVagueFollowUp(instruction) || !lastAiTurn || !lastAiTurn.patch) return instruction;
      const p = lastAiTurn.patch;
      const summary = p.type === "patch"
        ? ("type=patch, target=" + (p.target || "index.html") + ", 조각수=" + ((p.edits && p.edits.length) || 0) + ", 설명=" + String(p.explanation || "").slice(0, 200))
        : ("type=question, 내용=" + String(p.question || "").slice(0, 200));
      return "[막연한 후속 감지 — 직전 턴 문맥]\\n- 직전 요청: " + String(lastAiTurn.instruction).slice(0, 200)
        + "\\n- 직전 AI 결과: " + summary
        + "\\n- 지시: 위 직전 결과에 대한 수정·재확인 요청으로 간주하고, 진의 가설 2~3개(색 미반영? 변형 누락? 캐시로 본 것?)를 눈·grep 증거로 대조한 뒤 패치 또는 질문 JSON으로 답하세요. 허공 질문 금지.\\n\\n[사용자 이번 요청]\\n" + instruction;
    }`;

const replace1 = `    function withPrevContext(instruction) {
      if (!isVagueFollowUp(instruction) || !lastAiTurn || !lastAiTurn.patch) return instruction;
      const p = lastAiTurn.patch;
      const summary = p.type === "patch"
        ? ("type=patch, target=" + (p.target || "index.html") + ", 조각수=" + ((p.edits && p.edits.length) || 0) + ", 설명=" + String(p.explanation || "").slice(0, 200))
        : ("type=question, 내용=" + String(p.question || "").slice(0, 200));
      return "[막연한 후속 감지 — 직전 가설 쪽지(200자) 메타 동봉 (C0 타겟 결정 사용 금지, AI 참고용)]\\n- 직전 요청: " + String(lastAiTurn.instruction).slice(0, 200)
        + "\\n- 직전 AI 결과: " + summary
        + "\\n- 지시: 직전 결과에 대한 수정·후속 요청으로 간주하고, 진의 가설 2~3개(색 미반영? 변형 누락? 캐시?)를 눈·grep 증거로 대조한 뒤 패치 또는 질문 JSON으로 답하세요. 허공 질문 금지.\\n\\n[사용자 이번 요청]\\n" + instruction;
    }`;

content = patchOnce(content, search1, replace1, "blank.html 직전 가설 쪽지 메타 명시");

fs.writeFileSync(file, content, 'utf8');
console.log('✅ blank.html EYES 분할2 패치 성공');
