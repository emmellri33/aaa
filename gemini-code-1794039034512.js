// TITLE: 5. ai-modify 내 422 컷 통지문 17곳에 최우선반영 동봉 (step5_attach_422_notices.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const sSuffix = '\\n이 사유를 최우선 반영';

// 1. JSON 파싱 실패
const a1 = `return res.status(422).json({ ok: false, error: "AI 응답이 유효한 JSON 형식이 아닙니다.", raw: jsonStr });`;
const r1 = `return res.status(422).json({ ok: false, error: "AI 응답이 유효한 JSON 형식이 아닙니다.${sSuffix}", raw: jsonStr });`;

// 2. ReAct 루프 알 수 없는 type
const a2 = `return res.status(422).json({ ok: false, error: "알 수 없는 type 입니다: " + parsed.type, patch: parsed });`;
const r2 = `return res.status(422).json({ ok: false, error: "알 수 없는 type 입니다: " + parsed.type + "${sSuffix}", patch: parsed });`;

// 3. patch JSON 누락
const a3 = `return res.status(422).json({ ok: false, error: "patch JSON에 edits 배열 또는 search/replace 필드가 누락되었습니다.", patch: finalParsed });`;
const r3 = `return res.status(422).json({ ok: false, error: "patch JSON에 edits 배열 또는 search/replace 필드가 누락되었습니다.${sSuffix}", patch: finalParsed });`;

// 4. search/replace 형식 불일치
const a4 = `return res.status(422).json({ ok: false, error: "조각 #" + (i + 1) + "의 search/replace 형식이 올바르지 않습니다.", patch: finalParsed });`;
const r4 = `return res.status(422).json({ ok: false, error: "조각 #" + (i + 1) + "의 search/replace 형식이 올바르지 않습니다.${sSuffix}", patch: finalParsed });`;

// 5. 공백/속성 검증 실패
const a5 = `return res.status(422).json({ ok: false, error: "조각 #" + (i + 1) + " 공백/속성 검증 실패: " + wsCheck.reason, patch: finalParsed });`;
const r5 = `return res.status(422).json({ ok: false, error: "조각 #" + (i + 1) + " 공백/속성 검증 실패: " + wsCheck.reason + "${sSuffix}", patch: finalParsed });`;

// 6. 위험표기 누락
const a6 = `return res.status(422).json({ ok: false, error: "거부됨(422): 순삭제 " + netRemoved + "줄 — explanation [왜] 끝에 [위험] 한 줄(되돌릴 수 없는 범위와 이유)을 추가하세요.", patch: finalParsed });`;
const r6 = `return res.status(422).json({ ok: false, error: "거부됨(422): 순삭제 " + netRemoved + "줄 — explanation [왜] 끝에 [위험] 한 줄(되돌릴 수 없는 범위와 이유)을 추가하세요.${sSuffix}", patch: finalParsed });`;

// 7. 대규모 삭제
const a7 = `return res.status(422).json({ ok: false, error: "거부됨(422): 대규모 삭제 감지(순삭제 " + (totalRemoved - totalAdded) + "줄). 삭제 범위를 조각으로 나누거나 유지할 부분을 명시해 다시 요청하세요.", patch: finalParsed });`;
const r7 = `return res.status(422).json({ ok: false, error: "거부됨(422): 대규모 삭제 감지(순삭제 " + (totalRemoved - totalAdded) + "줄). 삭제 범위를 조각으로 나누거나 유지할 부분을 명시해 다시 요청하세요.${sSuffix}", patch: finalParsed });`;

// 8. 동일 조각 재제출 금지
const a8 = `return res.status(422).json({ ok: false, error: "거부됨(422): [동일 조각 재제출 금지] " + (_fi + 1) + "번째 조각이 실패 조각과 동일합니다. 다른 가설로 다시 작성하세요.", patch: finalParsed });`;
const r8 = `return res.status(422).json({ ok: false, error: "거부됨(422): [동일 조각 재제출 금지] " + (_fi + 1) + "번째 조각이 실패 조각과 동일합니다. 다른 가설로 다시 작성하세요.${sSuffix}", patch: finalParsed });`;

// 9. G3 증거 미첨부
const a9 = `return res.status(422).json({ ok: false, error: "[기계컷: 증거 미첨부] 발췌 모드에서는 파일의 일부만 보입니다. 대상 코드를 read/grep 도구로 직접 확인(증거 확보)한 뒤에 패치를 제안하세요.", patch: finalParsed });`;
const r9 = `return res.status(422).json({ ok: false, error: "[기계컷: 증거 미첨부] 발췌 모드에서는 파일의 일부만 보입니다. 대상 코드를 read/grep 도구로 직접 확인(증거 확보)한 뒤에 패치를 제안하세요.${sSuffix}", patch: finalParsed });`;

