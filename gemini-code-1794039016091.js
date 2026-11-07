// TITLE: 2. c-이사.md 인간 감사 로그 16행 생성 (step2_c_isa.js)
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'c-이사.md');
const today = new Date().toISOString().slice(0, 10);

const lines = [
  `# [이사] (${today}): F4 타겟 → C0+C0-강제 서버 주입 (server.js /api/ai-modify 프롬프트 조립부 targetHeader)`,
  `# [이사] (${today}): F5 0회·2회+ → G2 존재엄격판 (server.js /api/ai-modify G2 존재 게이트)`,
  `# [이사] (${today}): F5 발췌무증거 → G3 조건부 증거게이트 (server.js /api/ai-modify G3 증거 게이트)`,
  `# [이사] (${today}): F5 서명재탕 → G4 서명해시+당일 (server.js /api/ai-modify G4 서명 차단)`,
  `# [이사] (${today}): F5 합본문법 → G8 합본문법 (server.js /api/ai-modify G8 합본 문법 게이트)`,
  `# [이사] (${today}): F5 서버컷 최우선반영 → 이벤트 동봉 (server.js /api/ai-modify 422 컷 통지문)`,
  `# [이사] (${today}): F6 우회 → 허용통지 (server.js /api/ai-modify 성공 응답 notice)`,
  `# [이사] (${today}): F7 판단 → 라우터 1·2·4단계 (server.js judgeThreeSlots 및 3관 분기)`,
  `# [이사] (${today}): F2 전용 → 모드별 역할 b팩 (server.js BPACK 3종)`,
  `# [이사] (${today}): F8 모드 → 해체(규칙 불필요) (server.js 모드팩 분리)`,
  `# [이사] (${today}): A1 나머지 → G7 스윕 의무 (server.js 넓혀 보기 G7)`,
  `# [이사] (${today}): A3 판정 → 서버, 모양만 b-패치 (server.js G5 가설 검증 및 BPACK_PATCH)`,
  `# [이사] (${today}): A4 본문 → 서버 자동생성 (server.js /api/ai-modify A4 조립부)`,
  `# [이사] (${today}): A5 개수 → 서버 422 (server.js 위험 자가검토 및 순삭제 422)`,
  `# [이사] (${today}): B1 판단 → 라우터, 모양만 b-질문 (server.js 3관 묻기 및 BPACK_QUESTION)`,
  `# [이사] (${today}): C1 예산·금지 → 서버 감시, 모양만 b-패치 (server.js ReAct 도구 및 BPACK_PATCH)`
];

if (fs.existsSync(FILE_PATH)) {
  const existing = fs.readFileSync(FILE_PATH, 'utf8');
  const count = lines.filter(l => existing.includes(l.split('(')[0])).length;
  if (count === 16) {
    console.log('ℹ️ c-이사.md: 이미 반영됨 (exit 0)');
    process.exit(0);
  } else {
    console.error(`❌ c-이사.md: 일부 항목만 존재 (${count}/16) - 덮어쓰기 금지 (exit 1)`);
    process.exit(1);
  }
}

fs.writeFileSync(FILE_PATH, lines.join('\n') + '\n', 'utf8');
console.log('✅ step2_c_isa.js 완료: c-이사.md 16행 생성 완료');