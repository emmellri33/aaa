// TITLE: 1. server.js 조건부 타당성 팩 BPACK_FEASIBILITY 신설 (step1_server_bpack.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `const BPACK_LIGHT = [
  "- 가벼움 모드: 일상 허용. 기본 컨텍스트 없음. 형식 자유 (JSON 강제 없음). (F2-역할 — \\"전용\\" 삭제 이유: 일상 대화까지 컷됐던 문제 해결)",
  "- 설명에 코드 필요하면 read로 당김 (범위 지정, 재read 금지). 통째 읽기 없음."
].join("\\n");`;

const replace = `const BPACK_LIGHT = [
  "- 가벼움 모드: 일상 허용. 기본 컨텍스트 없음. 형식 자유 (JSON 강제 없음). (F2-역할 — \\"전용\\" 삭제 이유: 일상 대화까지 컷됐던 문제 해결)",
  "- 설명에 코드 필요하면 read로 당김 (범위 지정, 재read 금지). 통째 읽기 없음."
].join("\\n");

const BPACK_FEASIBILITY = [
  "- 타당성 판단 모드 (코딩 OFF, 읽기 전용): 패치 JSON을 절대 출력하지 마세요. 코드 수정 없이 일반 텍스트로만 답하세요.",
  "- 반드시 [가능/불가 여부 + 코드 근거 + 예상 수정 위치(행 번호·선택자) 및 방법] 순서로 간결하게 작성하세요."
].join("\\n");`;

if (content.split(search).length !== 2) {
  console.error('❌ step1_server_bpack.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step1_server_bpack.js 완료');