// 10. G5 가설 대조 실패
const a10 = `return res.status(422).json({ ok: false, error: "[기계컷: 가설 대조 실패] 제출하신 가설들이 현재 원본 코드와 일치하지 않습니다. 도구로 다시 확인하고 새 가설을 수립하세요.", patch: finalParsed });`;
const r10 = `return res.status(422).json({ ok: false, error: "[기계컷: 가설 대조 실패] 제출하신 가설들이 현재 원본 코드와 일치하지 않습니다. 도구로 다시 확인하고 새 가설을 수립하세요.${sSuffix}", patch: finalParsed });`;

// 11. G4 동일 시그니처 재시도
const a11 = `return res.status(422).json({ ok: false, error: "[기계컷: 동일 시그니처 재시도] 오늘 이미 실패로 기록된 동일한 수정 사항(서명: " + sig + ")입니다. 전혀 다른 접근법을 사용하세요.", patch: finalParsed });`;
const r11 = `return res.status(422).json({ ok: false, error: "[기계컷: 동일 시그니처 재시도] 오늘 이미 실패로 기록된 동일한 수정 사항(서명: " + sig + ")입니다. 전혀 다른 접근법을 사용하세요.${sSuffix}", patch: finalParsed });`;

// 12, 13. 쌍둥이 G2 0회 및 다매치 (정확히 2곳 replaceAll)
const aTwin = `return res.status(422).json({ ok: false, error: errorMsg, patch: finalParsed, failedChunk: { target: targetFile, search: ed.search, replace: ed.replace } });`;
const rTwin = `return res.status(422).json({ ok: false, error: errorMsg + "${sSuffix}", patch: finalParsed, failedChunk: { target: targetFile, search: ed.search, replace: ed.replace } });`;

// 14. G8 합본 문법 오류
const a14 = `return res.status(422).json({ ok: false, error: errorMsg, patch: finalParsed, failedChunk: { target: targetFile, search: rawEdits[0].search, replace: rawEdits[0].replace } });`;
const r14 = `return res.status(422).json({ ok: false, error: errorMsg + "${sSuffix}", patch: finalParsed, failedChunk: { target: targetFile, search: rawEdits[0].search, replace: rawEdits[0].replace } });`;

// 15. question 누락
const a15 = `return res.status(422).json({ ok: false, error: "question JSON에 question 필드가 누락되었습니다.", patch: finalParsed });`;
const r15 = `return res.status(422).json({ ok: false, error: "question JSON에 question 필드가 누락되었습니다.${sSuffix}", patch: finalParsed });`;

// 16. 최종 type 알 수 없음
const a16 = `return res.status(422).json({ ok: false, error: "알 수 없는 type 입니다: " + finalParsed.type, patch: finalParsed });`;
const r16 = `return res.status(422).json({ ok: false, error: "알 수 없는 type 입니다: " + finalParsed.type + "${sSuffix}", patch: finalParsed });`;

// 17. 완료표현 차단
const a17 = `return res.status(422).json({ ok: false, error: "거부됨(422): 근거 없는 완료 표현 금지(발견: \\"" + hitBan + "\\"). 증거(앵커·실행 결과) 기준으로 다시 작성하세요.", patch: finalParsed });`;
const r17 = `return res.status(422).json({ ok: false, error: "거부됨(422): 근거 없는 완료 표현 금지(발견: \\"" + hitBan + "\\"). 증거(앵커·실행 결과) 기준으로 다시 작성하세요.${sSuffix}", patch: finalParsed });`;

const singlePairs = [
  [a1, r1], [a2, r2], [a3, r3], [a4, r4], [a5, r5],
  [a6, r6], [a7, r7], [a8, r8], [a9, r9], [a10, r10],
  [a11, r11], [a14, r14], [a15, r15], [a16, r16], [a17, r17]
];

for (let i = 0; i < singlePairs.length; i++) {
  const [s, r] = singlePairs[i];
  if (content.split(s).length !== 2) {
    console.error(`❌ 단일 422 앵커 #${i + 1} 매칭 실패 (발견: ${content.split(s).length - 1}회)`);
    process.exit(1);
  }
  content = content.replace(s, r);
}

// 쌍둥이 2곳 검증 및 교체
if (content.split(aTwin).length !== 3) {
  console.error(`❌ 쌍둥이 422 앵커 매칭 실패: ${content.split(aTwin).length - 1}회 (정확히 2회 필수)`);
  process.exit(1);
}
content = content.replaceAll(aTwin, rTwin);

fs.writeFileSync(file, content, 'utf8');
console.log('✅ step5_attach_422_notices.js 완료: 17곳 422 리터럴 컷 통지문 최우선반영 동봉 완료');