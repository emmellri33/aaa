// TITLE: 1. router-cases.md 시드 파일 생성 (step1_seed.js)
const fs = require('fs');

const seedContent = `# 명확 (위치 발췌 경로)
- "target=1111.html 4행 title을 빈페이지로" → 명확 (파일·위치·내용)
- "Complex target=my-page 버튼 빨강으로" → 명확 (※ Complex는 지시문 속 단어. 구 Complex 버튼명 아님 — 버튼은 코딩 토글로 전환됨)
# 애매 (목록 경로)
- "제목 바꿔줘" → 애매 (파일·위치 빈칸)
- "다시 해줘" → 애매 (전부 빈칸, 직전 문맥 필요)
- "거기 색만 바꿔" → 애매 (위치 빈칸)
- "안 돼" → 애매
- "이거 왜 안 돼?" → 애매
# 묻기 (사용자 질문 경로 — 2단계에서 사용)
- "이거 고쳐줘" + 파일 3곳 후보 → 묻기 (파일 불확정)
`;

fs.writeFileSync('router-cases.md', seedContent, 'utf8');
console.log('✅ step1_seed.js: router-cases.md 생성 완료');