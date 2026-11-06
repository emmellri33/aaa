// TITLE: 2. b팩 3종 신설 및 프롬프트 조립식 준비 (step2_bpack.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `const USER_PROFILE_HEADER = "사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.";

const PATCH_SYSTEM_PROMPT = [
  USER_PROFILE_HEADER,`;

const replace = `const USER_PROFILE_HEADER = "사용자는 비개발자. 한글로 답한다. 터미널 명령은 한 번에 한 블록씩, 붙여넣기 전 커밋이 원칙. 겹쳐 붙이지 않는다.";

// --- ROUTER 분할3: b팩 3종 확정 (DIET §2 안) ---
const BPACK_PATCH = [
  "- 패치 모드: 패치 외 말 금지. 출력은 JSON 1개만 (코드블록·잡담 금지). (F2-역할 + F3 조건부 — 코딩 ON일 때만 적용)",
  "- 터미널은 한 번에 한 블록, 붙여넣기 전 커밋. (F1-터미널 — ON일 때만. OFF엔 run 호출이 없음)",
  "- search는 원본에 정확히 1회, 발췌모드 무증거 제출 금지. (F5-압축 — ON일 때만. 양쪽 조항 다 패치 전용)",
  "- search는 원본과 토씨까지 일치. replace는 대상만 바꾸고 나머지는 원본 그대로. (A2)",
  "- 변형 의심되면 grep 확인. (A1-1줄. 긴 버전 삭제, 나머지는 G7 스윕 의무로)",
  "- 가설: {파일, 위치, 하려는 일, 근거} 형식. 빈칸이면 미확립. (A3-모양. 완성도 판정은 서버)",
  "- 목록·read로도 못 정하면 질문으로 전환 (근거+객관식, 주관식 금지). (F7 잔재 — ON+애매 수습용)",
  "- grep/read/run 규격 준수. 받은 코드 재read 금지. 발췌 모드 read는 범위 지정. 동일 호출 반복 금지. (C1-규격)"
].join("\\n");

const BPACK_QUESTION = [
  "- 질문 모드: 근거+구체 질문. 주관식 금지. (F2-역할 + B1)",
  "- 애매 모드에선 질문하라. (F7-1줄. 판단 기준은 라우터로 이사)",
  "- 계획은 {target, steps[], instruction}으로. 실행은 버튼이 누름. (B1-스키마)",
  "- 근거 확인용 read 허용 (범위 지정, 받은 코드 재read 금지). 근거 없는 질문 금지 (ROUTER 2단계)."
].join("\\n");

const BPACK_LIGHT = [
  "- 가벼움 모드: 일상 허용. 기본 컨텍스트 없음. 형식 자유 (JSON 강제 없음). (F2-역할 — \\"전용\\" 삭제 이유: 일상 대화까지 컷됐던 문제 해결)",
  "- 설명에 코드 필요하면 read로 당김 (범위 지정, 재read 금지). 통째 읽기 없음."
].join("\\n");
// F7 삭제 대상 조항: 메인 프롬프트 내 F7 잔재는 발견되지 않아 삭제 생략 (명기)

const PATCH_SYSTEM_PROMPT = [
  USER_PROFILE_HEADER,`;

if (content.split(search).length !== 2) {
  console.error('❌ 블록 2 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ 블록 2: b팩 3종 분리 완료');